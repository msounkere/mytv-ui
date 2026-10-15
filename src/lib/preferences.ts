import { db, type EntreeCatalogue } from './db'
import { noterChangement } from './synchro'
import {
  invaliderFavoris, invaliderHistorique, invaliderReprises, invaliderReprisesRegroupees,
} from './requetes'

// Favoris, historique et reprise : ce qui ramène 154 000 entrées à la dizaine
// réellement regardée.
//
// Chaque écriture est notée au journal de `synchro.ts` pour pouvoir repartir
// vers `/profil/*` et sur une autre machine. L'ORDRE compte : IndexedDB d'abord,
// journal ensuite. Le service est un confort, jamais un prérequis — s'il est
// injoignable, l'écriture locale a déjà eu lieu et les lectures ci-dessous n'en
// savent rien.
//
// Chaque écriture périme aussi le cache de lecture (`lib/requetes.ts`), et c'est
// POSÉ ICI plutôt que dans les écrans : une étoile cochée dans le lecteur doit
// se voir sur l'Accueil, dans la rangée des favoris et dans le filtre
// « Favoris » de Films — trois écrans qui restent montés et qui ne relisent
// rien d'eux-mêmes. Six appelants, une seule ligne à ne pas oublier.

export async function estFavori(cle: string): Promise<boolean> {
  return (await db.favoris.get(cle)) !== undefined
}

export async function basculerFavori(cle: string): Promise<boolean> {
  if (await estFavori(cle)) {
    await db.favoris.delete(cle)
    noterChangement({ genre: 'favori', cle, supprime: true })
    await invaliderFavoris()
    return false
  }
  const ajouteLe = Date.now()
  await db.favoris.put({ cle, ajouteLe })
  noterChangement({ genre: 'favori', cle, valeur: { ajouteLe } })
  await invaliderFavoris()
  return true
}

/** Les dernières entrées ouvertes, les plus récentes d'abord. */
export async function historiqueRecent(limite = 20): Promise<EntreeCatalogue[]> {
  const lignes = await db.historique.orderBy('ouvertLe').reverse().limit(limite).toArray()
  const entrees = await db.catalogue.bulkGet(lignes.map((l) => l.cle))
  return entrees.filter((e): e is EntreeCatalogue => e !== undefined)
}

/**
 * Série parente des épisodes en cours de lecture. Le serveur range l'historique
 * d'un épisode sous sa série et la REFUSE sans elle ; le lecteur, lui, ne
 * connaît que la clé de l'épisode. La fiche série (seule à savoir) la déclare
 * ici avant le lancement.
 */
const seriesDesEpisodes = new Map<string, string>()

export function associerSerie(episode: string, serie: string): void {
  seriesDesEpisodes.set(episode, serie)
}

export async function noterOuverture(cle: string): Promise<unknown> {
  const r = await db.historique.put({ cle, ouvertLe: Date.now() })
  // L'instant d'ouverture EST la valeur de l'historique : la fusion « dernier
  // changement gagne » revient donc exactement à « la dernière machine qui a
  // regardé fait foi », sans règle particulière à écrire côté serveur.
  noterChangement({ genre: 'historique', cle })
  await invaliderHistorique()
  return r
}

export async function favoris(): Promise<EntreeCatalogue[]> {
  const lignes = await db.favoris.orderBy('ajouteLe').reverse().toArray()
  const entrees = await db.catalogue.bulkGet(lignes.map((l) => l.cle))
  return entrees.filter((e): e is EntreeCatalogue => e !== undefined)
}

/** Position mémorisée, ignorée si le contenu est quasiment terminé. */
export async function reprisePour(cle: string): Promise<number | undefined> {
  const r = await db.reprises.get(cle)
  if (!r || r.duree <= 0) return undefined
  if (r.position / r.duree > 0.95) return undefined
  return r.position
}

export async function noterPosition(cle: string, position: number, duree: number): Promise<unknown> {
  if (!Number.isFinite(duree) || duree <= 0) return Promise.resolve()
  const serie = seriesDesEpisodes.get(cle) ?? (await db.reprises.get(cle))?.serie
  const r = await db.reprises.put({ cle, position, duree, vuLe: Date.now(), serie })
  noterChangement({ genre: 'reprise', cle, valeur: { position, duree } })
  // Regroupée : cet appel revient toutes les cinq secondes pendant la lecture.
  invaliderReprisesRegroupees()
  return r
}

/** « Retirer de la reprise » : la position s'efface, la trace d'ouverture reste. */
export async function oublierReprise(cle: string): Promise<void> {
  await db.reprises.delete(cle)
  noterChangement({ genre: 'reprise', cle, supprime: true })
  await invaliderReprises()
}

/** « Marquer comme vu » : la position saute a la fin, et le geste voyage. */
export async function marquerVu(cle: string): Promise<void> {
  const r = await db.reprises.get(cle)
  if (!r) return
  await db.reprises.put({ ...r, position: r.duree, vuLe: Date.now() })
  noterChangement({ genre: 'reprise', cle, valeur: { position: r.duree, duree: r.duree } })
  await invaliderReprises()
}

/**
 * Avancement memorise pour un lot de cles, en une seule lecture. La fiche
 * serie en a besoin pour marquer les episodes deja vus : parcourir la table
 * entiere pour 268 episodes serait absurde, et un `get` par ligne aussi.
 * Valeur entre 0 et 1 ; absente si rien n a jamais ete lu.
 */
export async function progressions(cles: string[]): Promise<Map<string, number>> {
  const avancement = new Map<string, number>()
  if (cles.length === 0) return avancement
  for (const r of await db.reprises.bulkGet(cles))
    if (r && r.duree > 0) avancement.set(r.cle, Math.min(1, r.position / r.duree))
  return avancement
}
