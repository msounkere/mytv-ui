/**
 * Ou l'on revient en QUITTANT le lecteur (US-45 CA2) : UNE seule regle, la pile
 * d'historique -- `etat.revenirEnArriere(repli)` (ui-8) fait `history.back()`
 * tant que l'application a pousse des entrees ; sinon (lien direct,
 * rechargement) elle va au REPLI rendu ici : la fiche du contenu, sinon l'accueil.
 * « Retour », Echap, « Fermer la lecture », « Retour » du panneau d'erreur et la
 * fin de lecture passent tous par la ; le mini-lecteur, lui, ne navigue jamais.
 *
 * POURQUOI un module a part : la regle (`destinationRetour`) est pure et testee
 * seule, sans le routeur ni l'etat reactif. Constat qui l'a motivee (audits A8,
 * B UX4/UX5) : « Retour » d'un film menait a /films meme depuis la fiche ou
 * l'accueil, la fiche serie renvoyait vers Direct, « Fermer la lecture » depuis
 * l'accueil quittait l'accueil, la recherche en cours etait perdue.
 */
export type SelectionSortie = { type: 'live' | 'vod' | 'series'; cle?: string; serie?: string } | null | undefined

export type DestinationRetour =
  /** La pile de l'application n'est pas vide : un pas en arriere. */
  | { action: 'arriere' }
  /** Pile vide : la fiche du contenu (film, ou serie d'un episode). */
  | { action: 'fiche'; chemin: string }
  /** Pile vide et pas de fiche (chaine, inconnu) : l'accueil. */
  | { action: 'accueil'; chemin: '/' }

/** Regle pure du retour : `profondeur` = entrees d'historique poussees par l'application. */
export function destinationRetour(profondeur: number, sel: SelectionSortie): DestinationRetour {
  if (profondeur > 0) return { action: 'arriere' }
  if (sel?.type === 'vod' && sel.cle) return { action: 'fiche', chemin: `/film/${sel.cle}` }
  if (sel?.type === 'series' && sel.serie) return { action: 'fiche', chemin: `/serie/${sel.serie}` }
  return { action: 'accueil', chemin: '/' }
}

/**
 * Repli « apres lecture », pour `etat.ts` (`quitterLecteur`, `arreterLecture`) :
 * la fiche du contenu, sinon l'accueil -- jamais plus /films, /direct, /series.
 */
export function cheminApresLecture(sel: SelectionSortie): string {
  const d = destinationRetour(0, sel)
  return d.action === 'arriere' ? '/' : d.chemin
}
