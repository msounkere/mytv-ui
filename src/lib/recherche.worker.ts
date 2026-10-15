/// <reference lib="webworker" />
import MiniSearch from 'minisearch'
import type { EntreeCatalogue, TypeContenu } from './db'

// La recherche porte sur 154 060 entrées. L'index vit dans ce worker pour que
// la frappe ne soit jamais bloquée — ni par la construction de l'index (≈ 0,9 s
// mesurée sur le catalogue réel) ni par le classement d'une requête large :
// « a » ramène 26 318 correspondances, soit 90 ms que le fil principal ne peut
// pas s'offrir entre deux touches.

export interface ResultatRecherche {
  cle: string
  type: TypeContenu
  /** Identifiant serveur (`iptva:845410`), identique a `cle`. */
  idServeur: string
  nom: string
  pays?: string
  icone?: string
  note?: number
  ajouteLe?: number
}

export type Groupes = Record<TypeContenu, ResultatRecherche[]>
export type Totaux = Record<TypeContenu, number>

/** Valeur de filtre offerte par la page de résultats, avec son effectif. */
export interface Facette {
  cle: string
  libelle: string
  compte: number
}

export type Tri = 'pertinence' | 'recent' | 'note'

export type MessageVersWorker =
  | { type: 'indexer' }
  | { type: 'chercher'; requete: string; limites: Totaux; jeton: number }
  | {
      type: 'page'
      requete: string
      langue: string | null
      tri: Tri
      limites: Totaux
      jeton: number
    }

export type MessageDepuisWorker =
  | { type: 'pret'; compte: number; ms: number }
  | { type: 'resultats'; jeton: number; groupes: Groupes; totaux: Totaux; ms: number }
  | {
      type: 'page'
      jeton: number
      groupes: Groupes
      totaux: Totaux
      langues: Facette[]
      ms: number
    }

/** Les codes réellement portés par le catalogue, traduits quand ils désignent
 *  une langue. Les 224 autres préfixes (marchés, éditeurs) restent bruts
 *  plutôt que d'être rangés de force sous une langue qu'ils ne nomment pas. */
const LANGUES: Record<string, string> = {
  FR: 'Français', VF: 'Français', EN: 'Anglais', ENG: 'Anglais', AR: 'Arabe',
  DE: 'Allemand', ES: 'Espagnol', PT: 'Portugais', IT: 'Italien',
  NL: 'Néerlandais', PL: 'Polonais', RU: 'Russe', TR: 'Turc', EL: 'Grec',
  SE: 'Suédois', DK: 'Danois', NO: 'Norvégien', FI: 'Finnois', HU: 'Hongrois',
  RO: 'Roumain', BG: 'Bulgare', CZ: 'Tchèque', MULTI: 'Multi-langues',
  VOSTFR: 'Sous-titré', VOST: 'Sous-titré',
}

/** Même tamis que `normaliser` de `db.ts`, recopié ici : importer le module
 *  ferait entrer Dexie et une seconde connexion IndexedDB dans ce worker. */
function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

let index: MiniSearch<EntreeCatalogue> | null = null
const parCle = new Map<string, EntreeCatalogue>()

// Le panneau de suggestions et la page de résultats posent la même question à
// 200 ms d'intervalle : le classement est gardé pour que « voir tout » soit
// instantané, et pour qu'un changement de langue ou de tri ne relance pas
// l'interrogation de l'index.
let derniereRequete = ''
let dernierClassement: EntreeCatalogue[] = []

function creerIndex(): MiniSearch<EntreeCatalogue> {
  return new MiniSearch<EntreeCatalogue>({
    idField: 'cle',
    fields: ['recherche'],
    // Le champ indexé est déjà sans accents ; passer le terme saisi par le même
    // tamis est ce qui rend « pokémon » et « pokemon » strictement équivalents.
    // Auparavant seule la tolérance aux fautes les rapprochait, et elle en
    // perdait une sur quatre-vingts.
    processTerm: (terme) => normaliser(terme),
    searchOptions: { prefix: true, fuzzy: 0.15, combineWith: 'AND' },
  })
}

/** 0 : le titre commence par la requête ; 1 : un mot commence par elle ;
 *  2 : elle apparaît ailleurs ; 3 : seule la tolérance aux fautes l'a trouvée.
 *  C'est la règle « les débuts de mot passent en premier » du dossier. */
function rang(recherche: string, n: string): number {
  if (recherche.startsWith(n)) return 0
  if (recherche.includes(` ${n}`)) return 1
  return recherche.includes(n) ? 2 : 3
}

function classer(requete: string): EntreeCatalogue[] {
  const n = normaliser(requete.trim())
  if (!index || !n) return []
  if (n === derniereRequete) return dernierClassement

  const poids = new Map<string, number>()
  const liste: EntreeCatalogue[] = []
  for (const brut of index.search(requete)) {
    const e = parCle.get(brut.id as string)
    if (!e) continue
    // À rang égal, le titre le plus court gagne : « France 2 » avant
    // « France 2 Cinéma Premium ». Le tri étant stable, les ex æquo gardent
    // l'ordre de pertinence de MiniSearch. La note ne sert pas de départage :
    // mesurée nulle sur les 21 791 chaînes, elle est absente précisément là où
    // les ex æquo abondent (5 des 6 têtes de liste sur « france »).
    poids.set(e.cle, rang(e.recherche, n) * 1e6 + Math.min(e.recherche.length, 999_999))
    liste.push(e)
  }
  liste.sort((a, b) => poids.get(a.cle)! - poids.get(b.cle)!)

  derniereRequete = n
  dernierClassement = liste
  return liste
}

function versResultat(e: EntreeCatalogue): ResultatRecherche {
  return {
    cle: e.cle, type: e.type, idServeur: e.idServeur, nom: e.nom,
    pays: e.pays, icone: e.icone, note: e.note, ajouteLe: e.ajouteLe,
  }
}

/** Effectifs par langue sur TOUT le classement : les pastilles doivent rester
 *  les mêmes quand on en choisit une, sinon on ne peut plus en changer. */
function facettes(liste: EntreeCatalogue[]): Facette[] {
  const comptes = new Map<string, number>()
  for (const e of liste) {
    if (e.pays) comptes.set(e.pays, (comptes.get(e.pays) ?? 0) + 1)
  }
  return [...comptes]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cle, compte]) => ({ cle, libelle: LANGUES[cle] ?? cle, compte }))
}

function repartir(
  liste: EntreeCatalogue[],
  limites: Totaux,
  langue: string | null,
  tri: Tri,
): { groupes: Groupes; totaux: Totaux } {
  const retenus: Record<TypeContenu, EntreeCatalogue[]> = { live: [], vod: [], series: [] }
  const totaux: Totaux = { live: 0, vod: 0, series: 0 }

  for (const e of liste) {
    if (langue && e.pays !== langue) continue
    totaux[e.type] += 1
    // Un autre tri que la pertinence doit voir tout le groupe avant de couper.
    if (tri !== 'pertinence' || retenus[e.type].length < limites[e.type]) retenus[e.type].push(e)
  }

  if (tri === 'recent') {
    for (const t of Object.keys(retenus) as TypeContenu[]) {
      retenus[t].sort((a, b) => (b.ajouteLe ?? 0) - (a.ajouteLe ?? 0))
    }
  } else if (tri === 'note') {
    for (const t of Object.keys(retenus) as TypeContenu[]) {
      retenus[t].sort((a, b) => (b.note ?? -1) - (a.note ?? -1))
    }
  }

  const groupes: Groupes = {
    live: retenus.live.slice(0, limites.live).map(versResultat),
    vod: retenus.vod.slice(0, limites.vod).map(versResultat),
    series: retenus.series.slice(0, limites.series).map(versResultat),
  }
  return { groupes, totaux }
}

/**
 * Lit le catalogue sans passer par le fil principal. Le faire là-bas puis
 * transmettre le tableau coûtait une tâche de 426 ms, mesurée : désérialiser
 * 154 060 objets puis les recopier pour le worker. Ici, l'octet lu ne traverse
 * jamais l'interface. Dexie n'est pas importé — le schéma de `db.ts` suffit à
 * savoir que la réserve s'appelle « catalogue » dans la base « mytv ».
 */
function lireCatalogue(): Promise<EntreeCatalogue[]> {
  return new Promise((resoudre, rejeter) => {
    const ouverture = indexedDB.open('mytv')
    ouverture.onerror = () => rejeter(ouverture.error)
    ouverture.onsuccess = () => {
      const base = ouverture.result
      if (!base.objectStoreNames.contains('catalogue')) {
        base.close()
        resoudre([])
        return
      }
      const demande = base.transaction('catalogue', 'readonly').objectStore('catalogue').getAll()
      demande.onerror = () => { base.close(); rejeter(demande.error) }
      demande.onsuccess = () => { base.close(); resoudre(demande.result as EntreeCatalogue[]) }
    }
  })
}

self.onmessage = (e: MessageEvent<MessageVersWorker>) => {
  const msg = e.data

  if (msg.type === 'indexer') {
    const t0 = performance.now()
    void lireCatalogue().then((entrees) => {
      index = creerIndex()
      index.addAll(entrees)
      parCle.clear()
      for (const entree of entrees) parCle.set(entree.cle, entree)
      derniereRequete = ''
      dernierClassement = []
      post({ type: 'pret', compte: entrees.length, ms: Math.round(performance.now() - t0) })
    })
    return
  }

  if (msg.type === 'chercher') {
    const t0 = performance.now()
    const { groupes, totaux } = repartir(classer(msg.requete), msg.limites, null, 'pertinence')
    post({ type: 'resultats', jeton: msg.jeton, groupes, totaux, ms: Math.round(performance.now() - t0) })
    return
  }

  if (msg.type === 'page') {
    const t0 = performance.now()
    const liste = classer(msg.requete)
    const { groupes, totaux } = repartir(liste, msg.limites, msg.langue, msg.tri)
    post({
      type: 'page', jeton: msg.jeton, groupes, totaux,
      langues: facettes(liste), ms: Math.round(performance.now() - t0),
    })
  }
}

function post(m: MessageDepuisWorker) {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
}
