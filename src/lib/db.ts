import Dexie, { type EntityTable } from 'dexie'
import type { ChaineXtream, FilmXtream, SerieXtream, CategorieXtream } from './xtream'

// 21 791 chaines + 106 973 films ne peuvent pas etre re-telecharges a chaque
// navigation : le catalogue est importe une fois puis sert depuis IndexedDB.

export type TypeContenu = 'live' | 'vod' | 'series'

export interface EntreeCatalogue {
  /** `${type}:${id}` — identifiant stable toutes sources confondues. */
  cle: string
  type: TypeContenu
  id: number
  nom: string
  /** `nom` sans prefixe pays, normalise sans accents : la cle de recherche. */
  recherche: string
  pays?: string
  icone?: string
  categorie?: string
  extension?: string
  /** Date d'ajout au catalogue, en millisecondes. Permet un vrai tri
      « récemment ajouté » au lieu de se fier aux catégories « NEW ADDED »
      du fournisseur, qui ne sont qu'un rangement parmi d'autres. */
  ajouteLe?: number
  /** Note du fournisseur, sur 10. */
  note?: number
}

export interface Categorie {
  cle: string
  type: TypeContenu
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
}

export interface Historique {
  cle: string
  ouvertLe: number
}

export interface Reglage {
  cle: string
  valeur: unknown
}

/** Les six genres d'etat personnel que le service sait stocker. */
export type GenreEtat =
  | 'favori'
  | 'historique'
  | 'reprise'
  | 'categorie-masquee'
  | 'epingle'
  | 'affichage'

/**
 * Changement local en attente d'envoi. Il existe parce qu'une table seule ne
 * sait pas dire ce qu'elle a PERDU : un favori retire n'y laisse aucune trace,
 * et la synchronisation le ressusciterait depuis le serveur. La ligne de
 * journal porte donc la suppression, et l'instant exact du geste.
 */
export interface LigneJournal {
  n: number
  genre: GenreEtat
  cle: string
  /** Millisecondes du geste : c'est lui qui arbitre les conflits. */
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

// `/resource/<genre>/<utilisateur>/<mot de passe>/<reste>` chez le relais, que
// le service sert sous `/flux/relais/resource/<genre>/<reste>`. On repere les
// deux segments a retirer par leur POSITION, pas par leur contenu : la page n'a
// plus a connaitre les identifiants pour s'en debarrasser.
const RESSOURCE_RELAIS = /^https?:\/\/[^/]+\/resource\/([^/]+)\/[^/]+\/[^/]+\/(.+)$/

/** URL d'image relayee par le service, ou la valeur telle quelle. */
export function ressourceRelayee(u: string | undefined): string | undefined {
  if (!u) return u
  const m = RESSOURCE_RELAIS.exec(u)
  return m ? `/flux/relais/resource/${m[1]}/${m[2]}` : u
}

/** Marqueur de la purge ci-dessous. Une fois posee, elle ne recommence pas. */
const CLE_PURGE = 'purge.urlsRelais'
/** Lots d'ecriture. Mesure : 152 574 lignes reecrites en 30 s, soit 0,4 s par lot. */
const LOT_PURGE = 2000

/** Rend la main a l'interface entre deux transactions. */
const repos = () => new Promise((r) => setTimeout(r, 0))

/**
 * Efface les identifiants du relais des URL d'images deja stockees.
 *
 * POURQUOI il y a quelque chose a effacer : TuliProx place le couple
 * identifiant/mot de passe dans le chemin de CHAQUE logo (211 191 occurrences
 * dans les 78 Mo du catalogue), et les imports precedents les ont ecrits tels
 * quels ici — donc sur le disque du navigateur, en clair et durablement. Le
 * service les remplace maintenant a la source, mais rien n'oublie tout seul ce
 * qui est deja ecrit.
 *
 * POURQUOI en fond et non dans une migration Dexie. Mesure sur cette
 * installation : reecrire les 152 574 lignes concernees coute 30 s, au curseur
 * comme par lots de 5 000 — ce sont les ecritures IndexedDB qui dominent, pas
 * la methode. Place dans un `version().upgrade()`, ce temps BLOQUE l'ouverture
 * de la base, donc tout l'ecran d'accueil : trente secondes d'application
 * figee au premier demarrage apres la mise a jour. En fond, par lots, avec une
 * respiration entre chaque, l'interface reste utilisable pendant la purge.
 *
 * Idempotent, et sans risque a interrompre : chaque lot est une transaction, et
 * le marqueur n'est pose qu'a la fin. Une page rechargee au milieu reprend le
 * travail la ou il en etait (les lignes deja propres ne correspondent plus).
 */
export async function purgerUrlsRelais(): Promise<number> {
  if ((await db.reglages.get(CLE_PURGE))?.valeur === true) return 0
  let reecrites = 0
  // Par type : lire les 154 106 entrees d'un coup tiendrait tout le catalogue
  // en memoire, la ou le plus gros type (107 204 films) suffit deja.
  for (const type of ['live', 'vod', 'series'] as TypeContenu[]) {
    const sales = (await db.catalogue.where('type').equals(type).toArray()).flatMap((e) => {
      const propre = ressourceRelayee(e.icone)
      return propre === e.icone ? [] : [{ ...e, icone: propre }]
    })
    for (let k = 0; k < sales.length; k += LOT_PURGE) {
      await db.catalogue.bulkPut(sales.slice(k, k + LOT_PURGE))
      reecrites += Math.min(LOT_PURGE, sales.length - k)
      await repos()
    }
  }
  await db.reglages.put({ cle: CLE_PURGE, valeur: true })
  return reecrites
}

/** Minuscules, sans accents : rend la recherche insensible a « é » vs « e ». */
export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Secondes Unix du relais → millisecondes, en écartant les valeurs vides. */
function enMillisecondes(v: string | undefined): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n * 1000 : undefined
}

export function versEntree(
  type: TypeContenu,
  brut: ChaineXtream | FilmXtream | SerieXtream,
  separer: (n: string) => { pays?: string; titre: string },
): EntreeCatalogue {
  const id = 'series_id' in brut ? brut.series_id : brut.stream_id
  const { pays, titre } = separer(brut.name)
  const note = Number('rating' in brut ? brut.rating : undefined)
  return {
    cle: `${type}:${id}`,
    type,
    id,
    nom: titre,
    recherche: normaliser(titre),
    pays,
    // Le service a deja reecrit ces URL ; on repasse quand meme ici, parce
    // que cette base est le seul endroit ou une URL d'image SURVIT a l'onglet.
    icone: ressourceRelayee(
      'cover' in brut ? brut.cover : 'stream_icon' in brut ? brut.stream_icon : undefined,
    ),
    categorie: brut.category_id,
    extension: 'container_extension' in brut ? brut.container_extension : undefined,
    ajouteLe:
      'added' in brut
        ? enMillisecondes(brut.added)
        : enMillisecondes('last_modified' in brut ? brut.last_modified : undefined),
    note: Number.isFinite(note) && note > 0 ? note : undefined,
  }
}

export function versCategorie(
  type: TypeContenu,
  brut: CategorieXtream,
  compte: number,
): Categorie {
  return {
    cle: `${type}:${brut.category_id}`,
    type,
    id: brut.category_id,
    nom: brut.category_name,
    compte,
    masquee: 0,
  }
}
