/// <reference lib="webworker" />
import { db, versEntree, versCategorie, type TypeContenu } from './db'
import { ClientXtream, separerPrefixe } from './xtream'
import { ErreurLecteur } from './errors'

// L'import complet pèse 78 Mo et 154 000 entrées. Le seul `JSON.parse` des
// 43 Mo de films figerait l'onglet plusieurs secondes : fetch, parsing et
// écriture IndexedDB se font donc entièrement hors du fil principal.
//
// Le worker ne reçoit plus aucun identifiant : il appelle les routes relayées
// par le service, et le navigateur joint seul le cookie de session — un worker
// de module partage l'origine de la page qui l'a créé, donc ses cookies.

export interface AvancementImport {
  etape: string
  part: number
}

export type VersWorker = { type: 'importer' }

export type DepuisWorker =
  | { type: 'avancement'; avancement: AvancementImport }
  | { type: 'fini'; entrees: number; categories: number }
  | { type: 'erreur'; couche: string; message: string; action: string; detail?: string }

const LOTS: Array<{ type: TypeContenu; libelle: string }> = [
  { type: 'live', libelle: 'chaînes' },
  { type: 'vod', libelle: 'films' },
  { type: 'series', libelle: 'séries' },
]

self.onmessage = async (e: MessageEvent<VersWorker>) => {
  if (e.data.type !== 'importer') return
  try {
    const client = new ClientXtream()
    let totalEntrees = 0
    let totalCategories = 0

    for (const [i, lot] of LOTS.entries()) {
      const avancer = (etape: string, fraction: number) =>
        post({ type: 'avancement', avancement: { etape, part: (i + fraction) / LOTS.length } })

      avancer(`Catégories ${lot.libelle}`, 0.05)
      const categories =
        lot.type === 'live'
          ? await client.categoriesDirect()
          : lot.type === 'vod'
            ? await client.categoriesFilms()
            : await client.categoriesSeries()

      avancer(`Téléchargement des ${lot.libelle}`, 0.25)
      const items =
        lot.type === 'live'
          ? await client.chaines()
          : lot.type === 'vod'
            ? await client.films()
            : await client.series()

      avancer(`Indexation des ${lot.libelle}`, 0.6)
      const entrees = items.map((b) => versEntree(lot.type, b, separerPrefixe))

      const comptes = new Map<string, number>()
      for (const en of entrees)
        if (en.categorie) comptes.set(en.categorie, (comptes.get(en.categorie) ?? 0) + 1)

      avancer(`Enregistrement des ${lot.libelle}`, 0.8)
      await db.transaction('rw', db.catalogue, db.categories, async () => {
        await db.catalogue.where('type').equals(lot.type).delete()
        // Par lots : une seule écriture de 107 000 objets sature la transaction.
        for (let k = 0; k < entrees.length; k += 5000)
          await db.catalogue.bulkPut(entrees.slice(k, k + 5000))

        const masquees = new Set(
          (await db.categories.where('[type+masquee]').equals([lot.type, 1]).toArray()).map((c) => c.cle),
        )
        await db.categories.where('type').equals(lot.type).delete()
        await db.categories.bulkPut(
          categories.map((c) => {
            const cat = versCategorie(lot.type, c, comptes.get(c.category_id) ?? 0)
            if (masquees.has(cat.cle)) cat.masquee = 1
            return cat
          }),
        )
      })

      totalEntrees += entrees.length
      totalCategories += categories.length
    }

    await db.reglages.put({ cle: 'dernierImport', valeur: Date.now() })
    post({ type: 'fini', entrees: totalEntrees, categories: totalCategories })
  } catch (err) {
    const e2 =
      err instanceof ErreurLecteur
        ? err
        : new ErreurLecteur('donnees', String(err), "Réessayer l'import.")
    post({
      type: 'erreur',
      couche: e2.couche,
      message: e2.message,
      action: e2.action,
      detail: e2.detail,
    })
  }
}

function post(m: DepuisWorker) {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
}
