// Textes du guide et du direct (US-47 CA6). Module PUR : il se teste sous node.
//
// Le guide n'est pas un contenu : un 404 ou un 503 sur `/epg/grille` ne veut
// pas dire « ce contenu n'existe plus au catalogue » (audit D13). Et un etat
// vide a une cause que l'ecran connait (A UX18) : la dire plutot que lister
// trois hypotheses.

export const MESSAGE_GUIDE_INDISPONIBLE = 'Guide indisponible pour le moment.'
export const ACTION_GUIDE_INDISPONIBLE = 'Réessayer ; la navigation reste utilisable sans guide.'

export const MESSAGE_FLUX_ILLISIBLE = 'Impossible de lire ce flux.'
export const ACTION_FLUX_ILLISIBLE = 'Réessayer ; si cela persiste, choisir une autre chaîne.'

export interface EtatGuide {
  /** Texte du filtre saisi (vide : aucun). */
  filtre: string
  /** Chaines du direct au catalogue. */
  totalLive: number
  /** Chaines qui annoncent un guide (`epg_id`). */
  avecGuide: number
}

/** Pourquoi la grille est vide : le filtre, le catalogue, ou le fournisseur. */
export function messageGuideVide(e: EtatGuide): string {
  const f = e.filtre.trim()
  if (f) return `Aucune chaîne ne correspond à « ${f} ».`
  if (e.totalLive === 0) return 'Le catalogue n’est pas importé : importez-le depuis les Réglages pour afficher le guide.'
  if (e.avecGuide === 0) return 'Aucune chaîne de ce catalogue n’annonce de guide des programmes.'
  return 'Aucun programme à afficher.'
}

/** Contextes HLS (hls.js `details`) et chemins qui designent un flux du direct. */
const CONTEXTE_DIRECT = /manifest|level|frag|\.m3u8|\/seg\/|^direct$/i

/** Un echec de chargement de playlist ou de segment : c'est le flux, pas le catalogue. */
export function estContexteDirect(contexte: string | undefined): boolean {
  return !!contexte && CONTEXTE_DIRECT.test(contexte)
}

export const CONTEXTE_GUIDE = 'guide des programmes'
