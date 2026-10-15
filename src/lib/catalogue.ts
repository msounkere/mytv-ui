import { createSignal } from 'solid-js'
import { db, type TypeContenu, type EntreeCatalogue } from './db'
import { ErreurLecteur, type Couche } from './errors'
import type { AvancementImport, DepuisWorker, VersWorker } from './import.worker'
import { signalerSessionPerdue } from './api'
import { estConnecte } from './auth'
import { invaliderCatalogue } from './requetes'
import { reindexer } from './recherche-client'

// Import du catalogue dans IndexedDB. ~150 000 entrees ne peuvent pas etre
// retelechargees a chaque navigation ; une fois importees, la recherche et le
// parcours sont instantanes et fonctionnent meme service injoignable.
//
// Le travail lourd (flux, parsing, ecriture) est dans `import.worker.ts`. Ce
// module-ci garde ce qui doit vivre sur le fil principal : l'etat affiche, le
// declenchement (au demarrage, au retour sur l'onglet, periodiquement) et la
// peremption des lectures en cache une fois le catalogue remplace.

export type Avancement = AvancementImport & {
  /** 0 a 1, ou undefined quand l etape n est pas quantifiable. */
  part?: number
}

export interface ResultatImport {
  /** Faux : le manifeste a repondu « inchange », aucune donnee n'a ete lue. */
  importe: boolean
  version: string
  entrees: number
  categories: number
}

const CLE_IMPORT = 'dernierImport'

export async function dateDernierImport(): Promise<number | undefined> {
  const r = await db.reglages.get(CLE_IMPORT)
  return typeof r?.valeur === 'number' ? r.valeur : undefined
}

export async function versionCatalogue(): Promise<string | undefined> {
  const r = await db.reglages.get('catalogue.version')
  return typeof r?.valeur === 'string' ? r.valeur : undefined
}

export function importerCatalogue(
  surAvancement: (a: Avancement) => void,
  options: { force?: boolean } = {},
): Promise<ResultatImport> {
  return new Promise((resoudre, rejeter) => {
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<DepuisWorker>) => {
      const m = e.data
      if (m.type === 'avancement') return surAvancement(m.avancement)
      worker.terminate()
      if (m.type === 'fini')
        resoudre({ importe: m.importe, version: m.version, entrees: m.entrees, categories: m.categories })
      else rejeter(new ErreurLecteur(m.couche as Couche, m.message, m.action, m.detail))
    }
    worker.onerror = (e) => {
      worker.terminate()
      rejeter(new ErreurLecteur('donnees', e.message || "L'import a échoué.", "Réessayer l'import."))
    }
    worker.postMessage({ type: 'importer', force: options.force } satisfies VersWorker)
  })
}

// --- Suivi automatique -------------------------------------------------------

export type EtatCatalogue = 'inactif' | 'import' | 'a-jour' | 'erreur'

const [etatCatalogue, poserEtatCatalogue] = createSignal<EtatCatalogue>('inactif')
const [avancementCatalogue, poserAvancementCatalogue] = createSignal<Avancement | null>(null)
const [erreurCatalogue, poserErreurCatalogue] = createSignal<ErreurLecteur | null>(null)
const [dernierImportLe, poserDernierImport] = createSignal<number | undefined>()
export { etatCatalogue, avancementCatalogue, erreurCatalogue, dernierImportLe }

let enCours: Promise<ResultatImport | undefined> | undefined

/**
 * Verifie le catalogue et l'importe si le serveur en a un autre. Un seul a la
 * fois (deux workers se disputeraient la meme base). Ne leve jamais : l'etat
 * est expose par les signaux, parce que l'appelant courant est un
 * declencheur automatique que personne n'attend.
 */
export function mettreAJourCatalogue(force = false): Promise<ResultatImport | undefined> {
  // Les minuteurs survivent a la deconnexion : sans session, il n'y a rien a demander.
  if (!estConnecte()) return Promise.resolve(undefined)
  if (!enCours) {
    enCours = (async () => {
      poserEtatCatalogue('import')
      poserErreurCatalogue(null)
      try {
        const r = await importerCatalogue(poserAvancementCatalogue, { force })
        poserAvancementCatalogue(null)
        if (r.importe) {
          // L'import est le SEUL ecrivain du catalogue : c'est le seul moment
          // ou les lectures mises en cache cessent d'etre vraies. Les ecrans
          // restent montes, personne ne relirait de lui-meme. L'index de
          // recherche, lui, vit dans un worker et garde l'ancien catalogue.
          await invaliderCatalogue()
          reindexer()
          // Les favoris et l'historique recus avant l'import n'ont pas pu etre
          // resolus (le serveur ne dit pas le type) : on les relit maintenant.
          void import('./synchro').then((m) => m.synchroniser())
        }
        poserDernierImport(await dateDernierImport())
        poserEtatCatalogue('a-jour')
        return r
      } catch (e) {
        poserAvancementCatalogue(null)
        const err = e instanceof ErreurLecteur ? e : new ErreurLecteur('donnees', String(e), 'Réessayer.')
        poserErreurCatalogue(err)
        poserEtatCatalogue('erreur')
        if (err.couche === 'auth') signalerSessionPerdue()
        return undefined
      } finally {
        enCours = undefined
      }
    })()
  }
  return enCours
}

/** Intervalle de revalidation : le manifeste est tres leger (un comptage SQL). */
const PERIODE = 10 * 60_000
let suivi = false

export function demarrerSuiviCatalogue(): void {
  void mettreAJourCatalogue()
  if (suivi) return
  suivi = true
  void dateDernierImport().then(poserDernierImport)
  setInterval(() => {
    if (document.visibilityState === 'visible') void mettreAJourCatalogue()
  }, PERIODE)
  let dernier = Date.now()
  document.addEventListener('visibilitychange', () => {
    // Revenir sur l'onglet apres une longue absence : c'est le moment ou un
    // catalogue plus recent a le plus de chances d'exister.
    if (document.visibilityState === 'visible' && Date.now() - dernier > 2 * 60_000) {
      dernier = Date.now()
      void mettreAJourCatalogue()
    }
  })
}

export function entreesDeCategorie(type: TypeContenu, categorie: string): Promise<EntreeCatalogue[]> {
  return db.catalogue.where('[type+categorie]').equals([type, categorie]).toArray()
}

export function categoriesVisibles(type: TypeContenu) {
  return db.categories.where('[type+masquee]').equals([type, 0]).toArray()
}
