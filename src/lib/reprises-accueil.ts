import type { EntreeCatalogue, Reprise } from './db'

// Rangee « Continuer a regarder » : jointure des positions memorisees au catalogue.
//
// POURQUOI un module a part : un EPISODE n'est pas une entree du catalogue (sa cle
// « series:iptva:768606.mkv » n'y existe pas), seule sa SERIE l'est. La rangee ne
// retenait que les cles trouvees telles quelles : les films y figuraient, jamais
// les series en cours (trou fonctionnel vu en reel le 2026-10-31). Un episode est
// donc represente par sa serie, et une serie n'apparait qu'une fois, pour son
// episode le plus recent.

export interface RepriseJointe {
  entree: EntreeCatalogue
  ligne: Reprise
  /** Vrai quand la ligne est un episode affiche sous sa serie. */
  episode: boolean
}

/** Part au-dela de laquelle un contenu est considere termine (comme `reprisePour`). */
export const PART_TERMINEE = 0.95

/** Cles a charger dans le catalogue pour joindre ces lignes : la cle, et la serie des episodes. */
export function clesAJoindre(lignes: Reprise[]): string[] {
  const cles = new Set<string>()
  for (const l of lignes) {
    cles.add(l.cle)
    if (l.serie) cles.add(l.serie)
  }
  return [...cles]
}

/**
 * Joint les lignes (deja triees de la plus recente a la plus ancienne) aux entrees du
 * catalogue : les contenus termines sont ecartes, un episode prend l'entree de sa serie,
 * et chaque entree n'est gardee qu'une fois. `limite` borne le resultat.
 */
export function joindreReprises(
  lignes: Reprise[],
  entrees: ReadonlyMap<string, EntreeCatalogue>,
  limite: number,
): RepriseJointe[] {
  const vues = new Set<string>()
  const sortie: RepriseJointe[] = []
  for (const ligne of lignes) {
    if (!(ligne.duree > 0) || ligne.position / ligne.duree > PART_TERMINEE) continue
    const directe = entrees.get(ligne.cle)
    const entree = directe ?? (ligne.serie ? entrees.get(ligne.serie) : undefined)
    if (!entree || vues.has(entree.cle)) continue
    vues.add(entree.cle)
    sortie.push({ entree, ligne, episode: !directe })
    if (sortie.length >= limite) break
  }
  return sortie
}
