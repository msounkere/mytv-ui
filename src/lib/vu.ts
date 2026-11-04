// Seuil UNIQUE de l'etat « Vu » (lot 10, modele cible) : part lue >= 0,9, la
// meme valeur que `domain.PartVue` cote serveur. Toute comparaison de
// l'interface passe par ici : une position venue d'un autre appareil entre
// 90 et 95 % etait « en cours » sur l'Accueil et « vue » au lecteur (B16).
// Module PUR, sans dependance : il se teste sous node.

export const PART_VUE = 0.9

/** Vrai quand une position memorisee compte comme « vu ». */
export function estVu(position: number, duree: number): boolean {
  return duree > 0 && position / duree >= PART_VUE
}

/** Part lue, bornee a [0, 1] ; 0 sans duree. */
export function partLue(position: number, duree: number): number {
  return duree > 0 ? Math.max(0, Math.min(1, position / duree)) : 0
}
