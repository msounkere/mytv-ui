// Modes du DIRECT et machine d'etats des tentatives de conversion (US-32).
//
// Le serveur decide seul du traitement d'une chaine (direct, audio AAC, video
// reencodee, refus de la 4K) et le dit dans `X-Mytv-Mode`. Si le navigateur
// n'arrive malgre tout pas a demultiplexer le flux (`fragParsingError` fatal),
// l'interface peut IMPOSER un mode avec `?forcer=audio` puis `?forcer=video`.
// Ces deux essais sont les seuls : chacun une fois, dans cet ordre, puis
// abandon. Ce module est pur (aucune reactivite, aucun reseau) pour que la
// borne -- « jamais de boucle » -- soit testee seule.

import { ErreurLecteur } from './errors'

export type ModeDirect = 'direct' | 'audio' | 'video' | 'refus'
export type ModeForce = 'audio' | 'video'

/** Ordre et nombre des tentatives : une de chaque, jamais plus. */
export const FORCAGES: readonly ModeForce[] = ['audio', 'video']

export const CODE_HEVC_NON_LISIBLE = 'format_hevc_non_lisible'
export const DETAIL_PARSING = 'fragParsingError'

/** Delai tolere pour qu'ffmpeg demarre (playlist, niveau) : bien au-dela des 10 s par defaut. */
export const DELAI_CONVERSION_MS = 45_000
export const DELAI_PLAYLIST_DIRECT_MS = 20_000

export function lireModeDirect(valeur: string | null | undefined): ModeDirect | undefined {
  const v = valeur?.trim().toLowerCase()
  return v === 'direct' || v === 'audio' || v === 'video' || v === 'refus' ? v : undefined
}

/** Une conversion est-elle en cours (serveur ou forcage) ? */
export function enConversion(mode: ModeDirect | ModeForce | null | undefined): boolean {
  return mode === 'audio' || mode === 'video'
}

export const LIBELLE_CONVERSION: Record<ModeForce, string> = {
  audio: 'Conversion audio en cours…',
  video: 'Conversion vidéo en cours (démarrage plus long)…',
}

/** Libelle court de la ligne technique du lecteur. */
export const BADGE_DIRECT: Record<ModeDirect, string> = {
  direct: 'direct',
  audio: 'audio converti',
  video: 'vidéo convertie',
  refus: 'refusé',
}

/** Chaine « 4K » : le mot isole dans le nom (« FR - CANAL+ 4K », « |4K| TF1 »), pas « 4KIDS ». */
export function est4K(nom: string | undefined): boolean {
  return !!nom && /(^|[^a-z0-9])4k($|[^a-z0-9])/i.test(nom)
}

export const MESSAGE_4K = 'Chaîne 4K : souvent non lisible dans un navigateur, ou lente à démarrer (conversion).'

/** Erreur finale apres les deux conversions manquees. */
export function erreurApresConversions(detail?: string): ErreurLecteur {
  return new ErreurLecteur(
    'codec',
    'Cette chaîne reste illisible dans ce navigateur, même après conversion de l’audio puis de la vidéo.',
    'Essayer une autre chaîne, ou la diffuser vers un téléviseur.',
    detail,
  )
}

export function estErreurParsing(e: { couche: string; detail?: string }): boolean {
  return e.couche === 'codec' && !!e.detail && e.detail.includes(DETAIL_PARSING)
}

// --- Machine d'etats des tentatives ----------------------------------------

export interface EtatTentatives {
  /** Modes deja imposes pour ce contenu. */
  readonly faits: readonly ModeForce[]
}

export const AUCUNE_TENTATIVE: EtatTentatives = { faits: [] }

export type Suite =
  | { action: 'forcer'; mode: ModeForce; etat: EtatTentatives; tentative: number; total: number }
  | { action: 'abandonner'; etat: EtatTentatives }
  | { action: 'ignorer'; etat: EtatTentatives }

/**
 * Apres une erreur fatale en direct. Ne s'occupe que d'un `fragParsingError` :
 * toute autre erreur est `ignorer` (la politique de reprise habituelle decide).
 * Le prochain mode est le premier de FORCAGES pas encore fait ; plus aucun, abandon.
 */
export function suiteApresErreur(etat: EtatTentatives, e: { couche: string; detail?: string }): Suite {
  if (!estErreurParsing(e)) return { action: 'ignorer', etat }
  const prochain = FORCAGES.find((m) => !etat.faits.includes(m))
  if (!prochain) return { action: 'abandonner', etat }
  const faits = [...etat.faits, prochain]
  return { action: 'forcer', mode: prochain, etat: { faits }, tentative: faits.length, total: FORCAGES.length }
}

/** Adresse de la playlist avec le mode impose ; l'adresse d'origine reste intacte sans mode. */
export function urlForcee(url: string, mode: ModeForce | null | undefined): string {
  if (!mode) return url
  const [chemin = '', requete = ''] = url.split('?', 2)
  const p = new URLSearchParams(requete)
  p.set('forcer', mode)
  return `${chemin}?${p.toString()}`
}
