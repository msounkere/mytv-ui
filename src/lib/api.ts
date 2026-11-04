import { createSignal } from 'solid-js'
import { ErreurLecteur, erreurFournisseur, type Couche } from './errors'

// Couche reseau UNIQUE de l'interface vers `/api/v1` (contrat : docs/openapi.yaml
// du serveur). Tout ce qui parle au service passe ici, pour que trois regles
// ne dependent pas de la discipline de chaque appelant :
//   1. le cookie de session est joint par le navigateur (`same-origin`) -- le
//      jeton est HttpOnly, aucun JavaScript ne le lit ni ne le stocke ;
//   2. aucun identifiant, de fournisseur ou de compte, ne voyage dans une URL ;
//   3. une erreur est toujours `{code, message}` cote serveur, et devient ici
//      une `ErreurApi` portant le statut, le code stable et le delai de retry.

export const BASE_API = '/api/v1'

/** Erreur du service telle que le contrat la decrit (schema `Erreur`). */
export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    /** Code stable lisible par une machine (`conflit`, `profil_requis`...). */
    readonly code: string,
    message: string,
    /** Secondes, quand le service demande d'attendre (429, 503). */
    readonly retryApres?: number,
    /** Date d'expiration de l'abonnement (`fournisseur_compte_invalide`), si le serveur la donne. */
    readonly expiration?: string,
  ) {
    super(message)
    this.name = 'ErreurApi'
  }
}

/** Le reseau lui-meme a echoue : pas de reponse du tout (hors-ligne, service arrete). */
export class ErreurReseau extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'ErreurReseau'
  }
}

/**
 * Abonnes a la perte de session. Un 401 sur n'importe quel appel signifie
 * « cookie expire ou revoque » : on le fait savoir au portail (qui reaffiche la
 * connexion) plutot que de laisser chaque ecran echouer a sa facon. Un registre
 * et non un import de `auth.ts` : auth depend de ce module, pas l'inverse.
 */
const surSessionPerdue = new Set<() => void>()
export function abonnerSessionPerdue(f: () => void): () => void {
  surSessionPerdue.add(f)
  return () => surSessionPerdue.delete(f)
}

/** Declenche les abonnes : une couche (l'import en worker) a vu un 401 que `appeler` n'a pas pu voir. */
export function signalerSessionPerdue(): void {
  for (const f of surSessionPerdue) f()
}

/**
 * Le reseau vient-il d'echouer ? Vrai des qu'un appel n'obtient AUCUNE reponse,
 * faux des qu'un appel en obtient une (meme une erreur : le service parle).
 * C'est l'un des trois signes que `lib/reseau.ts` combine pour dire
 * « Hors ligne » sur tous les ecrans (US-47 CA4).
 */
const [reseauCoupe, poserReseauCoupe] = createSignal(false)
export { reseauCoupe, poserReseauCoupe }

export interface OptionsAppel {
  methode?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  corps?: unknown
  signal?: AbortSignal
  entetes?: Record<string, string>
  /** Un 401 de cet appel n'est PAS une perte de session (la connexion elle-meme). */
  sansDetectionSession?: boolean
}

function retryApres(r: Response): number | undefined {
  const brut = r.headers.get('Retry-After')
  const n = brut === null ? NaN : Number(brut)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Lit l'erreur du contrat ; tolere un corps absent ou non JSON (proxy, panne). */
export async function erreurDe(r: Response): Promise<ErreurApi> {
  let code = 'inconnue'
  let message = `Reponse inattendue du service (${r.status}).`
  let expiration: string | undefined
  try {
    const c = (await r.json()) as { code?: unknown; message?: unknown; expiration?: unknown }
    if (typeof c.code === 'string') code = c.code
    if (typeof c.message === 'string') message = c.message
    if (typeof c.expiration === 'string') expiration = c.expiration
  } catch {
    // Corps illisible : le statut suffit.
  }
  return new ErreurApi(r.status, code, message, retryApres(r), expiration)
}

/** Appel brut : renvoie la reponse si 2xx ou 304, sinon leve `ErreurApi`. */
export async function appeler(chemin: string, o: OptionsAppel = {}): Promise<Response> {
  const entetes: Record<string, string> = { ...o.entetes }
  let corps: string | undefined
  if (o.corps !== undefined) {
    entetes['Content-Type'] = 'application/json'
    corps = JSON.stringify(o.corps)
  }
  let r: Response
  try {
    r = await fetch(`${BASE_API}${chemin}`, {
      method: o.methode ?? 'GET',
      headers: entetes,
      body: corps,
      signal: o.signal,
      credentials: 'same-origin',
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    poserReseauCoupe(true)
    throw new ErreurReseau(String(e))
  }
  poserReseauCoupe(false)
  if (r.ok || r.status === 304) return r
  const err = await erreurDe(r)
  if (r.status === 401 && !o.sansDetectionSession) for (const f of surSessionPerdue) f()
  throw err
}

/** Appel JSON : le corps de la reponse est suppose conforme au contrat. */
export async function json<T>(chemin: string, o: OptionsAppel = {}): Promise<T> {
  const r = await appeler(chemin, o)
  try {
    return (await r.json()) as T
  } catch {
    throw new ErreurApi(r.status, 'reponse_illisible', 'Reponse du service illisible.')
  }
}

/** Appel sans corps de reponse attendu (204). */
export async function envoyer(chemin: string, o: OptionsAppel = {}): Promise<void> {
  await appeler(chemin, o)
}

/** Traduit une erreur du service en erreur d'affichage nommee (`ErreurLecteur`). */
export function versErreurLecteur(e: unknown, action = 'Reessayer.'): ErreurLecteur {
  if (e instanceof ErreurLecteur) return e
  if (e instanceof ErreurReseau)
    return new ErreurLecteur('reseau', 'Le service est injoignable.', 'Verifier la connexion, puis reessayer.', e.message)
  if (e instanceof ErreurApi) {
    // Compte ou adresse refuses par le fournisseur : message dedie, pas un « relais » generique.
    const f = e.statut === 502 ? erreurFournisseur(e.code, e.expiration, `HTTP ${e.statut} ${e.code}`) : undefined
    if (f) return f
    const couche: Couche =
      e.statut === 401 || e.statut === 403 ? 'auth' : e.statut === 429 || e.statut === 503 ? 'limite' : 'relais'
    return new ErreurLecteur(couche, e.message, action, `HTTP ${e.statut} ${e.code}`)
  }
  return new ErreurLecteur('donnees', String(e), action)
}

// --- Types du contrat (schemas de docs/openapi.yaml) ------------------------

export type TypeApi = 'live' | 'vod' | 'series'

export interface SessionApi {
  id: string
  /** Nom du compte (contrat US-16b). Absent d'un serveur plus ancien : voir auth.ts. */
  nom?: string
  admin: boolean
  profil_id?: string
  expire: string
}

export interface ProfilApi {
  id: string
  nom: string
}

export interface LimitesApi {
  /** Taille maximale d'une page ET nombre maximal de chaines d'un appel `/epg/grille`. */
  pagination_max: number
  /** Plage maximale d'un appel `/epg/grille`, en secondes. */
  grille_fenetre: number
  favoris_max: number
  historique_max: number
  reglages_octets_max: number
}

export interface CompteApi {
  session: SessionApi
  profils: ProfilApi[]
  limites?: LimitesApi
}

export interface CategorieApi {
  id: string
  fournisseur: string
  type: TypeApi
  nom: string
  ordre: number
}

export interface ChaineApi {
  id: string
  nom: string
  logo?: string
  numero: number
  epg_id?: string
  categorie: string
  lecture: string
  ajoute?: string | null
}

export interface FilmApi {
  id: string
  nom: string
  image?: string
  categorie: string
  extension: string
  note: number
  annee?: string
  ajoute?: string | null
  lecture: string
}

export interface SerieApi {
  id: string
  nom: string
  image?: string
  categorie: string
  note: number
  annee?: string
  ajoute?: string | null
  saisons: string
}

export interface EpisodeApi {
  id: string
  numero: number
  titre: string
  extension: string
  duree: number
  lecture: string
  /** Facultatifs (US-28) : absents quand le fournisseur n'en donne pas. */
  synopsis?: string
  image?: string
  sortie?: string
  note?: number
}

/** Provenance des details (schema `DetailsStatut`). */
export type StatutDetailsApi = 'ok' | 'perime' | 'indisponible' | 'absent' | 'non_demande'

/** Schema `DetailsCommuns` : tout est facultatif. */
export interface DetailsApi {
  synopsis?: string
  genre?: string
  casting?: string
  realisateur?: string
  pays?: string
  sortie?: string
  /** Adresse https YouTube uniquement. */
  bande_annonce?: string
  image_fond?: string
  affiche?: string
  note?: number
  age?: string
  /** Film : secondes. */
  duree?: number
  /** Serie : duree moyenne d'un episode, secondes. */
  duree_episode?: number
}

/** `GET /films/{id}` et `GET /series/{id}` : les champs de la liste + les details. */
export type FilmDetailApi = FilmApi & { details?: DetailsApi; details_statut?: StatutDetailsApi }
export type SerieDetailApi = SerieApi & { details?: DetailsApi; details_statut?: StatutDetailsApi }

export interface SaisonApi {
  numero: number
  episodes: EpisodeApi[]
}

export interface ManifesteCatalogue {
  version: string
  categories: number
  chaines: number
  films: number
  series: number
  synchronise: string | null
}

export interface LectureApi {
  contenu: string
  serie?: string
  position: number
  duree: number
  vu: string
}

export interface ReglagesApi {
  valeurs: Record<string, string>
  revision: number
}

export interface Page<T> {
  elements: T[]
  limite: number
  decalage: number
  suivant: number | null
}
