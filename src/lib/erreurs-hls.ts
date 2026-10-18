// Que faire d'une erreur signalee par hls.js, AVANT de rouvrir le flux ?
//
// POURQUOI ce module : jusqu'ici toute erreur fatale valait `hls.destroy()` puis
// une reattache complete — playlist, segments, et surtout reprise de la place
// chez un fournisseur qui n'en accorde qu'une. Or la doc de hls.js prevoit des
// gestes bien moins couteux : `recoverMediaError()` pour une erreur de media
// (le tampon est rejoue, aucune connexion de plus), `swapAudioCodec()` si elle
// se repete, `startLoad()` pour une erreur reseau. Ce module decide, sans
// reactivite ni reseau, pour que les bornes — jamais de boucle — soient testees
// seules. La traduction en ErreurLecteur et la reattache restent dans lecteur.ts.

export type ActionHls =
  /** `hls.recoverMediaError()` : rejoue le tampon, sans connexion de plus. */
  | 'recuperer'
  /** `hls.swapAudioCodec()` puis `recoverMediaError()` (2e erreur media rapprochee). */
  | 'permuter-audio'
  /** `hls.startLoad()` : une erreur reseau sans statut HTTP, une fois. */
  | 'recharger'
  /** Rien a faire ici : l'erreur remonte a la politique de reprise. */
  | 'remonter'
  /** Erreur non fatale que hls.js rattrape seul : on note, c'est tout. */
  | 'ignorer'

export interface EvenementHls {
  /** `data.type` : NETWORK_ERROR, MEDIA_ERROR, ... */
  type: string
  /** `data.details` : fragParsingError, bufferAppendNoProgress, ... */
  details: string
  fatal: boolean
  /** Statut HTTP de la reponse en cause, s'il y en a une. */
  statut?: number
  /** Place prise (503/429/403/407) : jamais recuperee ici, toujours remontee. */
  placePrise?: boolean
  /** Instant de l'erreur, en ms. */
  maintenant: number
  /** `video.currentTime` a cet instant : le progres reel de la lecture. */
  position: number
}

export interface EtatHls {
  /** Instants des `recoverMediaError()` deja faits (fenetre glissante). */
  readonly recuperations: readonly number[]
  /** `startLoad()` deja tente pour cette attache. */
  readonly recharge: boolean
  /** `bufferAppendNoProgress` : debut de la serie courante et position d'alors. */
  readonly sansProgres: { readonly depuis: number; readonly position: number; readonly n: number } | null
  /** La boucle sans progres a deja valu UNE recuperation. */
  readonly sansProgresRecupere: boolean
}

export const ETAT_HLS_INITIAL: EtatHls = { recuperations: [], recharge: false, sansProgres: null, sansProgresRecupere: false }

/** Deux erreurs media a moins de 10 s l'une de l'autre : la doc hls.js permute alors le codec audio. */
export const FENETRE_MEDIA_MS = 10_000
/** Au-dela, meme espacees, on ne rejoue plus le tampon : c'est la politique de reprise qui decide. */
export const RECUPERATIONS_MAX = 4
/** `bufferAppendNoProgress` : au-dela de ce nombre en moins de 30 s sans que la position avance... */
export const SANS_PROGRES_MAX = 5
export const FENETRE_SANS_PROGRES_MS = 30_000

export const TYPE_RESEAU = 'networkError'
export const TYPE_MEDIA = 'mediaError'
export const DETAIL_SANS_PROGRES = 'bufferAppendNoProgress'
const DETAIL_PARSING = 'fragParsingError'

export function reagir(etat: EtatHls, e: EvenementHls): { action: ActionHls; etat: EtatHls } {
  // Une place prise est traitee par l'appelant (fatale tout de suite, remontee) :
  // la recuperer ici ferait un essai de plus chez le fournisseur.
  if (e.placePrise) return { action: 'remonter', etat }

  if (!e.fatal) {
    if (e.details !== DETAIL_SANS_PROGRES) return { action: 'ignorer', etat }
    return sansProgres(etat, e)
  }

  if (e.type === TYPE_MEDIA) {
    // Un echec de demultiplexage ne se soigne pas en rejouant le tampon : il
    // declenche les forcages bornes (modes-direct), via la politique habituelle.
    if (e.details.includes(DETAIL_PARSING)) return { action: 'remonter', etat }
    const recentes = etat.recuperations.filter((t) => e.maintenant - t < FENETRE_MEDIA_MS)
    if (etat.recuperations.length >= RECUPERATIONS_MAX || recentes.length >= 2) return { action: 'remonter', etat }
    const suivant = { ...etat, recuperations: [...etat.recuperations, e.maintenant] }
    return { action: recentes.length === 1 ? 'permuter-audio' : 'recuperer', etat: suivant }
  }

  if (e.type === TYPE_RESEAU) {
    // Un statut HTTP (401, 404, 502...) a un sens que `startLoad()` ne changera
    // pas, et la politique de reprise sait le lire. Sans statut — delai, corps
    // tronque, connexion fermee — un rechargement vaut la peine, une fois.
    if (etat.recharge || (e.statut !== undefined && e.statut >= 400)) return { action: 'remonter', etat }
    return { action: 'recharger', etat: { ...etat, recharge: true } }
  }

  return { action: 'remonter', etat }
}

/**
 * `bufferAppendNoProgress` n'est pas fatal : hls.js marque le segment comme un
 * trou et continue. Mais en boucle (vu en telemetrie : des dizaines d'affilee
 * avec `video:seeking pos 0`), la lecture est figee sans qu'aucune erreur fatale
 * ne remonte jamais. On compte : au-dela de SANS_PROGRES_MAX en 30 s sans que la
 * position ait avance, une recuperation, puis la reprise habituelle.
 */
function sansProgres(etat: EtatHls, e: EvenementHls): { action: ActionHls; etat: EtatHls } {
  const serie = etat.sansProgres
  const continuee = serie && e.maintenant - serie.depuis < FENETRE_SANS_PROGRES_MS && e.position <= serie.position + 0.5
  const courante = continuee
    ? { ...serie, n: serie.n + 1 }
    : { depuis: e.maintenant, position: e.position, n: 1 }
  if (courante.n < SANS_PROGRES_MAX) return { action: 'ignorer', etat: { ...etat, sansProgres: courante } }
  // Seuil atteint : la serie repart de zero, qu'on recupere ou qu'on remonte.
  if (!etat.sansProgresRecupere)
    return { action: 'recuperer', etat: { ...etat, sansProgres: null, sansProgresRecupere: true } }
  return { action: 'remonter', etat: { ...etat, sansProgres: null } }
}
