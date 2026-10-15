/// <reference lib="webworker" />
import { db, versEntree, versCategorie, type TypeContenu } from './db'
import {
  ErreurApi, ErreurReseau, appeler,
  type CategorieApi, type ChaineApi, type FilmApi, type ManifesteCatalogue, type SerieApi,
} from './api'
import { ErreurLecteur } from './errors'
import { separerPrefixe } from './libelles'
import { lireNdjson } from './ndjson'
import { decider, delaiRetry, partAvancement, type EtatImport, type TypeExport } from './plan-import'

// L'import complet pese des dizaines de Mo et ~150 000 entrees : fetch, decodage,
// parsing et ecriture IndexedDB se font entierement hors du fil principal.
//
// COMMENT l'import est borne dans le temps, et pourquoi il peut reprendre :
//   - `GET /catalogue/version` est le manifeste (tres leger). Sa `version` est
//     l'ETag commun a TOUS les exports : inchangee, il n'y a AUCUNE donnee a
//     telecharger -- c'est la reponse « import incremental » du contrat ;
//   - sinon un export NDJSON par type, lu en flux et ecrit par lots. Chaque type
//     termine est consigne (`catalogue.enCours`) avec la version visee : une
//     coupure reprend au type interrompu, pas au debut ;
//   - si la version change PENDANT l'import (resynchronisation du serveur),
//     deux versions se melangeraient : on repart du manifeste.
// Aucun identifiant ne passe ici : le cookie de session est joint par le
// navigateur, un worker de module partageant l'origine de la page.

export interface AvancementImport {
  etape: string
  part: number
}

export type VersWorker = { type: 'importer'; force?: boolean }

export type DepuisWorker =
  | { type: 'avancement'; avancement: AvancementImport }
  | {
      type: 'fini'
      /** Faux : le catalogue etait deja a jour, rien n'a ete telecharge. */
      importe: boolean
      version: string
      entrees: number
      categories: number
    }
  | { type: 'erreur'; couche: string; message: string; action: string; detail?: string }

const CLE_VERSION = 'catalogue.version'
const CLE_EN_COURS = 'catalogue.enCours'
const CLE_DATE = 'dernierImport'
const LOT = 5000
const ESSAIS_PAR_EXPORT = 4
const ESSAIS_VERSION = 3

const LIBELLE: Record<TypeExport, string> = {
  categories: 'catégories',
  live: 'chaînes',
  vod: 'films',
  series: 'séries',
}

/** La version a change entre le manifeste et un export : on reprend du manifeste. */
class VersionChangee extends Error {}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** ETag faible `W/"abc"` -> `abc`, comme le champ `version` du manifeste. */
function versionDeEtag(brut: string | null): string | undefined {
  if (!brut) return undefined
  return brut.replace(/^W\//, '').replace(/^"|"$/g, '')
}

async function lireEtat(): Promise<EtatImport> {
  const v = (await db.reglages.get(CLE_VERSION))?.valeur
  const c = (await db.reglages.get(CLE_EN_COURS))?.valeur as EtatImport['enCours']
  return {
    versionComplete: typeof v === 'string' ? v : undefined,
    enCours: c && typeof c.version === 'string' && Array.isArray(c.faits) ? c : undefined,
  }
}

async function recupererManifeste(
  version: string | undefined,
): Promise<ManifesteCatalogue | 'inchange'> {
  const entetes: Record<string, string> = {}
  // `W/"v"` : le serveur compare des ETag faibles (contrat).
  if (version) entetes['If-None-Match'] = `W/"${version}"`
  const r = await appeler('/catalogue/version', { entetes })
  if (r.status === 304) return 'inchange'
  return (await r.json()) as ManifesteCatalogue
}

function total(m: ManifesteCatalogue): number {
  return m.categories + m.chaines + m.films + m.series
}

/** Nombre de lignes annonce par le manifeste pour un export (barre de progression). */
function effectif(m: ManifesteCatalogue, t: TypeExport): number {
  return t === 'categories' ? m.categories : t === 'live' ? m.chaines : t === 'vod' ? m.films : m.series
}

interface Contexte {
  version: string
  total: number
  fait: number
  poster: (etape: string, fait: number) => void
}

/**
 * Lit un export en flux. Seule l'OUVERTURE de la connexion est rejouee ici
 * (refus transitoire, service qui redemarre) : une fois des lots rendus a
 * l'appelant, ils sont deja ecrits, et rejouer le flux les rendrait deux fois.
 * Une coupure en plein flux remonte donc, et c'est `executer` qui reprend --
 * au type pres, grace a `catalogue.enCours`.
 */
async function* exporter<T>(type: TypeExport, ctx: Contexte): AsyncGenerator<T[]> {
  let r: Response | undefined
  for (let essai = 0; r === undefined; essai++) {
    try {
      r = await appeler(`/catalogue/export?type=${type}`)
    } catch (e) {
      const rejouable = e instanceof ErreurReseau || (e instanceof ErreurApi && e.statut >= 500)
      if (!rejouable || essai + 1 >= ESSAIS_PAR_EXPORT) throw e
      await attendre(delaiRetry(essai))
    }
  }
  const v = versionDeEtag(r.headers.get('ETag'))
  if (v !== undefined && v !== ctx.version) throw new VersionChangee()
  if (!r.body) throw new ErreurReseau('flux absent')
  try {
    for await (const lot of lireNdjson<T>(r.body, LOT)) {
      yield lot
      ctx.fait += lot.length
      ctx.poster(`Téléchargement des ${LIBELLE[type]}`, ctx.fait)
    }
  } catch (e) {
    // Une coupure en plein corps n'est pas une erreur de l'API : c'est du reseau.
    if (e instanceof TypeError) throw new ErreurReseau(e.message)
    throw e
  }
}

async function importerType(
  type: Exclude<TypeExport, 'categories'>,
  categories: CategorieApi[],
  ctx: Contexte,
): Promise<number> {
  const t: TypeContenu = type
  // Cles deja en base pour ce type : celles que l'export ne reverra pas ont
  // disparu du serveur et doivent partir -- mais seulement APRES un export
  // complet, pour qu'un import interrompu ne laisse pas un catalogue troue.
  const anciennes = new Set((await db.catalogue.where('type').equals(t).primaryKeys()) as string[])
  const comptes = new Map<string, number>()
  let n = 0
  for await (const lot of exporter<ChaineApi | FilmApi | SerieApi>(type, ctx)) {
    const entrees = lot.map((b) => versEntree(t, b, separerPrefixe))
    for (const e of entrees) {
      anciennes.delete(e.cle)
      if (e.categorie) comptes.set(e.categorie, (comptes.get(e.categorie) ?? 0) + 1)
    }
    await db.catalogue.bulkPut(entrees)
    n += entrees.length
  }
  if (anciennes.size > 0) await db.catalogue.bulkDelete([...anciennes])

  // Les categories masquees le restent apres un reimport : c'est un choix de
  // l'utilisateur (et un reglage de profil), pas une donnee du fournisseur.
  const masquees = new Set(
    (await db.categories.where('[type+masquee]').equals([t, 1]).toArray()).map((c) => c.cle),
  )
  const siennes = categories.filter((c) => c.type === t)
  await db.transaction('rw', db.categories, async () => {
    await db.categories.where('type').equals(t).delete()
    await db.categories.bulkPut(
      siennes.map((c) => {
        const cat = versCategorie(c, comptes.get(c.id) ?? 0)
        if (masquees.has(cat.cle)) cat.masquee = 1
        return cat
      }),
    )
  })
  return n
}

async function executer(force: boolean, poster: (m: DepuisWorker) => void): Promise<void> {
  for (let tentative = 0; tentative < ESSAIS_VERSION; tentative++) {
    const etat = await lireEtat()
    poster({ type: 'avancement', avancement: { etape: 'Vérification du catalogue', part: 0 } })
    const manifeste = await recupererManifeste(force ? undefined : etat.versionComplete)
    if (manifeste === 'inchange') {
      poster({
        type: 'fini', importe: false, version: etat.versionComplete ?? '', entrees: 0, categories: 0,
      })
      return
    }
    const decision = decider(etat, manifeste, force)
    if (decision.action === 'rien') {
      poster({ type: 'fini', importe: false, version: manifeste.version, entrees: 0, categories: 0 })
      return
    }
    if (!decision.reprise) {
      // Des qu'un import commence, « catalogue complet a la version X » n'est plus
      // vrai : on l'oublie, faute de quoi une coupure suivie d'une reprise sans
      // `force` croirait la base a jour. Il est repose a la toute fin.
      await db.reglages.delete(CLE_VERSION)
      await db.reglages.put({ cle: CLE_EN_COURS, valeur: { version: decision.version, faits: [] } })
    }

    // Les types deja termines (reprise) comptent comme faits dans la barre.
    const dejaFaits = new Set<TypeExport>(decision.reprise ? etat.enCours!.faits : [])
    const ctx: Contexte = {
      version: decision.version,
      total: total(manifeste),
      fait: [...dejaFaits].reduce((n, t) => n + effectif(manifeste, t), 0),
      poster: (etape, fait) =>
        poster({ type: 'avancement', avancement: { etape, part: partAvancement(fait, total(manifeste)) } }),
    }
    try {
      const categories: CategorieApi[] = []
      for await (const lot of exporter<CategorieApi>('categories', ctx)) categories.push(...lot)

      const faits = dejaFaits
      let entrees = 0
      for (const type of decision.restants) {
        if (type === 'categories') continue
        entrees += await importerType(type, categories, ctx)
        faits.add(type)
        await db.reglages.put({
          cle: CLE_EN_COURS, valeur: { version: decision.version, faits: [...faits] },
        })
      }
      // Compte total apres import : celui de la base, pas seulement de cette passe.
      const entreesBase = await db.catalogue.count()
      await db.reglages.bulkPut([
        { cle: CLE_VERSION, valeur: decision.version },
        { cle: CLE_DATE, valeur: Date.now() },
      ])
      await db.reglages.delete(CLE_EN_COURS)
      poster({
        type: 'fini', importe: true, version: decision.version,
        entrees: entreesBase || entrees, categories: categories.length,
      })
      return
    } catch (e) {
      if (e instanceof VersionChangee) {
        // L'etat `enCours` porte l'ancienne version : `decider` repartira de zero.
        continue
      }
      throw e
    }
  }
  throw new ErreurLecteur(
    'relais', 'Le catalogue change pendant l\'import.', 'Réessayer dans un instant.',
  )
}

/** Reprises automatiques apres une coupure : chacune repart du type interrompu. */
const REPRISES = 3

self.onmessage = async (e: MessageEvent<VersWorker>) => {
  if (e.data.type !== 'importer') return
  try {
    for (let reprise = 0; ; reprise++) {
      try {
        // `force` ne vaut que pour la PREMIERE passe : apres une coupure, la
        // reprise doit reutiliser ce qui est deja ecrit, pas tout recommencer.
        await executer(e.data.force === true && reprise === 0, post)
        break
      } catch (err) {
        const rejouable = err instanceof ErreurReseau || (err instanceof ErreurApi && err.statut >= 500)
        if (!rejouable || reprise >= REPRISES) throw err
        post({ type: 'avancement', avancement: { etape: 'Reprise après une coupure', part: 0 } })
        await attendre(delaiRetry(reprise, 1000))
      }
    }
  } catch (err) {
    const e2 = versErreur(err)
    post({ type: 'erreur', couche: e2.couche, message: e2.message, action: e2.action, detail: e2.detail })
  }
}

function versErreur(err: unknown): ErreurLecteur {
  if (err instanceof ErreurLecteur) return err
  if (err instanceof ErreurReseau)
    return new ErreurLecteur('reseau', 'Le service est injoignable.', "Réessayer l'import.", err.message)
  if (err instanceof ErreurApi) {
    const couche = err.statut === 401 || err.statut === 403 ? 'auth' : err.statut >= 500 ? 'relais' : 'donnees'
    return new ErreurLecteur(couche, err.message, "Réessayer l'import.", `HTTP ${err.statut} ${err.code}`)
  }
  return new ErreurLecteur('donnees', String(err), "Réessayer l'import.")
}

function post(m: DepuisWorker) {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
}
