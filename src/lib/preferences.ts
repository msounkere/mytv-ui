import { db, type EntreeCatalogue, type Reprise } from './db'
import { noterChangement } from './synchro'
import { associerSerie, serieAssociee } from './series-episodes'
import {
  invaliderFavoris, invaliderHistorique, invaliderReprises, invaliderReprisesRegroupees,
} from './requetes'
import { estVu } from './vu'
import { TEXTES_TOAST, emettreToast } from './toasts'
import { titreCourt } from '../components/titres'

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
//
// Lot 10 (US-46) : les favoris ne concernent plus que les CHAÎNES (US-44 CA6,
// films et séries versés dans « Ma liste ») ; le seuil « vu » est PART_VUE
// (lib/vu.ts) ; « Marquer comme vu / non vu » et « Retirer de Reprendre »
// émettent un toast avec « Annuler ».

/** Seules les chaînes sont favorites (lot 10) : une autre clé est refusée sans écrire. */
const estChaine = (cle: string) => cle.startsWith('live:')

export async function estFavori(cle: string): Promise<boolean> {
  if (!estChaine(cle)) return false
  return (await db.favoris.get(cle)) !== undefined
}

export async function basculerFavori(cle: string): Promise<boolean> {
  if (!estChaine(cle)) return false
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

export { associerSerie }

export async function noterOuverture(cle: string): Promise<unknown> {
  // Pour un episode, la serie voyage avec la trace : sans elle le service refuse
  // l'ecriture, et l'envoi (differe, parfois apres un rechargement) ne saurait
  // plus la retrouver.
  const r = await db.historique.put({ cle, ouvertLe: Date.now(), serie: serieAssociee(cle) })
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
  return entrees.filter((e): e is EntreeCatalogue => e !== undefined && e.type === 'live')
}

/** Position mémorisée, ignorée si le contenu est vu (seuil unique PART_VUE). */
export async function reprisePour(cle: string): Promise<number | undefined> {
  const r = await db.reprises.get(cle)
  if (!r || r.duree <= 0) return undefined
  if (estVu(r.position, r.duree)) return undefined
  return r.position
}

export async function noterPosition(cle: string, position: number, duree: number): Promise<unknown> {
  if (!Number.isFinite(duree) || duree <= 0) return Promise.resolve()
  const serie = serieAssociee(cle) ?? (await db.reprises.get(cle))?.serie
  const r = await db.reprises.put({ cle, position, duree, vuLe: Date.now(), serie })
  noterChangement({ genre: 'reprise', cle, valeur: { position, duree } })
  // Une lecture reelle fait reapparaitre ce qu'on avait retire de « Reprendre ».
  await reafficherDansReprendre(serie ?? cle)
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

/**
 * Oublie toutes les positions d'une serie. Compat lot 9 ; le geste du modele
 * cible est `retirerDeReprendre`, qui ne touche pas aux positions.
 */
export async function oublierReprisesDeSerie(serie: string): Promise<void> {
  const lignes = (await db.reprises.toArray()).filter((r) => r.serie === serie)
  await db.reprises.bulkDelete(lignes.map((r) => r.cle))
  for (const r of lignes) noterChangement({ genre: 'reprise', cle: r.cle, supprime: true })
  await invaliderReprises()
}

// --- « Reprendre » : retirer sans effacer (lot 10, CA3) ----------------------------

/** Cles des films et series cachees de la rangee « Reprendre ». */
export async function reprisesCachees(): Promise<Set<string>> {
  return new Set((await db.reprises_cachees.toArray()).map((c) => c.cle))
}

/**
 * « Retirer de Reprendre » (Netflix « Retirer de la rangee ») : la carte
 * disparait, les positions restent ; une nouvelle lecture la ramene.
 * `cle` est celle de l'ENTREE (film ou serie), jamais d'un episode.
 */
export async function retirerDeReprendre(cle: string, geste: { silencieux?: boolean } = {}): Promise<void> {
  await db.reprises_cachees.put({ cle, cacheLe: Date.now() })
  await invaliderReprises()
  if (geste.silencieux) return
  const titre = await titreDe(cle)
  emettreToast({
    message: TEXTES_TOAST.retireDeReprendre(titre),
    ton: 'info',
    action: () => reafficherDansReprendre(cle),
  })
}

export async function reafficherDansReprendre(cle: string): Promise<void> {
  if ((await db.reprises_cachees.get(cle)) === undefined) return
  await db.reprises_cachees.delete(cle)
  await invaliderReprises()
}

// --- « Vu » (lot 10, CA3 / CA4) -----------------------------------------------------

export interface OptionsVu {
  /** Duree a retenir quand aucune position n'existe (episode jamais ouvert) ; 1 a defaut. */
  duree?: number
  /** Serie parente d'un episode jamais ouvert (le serveur l'exige). */
  serie?: string
  /** Libelle du toast (« S01E02 ») ; sinon le titre du catalogue. */
  libelle?: string
  /** Serie : le repere de l'episode vers lequel « Reprendre » passe (« S01E03 »). */
  suivant?: string
  silencieux?: boolean
}

async function titreDe(cle: string): Promise<string> {
  const e = await db.catalogue.get(cle).catch(() => undefined)
  if (e) return titreCourt(e.nom)
  const serie = (await db.reprises.get(cle).catch(() => undefined))?.serie
  const s = serie ? await db.catalogue.get(serie).catch(() => undefined) : undefined
  return s ? titreCourt(s.nom) : cle
}

/** Ecrit une position et la note au journal ; renvoie la ligne d'avant (pour « Annuler »). */
async function ecrirePosition(cle: string, ligne: Reprise): Promise<Reprise | undefined> {
  const avant = await db.reprises.get(cle)
  await db.reprises.put(ligne)
  noterChangement({ genre: 'reprise', cle, valeur: { position: ligne.position, duree: ligne.duree } })
  return avant
}

async function restaurer(cle: string, avant: Reprise | undefined): Promise<void> {
  if (avant) {
    await db.reprises.put(avant)
    noterChangement({ genre: 'reprise', cle, valeur: { position: avant.position, duree: avant.duree } })
  } else {
    await db.reprises.delete(cle)
    noterChangement({ genre: 'reprise', cle, supprime: true })
  }
  await invaliderReprises()
}

/**
 * « Marquer comme vu » : la position saute a la fin (= duree), et le geste
 * voyage. Un contenu jamais ouvert recoit une ligne (duree donnee, sinon 1/1).
 * Toast « ✓ … marqué comme vu · Annuler » : l'annulation restaure la ligne d'avant.
 */
export async function marquerVu(cle: string, o: OptionsVu = {}): Promise<void> {
  const r = await db.reprises.get(cle)
  const duree = r?.duree && r.duree > 0 ? r.duree : o.duree && o.duree > 0 ? o.duree : 1
  const serie = r?.serie ?? o.serie ?? serieAssociee(cle)
  const avant = await ecrirePosition(cle, { cle, position: duree, duree, vuLe: Date.now(), serie })
  await invaliderReprises()
  if (o.silencieux) return
  const message = o.libelle ? TEXTES_TOAST.episodeVu(o.libelle, o.suivant) : TEXTES_TOAST.marqueVu(await titreDe(cle))
  emettreToast({ message, ton: 'ok', action: () => restaurer(cle, avant) })
}

/**
 * « Marquer comme non vu » : la reprise est effacee (synchro existante :
 * DELETE de l'historique). Toast avec « Annuler » qui remet la ligne.
 */
export async function marquerNonVu(cle: string, o: Pick<OptionsVu, 'libelle' | 'silencieux'> = {}): Promise<void> {
  const avant = await db.reprises.get(cle)
  await db.reprises.delete(cle)
  noterChangement({ genre: 'reprise', cle, supprime: true })
  await invaliderReprises()
  if (o.silencieux) return
  emettreToast({
    message: TEXTES_TOAST.marqueNonVu(o.libelle ?? (await titreDe(cle))),
    ton: 'info',
    action: () => restaurer(cle, avant),
  })
}

/**
 * « Marquer la saison comme vue / non vue » : un lot d'episodes, un seul toast.
 * `duree` par episode quand la fiche la connait (sinon 1/1).
 */
export async function marquerVuEpisodes(
  episodes: Array<{ cle: string; duree?: number }>,
  serie: string,
  vus: boolean,
  o: Pick<OptionsVu, 'libelle' | 'silencieux'> = {},
): Promise<void> {
  const avants = new Map<string, Reprise | undefined>()
  for (const ep of episodes) {
    const r = await db.reprises.get(ep.cle)
    avants.set(ep.cle, r)
    if (vus) {
      const duree = r?.duree && r.duree > 0 ? r.duree : ep.duree && ep.duree > 0 ? ep.duree : 1
      await db.reprises.put({ cle: ep.cle, position: duree, duree, vuLe: Date.now(), serie })
      noterChangement({ genre: 'reprise', cle: ep.cle, valeur: { position: duree, duree } })
    } else if (r) {
      await db.reprises.delete(ep.cle)
      noterChangement({ genre: 'reprise', cle: ep.cle, supprime: true })
    }
  }
  await invaliderReprises()
  if (o.silencieux) return
  const libelle = o.libelle ?? 'Saison'
  emettreToast({
    message: vus ? `✓ ${libelle} marquée comme vue` : `${libelle} marquée comme non vue`,
    ton: vus ? 'ok' : 'info',
    action: async () => {
      for (const [cle, avant] of avants) await restaurer(cle, avant)
    },
  })
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
