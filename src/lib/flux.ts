import { ErreurLecteur, erreurDeStatut } from './errors'
import { signalerSiNonAuthentifie } from './session-expiree'
import { urlAvecCapacites, type Capacites } from './capacites'
import { chaineDeLecture } from './source-lecture'

// Ce module repond a une seule question : « quelle URL donner au lecteur, et
// que sait-on de ce flux ». Le serveur mytv decide seul du traitement d'un film
// (octets tels quels avec Range, remux, audio reencode) et du refus d'un format
// illisible (415) : l'interface n'a plus de sonde ni de strategie a imposer. Elle
// lit juste ce que le serveur dit de la reponse.
//
// LES ADRESSES SONT CELLES DU SERVEUR, jamais reecrites ici : le champ `lecture`
// de l'API pour un contenu, et des segments HLS dont les URL sont stables d'une
// playlist a l'autre (le cache du navigateur et hls.js s'y fient). La seule
// retouche permise est `?t=`, le deplacement d'un film remuxe.

export type GenreFlux = 'live' | 'vod'

/** Ce que le serveur fait d'un film : l'octet tel quel, un remux, ou l'audio recode. */
export type ModeVod = 'direct' | 'remux' | 'audio'

export interface Plan {
  genre: GenreFlux
  /** Adresse relative de reference (sans `?t=`) : celle du champ `lecture`. */
  lecture: string
  /** Adresse a donner au lecteur. */
  url: string
  /** Numero de chaine d'un direct, pour rendre la place (`/live/{chaine}/fin`). */
  chaine?: string
  /** Connu pour un film seulement, apres la verification en tete. */
  mode?: ModeVod
  /**
   * Vrai quand le serveur FABRIQUE le MP4 (remux, audio) : il n'y a alors pas
   * d'« octet N » a viser, et le deplacement passe par `?t=`.
   */
  viaService: boolean
  /** Duree totale annoncee par le serveur, quand il la donne. */
  dureeSecondes?: number
}

/** Libelle complet, pour le panneau d'informations. */
export const LIBELLE_MODE: Record<ModeVod, string> = {
  direct: 'Lecture directe — aucun traitement',
  remux: 'Remux — conteneur réécrit par le serveur',
  audio: 'Audio réencodé en AAC par le serveur',
}

/** Libelle court, pour la ligne technique posee sur l'image. */
export const BADGE_MODE: Record<ModeVod, string> = {
  direct: 'direct',
  remux: 'remux',
  audio: 'audio AAC',
}

/** Teintes des tokens : un remux ne coute presque rien, un reencodage un peu. */
export const TEINTE_MODE: Record<ModeVod, string> = {
  direct: 'var(--ok)',
  remux: 'var(--acc-fg)',
  audio: 'var(--lim)',
}

/** Le deplacement passe-t-il par `?t=` ? Seulement quand le serveur fabrique le MP4. */
export function deplacementParService(plan: Plan | null | undefined): boolean {
  return !!plan && plan.genre === 'vod' && plan.viaService
}

/**
 * Adresse d'un film, deplacee a `decalage` secondes. En dessous de 0,5 s on ne
 * decale pas : le serveur le traite comme un depart normal, et une URL sans `?t=`
 * est celle que le cache connait. Conserve une eventuelle requete existante.
 */
export function urlVod(lecture: string, decalage = 0): string {
  if (!(decalage > 0.5)) return lecture
  const [chemin = '', requete = ''] = lecture.split('?', 2)
  const p = new URLSearchParams(requete)
  p.set('t', decalage.toFixed(3))
  return `${chemin}?${p.toString()}`
}

// --- Lecture des en-tetes -------------------------------------------------

interface LecteurEnTetes {
  get(nom: string): string | null
}

/**
 * Ce que dit la reponse d'un film. `Accept-Ranges: none` est ce que pose le
 * serveur quand il remuxe (il ne sait pas servir un octet donne d'un flux qu'il
 * fabrique) ; `X-Mytv-Mode` et `X-Mytv-Duree`, quand ils existent, sont plus
 * precis et priment.
 */
export function lireEnTetesVod(h: LecteurEnTetes): { mode: ModeVod; dureeSecondes?: number } {
  const annonce = h.get('X-Mytv-Mode')?.trim().toLowerCase()
  let mode: ModeVod
  if (annonce === 'direct' || annonce === 'remux' || annonce === 'audio') mode = annonce
  else mode = h.get('Accept-Ranges')?.trim().toLowerCase() === 'none' ? 'remux' : 'direct'
  const duree = Number(h.get('X-Mytv-Duree'))
  return { mode, dureeSecondes: Number.isFinite(duree) && duree > 0 ? Math.round(duree) : undefined }
}

// --- Preparation de la source ---------------------------------------------

export interface OptionsPlan {
  /** Adresse `lecture` du contenu (jamais construite a la main ici). */
  lecture: string
  /** Point de reprise en secondes, pour un film remuxe. */
  decalage?: number
  /** Capacites du navigateur, annoncees par `?cap=`. */
  capacites?: Capacites
  signal?: AbortSignal
  /** Injectable pour les tests. */
  fetchImpl?: typeof fetch
}

/**
 * Plan d'un DIRECT. Aucune requete : une verification prealable ouvrirait une
 * playlist de plus, donc une demande de place de plus chez un fournisseur qui
 * n'en accorde qu'une. C'est hls.js qui ouvre la playlist, et ses erreurs
 * (503 + Retry-After, 401) sont traduites par `lecteur.ts`.
 */
export function planDirect(lecture: string): Plan {
  return { genre: 'live', lecture, url: lecture, chaine: chaineDeLecture(lecture), viaService: false }
}

/**
 * Plan d'un FILM : un `HEAD` d'abord.
 *
 * POURQUOI : une balise <video> ne rend ni le statut ni les en-tetes d'une
 * reponse d'erreur — un 503, un 415 ou un 401 y deviennent tous « source non
 * supportee ». Seul un `fetch` peut distinguer « place occupee, patientez » de
 * « format illisible ». Le serveur repond au HEAD comme au GET (memes statuts)
 * sans lancer de remux, et l'en-tete `Accept-Ranges` nous dit s'il va en faire
 * un : la strategie de deplacement en depend.
 */
export async function planVod(opts: OptionsPlan): Promise<Plan> {
  const { lecture: lectureBrute, capacites, decalage = 0, signal, fetchImpl = fetch } = opts
  // Le serveur ne convertit que ce que le navigateur ne lit pas : on lui dit ce qu'il lit.
  const lecture = capacites ? urlAvecCapacites(lectureBrute, capacites) : lectureBrute
  let r: Response
  try {
    r = await fetchImpl(lecture, { method: 'HEAD', credentials: 'same-origin', signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ErreurLecteur('reseau', 'Le serveur est injoignable.', 'Réessayer ; vérifier la liaison réseau.', String(e))
  }
  if (!r.ok) {
    signalerSiNonAuthentifie(r.status)
    // Pas de corps sur un HEAD : le code d'erreur est lu dans l'en-tete du serveur.
    throw erreurDeStatut(r.status, {
      retryAfter: r.headers.get('Retry-After'),
      code: r.headers.get('X-Mytv-Erreur') ?? undefined,
      expiration: r.headers.get('X-Mytv-Expiration'),
      contexte: 'film',
    })
  }
  const { mode, dureeSecondes } = lireEnTetesVod(r.headers)
  const viaService = mode !== 'direct'
  return {
    genre: 'vod',
    lecture,
    // `?t=` n'a de sens que pour un MP4 fabrique : un fichier servi tel quel se
    // deplace par Range, que le navigateur gere.
    url: viaService ? urlVod(lecture, decalage) : lecture,
    mode,
    viaService,
    dureeSecondes,
  }
}

/**
 * Borne une position visee. Sans duree connue (film remuxe sans `X-Mytv-Duree`),
 * on ne plafonne PAS : `Math.min(0, cible)` renvoyait chaque deplacement au
 * debut du film. Le serveur, lui, sait refuser un `?t=` hors du film.
 */
export function bornerPosition(cible: number, duree: number): number {
  if (!Number.isFinite(cible)) return 0
  const plafonnee = Number.isFinite(duree) && duree > 0 ? Math.min(duree, cible) : cible
  return Math.max(0, plafonnee)
}
