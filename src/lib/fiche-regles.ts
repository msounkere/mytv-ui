// Regles PURES des fiches (US-45 CA3/CA4) : l'action principale d'un film et
// d'une serie, le temps restant, l'etat « vu ». Sans dependance : testees sous
// node, et appelees par FicheFilm / FicheSerie pour dire la meme chose.

/** Sous cette position (secondes), on ne propose pas de reprise : « Regarder », et la carte sans barre. */
export const SEUIL_REPRISE_S = 60

export interface RepriseFiche {
  position: number
  duree: number
}

/** « 42 min », « 1 h 05 », « 1 min » (jamais « 0 min »). */
export function resteLisible(secondes: number): string {
  const min = Math.max(1, Math.round(Math.max(0, secondes) / 60))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export function partVue(r: RepriseFiche | undefined): number {
  if (!r || !(r.duree > 0)) return 0
  return Math.max(0, Math.min(1, r.position / r.duree))
}

export type EtatLecture = 'jamais' | 'entame' | 'vu'

/** Vu au-dela de `partVueSeuil` ; entame a partir de SEUIL_REPRISE_S ; sinon « jamais » (y compris sous la minute : coherence avec la carte). */
export function etatLecture(r: RepriseFiche | undefined, partVueSeuil: number): EtatLecture {
  if (!r || !(r.duree > 0)) return 'jamais'
  if (partVue(r) >= partVueSeuil) return 'vu'
  return r.position >= SEUIL_REPRISE_S ? 'entame' : 'jamais'
}

export interface ActionFilm {
  libelle: string
  icone: 'play_arrow' | 'refresh'
  /** « Recommencer » a cote de « Reprendre ». */
  secondaire?: string
}

/** Fiche film : `Regarder` / `Reprendre · 42 min` (+ `Recommencer`) / `Regarder a nouveau`. */
export function actionFilm(r: RepriseFiche | undefined, partVueSeuil: number): ActionFilm {
  const e = etatLecture(r, partVueSeuil)
  if (e === 'vu') return { libelle: 'Regarder à nouveau', icone: 'refresh' }
  if (e === 'entame') return { libelle: `Reprendre · ${resteLisible(r!.duree - r!.position)}`, icone: 'play_arrow', secondaire: 'Recommencer' }
  return { libelle: 'Regarder', icone: 'play_arrow' }
}

export function repere(saison: number, episode: number): string {
  return `S${String(saison).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}

export interface EpisodeFiche {
  cle: string
  saison: number
  numero: number
}

export interface ActionSerie {
  libelle: string
  icone: 'play_arrow' | 'refresh'
  /** L'episode a lire. */
  cle: string
  /** `Reprendre` : part vue, pour la barre sous le titre. */
  part?: number
  motif: 'premier' | 'reprendre' | 'suivant' | 'revoir'
}

/**
 * Fiche serie : l'episode a lire et son libelle.
 *  - un episode entame (le plus recent) : `Reprendre S01E03 · 23 min` ;
 *  - sinon le premier non vu apres un vu : `Episode suivant S01E04` ;
 *  - sinon (rien de vu) : `Lire S01E01` ;
 *  - tout vu : `Regarder a nouveau S01E01`.
 * `episodes` dans l'ordre de lecture (saisons puis numeros) ; `depuis` : point de
 * depart choisi (Ma liste), qui borne la recherche du prochain non vu.
 */
export function actionSerie(
  episodes: EpisodeFiche[],
  reprises: ReadonlyMap<string, RepriseFiche & { vuLe?: number }>,
  partVueSeuil: number,
  depuis?: { saison: number; episode: number },
): ActionSerie | undefined {
  if (episodes.length === 0) return undefined
  let entame: (EpisodeFiche & { r: RepriseFiche & { vuLe?: number } }) | undefined
  for (const e of episodes) {
    const r = reprises.get(e.cle)
    if (r && etatLecture(r, partVueSeuil) === 'entame' && (!entame || (r.vuLe ?? 0) > (entame.r.vuLe ?? 0))) entame = { ...e, r }
  }
  if (entame)
    return {
      libelle: `Reprendre ${repere(entame.saison, entame.numero)} · ${resteLisible(entame.r.duree - entame.r.position)}`,
      icone: 'play_arrow', cle: entame.cle, part: partVue(entame.r), motif: 'reprendre',
    }
  const vu = (e: EpisodeFiche) => etatLecture(reprises.get(e.cle), partVueSeuil) === 'vu'
  const debut = depuis ? Math.max(0, episodes.findIndex((e) => e.saison === depuis.saison && e.numero === depuis.episode)) : 0
  const candidats = episodes.slice(debut)
  const prochain = candidats.find((e) => !vu(e))
  const unVu = episodes.some(vu)
  if (!prochain) return { libelle: `Regarder à nouveau ${repere(episodes[0]!.saison, episodes[0]!.numero)}`, icone: 'refresh', cle: episodes[0]!.cle, motif: 'revoir' }
  if (unVu && episodes.indexOf(prochain) > 0 && vu(episodes[episodes.indexOf(prochain) - 1]!))
    return { libelle: `Épisode suivant ${repere(prochain.saison, prochain.numero)}`, icone: 'play_arrow', cle: prochain.cle, motif: 'suivant' }
  return { libelle: `Lire ${repere(prochain.saison, prochain.numero)}`, icone: 'play_arrow', cle: prochain.cle, motif: 'premier' }
}

/** « 3 nov. » : date d'un « Vu le … ». */
export function dateCourte(ms: number | undefined): string | undefined {
  if (!ms || !Number.isFinite(ms)) return undefined
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
