import type { EntreeCatalogue } from './db'

// Le navigateur ne lit ni le Matroska (54,6 % des 107 159 films), ni l'EAC3,
// ni le HEVC : mesure faite sur cette installation. Le service de remux, servi
// sous /flux/* sur la MEME origine que l'interface, normalise la sortie — y
// compris quand une chaine change de codec en cours de route (TF1 mesuree en
// h264+eac3 puis en h264+aac vingt minutes plus tard).
//
// Ce module ne lit jamais un flux : il repond a une seule question, « quelle
// URL donner au lecteur », et il la garde en memoire pour ne pas la reposer.
// POURQUOI un cache obligatoire : sonder consomme la connexion UNIQUE du
// fournisseur pendant 0,7 a 5,5 s. Une sonde par contenu ouvert, pas plus.

export type GenreFlux = 'live' | 'movie' | 'series'

/** Les quatre strategies du service, plus son refus de reencoder. */
export type Strategie = 'redirection' | 'remux' | 'audio' | 'video' | 'refus'

/**
 * Strategie qu'on peut IMPOSER au service, par `?forcer=`, quand son verdict
 * s'est revele faux en pleine lecture. Ni `redirection` (elle ne produit rien,
 * donc elle ne repare rien) ni `refus` (on n'impose pas une panne).
 */
export type Forcage = Extract<Strategie, 'remux' | 'audio' | 'video'>

export interface Sonde {
  conteneur: string
  video?: string
  audio?: string
  strategie: Strategie
  /** Vrai quand le navigateur sait lire la source telle quelle. */
  lisibleDirect: boolean
  hauteur: number
  dureeSecondes: number
  /** Phrase du service, destinee a etre lue par un humain. */
  pourquoi: string
  coutCpu: string
  depuisCache: boolean
}

/** Ce que le service sait nommer : le genre et l'identifiant qu'il attend. */
export interface Reference {
  genre: GenreFlux
  id: string
}

export interface Plan {
  reference: Reference
  /** URL a donner au lecteur. */
  url: string
  /** Vrai quand le service est dans le chemin : son processeur travaille. */
  viaService: boolean
  sonde?: Sonde
  /** Strategie imposee au service : elle prime sur le verdict de la sonde. */
  forcer?: Forcage
  /** Renseigne quand on n'a PAS pu faire ce qui etait prevu. Jamais silencieux. */
  repli?: string
}

/**
 * Ce que le service fait REELLEMENT au flux ouvert. La sonde dit ce qu'il AURAIT
 * fait ; apres un forcage, les deux divergent, et c'est le forcage qui a lieu.
 */
export function strategieEffective(plan: Plan | null | undefined): Strategie | undefined {
  if (!plan?.viaService) return undefined
  return plan.forcer ?? plan.sonde?.strategie
}

/**
 * Ce qu'on annonce quand on impose une sortie. Le dossier interdit l'echec
 * muet : un transcodage declenche derriere le dos de l'utilisateur, apres une
 * image qui s'est figee, doit se dire.
 */
export const LIBELLE_FORCAGE: Record<Forcage, string> = {
  remux: 'conteneur réécrit par le service après un échec de lecture',
  audio: 'son réencodé en AAC par le service après un échec de lecture',
  video: 'image réencodée en H.264 par le service après un échec de lecture',
}

/**
 * Couts mesures sur ce serveur, repris du service pour les sorties imposees :
 * apres un forcage, le cout annonce par la sonde est celui d'un traitement
 * qu'on ne fait plus.
 */
const COUT_MESURE: Record<Forcage, string> = {
  remux: "0,33 % d'un cœur (speed 30,9x)",
  audio: "2,5 % d'un cœur (speed 42,4x)",
  video: "78 à 106 % d'un cœur (speed 3,8x h264, 2,9x hevc)",
}

/**
 * Ce qu'on montre avant de faire chauffer le processeur. POURQUOI ne pas
 * reprendre la phrase de la sonde : apres un forcage elle motive un traitement
 * abandonne — mesure a l'ecran, elle annoncait « 0 % CPU, aucun ffmpeg » juste
 * au-dessus d'un bouton qui lance un reencodage a 106 % d'un coeur.
 */
export function justification(plan: Plan | null | undefined): { pourquoi: string; coutCpu: string } {
  const forcee = plan?.forcer
  if (forcee) return { pourquoi: LIBELLE_FORCAGE[forcee], coutCpu: COUT_MESURE[forcee] }
  return {
    pourquoi: plan?.sonde?.pourquoi ?? 'le service n’a pas motivé son choix',
    coutCpu: plan?.sonde?.coutCpu ?? 'coût inconnu',
  }
}

/** Libelle complet, pour le panneau d'informations. */
export const LIBELLE_STRATEGIE: Record<Strategie, string> = {
  redirection: 'Aucun traitement',
  remux: 'Remux — conteneur réécrit',
  audio: 'Audio réencodé en AAC',
  video: 'Vidéo réencodée en H.264',
  refus: 'Traitement refusé par le service',
}

/** Libelle court, pour la ligne technique posee sur l'image. */
export const BADGE_STRATEGIE: Record<Strategie, string> = {
  redirection: 'direct',
  remux: 'remux',
  audio: 'audio AAC',
  video: 'réencodage H.264',
  refus: 'refusé',
}

/** Teintes des tokens : le remux ne coute rien, le reencodage video si. */
export const TEINTE_STRATEGIE: Record<Strategie, string> = {
  redirection: 'var(--ok)',
  remux: 'var(--acc-fg)',
  audio: 'var(--lim)',
  video: 'var(--cod)',
  refus: 'var(--err)',
}

/** Seule strategie assez couteuse pour qu'on demande l'avis de l'utilisateur. */
export function coutAVertir(plan: Plan | null | undefined): boolean {
  return strategieEffective(plan) === 'video'
}

/**
 * Le deplacement passe-t-il par `?t=` ? Uniquement quand le service fabrique le
 * MP4 : une source servie octet pour octet se deplace nativement.
 */
export function deplacementParService(plan: Plan | null | undefined): boolean {
  return !!plan && plan.viaService && plan.reference.genre !== 'live'
}

// --- Identification du contenu -------------------------------------------

/**
 * La fiche serie ne transmet qu'une URL toute faite : l'identifiant d'EPISODE,
 * que le service attend, n'est que la-dedans. On le ressort plutot que de
 * sonder la serie entiere, qui n'est pas un flux.
 */
function identifiantEpisode(url: string): string | undefined {
  const trouve = /\/series\/[^/]+\/[^/]+\/([^/?#]+)/.exec(url)
  const brut = trouve?.[1]
  return brut ? brut.replace(/\.[a-z0-9]{2,5}$/i, '') : undefined
}

export function referenceDe(entree: EntreeCatalogue, urlForcee?: string): Reference {
  if (entree.type === 'live') return { genre: 'live', id: String(entree.id) }
  const episode = urlForcee ? identifiantEpisode(urlForcee) : undefined
  if (episode) return { genre: 'series', id: episode }
  // Sans URL forcee, une entree « series » est ouverte comme un film : c'est
  // l'identifiant du catalogue, et le service le traitera comme tel.
  return { genre: 'movie', id: String(entree.id) }
}

/**
 * URL du service. Relative : l'interface et le service partagent l'origine, donc
 * aucun CORS et aucune adresse a configurer.
 *
 * `decalage` part en `?t=` : le service le documente comme exact, contrairement
 * a la traduction octet → temps que fait une balise <video> nue.
 */
export function urlFlux(reference: Reference, decalage = 0, forcer?: Forcage): string {
  const id = encodeURIComponent(reference.id)
  const parametres = new URLSearchParams()
  // Le direct n'a pas d'instant a viser : sa playlist est toujours au present.
  if (reference.genre !== 'live' && decalage > 0.5) parametres.set('t', decalage.toFixed(3))
  if (forcer) parametres.set('forcer', forcer)
  const requete = parametres.toString()
  const base = reference.genre === 'live' ? `/flux/live/${id}.m3u8` : `/flux/${reference.genre}/${id}`
  return requete ? `${base}?${requete}` : base
}

// --- Cache des sondes -----------------------------------------------------

const CLE_STOCKAGE = 'mytv.flux.sondes'
// La VOD est immuable ; le direct change de programme, et parfois de codec.
// POURQUOI 600 s et pas un jour : le service a ramene son propre cache de
// direct a 600 s apres la panne mesuree sur TF1 (h264+eac3 puis h264+aac vingt
// minutes plus tard). Garder un verdict un jour entier ici annulerait cette
// correction -- le navigateur n'aurait meme pas reinterroge le service.
const DUREE_VALIDITE: Record<GenreFlux, number> = {
  live: 600_000,
  movie: Number.POSITIVE_INFINITY,
  series: Number.POSITIVE_INFINITY,
}
/** Un echec n'est pas un verdict : on le reinterroge vite, et on ne le garde pas. */
const VALIDITE_ECHEC = 60_000
/** Plafond du stockage : 107 159 films ne tiennent pas dans localStorage. */
const MAX_MEMORISE = 400

export interface Resultat {
  sonde?: Sonde
  /** Phrase expliquant pourquoi il n'y a pas de verdict. */
  echec?: string
  /**
   * Vrai quand c'est le SERVICE qui n'a pas repondu, et non l'amont qu'il
   * sonde. Un service muet ne peut rien transcoder : lui imposer une strategie
   * ne ferait qu'echouer autrement, il faut retomber sur TuliProx.
   */
  injoignable?: boolean
}

interface Memorise extends Resultat {
  horodatage: number
}

const memoire = new Map<string, Memorise>()
const enVol = new Map<string, Promise<Resultat>>()
let charge = false

function cle(r: Reference): string {
  return `${r.genre}:${r.id}`
}

function charger(): void {
  if (charge) return
  charge = true
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE)
    if (!brut) return
    const lu = JSON.parse(brut) as Record<string, Memorise>
    for (const [k, v] of Object.entries(lu)) if (v.sonde) memoire.set(k, v)
  } catch {
    // Stockage illisible ou mode prive : le cache memoire suffit a la session.
  }
}

function persister(): void {
  try {
    // Les plus recentes d'abord : Map conserve l'ordre d'insertion.
    const entrees = [...memoire.entries()].filter(([, v]) => v.sonde).slice(-MAX_MEMORISE)
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(Object.fromEntries(entrees)))
  } catch {
    // Quota atteint : la session garde quand meme ses verdicts en memoire.
  }
}

function perime(r: Reference, m: Memorise): boolean {
  const validite = m.sonde ? DUREE_VALIDITE[r.genre] : VALIDITE_ECHEC
  return Date.now() - m.horodatage > validite
}

/** Oublie un verdict : utile quand l'utilisateur reessaie explicitement. */
export function oublierSonde(r: Reference): void {
  memoire.delete(cle(r))
  persister()
}

function texte(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function nombre(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const STRATEGIES: readonly Strategie[] = ['redirection', 'remux', 'audio', 'video', 'refus']

function normaliser(brut: Record<string, unknown>): Sonde {
  const annoncee = texte(brut['strategie'])
  const strategie = STRATEGIES.find((s) => s === annoncee) ?? 'refus'
  return {
    conteneur: texte(brut['conteneur']) ?? 'inconnu',
    video: texte(brut['video']),
    audio: texte(brut['audio']),
    strategie,
    lisibleDirect: brut['lisibleDirect'] === true,
    hauteur: nombre(brut['hauteur']),
    dureeSecondes: nombre(brut['dureeSecondes']),
    pourquoi: texte(brut['pourquoi']) ?? 'le service n’a pas motivé son choix',
    coutCpu: texte(brut['coutCpu']) ?? 'coût inconnu',
    depuisCache: brut['depuisCache'] === true,
  }
}

async function interroger(r: Reference, signal?: AbortSignal): Promise<Resultat> {
  let reponse: Response
  try {
    reponse = await fetch(`/flux/sonde/${r.genre}/${encodeURIComponent(r.id)}`, {
      signal,
      credentials: 'omit',
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    return { echec: 'service de remux injoignable', injoignable: true }
  }
  let corps: unknown
  try {
    corps = await reponse.json()
  } catch {
    return { echec: `réponse illisible du service (HTTP ${reponse.status})` }
  }
  const objet = (corps ?? {}) as Record<string, unknown>
  if (!reponse.ok)
    return { echec: `analyse impossible — ${texte(objet['erreur']) ?? `HTTP ${reponse.status}`}` }
  return { sonde: normaliser(objet) }
}

/**
 * Une sonde par contenu, jamais deux. Les appels concurrents sur le meme
 * contenu partagent la requete en vol ; les suivants lisent le verdict garde.
 */
export async function sonder(r: Reference, signal?: AbortSignal): Promise<Resultat> {
  charger()
  const k = cle(r)
  const vu = memoire.get(k)
  if (vu && !perime(r, vu))
    return { sonde: vu.sonde, echec: vu.echec, injoignable: vu.injoignable }

  const dejaEnVol = enVol.get(k)
  if (dejaEnVol) return dejaEnVol

  const requete = interroger(r, signal)
    .then((resultat) => {
      memoire.delete(k)
      memoire.set(k, { ...resultat, horodatage: Date.now() })
      if (resultat.sonde) persister()
      return resultat
    })
    .finally(() => enVol.delete(k))
  enVol.set(k, requete)
  // Un abandon ne memorise rien : le contenu suivant doit pouvoir etre sonde.
  return requete
}

// --- Decision -------------------------------------------------------------

/**
 * Decide de l'URL a donner au lecteur. TuliProx en direct quand la source est
 * lisible telle quelle — zero CPU, un saut de moins —, le service sinon.
 *
 * `forcer` repond a la panne mesuree : une chaine qui change d'encodage en
 * cours de journee rend le verdict de la sonde faux, et REPASSER PAR LE SERVICE
 * NE SUFFIT PAS — consulte a nouveau, il rend le meme verdict et redirige vers
 * le meme flux illisible. Seule l'imposition d'une sortie repare, parce qu'elle
 * ne depend plus d'aucun diagnostic.
 */
export async function planifier(opts: {
  reference: Reference
  /** URL TuliProx deja construite par l'appelant : lui seul a les identifiants. */
  urlDirecte: string
  decalage?: number
  /** Strategie a imposer au service, apres un echec de lecture constate. */
  forcer?: Forcage
  signal?: AbortSignal
}): Promise<Plan> {
  const { reference, urlDirecte, decalage = 0, forcer, signal } = opts

  // LE DIRECT NE SE SONDE PAS. Sonder lance un ffprobe sur le flux, donc ouvre
  // une connexion chez un fournisseur qui n'en accorde qu'UNE : la sonde coupe
  // la chaine en cours de lecture, a chaque zap. Et son verdict est de toute
  // facon perissable, le fournisseur changeant d'encodage en cours de journee.
  // On tente donc la lecture directe, et c'est l'echec reel — jamais un
  // diagnostic prealable — qui declenche le passage par le service.
  if (reference.genre === 'live' && !forcer)
    return { reference, url: urlDirecte, viaService: false }

  if (reference.genre === 'live')
    return {
      reference,
      url: urlFlux(reference, decalage, forcer),
      viaService: true,
      repli: `format illisible en lecture directe — transcodage ${forcer} par le service`,
    }

  // La VOD, elle, porte sur un fichier fixe : sa sonde est exacte, durable, et
  // sa duree est la seule base fiable du deplacement.
  const { sonde, echec, injoignable } = await sonder(reference, signal)
  const parService = (repli?: string): Plan => ({
    reference,
    url: urlFlux(reference, decalage),
    viaService: true,
    sonde,
    repli,
  })

  // Un service muet ne transcode rien : insister l'enverrait echouer autrement.
  if (forcer && !injoignable)
    return {
      reference,
      url: urlFlux(reference, decalage, forcer),
      viaService: true,
      sonde,
      forcer,
      repli:
        LIBELLE_FORCAGE[forcer] +
        (echec ? ` — verdict indisponible (${echec}), sortie imposée quand même` : ''),
    }

  if (echec || !sonde)
    return {
      reference,
      url: urlDirecte,
      viaService: false,
      repli: `${echec ?? 'aucun verdict'} — lecture directe depuis TuliProx`,
    }

  if (sonde.strategie === 'refus')
    return {
      reference,
      url: urlDirecte,
      viaService: false,
      sonde,
      repli: `${sonde.pourquoi} — lecture directe tentée`,
    }

  if (sonde.lisibleDirect) return { reference, url: urlDirecte, viaService: false, sonde }
  return parService()
}
