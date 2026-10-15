// Deux formats que le pied du lecteur, sa colonne de pistes et ses bandeaux
// écrivent de la même façon : les séparer les ferait diverger.

/** Surtitre des petites sections : « EN CE MOMENT », « ENSUITE », « CATÉGORIE ». */
export const surtitre = {
  'font-size': '11px', 'font-weight': 'var(--w-strong)',
  'text-transform': 'uppercase', 'letter-spacing': '.06em',
} as const

export function heure(ms: number): string {
  if (!ms) return '--:--'
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
