import { db, type TypeContenu, type EntreeCatalogue } from './db'
import { ErreurLecteur, type Couche } from './errors'
import type { DepuisWorker, VersWorker } from './import.worker'

// Import unique du catalogue dans IndexedDB. 128 000 entrees ne peuvent pas
// etre retelechargees a chaque navigation ; une fois importees, la recherche et
// le parcours sont instantanes et fonctionnent meme relais injoignable.

export interface Avancement {
  etape: string
  /** 0 a 1, ou undefined quand l etape n est pas quantifiable. */
  part?: number
}

const CLE_IMPORT = 'dernierImport'

export async function dateDernierImport(): Promise<number | undefined> {
  const r = await db.reglages.get(CLE_IMPORT)
  return typeof r?.valeur === 'number' ? r.valeur : undefined
}

export function importerCatalogue(
  surAvancement: (a: Avancement) => void,
): Promise<{ entrees: number; categories: number }> {
  return new Promise((resoudre, rejeter) => {
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<DepuisWorker>) => {
      const m = e.data
      if (m.type === 'avancement') return surAvancement(m.avancement)
      worker.terminate()
      if (m.type === 'fini') resoudre({ entrees: m.entrees, categories: m.categories })
      else rejeter(new ErreurLecteur(m.couche as Couche, m.message, m.action, m.detail))
    }
    worker.onerror = (e) => {
      worker.terminate()
      rejeter(new ErreurLecteur('donnees', e.message || "L'import a échoué.", "Réessayer l'import."))
    }
    worker.postMessage({ type: 'importer' } satisfies VersWorker)
  })
}

export function entreesDeCategorie(type: TypeContenu, categorie: string): Promise<EntreeCatalogue[]> {
  return db.catalogue.where('[type+categorie]').equals([type, categorie]).toArray()
}

export function categoriesVisibles(type: TypeContenu) {
  return db.categories.where('[type+masquee]').equals([type, 0]).toArray()
}
