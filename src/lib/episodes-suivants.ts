import type { SaisonApi } from './api'

// L'episode d'apres, toutes saisons confondues (US-43 CA4).
//
// POURQUOI un module a part : la fiche serie ne connaissait que l'episode
// suivant DANS la saison affichee, et seulement pour le premier lancement. Pour
// enchainer S01E03 -> S02E01 puis continuer, le lecteur a besoin d'une regle qui
// lise les saisons de l'API, pure pour etre testee sous node (module SANS
// dependance ; le chargeur partage est dans saisons.ts).

export interface EpisodeLisible {
  /** Cle locale de l'episode (`series:iptva:77123.mkv`). */
  cle: string
  /** Libelle complet, comme la fiche le donne au lecteur : « Serie — S01E02 ». */
  nom: string
  url: string
  extension: string
  saison: number
  numero: number
}

function repere(saison: number, episode: number): string {
  return `S${String(saison).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}

/** Tous les episodes lisibles, saisons dans l'ordre puis numeros dans l'ordre. */
export function episodesOrdonnes(saisons: SaisonApi[], nomSerie: string): EpisodeLisible[] {
  const sortie: EpisodeLisible[] = []
  for (const s of [...saisons].sort((a, b) => a.numero - b.numero))
    for (const e of [...s.episodes].sort((a, b) => a.numero - b.numero)) {
      if (!e.id || !e.lecture) continue
      sortie.push({
        cle: `series:${e.id}`,
        nom: `${nomSerie} — ${repere(s.numero, e.numero)}`,
        url: e.lecture,
        extension: e.extension || 'mp4',
        saison: s.numero,
        numero: e.numero,
      })
    }
  return sortie
}

/** L'episode qui suit `cle` ; `undefined` sur le dernier ou si `cle` est inconnue. */
export function episodeApres(saisons: SaisonApi[], nomSerie: string, cle: string): EpisodeLisible | undefined {
  const liste = episodesOrdonnes(saisons, nomSerie)
  const i = liste.findIndex((e) => e.cle === cle)
  return i < 0 ? undefined : liste[i + 1]
}

/**
 * Le prochain episode a regarder : le premier non vu (part < `seuil`) a partir
 * de `depuis` (sinon du debut). C'est lui que la fiche sonde (CA5) et que la
 * carte « Lire le prochain episode » vise.
 */
export function prochainAVoir(
  saisons: SaisonApi[],
  nomSerie: string,
  progressions: ReadonlyMap<string, number>,
  seuil: number,
  depuis?: { saison: number; episode: number },
): EpisodeLisible | undefined {
  const liste = episodesOrdonnes(saisons, nomSerie)
  const debut = depuis
    ? Math.max(0, liste.findIndex((e) => e.saison === depuis.saison && e.numero === depuis.episode))
    : 0
  return liste.slice(debut).find((e) => (progressions.get(e.cle) ?? 0) < seuil)
}
