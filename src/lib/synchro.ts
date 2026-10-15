import { createSignal } from 'solid-js'
import { db, type Categorie, type GenreEtat, type LigneJournal } from './db'
import { config, poserConfig } from '../config'
import { estConnecte, etatAuth, session, verifierSession } from './auth'
import {
  invaliderCategories, invaliderEpingles, invaliderFavoris, invaliderHistorique,
  invaliderReprises,
} from './requetes'

/**
 * Reprise de l'etat personnel d'une machine a l'autre.
 *
 * POURQUOI IndexedDB reste la source : changer de PC fait perdre les favoris,
 * mais un service injoignable ne doit RIEN faire perdre. Toutes les lectures de
 * `preferences.ts` continuent donc de venir du navigateur ; ce module n'ajoute
 * qu'un aller-retour par-dessus. Il echoue en silence, jamais devant
 * l'utilisateur, et reprend la ou il s'etait arrete.
 *
 * POURQUOI deux mecanismes d'envoi et pas un :
 *   - favoris, historique et reprises portent chacun leur propre horodatage et
 *     peuvent compter des centaines de lignes : un JOURNAL ecrit par
 *     `preferences.ts` au moment du geste donne l'instant exact, la suppression
 *     comprise, sans jamais relire la table entiere ;
 *   - epingles, categories masquees et preferences d'affichage sont des petits
 *     ensembles sans horodatage, ecrits par les ecrans eux-memes (Parcours
 *     ecrit un tableau d'epingles d'un bloc). On les COMPARE donc a l'image de
 *     ce qui a ete synchronise la derniere fois. L'ecran n'a rien a declarer,
 *     c'est ce qui permet de ne toucher aucun ecran.
 *
 * CE QUI NE REMONTE PAS : le catalogue (78 Mo) et le guide (61 Mo). Ils ne sont
 * pas personnels et se reconstruisent depuis le relais en quelques secondes.
 */

export type EtatSynchro = 'inactif' | 'en-cours' | 'ok' | 'erreur'

const [etatSynchro, poserEtat] = createSignal<EtatSynchro>('inactif')
const [derniereSynchro, poserDerniere] = createSignal<number | undefined>()
export { etatSynchro, derniereSynchro }

/** Profil dont l'etat est synchronise. L'ecran de gestion viendra ; le modele
 *  de donnees, lui, est deja par profil de bout en bout. */
const CLE_PROFIL = 'mytv.profil'
export const PROFIL_DEFAUT = 'defaut'

export function profilActif(): string {
  try {
    return localStorage.getItem(CLE_PROFIL) || PROFIL_DEFAUT
  } catch {
    return PROFIL_DEFAUT
  }
}

export function poserProfilActif(profil: string): void {
  try {
    localStorage.setItem(CLE_PROFIL, profil)
  } catch {
    // Mode prive : le profil vaut pour la session, ce qui suffit.
  }
}

// --- Reglages locaux de la synchronisation --------------------------------
// Le filigrane est le numero d'ordre du dernier changement recu du service :
// c'est lui qui transforme une synchronisation en rattrapage et non en
// retelechargement. Il est garde PAR PROFIL.
const filigraneCle = (p: string) => `synchro.filigrane.${p}`
const imageCle = (p: string, genre: GenreEtat) => `synchro.image.${p}.${genre}`

async function lireReglage<T>(cle: string, defaut: T): Promise<T> {
  const r = await db.reglages.get(cle)
  return (r?.valeur as T | undefined) ?? defaut
}

// --- Elements echanges ----------------------------------------------------

interface Element {
  genre: GenreEtat
  cle: string
  maj: number
  supprime?: boolean
  valeur?: unknown
}

interface Reponse {
  filigrane: number
  complet: boolean
  elements: Element[]
}

/** Au-dela, le service refuse le lot : on l'envoie en plusieurs fois. */
const LOT = 500

// --- Journal (favoris, historique, reprises) ------------------------------

export interface Changement {
  genre: GenreEtat
  cle: string
  valeur?: unknown
  supprime?: boolean
}

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
 * Premiere synchronisation d'une machine deja utilisee : ses favoris existent
 * depuis des semaines et n'ont jamais ete journalises. Sans cet amorcage, ils
 * ne partiraient jamais — et le premier rattrapage du serveur les ecraserait.
 */
async function amorcer(): Promise<Element[]> {
  const sortie: Element[] = []
  for (const f of await db.favoris.toArray())
    sortie.push({ genre: 'favori', cle: f.cle, maj: f.ajouteLe, valeur: { ajouteLe: f.ajouteLe } })
  for (const h of await db.historique.toArray())
    sortie.push({ genre: 'historique', cle: h.cle, maj: h.ouvertLe })
  for (const r of await db.reprises.toArray())
    sortie.push({
      genre: 'reprise',
      cle: r.cle,
      maj: r.vuLe,
      valeur: { position: r.position, duree: r.duree },
    })
  return sortie
}

// --- Ensembles compares (epingles, masquages, affichage) ------------------

const CLE_EPINGLES = 'epingles.live'

/** Ce que la synchronisation sait lire et ecrire en matiere d'affichage. Liste
 *  fermee : un reglage de connexion n'a rien a faire sur le serveur. */
type ValeursAffichage = Record<string, unknown>

async function affichageLocal(): Promise<ValeursAffichage> {
  const v: ValeursAffichage = { theme: config().theme }
  try {
    const barre = localStorage.getItem('mytv.barre-deployee')
    if (barre !== null) v['barreDeployee'] = barre === '1'
  } catch {
    // Rien a synchroniser si le stockage local est ferme.
  }
  return v
}

async function ensemblesLocaux(): Promise<Record<GenreEtat, ValeursAffichage>> {
  const epingles = await lireReglage<string[]>(CLE_EPINGLES, [])
  const masquees = (await db.categories.where('[type+masquee]').equals(['live', 1]).toArray())
    .concat(await db.categories.where('[type+masquee]').equals(['vod', 1]).toArray())
    .concat(await db.categories.where('[type+masquee]').equals(['series', 1]).toArray())
  return {
    epingle: Object.fromEntries(epingles.map((id) => [id, true])),
    'categorie-masquee': Object.fromEntries(masquees.map((c) => [c.cle, true])),
    affichage: await affichageLocal(),
    favori: {},
    historique: {},
    reprise: {},
  }
}

/** Ensembles de cles : une machine neuve en a un VIDE, elle ne peut donc rien
 *  ecraser en les envoyant. Ils partent des le premier appel. */
const GENRES_ENSEMBLES: GenreEtat[] = ['epingle', 'categorie-masquee']
/** L'affichage, lui, a des valeurs par DEFAUT : « thème sombre » sur une
 *  machine qui n'a jamais synchronise n'exprime aucun choix, et effacerait le
 *  thème clair demande ailleurs. Il attend donc d'avoir ecoute une fois. */
const GENRES_COMPARES: GenreEtat[] = [...GENRES_ENSEMBLES, 'affichage']

/** Ce qui a change depuis la derniere synchronisation, deduit par comparaison.
 *  Une cle disparue devient une suppression : c'est ce qui fait voyager un
 *  desepinglage. */
async function comparer(
  profil: string,
  locaux: Record<GenreEtat, ValeursAffichage>,
  genres: GenreEtat[],
): Promise<Element[]> {
  const maintenant = Date.now()
  const sortie: Element[] = []
  for (const genre of genres) {
    const vu = await lireReglage<ValeursAffichage>(imageCle(profil, genre), {})
    const ici = locaux[genre]
    for (const [cle, valeur] of Object.entries(ici))
      if (!(cle in vu) || JSON.stringify(vu[cle]) !== JSON.stringify(valeur))
        sortie.push({ genre, cle, maj: maintenant, valeur })
    for (const cle of Object.keys(vu))
      if (!(cle in ici)) sortie.push({ genre, cle, maj: maintenant, supprime: true })
  }
  return sortie
}

async function enregistrerImages(profil: string): Promise<void> {
  const locaux = await ensemblesLocaux()
  for (const genre of GENRES_COMPARES)
    await db.reglages.put({ cle: imageCle(profil, genre), valeur: locaux[genre] })
}

// --- Application de ce qui vient des autres machines ----------------------

async function appliquer(elements: Element[]): Promise<number> {
  // Un geste fait pendant l'aller-retour n'est pas encore parti : il est plus
  // recent que ce que le service vient de repondre, et c'est lui qui doit
  // rester. Sans ce garde-fou, un favori coche a la mauvaise seconde
  // reapparaitrait decoche sous les doigts de l'utilisateur.
  const enAttente = new Map<string, number>()
  for (const l of await db.journal.toArray()) {
    const cle = `${l.genre}|${l.cle}`
    enAttente.set(cle, Math.max(enAttente.get(cle) ?? 0, l.maj))
  }

  let appliques = 0
  const masquages: Element[] = []
  const epingles: Element[] = []
  const affichages: Element[] = []
  // Ce qui a vraiment bouge, pour ne perimer que cela. Les ecrans restent
  // montes (voir Couche.tsx) : sans ce reveil, un favori coche sur l'autre
  // machine arrivait bien en base mais ne s'affichait qu'au rechargement
  // suivant -- exactement la promesse que la synchronisation est censee tenir.
  const touches = new Set<GenreEtat>()

  for (const e of elements) {
    if ((enAttente.get(`${e.genre}|${e.cle}`) ?? 0) >= e.maj) continue
    appliques++
    touches.add(e.genre)
    switch (e.genre) {
      case 'favori':
        if (e.supprime) await db.favoris.delete(e.cle)
        else
          await db.favoris.put({
            cle: e.cle,
            ajouteLe: (e.valeur as { ajouteLe?: number } | undefined)?.ajouteLe ?? e.maj,
          })
        break
      case 'historique':
        if (e.supprime) await db.historique.delete(e.cle)
        else await db.historique.put({ cle: e.cle, ouvertLe: e.maj })
        break
      case 'reprise': {
        if (e.supprime) {
          await db.reprises.delete(e.cle)
          break
        }
        const v = e.valeur as { position?: number; duree?: number } | undefined
        if (!v || !v.duree) break
        await db.reprises.put({
          cle: e.cle,
          position: v.position ?? 0,
          duree: v.duree,
          vuLe: e.maj,
        })
        break
      }
      case 'categorie-masquee':
        masquages.push(e)
        break
      case 'epingle':
        epingles.push(e)
        break
      case 'affichage':
        affichages.push(e)
        break
    }
  }

  if (masquages.length) await appliquerMasquages(masquages)
  if (epingles.length) await appliquerEpingles(epingles)
  for (const a of affichages) appliquerAffichage(a)
  await perimerCeQuiABouge(touches)
  return appliques
}

/** Chaque genre recu nomme exactement les lectures a refaire. */
async function perimerCeQuiABouge(touches: Set<GenreEtat>): Promise<void> {
  const travaux: Array<Promise<void>> = []
  if (touches.has('favori')) travaux.push(invaliderFavoris())
  if (touches.has('historique')) travaux.push(invaliderHistorique())
  if (touches.has('reprise')) travaux.push(invaliderReprises())
  if (touches.has('epingle')) travaux.push(invaliderEpingles())
  // Seul Direct a des categories masquees : les films et les series se
  // filtrent par facettes, pas par categorie.
  if (touches.has('categorie-masquee')) travaux.push(invaliderCategories('live'))
  await Promise.all(travaux)
}

async function appliquerMasquages(elements: Element[]): Promise<void> {
  // La categorie peut ne pas exister encore : une machine neuve n'a pas importe
  // le catalogue. On pose ce qu'on peut ; l'image enregistree gardera le reste
  // et le masquage retombera a la synchronisation suivante.
  const cles = elements.map((e) => e.cle)
  const presentes = new Map<string, Categorie>()
  for (const c of await db.categories.bulkGet(cles)) if (c) presentes.set(c.cle, c)
  for (const e of elements) {
    const c = presentes.get(e.cle)
    if (!c) continue
    const voulu = e.supprime ? 0 : 1
    if (c.masquee !== voulu) await db.categories.update(e.cle, { masquee: voulu })
  }
}

async function appliquerEpingles(elements: Element[]): Promise<void> {
  const liste = new Set(await lireReglage<string[]>(CLE_EPINGLES, []))
  for (const e of elements) {
    if (e.supprime) liste.delete(e.cle)
    else liste.add(e.cle)
  }
  await db.reglages.put({ cle: CLE_EPINGLES, valeur: [...liste] })
}

function appliquerAffichage(e: Element): void {
  // Le theme est applique tout de suite — il est lu par un signal. La barre
  // laterale lit son etat au demarrage : la valeur recue vaut pour le prochain
  // chargement, ce qui est exactement ce qu'on attend d'une preference.
  if (e.cle === 'theme' && (e.valeur === 'dark' || e.valeur === 'light')) {
    if (config().theme !== e.valeur) poserConfig({ theme: e.valeur })
    return
  }
  if (e.cle === 'barreDeployee') {
    try {
      localStorage.setItem('mytv.barre-deployee', e.valeur ? '1' : '0')
    } catch {
      // Sans stockage local, la preference ne survit pas : rien de plus a faire.
    }
  }
}

// --- Appel au service -----------------------------------------------------

/**
 * Le compte, prouve par la SESSION de l'application (voir auth.ts). Auparavant
 * cette fonction envoyait une empreinte des identifiants du relais : connaitre
 * ce couple valait titre de propriete. C'est ce bricolage qui interdisait de
 * servir ces identifiants depuis le serveur, et obligeait a les ressaisir sur
 * chaque machine. Il ne reste rien a envoyer : le cookie de session est pose par
 * le navigateur, et il est `HttpOnly` -- ce module ne peut meme pas le lire.
 */

/** Meme origine qu'en production (Caddy) comme en developpement (proxy Vite) :
 *  l'interface n'a aucune adresse de service a connaitre. */
const BASE = '/flux/etat'

async function appeler(profil: string, corps: unknown): Promise<Reponse> {
  const r = await fetch(`${BASE}/${encodeURIComponent(profil)}/synchro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
    credentials: 'same-origin',
  })
  if (r.status === 401) {
    // La session est tombee (expiration, deconnexion ailleurs). On le fait
    // savoir au portail plutot que d'echouer en boucle en silence : l'ecran de
    // connexion reapparait, et l'etat local n'a rien perdu.
    void verifierSession()
    throw new Error('session expiree')
  }
  if (!r.ok) throw new Error(`service d'etat : ${r.status}`)
  return (await r.json()) as Reponse
}

export interface Resultat {
  etat: EtatSynchro
  envoyes: number
  recus: number
  raison?: string
}

let enCours: Promise<Resultat> | undefined

/** Un seul aller-retour a la fois : deux synchronisations concurrentes se
 *  disputeraient le journal et le filigrane. */
export function synchroniser(): Promise<Resultat> {
  if (!enCours) enCours = executer().finally(() => (enCours = undefined))
  return enCours
}

async function executer(): Promise<Resultat> {
  if (!estConnecte()) {
    poserEtat('inactif')
    return { etat: 'inactif', envoyes: 0, recus: 0, raison: 'aucune session' }
  }
  const profil = profilActif()
  poserEtat('en-cours')
  try {
    let filigrane = await lireReglage<number>(filigraneCle(profil), 0)
    // Premiere synchronisation de ce profil sur cette machine : voir
    // GENRES_ENSEMBLES. Ce qui porte une vraie date part tout de suite, ce qui
    // n'est qu'une valeur par defaut attend d'avoir ecoute.
    const premiere = filigrane === 0

    const lignes = await db.journal.orderBy('n').toArray()
    const aPousser: Element[] = [
      ...(premiere ? await amorcer() : []),
      ...lignes.map((l) => ({
        genre: l.genre,
        cle: l.cle,
        maj: l.maj,
        supprime: l.supprime === 1,
        valeur: l.valeur,
      })),
      ...(await comparer(
        profil,
        await ensemblesLocaux(),
        premiere ? GENRES_ENSEMBLES : GENRES_COMPARES,
      )),
    ]
    // Un seul changement par cle et par genre : le plus recent. Le service
    // trancherait pareil, mais autant ne pas lui envoyer trois fois la meme
    // position de reprise notee a 5 s d'intervalle.
    const retenus = new Map<string, Element>()
    for (const e of aPousser) {
      const cle = `${e.genre}|${e.cle}`
      const vu = retenus.get(cle)
      if (!vu || vu.maj <= e.maj) retenus.set(cle, e)
    }
    const paquet = [...retenus.values()]

    // Au moins une tranche, meme vide : c'est l'appel qui rapatrie ce que les
    // autres machines ont change.
    const tranches: Element[][] = []
    for (let i = 0; i < paquet.length; i += LOT) tranches.push(paquet.slice(i, i + LOT))
    if (!tranches.length) tranches.push([])

    let envoyes = 0
    let recus = 0
    let complet = true
    for (const tranche of tranches) {
      const rep = await appeler(profil, { depuis: filigrane, elements: tranche })
      envoyes += tranche.length
      recus += await appliquer(rep.elements)
      filigrane = rep.filigrane
      complet = rep.complet
      await db.reglages.put({ cle: filigraneCle(profil), valeur: filigrane })
    }
    // Le journal ne se vide qu'une fois TOUTES les tranches acquittees, et par
    // identifiants explicites : une coupure au milieu fait tout reenvoyer (la
    // fusion rend l'envoi idempotent) et un geste fait pendant l'appel reste en
    // attente au lieu d'etre efface sans avoir ete envoye.
    if (lignes.length) await db.journal.bulkDelete(lignes.map((l) => l.n))
    // Rattrapage d'un retard important : le service tronque ses lots.
    while (!complet) {
      const rep = await appeler(profil, { depuis: filigrane, elements: [] })
      recus += await appliquer(rep.elements)
      filigrane = rep.filigrane
      complet = rep.complet
      await db.reglages.put({ cle: filigraneCle(profil), valeur: filigrane })
    }

    // Apres application : l'image doit decrire l'etat local resultant, sinon
    // une suppression recue d'une autre machine repartirait en ajout.
    await enregistrerImages(profil)
    poserEtat('ok')
    poserDerniere(Date.now())
    return { etat: 'ok', envoyes, recus }
  } catch (e) {
    // Jamais d'exception vers l'appelant : la synchronisation est un plus.
    poserEtat('erreur')
    return { etat: 'erreur', envoyes: 0, recus: 0, raison: String(e) }
  }
}

// --- Declenchement --------------------------------------------------------
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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  demarrerSynchro()
  if (import.meta.env.DEV) {
    // Prise de test : elle permet aux tests Playwright d'exercer le VRAI code
    // de synchronisation depuis deux profils de navigateur, sans qu'aucun ecran
    // n'expose quoi que ce soit en production.
    Object.assign(window as unknown as Record<string, unknown>, {
      mytvSynchro: {
        synchroniser,
        etat: etatSynchro,
        auth: etatAuth,
        compte: () => session()?.identifiant,
        profil: profilActif,
        poserProfil: poserProfilActif,
        prefs: () => import('./preferences'),
      },
    })
  }
}
