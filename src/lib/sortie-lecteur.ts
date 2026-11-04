/**
 * Ou l'on revient en QUITTANT le lecteur (US-45 CA2) : UNE seule regle, la pile
 * d'historique. « Retour », Echap, « Fermer la lecture », « Retour » du panneau
 * d'erreur et la fin de lecture ramenent a l'ECRAN PRECEDENT ; si la pile de
 * l'application est vide (lien direct, rechargement), a la fiche du contenu,
 * sinon a l'accueil. Le mini-lecteur, lui, ne navigue jamais.
 *
 * POURQUOI un module a part : la regle (`destinationRetour`) est pure et testee
 * seule, sans le routeur ni l'etat reactif. Constat qui l'a motivee (audits A8,
 * B UX4/UX5) : « Retour » d'un film menait a /films meme depuis la fiche ou
 * l'accueil, la fiche serie renvoyait vers Direct, « Fermer la lecture » depuis
 * l'accueil quittait l'accueil, la recherche en cours etait perdue.
 *
 * CE QUE `cheminApresLecture` EST DEVENU : l'etat de navigation (`etat.ts`,
 * `arreterLecture` / `quitterLecteur`) l'appelle encore pour savoir ou aller ;
 * il rend desormais le CHEMIN COURANT — une navigation vers le chemin courant est
 * ignoree par le routeur — car c'est le lecteur qui navigue, par la pile. (Voir
 * /opt/mytv-work/statut/ui-6.contrat.demande : a terme `etat.ts` ne navigue plus.)
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

// Entrees d'historique presentes AVANT l'application : tout ce qui vient apres
// a ete pousse par elle. Capture au chargement du module, c'est-a-dire au
// demarrage (ce module est importe par l'etat de navigation).
const longueurDepart = typeof history !== 'undefined' ? history.length : 0

/** Profondeur de la pile de l'application (0 : lien direct ou rechargement). */
export function profondeurHistorique(): number {
  if (typeof history === 'undefined') return 0
  return Math.max(0, history.length - longueurDepart)
}

/** Chemin courant tel que le routeur le compare (chemin + requete + fragment). */
export function cheminCourant(): string {
  if (typeof location === 'undefined') return '/'
  return location.pathname + location.search + location.hash
}

/**
 * Appele par `etat.ts` : la destination « apres lecture ». Rendre le chemin
 * courant fait de cette navigation un non-evenement — c'est voulu, le lecteur
 * a deja navigue (ou ne doit pas : mini-lecteur).
 */
export function cheminApresLecture(_sel: SelectionSortie): string {
  return cheminCourant()
}

/**
 * Un pas en arriere dans la pile de l'application, sinon `repli` (fiche ou
 * accueil, par le routeur). Partage par le lecteur et les fiches.
 */
export function revenirEnArriere(sel: SelectionSortie, naviguer: (chemin: string) => void): DestinationRetour {
  const d = destinationRetour(profondeurHistorique(), sel)
  if (d.action === 'arriere') history.back()
  else naviguer(d.chemin)
  return d
}
