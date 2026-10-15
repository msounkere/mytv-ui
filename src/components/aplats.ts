import { teinte } from './couleurs'

// Les surfaces 16:9 (couverture « À la une », miniature de reprise, vignette de
// programme) portent un grand titre en clair : la maquette les peint plus
// sombres et moins saturées que les affiches 2:3, sans quoi le texte s'y noie.

export function couverture(nom: string): string {
  return `oklch(0.27 0.05 ${teinte(nom)})`
}

/** Rayon des affiches et miniatures. Le dossier le fixe à 6 px ; aucun token
 *  ne le porte — `--r-sm` vaut 4 px en style Fluent, c'est le rayon des
 *  contrôles, pas celui des visuels. */
export const RAYON_VISUEL = '6px'
