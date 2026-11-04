import type { EntreeCatalogue, Reprise } from './db'
import type { EpisodeLisible } from './episodes-suivants'
import { PART_VUE, estVu } from './vu'

// Rangee « Reprendre » (ex-« Continuer a regarder ») : jointure des positions
// memorisees au catalogue, et choix de L'EPISODE A LIRE pour une serie.
//
// POURQUOI un module a part : un EPISODE n'est pas une entree du catalogue (sa cle
// « series:iptva:768606.mkv » n'y existe pas), seule sa SERIE l'est. La rangee ne
// retenait que les cles trouvees telles quelles : les films y figuraient, jamais
// les series en cours (trou fonctionnel vu en reel le 2026-10-31). Un episode est
// donc represente par sa serie, et une serie n'apparait qu'une fois.
//
// Lot 10 (US-46 CA3) : une serie RESTE tant qu'il lui reste un episode (C7) ; la
// carte pointe l'episode entame, sinon le prochain non vu apres le dernier vu
// (saisons dans l'ordre) ; le seuil « vu » est PART_VUE (B16). Module PUR.

export interface RepriseJointe {
  entree: EntreeCatalogue
  ligne: Reprise
  /** Vrai quand la ligne est un episode affiche sous sa serie. */
  episode: boolean
}

/** Part au-dela de laquelle un contenu est considere termine : le seuil unique. */
export const PART_TERMINEE = PART_VUE

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
 * catalogue : un film vu est ecarte, un episode (vu ou non) prend l'entree de sa serie
 * -- c'est `episodeAReprendre` qui dira ensuite s'il reste quelque chose a lire --,
 * chaque entree n'est gardee qu'une fois (sa ligne la plus recente), les entrees
 * `cachees` (« Retirer de Reprendre ») sont passees. `limite` borne le resultat.
 */
export function joindreReprises(
  lignes: Reprise[],
  entrees: ReadonlyMap<string, EntreeCatalogue>,
  limite: number,
  cachees: ReadonlySet<string> = new Set(),
): RepriseJointe[] {
  const vues = new Set<string>()
  const sortie: RepriseJointe[] = []
  for (const ligne of lignes) {
    if (!(ligne.duree > 0)) continue
    const directe = entrees.get(ligne.cle)
    if (directe && estVu(ligne.position, ligne.duree)) continue
    const entree = directe ?? (ligne.serie ? entrees.get(ligne.serie) : undefined)
    if (!entree || vues.has(entree.cle) || cachees.has(entree.cle)) continue
    vues.add(entree.cle)
    sortie.push({ entree, ligne, episode: !directe })
    if (sortie.length >= limite) break
  }
  return sortie
}

export interface EpisodeAReprendre {
  episode: EpisodeLisible
  /** Position memorisee de cet episode, s'il est entame. */
  ligne?: Reprise
  /** Part lue, 0 pour un episode jamais ouvert. */
  progression: number
  /** Secondes restantes, pour un episode entame. */
  resteS?: number
  /** Vrai quand c'est « l'episode suivant » (le precedent est vu), faux quand il est entame. */
  suivant: boolean
}

/**
 * L'episode a lire d'une serie : la ligne la plus recente de la serie decide.
 * Entamee (part < PART_VUE) -> cet episode avec sa progression ; vue -> le
 * premier episode NON VU qui la suit, saisons dans l'ordre ; plus rien ->
 * `undefined` (serie finie : elle sort de la rangee). Sans aucune ligne ->
 * `undefined` aussi (une serie jamais ouverte n'est pas « a reprendre »).
 */
export function episodeAReprendre(episodes: EpisodeLisible[], lignes: ReadonlyMap<string, Reprise>): EpisodeAReprendre | undefined {
  let recente: Reprise | undefined
  for (const e of episodes) {
    const l = lignes.get(e.cle)
    if (l && l.duree > 0 && (!recente || l.vuLe > recente.vuLe)) recente = l
  }
  if (!recente) return undefined
  const i = episodes.findIndex((e) => e.cle === recente!.cle)
  if (i < 0) return undefined
  if (!estVu(recente.position, recente.duree)) {
    return {
      episode: episodes[i]!, ligne: recente, suivant: false,
      progression: Math.min(1, recente.position / recente.duree),
      resteS: Math.max(0, recente.duree - recente.position),
    }
  }
  for (let j = i + 1; j < episodes.length; j++) {
    const e = episodes[j]!
    const l = lignes.get(e.cle)
    if (l && l.duree > 0 && estVu(l.position, l.duree)) continue
    if (l && l.duree > 0 && l.position > 0)
      return { episode: e, ligne: l, suivant: false, progression: Math.min(1, l.position / l.duree), resteS: Math.max(0, l.duree - l.position) }
    return { episode: e, suivant: true, progression: 0 }
  }
  return undefined
}

/** « reste 23 min » ; jamais « 0 min » : sous la minute, « reste 1 min » (B16, C14). */
export function resteLisible(secondes: number): string {
  const s = Math.max(0, Math.round(secondes))
  const h = Math.floor(s / 3600)
  const m = Math.max(1, Math.round((s % 3600) / 60))
  if (h > 0) return `reste ${h} h ${String(m === 60 ? 0 : m).padStart(2, '0')}`
  return `reste ${m} min`
}
