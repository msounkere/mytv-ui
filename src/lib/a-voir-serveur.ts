import { createSignal } from 'solid-js'
import { db, type AVoir } from './db'
import { cleDe, cleDeIdAVoir } from './identifiants'
import {
  CLE_ORDRE, type Budget, type EtatPreparation, type Preparation, type PreparationEpisode, type RaisonAttente,
} from './ma-liste-regles'
import { estVu } from './vu'
import { TEXTES_TOAST, emettreToast } from './toasts'
import { titreCourt } from '../components/titres'

// Reception de `GET /profil/a_voir` (US-43 CA1 : le serveur fait foi au
// demarrage ; CA2 : l'etat se relit toutes les 10 s sur l'ecran ; lot 10 /
// US-44 : raison d'attente, position dans la file, nouvelle tentative, budget).
// Module a part pour que `synchro.ts` (qui recoit) et `ma-liste.ts` (qui ecrit
// les gestes) le partagent sans s'importer l'un l'autre.

/** Element tel que le contrat (lot 9 + US-44) le rend. */
export interface AVoirElementApi {
  contenu: string
  rang: number
  ajoute: string
  episodes_avance?: number
  depuis?: { saison: number; episode: number }
  etat: EtatPreparation
  octets?: number
  total?: number
  debit_kbps?: number
  cause?: string
  raison?: RaisonAttente
  position?: number
  reessai?: string
  episodes?: Array<{
    contenu: string
    saison: number
    episode: number
    etat: EtatPreparation
    octets?: number
    total?: number
    debit_kbps?: number
    cause?: string
    raison?: RaisonAttente
    position?: number
    reessai?: string
  }>
}

const ETATS: readonly EtatPreparation[] = ['attente', 'en_cours', 'pret', 'echec']
const RAISONS: readonly RaisonAttente[] = ['lecture_en_cours', 'file', 'budget_plein', 'reprise_apres']
const etatSur = (e: unknown): EtatPreparation => (ETATS.includes(e as EtatPreparation) ? (e as EtatPreparation) : 'attente')
const raisonSur = (r: unknown): RaisonAttente | undefined => (RAISONS.includes(r as RaisonAttente) ? (r as RaisonAttente) : undefined)
const nombre = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) ? n : undefined)
/** La cause vient du serveur deja assainie ; on la borne quand meme pour l'affichage. */
const texte = (t: unknown): string | undefined => (typeof t === 'string' && t ? t.slice(0, 200) : undefined)

export function versPreparation(e: AVoirElementApi): Preparation {
  const episodes: PreparationEpisode[] | undefined = e.episodes?.map((ep) => ({
    contenu: ep.contenu, saison: ep.saison, episode: ep.episode, etat: etatSur(ep.etat),
    octets: nombre(ep.octets), total: nombre(ep.total), debitKbps: nombre(ep.debit_kbps), cause: texte(ep.cause),
    raison: raisonSur(ep.raison), position: nombre(ep.position), reessai: texte(ep.reessai),
  }))
  return {
    etat: etatSur(e.etat),
    octets: nombre(e.octets), total: nombre(e.total), debitKbps: nombre(e.debit_kbps), cause: texte(e.cause),
    raison: raisonSur(e.raison), position: nombre(e.position), reessai: texte(e.reessai),
    ...(episodes?.length ? { episodes } : {}),
  }
}

// --- Budget du serveur (US-44 CA4) -------------------------------------------
// Un signal, pose a chaque reception : l'en-tete de l'ecran « Ma liste » le lit.

const [budgetListe, poserBudgetListe] = createSignal<Budget | undefined>(undefined)
const [derniereReception, poserDerniereReception] = createSignal<number | undefined>(undefined)
export { budgetListe, derniereReception }

export function versBudget(b: unknown): Budget | undefined {
  if (!b || typeof b !== 'object') return undefined
  const utilise = nombre((b as { utilise?: unknown }).utilise)
  const total = nombre((b as { total?: unknown }).total)
  return utilise !== undefined && total !== undefined ? { utilise, total } : undefined
}

// --- Ce qui est pret, lisible par tous les ecrans ------------------------------
// Les cartes et les fiches (CA3) et le decompte du lecteur (CA4) demandent « ce
// contenu est-il pret ? » : un signal, recalcule a chaque reception, repond sans
// relire la table. Cles locales : celle du film, et celle de CHAQUE episode pret
// d'une serie (`series:iptva:77123.mkv`).

const [clesPretes, poserClesPretes] = createSignal<ReadonlySet<string>>(new Set())
export { clesPretes }

export function estPret(cle: string): boolean {
  return clesPretes().has(cle)
}

export function recalculerPrets(lignes: AVoir[]): void {
  const prets = new Set<string>()
  for (const l of lignes) {
    const p = l.preparation
    if (!p) continue
    if (p.etat === 'pret' && !p.episodes) prets.add(l.cle)
    for (const ep of p.episodes ?? []) if (ep.etat === 'pret') prets.add(cleDe('series', ep.contenu))
  }
  poserClesPretes(prets)
}

// Au chargement : ce que la derniere reception a laisse en base, pour que les
// badges ne clignotent pas en attendant le serveur.
if (typeof indexedDB !== 'undefined') void db.a_voir.toArray().then(recalculerPrets).catch(() => undefined)

const meme = (a: AVoir | undefined, b: AVoir): boolean => a !== undefined && JSON.stringify(a) === JSON.stringify(b)

/** Au plus autant de toasts par reception : une liste purgee ailleurs ne doit pas en faire pleuvoir. */
const TOASTS_MAX_PAR_RECEPTION = 3

/**
 * Applique la liste du serveur a la table locale, dans UNE transaction avec le
 * journal : les gestes en attente (journal) sont lus et les lignes ecrites sans
 * qu'un geste puisse se glisser entre les deux -- constate en recette : une
 * option changee pendant la relecture periodique etait ecrasee par la reponse,
 * puis envoyee sans l'option. `gardes` : cles dont un geste etait en attente
 * AVANT l'aller-retour ; celles du journal au moment d'ecrire s'y ajoutent.
 * Elles gagnent sur le serveur (present ou retire, leurs options) mais prennent
 * quand meme l'etat de preparation recu. Renvoie vrai si quelque chose a change.
 *
 * Lot 10 (CA4) : la DIFFERENCE entre deux receptions parle. Un element que le
 * serveur a retire sans geste local (film vu, serie finie) et un fichier passe
 * en echec donnent chacun un toast -- jamais une disparition silencieuse.
 */
export async function appliquerListeServeur(elements: AVoirElementApi[], gardesAvant: ReadonlySet<string>, budget?: Budget): Promise<boolean> {
  const recus = new Map<string, AVoirElementApi>()
  for (const e of elements) {
    const cle = cleDeIdAVoir(e.contenu)
    if (cle) recus.set(cle, e)
  }
  const disparus: AVoir[] = []
  const echecs: AVoir[] = []
  const change = await db.transaction('rw', db.a_voir, db.journal, async () => {
    const gardes = new Set(gardesAvant)
    for (const l of await db.journal.toArray()) if (l.genre === 'a_voir') gardes.add(l.cle)
    // Un ordre local pas encore parti gagne sur les rangs du serveur : sinon la
    // relecture periodique de l'etat (toutes les 10 s) defait un « Descendre »
    // avant que le PUT de l'ordre ne parte.
    const ordreLocal = gardes.has(CLE_ORDRE)
    const locaux = await db.a_voir.toArray()
    const connus = new Map(locaux.map((l) => [l.cle, l]))
    let change = false
    for (const l of locaux)
      if (!recus.has(l.cle) && !gardes.has(l.cle)) {
        await db.a_voir.delete(l.cle)
        disparus.push(l)
        change = true
      }
    let i = 0
    for (const [cle, e] of recus) {
      i++
      const local = connus.get(cle)
      const preparation = versPreparation(e)
      let ligne: AVoir
      if (gardes.has(cle)) {
        if (!local) continue
        ligne = { ...local, preparation }
      } else {
        ligne = {
          cle,
          rang: ordreLocal && local ? local.rang : typeof e.rang === 'number' ? e.rang : i,
          ajouteLe: local?.ajouteLe ?? (Date.parse(e.ajoute) || Date.now()),
          ...(e.episodes_avance !== undefined ? { episodesAvance: e.episodes_avance } : {}),
          ...(e.depuis ? { depuis: { saison: e.depuis.saison, episode: e.depuis.episode } } : {}),
          preparation,
        }
      }
      if (meme(local, ligne)) continue
      // Un echec NOUVEAU (l'element etait connu dans un autre etat) merite un toast.
      if (local?.preparation && local.preparation.etat !== 'echec' && preparation.etat === 'echec') echecs.push(ligne)
      await db.a_voir.put(ligne)
      change = true
    }
    return change
  })
  recalculerPrets(await db.a_voir.toArray())
  if (budget) poserBudgetListe(budget)
  poserDerniereReception(Date.now())
  await annoncerDifferences(disparus, echecs)
  return change
}

/** Nom affichable d'une cle de film ou de serie ; la cle elle-meme a defaut. */
async function titreDe(cle: string): Promise<string> {
  const e = await db.catalogue.get(cle).catch(() => undefined)
  return e ? titreCourt(e.nom) : cle
}

/** Vrai quand ce film est vu, ou qu'un episode de cette serie l'est : la sortie vient de la lecture. */
async function sortiParLecture(cle: string): Promise<'film' | 'serie' | false> {
  const r = await db.reprises.get(cle).catch(() => undefined)
  if (r && estVu(r.position, r.duree)) return 'film'
  if (cle.startsWith('series:')) {
    const episodes = await db.reprises.filter((x) => x.serie === cle).toArray().catch(() => [])
    if (episodes.some((x) => estVu(x.position, x.duree))) return 'serie'
  }
  return false
}

async function annoncerDifferences(disparus: AVoir[], echecs: AVoir[]): Promise<void> {
  let n = 0
  for (const l of disparus) {
    if (n >= TOASTS_MAX_PAR_RECEPTION) break
    const cause = await sortiParLecture(l.cle)
    // Retire ailleurs sans etre vu (autre appareil, nettoyage) : pas un evenement
    // de CET appareil, on ne le commente pas.
    if (!cause) continue
    n++
    const titre = await titreDe(l.cle)
    emettreToast({
      message: cause === 'film' ? TEXTES_TOAST.vuRetireMaListe(titre) : TEXTES_TOAST.serieTermineeRetiree(titre),
      ton: 'ok',
      action: async () => {
        // Import a la demande : `ma-liste.ts` importe `synchro.ts` qui importe ce module.
        const { ajouterMaListe } = await import('./ma-liste')
        await ajouterMaListe(l.cle, { episodesAvance: l.episodesAvance, depuis: l.depuis }, { silencieux: true, rang: l.rang })
      },
    })
  }
  for (const l of echecs) {
    if (n >= TOASTS_MAX_PAR_RECEPTION) break
    n++
    const titre = await titreDe(l.cle)
    emettreToast({
      message: TEXTES_TOAST.echecPreparation(titre),
      ton: 'erreur',
      libelleAction: 'Réessayer',
      action: async () => {
        const { reessayerMaListe } = await import('./ma-liste')
        await reessayerMaListe(l.cle)
      },
    })
  }
}
