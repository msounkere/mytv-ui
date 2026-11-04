import { createSignal } from 'solid-js'
import { db, type Categorie, type GenreEtat, type LigneJournal, type TypeContenu } from './db'
import { config, poserConfig } from '../config'
import { ErreurApi, ErreurReseau, envoyer, json, type LectureApi, type Page, type ReglagesApi } from './api'
import { estConnecte, limites, profilActifId, signalerProfilRequis } from './auth'
import {
  invaliderAVoir, invaliderCategories, invaliderEpingles, invaliderFavoris, invaliderHistorique,
  invaliderRecommandation, invaliderReprises,
} from './requetes'
import { serieAssociee } from './series-episodes'
import { appliquerListeServeur, versBudget, type AVoirElementApi } from './a-voir-serveur'
import { CLE_ORDRE } from './ma-liste-regles'
import { fusionner, egaux, ecrireEnsemble, lireEnsemble, type Valeurs } from './reglages-fusion'
import {
  cheminAVoir, cheminContenu, cleDe, clesCandidates, estIdentifiantEpisode, idAVoirDeCle, idServeurDeCle, serieDeCle,
} from './identifiants'

/**
 * Reprise de l'etat personnel d'une machine a l'autre, via `/profil/*`.
 *
 * POURQUOI IndexedDB reste la source de lecture : un service injoignable ne doit
 * RIEN faire perdre ni rien ralentir. Toutes les lectures de `preferences.ts`
 * continuent de venir du navigateur ; ce module n'ajoute qu'un aller-retour
 * par-dessus. Il echoue en silence (jamais devant l'utilisateur), garde ses
 * gestes en attente dans un journal local, et reprend la ou il s'etait arrete
 * des que le reseau revient.
 *
 * TROIS MECANISMES, parce que le contrat expose trois formes d'etat :
 *   - FAVORIS : un ensemble ordonne, une route par contenu (PUT/DELETE
 *     idempotents). Le journal dit QUOI a change, la table dit dans quel sens ;
 *   - HISTORIQUE : un enregistrement par contenu qui porte aussi la position de
 *     reprise. Cote navigateur la reprise et l'historique sont deux tables ; on
 *     les recompose en un seul PUT ;
 *   - REGLAGES : un dictionnaire + une revision, ecrit d'un bloc. C'est le seul
 *     qui peut entrer en CONFLIT (`409 conflit`) : on fusionne a trois points
 *     (voir reglages-fusion.ts) puis on reessaie ;
 *   - « À VOIR » (US-43 CA1) : comme les favoris, une route par contenu (PUT
 *     avec les options / DELETE, idempotents), plus UN PUT de l'ordre complet
 *     quand il a change. `GET /profil/a_voir` fait foi au demarrage et porte
 *     l'etat de preparation de chaque element (voir a-voir-serveur.ts).
 *
 * CE QUI NE REMONTE PAS : le catalogue (il vient du serveur) et le guide.
 */

export type EtatSynchro = 'inactif' | 'en-cours' | 'ok' | 'erreur' | 'hors-ligne'

const [etatSynchro, poserEtat] = createSignal<EtatSynchro>('inactif')
const [derniereSynchro, poserDerniere] = createSignal<number | undefined>()
export { etatSynchro, derniereSynchro }

// --- Elements du journal ----------------------------------------------------

export interface Changement {
  genre: GenreEtat
  cle: string
  valeur?: unknown
  supprime?: boolean
}

/** Au-dela, on abandonne la pagination plutot que de boucler sur un serveur fou. */
const PAGES_MAX = 100

/**
 * Appele par `preferences.ts` apres CHAQUE ecriture. L'ecriture locale a deja
 * eu lieu : si ce qui suit echoue, l'utilisateur ne perd rien.
 */
export function noterChangement(c: Changement): void {
  void db.journal
    .add({
      genre: c.genre,
      cle: c.cle,
      maj: Date.now(),
      supprime: c.supprime ? 1 : 0,
      valeur: c.valeur,
    } as LigneJournal)
    .then(() => planifier(c.genre === 'reprise' ? DELAI_REPRISE : DELAI_GESTE))
    .catch(() => undefined)
}

/**
 * Meme chose, pour un geste ecrit dans une transaction Dexie : la ligne de
 * journal est ajoutee DANS la transaction (donc visible de toute relecture qui
 * verrait deja le geste), et `planifierGeste()` se fait apres. Sans cela une
 * relecture du serveur pouvait s'intercaler entre l'ecriture et le journal, ne
 * pas tenir le geste pour « en attente », et l'ecraser (US-43 CA1, constate).
 */
export async function journaliser(c: Changement): Promise<void> {
  await db.journal.add({
    genre: c.genre,
    cle: c.cle,
    maj: Date.now(),
    supprime: c.supprime ? 1 : 0,
    valeur: c.valeur,
  } as LigneJournal)
}

export function planifierGeste(): void {
  planifier(DELAI_GESTE)
}

// --- Envoi : le journal -----------------------------------------------------

/** Une cle de journal = un contenu et une CLASSE de route : favoris d'un cote,
 *  historique (qui porte la reprise) de l'autre, la liste « À voir » enfin. */
type Classe = 'favori' | 'lecture' | 'a_voir'
const classeDe = (g: GenreEtat): Classe => (g === 'favori' ? 'favori' : g === 'a_voir' ? 'a_voir' : 'lecture')

interface Groupe {
  classe: Classe
  cle: string
  /** Plus grand `n` du groupe : les lignes ajoutees pendant l'envoi restent. */
  dernier: number
}

function grouper(lignes: LigneJournal[]): Groupe[] {
  const m = new Map<string, Groupe>()
  for (const l of lignes) {
    const classe = classeDe(l.genre)
    const k = `${classe}|${l.cle}`
    const g = m.get(k)
    if (g) g.dernier = Math.max(g.dernier, l.n)
    else m.set(k, { classe, cle: l.cle, dernier: l.n })
  }
  // L'ordre de « À voir » part en dernier : les elements qu'il cite doivent
  // deja exister cote serveur.
  return [...m.values()].sort((a, b) => Number(estOrdre(a)) - Number(estOrdre(b)))
}

const estOrdre = (g: Groupe) => g.classe === 'a_voir' && g.cle === CLE_ORDRE

/**
 * Envoie l'etat COURANT d'un contenu, pas le geste : un favori ajoute puis
 * retire entre deux synchronisations ne fait qu'un DELETE (idempotent), et
 * cinquante positions de reprise ne font qu'un PUT. Renvoie `false` quand il n'y
 * a rien d'envoyable (episode dont la serie est inconnue).
 */
async function envoyerGroupe(g: Groupe): Promise<boolean> {
  if (g.classe === 'a_voir') return envoyerAVoir(g.cle)
  // Le serveur range tout par identifiant seul : la cle locale perd son type ici.
  const id = idServeurDeCle(g.cle)
  const chemin = cheminContenu(id)
  if (g.classe === 'favori') {
    // Lot 10 (US-44 CA6) : les favoris sont reserves aux chaines ; le serveur
    // refuse un film ou une serie (422). Rien a envoyer pour une autre cle.
    if (!g.cle.startsWith('live:')) return false
    const present = (await db.favoris.get(g.cle)) !== undefined
    await envoyer(`/profil/favoris/${chemin}`, { methode: present ? 'PUT' : 'DELETE' })
    return true
  }
  const [h, r] = await Promise.all([db.historique.get(g.cle), db.reprises.get(g.cle)])
  if (!h && !r) {
    await envoyer(`/profil/historique/${chemin}`, { methode: 'DELETE' })
    return true
  }
  const corps: { position: number; duree: number; serie?: string } = {
    position: Math.max(0, Math.floor(r?.position ?? 0)),
    duree: Math.max(0, Math.floor(r?.duree ?? 0)),
  }
  // Le contrat EXIGE `serie` pour un episode et l'INTERDIT sinon (400) : sans
  // elle l'historique jugerait l'episode orphelin.
  const serieLocale = r?.serie ?? h?.serie ?? serieAssociee(g.cle)
  const serie = serieDeCle(id, serieLocale ? idServeurDeCle(serieLocale) : undefined)
  if (serie === 'requise') return false
  if (serie !== undefined) corps.serie = serie
  await envoyer(`/profil/historique/${chemin}`, { methode: 'PUT', corps })
  return true
}

/**
 * « À voir » : l'etat courant de l'element (present avec ses options, ou
 * absent), ou l'ordre complet de la liste. Une cle qui n'a pas sa place dans la
 * liste (chaine, episode) n'est pas envoyable.
 */
async function envoyerAVoir(cle: string): Promise<boolean> {
  if (cle === CLE_ORDRE) {
    const ids: string[] = []
    for (const l of await db.a_voir.orderBy('rang').toArray()) {
      try {
        ids.push(idAVoirDeCle(l.cle))
      } catch {
        // Ligne sans place dans la liste : elle n'est pas envoyable, on l'ignore.
      }
    }
    await envoyer('/profil/a_voir', { methode: 'PUT', corps: { ids } })
    return true
  }
  let id: string
  try {
    id = idAVoirDeCle(cle)
  } catch {
    return false
  }
  const ligne = await db.a_voir.get(cle)
  if (!ligne) {
    await envoyer(`/profil/a_voir/${cheminAVoir(id)}`, { methode: 'DELETE' })
    return true
  }
  const corps: { episodes_avance?: number; depuis?: { saison: number; episode: number } } = {}
  if (ligne.episodesAvance !== undefined) corps.episodes_avance = ligne.episodesAvance
  if (ligne.depuis) corps.depuis = ligne.depuis
  await envoyer(`/profil/a_voir/${cheminAVoir(id)}`, { methode: 'PUT', corps })
  return true
}

interface BilanEnvoi {
  envoyes: number
  refuses: number
}

async function pousserJournal(): Promise<BilanEnvoi> {
  const lignes = await db.journal.orderBy('n').toArray()
  const bilan: BilanEnvoi = { envoyes: 0, refuses: 0 }
  for (const g of grouper(lignes)) {
    try {
      if (await envoyerGroupe(g)) bilan.envoyes++
      else bilan.refuses++
    } catch (e) {
      // Reseau, session, profil : on s'arrete, le journal est intact et tout
      // sera rejoue. Les erreurs PROPRES a ce contenu ne doivent en revanche pas
      // bloquer les autres ni se rejouer indefiniment.
      if (e instanceof ErreurApi && [400, 404, 413, 422].includes(e.statut)) {
        bilan.refuses++
      } else throw e
    }
    const ids = lignes.filter((l) => classeDe(l.genre) === g.classe && l.cle === g.cle && l.n <= g.dernier)
    await db.journal.bulkDelete(ids.map((l) => l.n))
  }
  return bilan
}

// --- Reception : favoris et historique --------------------------------------

/** Cles qui ont un geste local pas encore parti : elles gagnent sur le serveur.
 *  Sans ce garde-fou, un favori coche a la mauvaise seconde reapparaitrait
 *  decoche sous les doigts de l'utilisateur. */
async function enAttente(): Promise<{ favoris: Set<string>; lectures: Set<string>; aVoir: Set<string> }> {
  const favoris = new Set<string>()
  const lectures = new Set<string>()
  const aVoir = new Set<string>()
  for (const l of await db.journal.toArray()) {
    const c = classeDe(l.genre)
    ;(c === 'favori' ? favoris : c === 'a_voir' ? aVoir : lectures).add(l.cle)
  }
  return { favoris, lectures, aVoir }
}

/**
 * Identifiants recus du serveur -> cles locales. Le serveur ne dit pas le TYPE
 * d'un contenu (`iptva:5521` : film ? chaine ?) : le catalogue local le sait.
 * Un identifiant que le catalogue ne connait pas encore (premiere ouverture,
 * import en cours) est simplement ignore cette fois -- l'import terminé relance
 * une synchronisation. Un episode, lui, n'est jamais au catalogue et son type
 * est toujours `series`.
 */
async function resoudreCles(ids: string[]): Promise<Map<string, string>> {
  const resolus = new Map<string, string>()
  const aChercher = ids.filter((id) => !estIdentifiantEpisode(id))
  for (const id of ids) if (estIdentifiantEpisode(id)) resolus.set(id, cleDe('series', id))
  const candidats = aChercher.flatMap(clesCandidates)
  const trouves = new Set(
    ((await db.catalogue.bulkGet(candidats)) as Array<{ cle: string } | undefined>)
      .filter((e): e is { cle: string } => e !== undefined)
      .map((e) => e.cle),
  )
  for (const id of aChercher) {
    const cle = clesCandidates(id).find((c) => trouves.has(c))
    if (cle) resolus.set(id, cle)
  }
  return resolus
}

/** Ancre des dates de favoris recus : le serveur ne donne que l'ORDRE d'ajout. */
const ANCRE_FAVORIS = 1_000_000_000_000

async function tirerFavoris(limite: number | undefined): Promise<boolean> {
  const ids: string[] = []
  let decalage: number | null = 0
  const param = limite ? `limite=${limite}&` : ''
  for (let page = 0; decalage !== null && page < PAGES_MAX; page++) {
    const p: Page<string> = await json<Page<string>>(`/profil/favoris?${param}decalage=${decalage}`)
    ids.push(...p.elements)
    decalage = p.suivant
  }
  const resolus = await resoudreCles(ids)
  // Lot 10 : un film ou une serie encore favori cote serveur (migration non
  // jouee) est ignore -- il vit desormais dans « Ma liste ».
  const cles = ids.flatMap((id) => {
    const c = resolus.get(id)
    return c && c.startsWith('live:') ? [c] : []
  })
  const { favoris: gardes } = await enAttente()
  const serveur = new Set(cles)
  let change = false
  const locaux = await db.favoris.toArray()
  const connus = new Map(locaux.map((f) => [f.cle, f]))
  for (const f of locaux)
    if (!serveur.has(f.cle) && !gardes.has(f.cle)) {
      await db.favoris.delete(f.cle)
      change = true
    }
  for (const [i, cle] of cles.entries()) {
    if (gardes.has(cle) || connus.has(cle)) continue
    // Un favori recu prend un rang qui respecte l'ordre du serveur, et reste
    // anterieur a tout ajout local (Date.now() >> l'ancre).
    await db.favoris.put({ cle, ajouteLe: ANCRE_FAVORIS + i })
    change = true
  }
  return change
}

async function tirerHistorique(): Promise<{ historique: boolean; reprises: boolean }> {
  // Instant de l'instantane : tout ce qui a ete ouvert APRES lui est plus recent
  // que ce que le serveur sait, et ne doit pas etre pris pour « retire ailleurs ».
  const instantane = Date.now()
  const r = await json<{ elements: LectureApi[] }>('/profil/historique')
  const resolus = await resoudreCles(r.elements.map((l) => l.contenu))
  const { lectures: gardees } = await enAttente()
  const vues = new Set<string>()
  let historique = false
  let reprises = false
  let plusAncien = Infinity
  for (const l of r.elements) {
    const vu = Date.parse(l.vu) || Date.now()
    plusAncien = Math.min(plusAncien, vu)
    const cle = resolus.get(l.contenu)
    // Inconnu du catalogue local pour l'instant : ni affichable ni utile.
    if (!cle) continue
    vues.add(cle)
    if (gardees.has(cle)) continue
    const serie = l.serie ? cleDe('series', l.serie) : undefined
    const h = await db.historique.get(cle)
    if (h?.ouvertLe !== vu || h.serie !== serie) {
      await db.historique.put({ cle, ouvertLe: vu, serie })
      historique = true
    }
    const rp = await db.reprises.get(cle)
    if (l.duree > 0) {
      if (!rp || rp.position !== l.position || rp.duree !== l.duree || rp.serie !== serie) {
        await db.reprises.put({ cle, position: l.position, duree: l.duree, vuLe: vu, serie })
        reprises = true
      }
    } else if (rp) {
      await db.reprises.delete(cle)
      reprises = true
    }
  }
  // Retire ailleurs : la liste du serveur est tronquee aux plus RECENTS, donc une
  // ligne locale n'est a supprimer que si elle est plus recente que le plus
  // ancien element recu et pourtant absente.
  // `gardees` date du debut de la fusion : une ouverture notee depuis (le lecteur
  // s'ouvre en meme temps que la page) n'y figure pas. On relit le journal, et on
  // protege aussi tout ce qui est posterieur a l'instantane du serveur.
  const { lectures: recentes } = await enAttente()
  const protegee = (h: { cle: string; ouvertLe: number }) =>
    gardees.has(h.cle) || recentes.has(h.cle) || h.ouvertLe >= instantane
  if (Number.isFinite(plusAncien)) {
    for (const h of await db.historique.where('ouvertLe').aboveOrEqual(plusAncien).toArray()) {
      if (vues.has(h.cle) || protegee(h)) continue
      await db.historique.delete(h.cle)
      await db.reprises.delete(h.cle)
      historique = reprises = true
    }
  } else if (r.elements.length === 0) {
    // Serveur vide : tout ce qui n'attend pas d'envoi a ete retire ailleurs.
    for (const h of await db.historique.toArray())
      if (!protegee(h)) {
        await db.historique.delete(h.cle)
        await db.reprises.delete(h.cle)
        historique = reprises = true
      }
  }
  return { historique, reprises }
}

// --- Reception : « À voir » et son etat de preparation ----------------------

/**
 * `GET /profil/a_voir` : la liste ordonnee ET l'etat de preparation de chaque
 * element. Appelee a chaque synchronisation, et toutes les 10 s par l'ecran
 * « À voir » tant qu'il est ouvert (CA2). Renvoie vrai si la table a change.
 * Un serveur qui n'a pas encore la route (404, 501) ne fait pas echouer le
 * reste : la liste reste simplement locale.
 */
export async function tirerAVoir(): Promise<boolean> {
  // Gestes en attente AVANT l'aller-retour (ceux du moment de l'ecriture sont
  // relus dans la transaction d'application) : un geste parti, journal efface,
  // pendant que cette reponse voyageait serait sinon ecrase par elle.
  const { aVoir: avant } = await enAttente()
  let r: { elements?: AVoirElementApi[]; budget?: unknown; episodes_avance_defaut?: unknown }
  try {
    r = await json<{ elements?: AVoirElementApi[]; budget?: unknown; episodes_avance_defaut?: unknown }>('/profil/a_voir')
  } catch (e) {
    if (e instanceof ErreurApi && (e.statut === 404 || e.statut === 501)) return false
    throw e
  }
  const defaut = typeof r.episodes_avance_defaut === 'number' ? r.episodes_avance_defaut : undefined
  const change = await appliquerListeServeur(Array.isArray(r.elements) ? r.elements : [], avant, versBudget(r.budget), defaut)
  if (change) await invaliderAVoir()
  return change
}

// --- Reglages : fusion a trois points ---------------------------------------

const CLE_EPINGLES = 'epingles.live'
const CLE_BARRE = 'mytv.barre-deployee'
const baseCle = (profil: string) => `synchro.reglages.${profil}`

interface BaseReglages {
  valeurs: Valeurs
  revision: number
}

async function lireBase(profil: string): Promise<BaseReglages | undefined> {
  return (await db.reglages.get(baseCle(profil)))?.valeur as BaseReglages | undefined
}

async function categoriesMasqueesLocales(): Promise<string[]> {
  const sortie: string[] = []
  for (const t of ['live', 'vod', 'series'] as TypeContenu[])
    for (const c of await db.categories.where('[type+masquee]').equals([t, 1]).toArray()) sortie.push(c.cle)
  return sortie
}

/** Ce que cette machine dit aujourd'hui de ses reglages. */
async function valeursLocales(base: Valeurs | undefined): Promise<Valeurs> {
  const v: Valeurs = { theme: config().theme }
  try {
    const barre = localStorage.getItem(CLE_BARRE)
    if (barre !== null) v['barreDeployee'] = barre === '1' ? '1' : '0'
  } catch {
    // Rien a synchroniser si le stockage local est ferme.
  }
  const epingles = (await db.reglages.get(CLE_EPINGLES))?.valeur
  if (Array.isArray(epingles) && epingles.length) v[CLE_EPINGLES] = ecrireEnsemble(epingles as string[])

  // Les categories masquees dont le catalogue local ne connait pas encore la
  // categorie (machine neuve, import en cours) ne sont pas « retirees » : elles
  // sont seulement pas encore applicables. On les garde telles quelles, sinon la
  // fusion croirait que l'utilisateur les a demasquees.
  const masquees = new Set(await categoriesMasqueesLocales())
  const attendues = lireEnsemble(base?.['masquees'])
  const presentes = await db.categories.bulkGet(attendues)
  attendues.forEach((cle, i) => {
    if (!presentes[i]) masquees.add(cle)
  })
  if (masquees.size) v['masquees'] = ecrireEnsemble(masquees)
  return v
}

/** Applique des reglages recus a l'etat local. */
async function appliquerReglages(v: Valeurs): Promise<void> {
  // Le theme est applique tout de suite -- il est lu par un signal. La barre
  // laterale lit son etat au demarrage : la valeur recue vaut pour le prochain
  // chargement, ce qui est exactement ce qu'on attend d'une preference.
  const theme = v['theme']
  if ((theme === 'dark' || theme === 'light') && config().theme !== theme) poserConfig({ theme })
  if (v['barreDeployee'] !== undefined) {
    try {
      localStorage.setItem(CLE_BARRE, v['barreDeployee'])
    } catch {
      // Sans stockage local, la preference ne survit pas : rien de plus a faire.
    }
  }

  const epingles = lireEnsemble(v[CLE_EPINGLES])
  const actuelles = (await db.reglages.get(CLE_EPINGLES))?.valeur
  if (ecrireEnsemble(epingles) !== ecrireEnsemble(Array.isArray(actuelles) ? (actuelles as string[]) : [])) {
    await db.reglages.put({ cle: CLE_EPINGLES, valeur: epingles })
    await invaliderEpingles()
  }

  const voulues = new Set(lireEnsemble(v['masquees']))
  const touches = new Set<TypeContenu>()
  for (const c of await db.categories.bulkGet([...voulues]) as Array<Categorie | undefined>) {
    if (c && c.masquee !== 1) {
      await db.categories.update(c.cle, { masquee: 1 })
      touches.add(c.type)
    }
  }
  for (const t of ['live', 'vod', 'series'] as TypeContenu[])
    for (const c of await db.categories.where('[type+masquee]').equals([t, 1]).toArray())
      if (!voulues.has(c.cle)) {
        await db.categories.update(c.cle, { masquee: 0 })
        touches.add(c.type)
      }
  for (const t of touches) await invaliderCategories(t)
}

/** Essais de fusion avant d'abandonner : au-dela, deux machines se disputent en boucle. */
const ESSAIS_CONFLIT = 4

async function synchroReglages(profil: string): Promise<void> {
  const base = await lireBase(profil)
  for (let essai = 0; essai < ESSAIS_CONFLIT; essai++) {
    const distant = await json<ReglagesApi>('/profil/reglages')
    const local = await valeursLocales(base?.valeurs)
    const fusion = fusionner(base?.valeurs, local, distant.valeurs)
    let revision = distant.revision
    let accorde = distant.valeurs
    if (!egaux(fusion, distant.valeurs)) {
      try {
        const r = await json<ReglagesApi>('/profil/reglages', {
          methode: 'PUT', corps: { valeurs: fusion, revision: distant.revision },
        })
        revision = r.revision
        accorde = r.valeurs
      } catch (e) {
        // Une autre machine a ecrit entre notre lecture et notre ecriture :
        // on relit, on refusionne, on reessaie.
        if (e instanceof ErreurApi && e.statut === 409 && e.code === 'conflit') continue
        throw e
      }
    }
    await appliquerReglages(accorde)
    await db.reglages.put({ cle: baseCle(profil), valeur: { valeurs: accorde, revision } satisfies BaseReglages })
    return
  }
  throw new Error('conflit de reglages persistant')
}

// --- Orchestration ----------------------------------------------------------

export interface Resultat {
  etat: EtatSynchro
  envoyes: number
  recus: number
  raison?: string
}

let enCours: Promise<Resultat> | undefined
let indisponible = false

/** Un seul aller-retour a la fois : deux synchronisations concurrentes se
 *  disputeraient le journal. */
export function synchroniser(): Promise<Resultat> {
  if (!enCours) enCours = executer().finally(() => (enCours = undefined))
  return enCours
}

async function executer(): Promise<Resultat> {
  const profil = profilActifId()
  if (!estConnecte() || !profil) {
    poserEtat('inactif')
    return { etat: 'inactif', envoyes: 0, recus: 0, raison: 'aucune session ou aucun profil' }
  }
  if (indisponible) return { etat: 'inactif', envoyes: 0, recus: 0, raison: 'non disponible' }
  poserEtat('en-cours')
  try {
    const { envoyes } = await pousserJournal()
    let recus = 0
    if (await tirerFavoris(limites()?.pagination_max)) {
      recus++
      await invaliderFavoris()
    }
    const h = await tirerHistorique()
    if (h.historique) {
      recus++
      await invaliderHistorique()
      // « Parce que vous avez regardé… » suit l'historique venu d'ailleurs (A10) :
      // sans cela la rangee n'apparaissait qu'au second rechargement.
      await invaliderRecommandation()
    }
    if (h.reprises) {
      recus++
      await invaliderReprises()
    }
    if (await tirerAVoir()) recus++
    await synchroReglages(profil)
    poserEtat('ok')
    poserDerniere(Date.now())
    return { etat: 'ok', envoyes, recus }
  } catch (e) {
    // Jamais d'exception vers l'appelant : la synchronisation est un plus.
    if (e instanceof ErreurReseau) {
      poserEtat('hors-ligne')
      return { etat: 'hors-ligne', envoyes: 0, recus: 0, raison: e.message }
    }
    if (e instanceof ErreurApi) {
      if (e.statut === 409 && e.code === 'profil_requis') signalerProfilRequis()
      if (e.statut === 501) indisponible = true
    }
    poserEtat('erreur')
    return { etat: 'erreur', envoyes: 0, recus: 0, raison: String(e) }
  }
}

// --- Declenchement ----------------------------------------------------------
// Aucun ecran n'a a appeler quoi que ce soit : le module se reveille seul des
// qu'il est importe (donc des que `preferences.ts` l'est), puis sur les
// evenements qui changent quelque chose.

/** Apres un geste : assez court pour qu'un changement de machine le trouve
 *  fait. Une etoile cochee doit suivre l'utilisateur, pas attendre. */
const DELAI_GESTE = 2500
/** La position de lecture, elle, est notee toutes les 5 s par le lecteur. La
 *  renvoyer aussi souvent ferait un appel reseau pendant que le meme service
 *  pousse la video : on la laisse s'accumuler, et le prochain geste l'emporte
 *  avec lui. Perdre 30 s de progression sur une coupure brutale ne coute rien. */
const DELAI_REPRISE = 30_000
const DELAI_DEMARRAGE = 1500
/** Filet pour la machine restee ouverte pendant qu'une autre travaille. */
const PERIODE = 120_000

let minuteur: ReturnType<typeof setTimeout> | undefined
let echeance = 0

/** Toujours la plus proche echeance : une position de lecture notee a repetition
 *  ne doit pas repousser indefiniment l'envoi d'un favori. */
function planifier(delai: number): void {
  const quand = Date.now() + delai
  if (minuteur && echeance <= quand) return
  if (minuteur) clearTimeout(minuteur)
  echeance = quand
  minuteur = setTimeout(() => {
    minuteur = undefined
    void synchroniser()
  }, delai)
}

export function demarrerSynchro(): void {
  planifier(DELAI_DEMARRAGE)
  setInterval(() => {
    if (document.visibilityState === 'visible') void synchroniser()
  }, PERIODE)
  // Revenir sur l'onglet est le moment exact ou l'on veut l'etat de l'autre
  // machine ; retrouver le reseau est le moment exact ou l'on peut l'envoyer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') planifier(DELAI_GESTE)
  })
  window.addEventListener('online', () => planifier(500))
}

/** Deconnexion : plus rien ne doit partir tant qu'aucune session n'est ouverte. */
export function arreterSynchro(): void {
  if (minuteur) clearTimeout(minuteur)
  minuteur = undefined
  indisponible = false
  poserEtat('inactif')
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  demarrerSynchro()
  if (import.meta.env.DEV) {
    // Prise de test : elle permet aux tests Playwright d'exercer le VRAI code
    // de synchronisation, sans qu'aucun ecran n'expose quoi que ce soit en
    // production.
    Object.assign(window as unknown as Record<string, unknown>, {
      mytvSynchro: {
        synchroniser,
        etat: etatSynchro,
        prefs: () => import('./preferences'),
      },
    })
  }
}

