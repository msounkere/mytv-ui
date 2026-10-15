import Dexie, { type EntityTable } from 'dexie'
import { cleDe, estIdentifiantEpisode } from './identifiants'
import type { CategorieApi, ChaineApi, FilmApi, SerieApi, TypeApi } from './api'

// 21 791 chaines + 106 973 films ne peuvent pas etre re-telecharges a chaque
// navigation : le catalogue est importe une fois (export en bloc de l'API, voir
// import.worker.ts) puis sert depuis IndexedDB.

export type TypeContenu = TypeApi

export interface EntreeCatalogue {
  /**
   * Cle locale : `${type}:${idServeur}` (`vod:iptva:5521`). Le type en prefixe
   * evite qu'une serie et un film de meme numero se confondent. Pour un
   * EPISODE : `series:iptva:77123.mkv` (l'extension suit le numero).
   */
  cle: string
  type: TypeContenu
  /** Identifiant tel que l'API le donne : `fournisseur:numero` (`iptva:845410`).
   *  C'est ce que les routes `/vod/{id}`, `/epg/...` et le diagnostic attendent. */
  idServeur: string
  /** Adresse de lecture RELATIVE donnee par l'API (jamais d'identifiants). */
  lecture?: string
  /** OBSOLETE : partie numerique de `idServeur` (0 pour un episode). Conserve le
   *  temps que les ecrans de lecture/EPG migrent vers `idServeur` ; ne plus lire. */
  id: number
  nom: string
  /** `nom` sans prefixe pays, normalise sans accents : la cle de recherche. */
  recherche: string
  pays?: string
  icone?: string
  /** Identifiant de categorie serveur (`iptva:12`). */
  categorie?: string
  extension?: string
  /** Date d'ajout au catalogue, en millisecondes. Permet un vrai tri
      « récemment ajouté » au lieu de se fier aux catégories « NEW ADDED »
      du fournisseur, qui ne sont qu'un rangement parmi d'autres. */
  ajouteLe?: number
  /** Note du fournisseur, sur 10. */
  note?: number
  annee?: number
  /** Numero de chaine affiche (direct). */
  numero?: number
  /** Identifiant de guide de la chaine, quand le fournisseur en donne un. */
  epgId?: string
  /** Episodes seulement : cle de la serie parente (l'historique serveur l'exige). */
  serie?: string
}

export interface Categorie {
  cle: string
  type: TypeContenu
  /** Identifiant serveur de la categorie (`iptva:12`). */
  id: string
  nom: string
  /** Nombre d entrees, pour les compteurs exiges par le brief. */
  compte: number
  masquee: 0 | 1
}

export interface Favori {
  cle: string
  ajouteLe: number
}

export interface Reprise {
  cle: string
  position: number
  duree: number
  vuLe: number
  /** Episodes : serie parente, que le serveur exige pour ranger l'historique. */
  serie?: string
}

export interface Historique {
  cle: string
  ouvertLe: number
  /** Episodes : serie parente (voir `Reprise.serie`). */
  serie?: string
}

export interface Reglage {
  cle: string
  valeur: unknown
}

/** Les genres d'etat personnel qui passent par le journal (un changement = un
 *  geste a rejouer vers le service). Les reglages, eux, se synchronisent par
 *  fusion (voir reglages-fusion.ts) et n'ont pas de journal. */
export type GenreEtat = 'favori' | 'historique' | 'reprise'

/**
 * Changement local en attente d'envoi. Il existe parce qu'une table seule ne
 * sait pas dire ce qu'elle a PERDU : un favori retire n'y laisse aucune trace,
 * et la synchronisation le ressusciterait depuis le serveur. La ligne de
 * journal designe donc le contenu touche ; ce qu'il faut envoyer (ajout ou
 * retrait) se relit dans les tables au moment de l'envoi.
 */
export interface LigneJournal {
  n: number
  genre: GenreEtat
  cle: string
  /** Millisecondes du geste. */
  maj: number
  supprime: 0 | 1
  valeur?: unknown
}

export const db = new Dexie('mytv') as Dexie & {
  catalogue: EntityTable<EntreeCatalogue, 'cle'>
  categories: EntityTable<Categorie, 'cle'>
  favoris: EntityTable<Favori, 'cle'>
  reprises: EntityTable<Reprise, 'cle'>
  historique: EntityTable<Historique, 'cle'>
  reglages: EntityTable<Reglage, 'cle'>
  journal: EntityTable<LigneJournal, 'n'>
}

db.version(1).stores({
  catalogue: 'cle, type, categorie, [type+categorie], nom',
  categories: 'cle, type, [type+masquee]',
  favoris: 'cle, ajouteLe',
  reprises: 'cle, vuLe',
  historique: 'cle, ouvertLe',
  reglages: 'cle',
})

// Version 2 : index sur la date d'ajout et la note, pour les tris du catalogue.
db.version(2).stores({
  catalogue: 'cle, type, categorie, [type+categorie], nom, [type+ajouteLe], [type+note]',
})

// Version 3 : le journal de synchronisation. Table ajoutee seule — les stores
// existants ne sont pas redeclares, donc rien n'est reindexe au passage.
db.version(3).stores({
  journal: '++n, [genre+cle]',
})

// Version 4 : passage a l'API v1. Les identifiants de contenu changent de
// forme (`iptva:845410` au lieu de `live:123`) : TOUT ce qui les porte est
// invalide -- catalogue, favoris, historique, reprises, journal -- et le
// service est desormais la source de l'etat personnel, qui se retelecharge.
// On vide donc ici plutot que de laisser des cles orphelines que plus rien
// ne saurait resoudre.
db.version(4)
  .stores({})
  .upgrade(async (tx) => {
    for (const t of ['catalogue', 'categories', 'favoris', 'reprises', 'historique', 'journal', 'reglages'])
      await tx.table(t).clear()
  })

/** Minuscules, sans accents : rend la recherche insensible a « é » vs « e ». */
export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Instant RFC 3339 de l'API -> millisecondes ; `undefined` si absent ou illisible. */
function enMillisecondes(v: string | null | undefined): number | undefined {
  if (!v) return undefined
  const t = Date.parse(v)
  return Number.isFinite(t) && t > 0 ? t : undefined
}

/** Champ OBSOLETE `id` : partie numerique de l'identifiant (0 pour une serie `s77`
 *  ou un episode). Les identifiants sont opaques, rien ne doit plus la lire. */
function numeroDe(idServeur: string): number {
  const n = Number(idServeur.slice(idServeur.indexOf(':') + 1))
  return Number.isFinite(n) ? n : 0
}

type LigneCatalogue = ChaineApi | FilmApi | SerieApi

export function versEntree(
  type: TypeContenu,
  brut: LigneCatalogue,
  separer: (n: string) => { pays?: string; titre: string },
): EntreeCatalogue {
  const { pays, titre } = separer(brut.nom)
  const note = 'note' in brut ? brut.note : undefined
  const annee = 'annee' in brut ? Number(brut.annee) : NaN
  const image = type === 'live' ? (brut as ChaineApi).logo : (brut as FilmApi | SerieApi).image
  return {
    cle: cleDe(type, brut.id),
    type,
    idServeur: brut.id,
    lecture: 'lecture' in brut ? brut.lecture : brut.saisons,
    id: numeroDe(brut.id),
    nom: titre,
    recherche: normaliser(titre),
    pays,
    icone: image || undefined,
    categorie: brut.categorie || undefined,
    extension: 'extension' in brut ? brut.extension || undefined : undefined,
    ajouteLe: enMillisecondes(brut.ajoute),
    note: note !== undefined && Number.isFinite(note) && note > 0 ? note : undefined,
    annee: Number.isFinite(annee) && annee > 0 ? annee : undefined,
    numero: 'numero' in brut ? brut.numero : undefined,
    epgId: 'epg_id' in brut ? brut.epg_id || undefined : undefined,
  }
}

export function versCategorie(brut: CategorieApi, compte: number): Categorie {
  return {
    cle: `${brut.type}:${brut.id}`,
    type: brut.type,
    id: brut.id,
    nom: brut.nom,
    compte,
    masquee: 0,
  }
}

/** Un episode se reconnait a l'extension qui suit son numero (`iptva:77123.mkv`). */
export const estEpisode = estIdentifiantEpisode
