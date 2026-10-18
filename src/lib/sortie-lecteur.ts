/**
 * Ou l'on revient en QUITTANT le lecteur. Un episode ramene a la fiche de sa serie
 * (c'est de la qu'on est venu, et c'est la que sont les autres episodes) ; un film ou
 * une chaine ramene a sa liste. POURQUOI une fonction a part : la regle est testee seule,
 * sans le routeur ni l'etat reactif.
 *
 * Constat qui a motive la regle : depuis un episode, la croix renvoyait a la liste de
 * TOUTES les series et rien dans l'ecran ne disait comment revenir a la serie en cours.
 */
export type SelectionSortie = { type: 'live' | 'vod' | 'series'; serie?: string } | null | undefined

// Les memes chemins que l'etat de navigation (CHEMIN_ONGLET) : trois constantes, recopiees
// pour que ce module reste pur.
const LISTE: Record<'live' | 'vod' | 'series', string> = { live: '/direct', vod: '/films', series: '/series' }

export function cheminApresLecture(sel: SelectionSortie): string {
  if (!sel) return '/'
  if (sel.type === 'series' && sel.serie) return `/serie/${sel.serie}`
  return LISTE[sel.type] ?? '/'
}
