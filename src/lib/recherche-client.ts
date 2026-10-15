import { createSignal } from 'solid-js'
import type { TypeContenu } from './db'
import type {
  Facette,
  Groupes,
  MessageDepuisWorker,
  MessageVersWorker,
  Totaux,
  Tri,
} from './recherche.worker'

// Un seul index pour toute l'application. Le panneau de suggestions vit dans
// l'en-tête et la page de résultats dans la surface principale : leur donner
// chacun son worker reconstruirait deux fois un index de 154 060 entrées et
// garderait deux copies du catalogue en mémoire.

export const QUOTAS_PANNEAU: Totaux = { live: 6, vod: 5, series: 4 }

/** Délai sans frappe avant d'interroger l'index, imposé par le dossier. */
export const DELAI_FRAPPE = 180

export type EtatIndex = 'repos' | 'indexation' | 'pret'

const [etatIndex, poserEtatIndex] = createSignal<EtatIndex>('repos')
const [compteIndexe, poserCompteIndexe] = createSignal(0)
export { etatIndex, compteIndexe }

export interface ReponsePanneau {
  groupes: Groupes
  totaux: Totaux
  /** Temps passé dans le worker, en millisecondes. */
  ms: number
}

export interface ReponsePage extends ReponsePanneau {
  langues: Facette[]
}

let worker: Worker | null = null
let demarrage: Promise<number> | null = null
let jeton = 0
const attentes = new Map<number, (m: MessageDepuisWorker) => void>()

function obtenirWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./recherche.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<MessageDepuisWorker>) => {
    const m = e.data
    if (m.type === 'pret') return
    const resoudre = attentes.get(m.jeton)
    if (resoudre) {
      attentes.delete(m.jeton)
      resoudre(m)
    }
  }
  return worker
}

/**
 * Construit l'index au premier besoin et le garde. Les appels concurrents
 * partagent la même promesse : ouvrir le panneau pendant que la page de
 * résultats démarre ne doit pas déclencher deux lectures d'IndexedDB.
 */
export function demarrerIndex(): Promise<number> {
  if (demarrage) return demarrage
  const w = obtenirWorker()
  poserEtatIndex('indexation')
  demarrage = (async () => {
    performance.mark('rech:index-debut')
    // Le worker va chercher le catalogue lui-même dans IndexedDB : le lire ici
    // coûtait une tâche de 426 ms sur le fil qui reçoit les touches.
    const compte = await new Promise<number>((resoudre) => {
      const surPret = (e: MessageEvent<MessageDepuisWorker>) => {
        if (e.data.type !== 'pret') return
        w.removeEventListener('message', surPret)
        resoudre(e.data.compte)
      }
      w.addEventListener('message', surPret)
      w.postMessage({ type: 'indexer' } satisfies MessageVersWorker)
    })
    performance.mark('rech:index-fin')
    performance.measure('rech:indexation', 'rech:index-debut', 'rech:index-fin')
    poserCompteIndexe(compte)
    poserEtatIndex('pret')
    return compte
  })()
  return demarrage
}

function envoyer<T extends MessageDepuisWorker>(
  faire: (j: number) => MessageVersWorker,
): Promise<T> {
  const w = obtenirWorker()
  jeton += 1
  const j = jeton
  return new Promise<T>((resoudre) => {
    attentes.set(j, (m) => resoudre(m as T))
    w.postMessage(faire(j))
  })
}

/** Interroge l'index pour le panneau : quotas 6 / 5 / 4 et effectifs réels. */
export async function chercherPanneau(requete: string): Promise<ReponsePanneau> {
  await demarrerIndex()
  const marque = `rech:panneau:${requete}`
  performance.mark(`${marque}:debut`)
  const m = await envoyer<Extract<MessageDepuisWorker, { type: 'resultats' }>>((j) => ({
    type: 'chercher', requete, limites: QUOTAS_PANNEAU, jeton: j,
  }))
  performance.mark(`${marque}:fin`)
  performance.measure('rech:panneau', `${marque}:debut`, `${marque}:fin`)
  return { groupes: m.groupes, totaux: m.totaux, ms: m.ms }
}

/** Interroge l'index pour l'écran de résultats, filtres compris. */
export async function chercherPage(
  requete: string,
  langue: string | null,
  tri: Tri,
  limites: Record<TypeContenu, number>,
): Promise<ReponsePage> {
  await demarrerIndex()
  performance.mark('rech:page:debut')
  const m = await envoyer<Extract<MessageDepuisWorker, { type: 'page' }>>((j) => ({
    type: 'page', requete, langue, tri, limites, jeton: j,
  }))
  performance.mark('rech:page:fin')
  performance.measure('rech:page', 'rech:page:debut', 'rech:page:fin')
  return { groupes: m.groupes, totaux: m.totaux, langues: m.langues, ms: m.ms }
}

export type { Facette, Groupes, Totaux, Tri }
