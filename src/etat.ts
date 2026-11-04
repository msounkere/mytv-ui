import { batch, createComputed, createSignal, untrack } from 'solid-js'
import type { EntreeCatalogue, TypeContenu } from './lib/db'
import { idServeurDeCle } from './lib/identifiants'
import { associerSerie } from './lib/preferences'

// Navigation : l'URL est la source de vérité de l'écran courant.
//
// POURQUOI ce module garde le vocabulaire `ecran()` / `poserEcran()` alors
// qu'un vrai routeur est désormais branché : c'est déjà le langage dans lequel
// les écrans se renvoient la main. Traduire ce langage en chemins ICI, à un
// seul endroit, évite de semer des URL littérales dans dix fichiers — et la
// table ci-dessous devient du coup la définition des routes.
//
// POURQUOI `ecran()` LIT et ne mémorise rien : un écran mémorisé à côté de
// l'URL finit toujours par la contredire. Le bouton retour du navigateur, un
// rechargement et un lien partagé reposent sur le même chemin que le rail.

export type Ecran = 'accueil' | 'recherche' | 'parcours' | 'lecture' | 'serie' | 'film' | 'guide' | 'reglages' | 'a_voir'

/** Écrans qu'une URL désigne à elle seule, sans identifiant de contenu. */
export type EcranSimple = 'accueil' | 'parcours' | 'guide' | 'reglages' | 'a_voir'

// Lot 10 : « À voir » devient « Ma liste » (modele cible). L'ecran interne garde
// sa cle `a_voir` pour ne pas renommer tout ce qui la lit ; seule l'URL change.
// L'ancien chemin `/a-voir` reste accepte (liens et favoris du navigateur).
const CHEMIN: Record<Exclude<EcranSimple, 'parcours'>, string> = {
  accueil: '/',
  guide: '/guide',
  reglages: '/reglages',
  a_voir: '/ma-liste',
}

/** Direct, Films et Séries sont le MÊME écran : seule l'URL les distingue. */
const CHEMIN_ONGLET: Record<TypeContenu, string> = {
  live: '/direct',
  vod: '/films',
  series: '/series',
}

// --- Direct : categorie et mode dans l'URL (US-47 CA7) ---------------------
// Un rechargement ou un lien partage doit retomber sur la categorie et le mode
// qu'on regardait : `/direct?categorie=iptva:100&mode=cartes`. Les valeurs sont
// RETENUES hors de Direct (Films, Accueil...) pour que l'onglet du rail y
// ramene, et REMPLACENT l'entree d'historique : changer de categorie n'est pas
// un ecran de plus a redescendre avec le bouton retour.

export type ModeDirect = 'liste' | 'cartes'
export interface ParametresDirect {
  categorie?: string
  mode?: ModeDirect
  /** `/direct?favoris=1` : la liste des chaines favorites (« Tout voir » de l'accueil, US-46 CA8). */
  favoris?: boolean
}

const [parametresDirect, poserParametresRetenus] = createSignal<ParametresDirect>({})
export { parametresDirect }

export function cheminDirect(p: ParametresDirect): string {
  const q = new URLSearchParams()
  if (p.favoris) q.set('favoris', '1')
  else if (p.categorie) q.set('categorie', p.categorie)
  if (p.mode && p.mode !== 'liste') q.set('mode', p.mode)
  const s = q.toString()
  return `${CHEMIN_ONGLET.live}${s ? `?${s}` : ''}`
}

/** Lit `?categorie=&mode=` ; un mode inconnu est ignore, pas une erreur. */
export function lireParametresDirect(recherche: string): ParametresDirect {
  const q = new URLSearchParams(recherche)
  const categorie = q.get('categorie') ?? undefined
  const mode = q.get('mode')
  const favoris = q.get('favoris')
  return {
    ...(categorie ? { categorie } : {}),
    ...(mode === 'cartes' || mode === 'liste' ? { mode } : {}),
    // Explicite dans les deux sens : `?favoris=0` (ou son absence avec une
    // categorie) quitte la vue des favorites.
    ...(favoris !== null ? { favoris: favoris === '1' } : categorie ? { favoris: false } : {}),
  }
}

const memesParametres = (a: ParametresDirect, b: ParametresDirect) =>
  a.categorie === b.categorie && a.mode === b.mode && !!a.favoris === !!b.favoris

export function poserParametresDirect(p: ParametresDirect): void {
  // Lecture NON suivie : l'appelant est souvent un effet qui ecrit ici, et un
  // nouvel objet a chaque ecriture le relancerait sans fin.
  const actuel = untrack(parametresDirect)
  const suivant = { ...actuel, ...p }
  if (!memesParametres(actuel, suivant)) poserParametresRetenus(suivant)
  if (untrack(() => tete(lireChemin())) !== 'direct') return
  const cible = cheminDirect(suivant)
  if (cible !== untrack(() => lireChemin() + lireRecherche())) aller(cible, { replace: true })
}

const ONGLET_DU_CHEMIN: Record<string, TypeContenu | undefined> = {
  direct: 'live',
  films: 'vod',
  series: 'series',
}

export const LIBELLE_ONGLET: Record<TypeContenu, string> = {
  live: 'Direct',
  vod: 'Films',
  series: 'Séries',
}

/** Premier segment du chemin, la base du routeur déjà retirée. */
function tete(chemin: string): string {
  return chemin.split('/').filter(Boolean)[0] ?? ''
}

/** Une clé de contenu (`iptva:845410`) ne contient que des caractères sûrs, mais
 *  un lien recopié peut arriver échappé (`%3A`) : on accepte les deux écritures. */
function decoder(brut: string): string {
  try {
    return decodeURIComponent(brut)
  } catch {
    return brut
  }
}

function ecranDuChemin(chemin: string): Ecran {
  switch (tete(chemin)) {
    case 'direct':
    case 'films':
    case 'series':
      return 'parcours'
    case 'recherche':
      return 'recherche'
    case 'guide':
      return 'guide'
    case 'reglages':
      return 'reglages'
    case 'a-voir':
    case 'ma-liste':
      return 'a_voir'
    case 'lecture':
      return 'lecture'
    case 'serie':
      return 'serie'
    case 'film':
      return 'film'
    // Chemin vide comme chemin inconnu : le routeur renvoie déjà l'inconnu sur
    // l'accueil, et répondre « accueil » ici évite un écran vide entre-temps.
    default:
      return 'accueil'
  }
}

/** Clé du contenu portée par `/lecture/<clé>` ou `/serie/<clé>`. */
function cleDuChemin(chemin: string, prefixe: 'lecture' | 'serie' | 'film'): string | undefined {
  const parts = chemin.split('/').filter(Boolean)
  const cle = parts[1]
  return parts[0] === prefixe && cle ? decoder(cle) : undefined
}

// --- Branchement du routeur -----------------------------------------------
// La coque passe ici le chemin courant et le navigateur du routeur. Avant ce
// branchement, rien de l'application n'est monté : personne ne navigue encore.

export type Aller = (href: string, options?: { replace?: boolean }) => void

let lireChemin: () => string = () => '/'
let lireRecherche: () => string = () => ''
let aller: Aller = () => {}

// --- Retour : UNE regle (US-47 CA7, US-45 CA2) ------------------------------
// « Retour », Echap, « Fermer la lecture » reviennent a l'ECRAN PRECEDENT, par
// la pile d'historique. On compte les navigations POUSSEES par l'application
// depuis le chargement : tant qu'il y en a, `history.back()` reste dans
// l'application ; sinon (lien direct, rechargement) on va au repli donne par
// l'appelant, en REMPLACANT l'entree courante.
let profondeur = 0
let retourAttendu = false
if (typeof window !== 'undefined')
  window.addEventListener('popstate', () => {
    if (retourAttendu) retourAttendu = false
    else profondeur = Math.max(0, profondeur - 1)
  })

export function revenirEnArriere(repli: string): void {
  if (profondeur > 0) {
    profondeur -= 1
    retourAttendu = true
    window.history.back()
  } else aller(repli, { replace: true })
}

/** Navigations internes encore depilables (tests et diagnostic). */
export const profondeurHistorique = (): number => profondeur

// L'onglet suit l'URL, mais SURVIT aux écrans qui n'en portent pas : Parcours
// reste monté sous l'Accueil et le Guide, et le remettre sur Direct à chaque
// détour relancerait exactement les requêtes que cette préservation évite.
const [ongletRetenu, poserOngletRetenu] = createSignal<TypeContenu>('live')

export const onglet = ongletRetenu

export function brancherRouteur(chemin: () => string, navigation: Aller, recherche: () => string = () => ''): void {
  lireChemin = chemin
  lireRecherche = recherche
  aller = (href, options) => {
    const courant = lireChemin() + lireRecherche()
    if (!options?.replace && href !== courant) profondeur += 1
    navigation(href, options)
  }
  // `createComputed` et non `createEffect` : l'onglet doit être à jour AVANT
  // que Parcours ne se rende, faute de quoi il se peint une fois sur l'onglet
  // précédent — et sa grille repartirait du mauvais catalogue.
  createComputed(() => {
    const t = ONGLET_DU_CHEMIN[tete(chemin())]
    if (t) poserOngletRetenu(t)
    // Les parametres du Direct portes par l'URL (lien partage, rechargement,
    // bouton retour) font foi sur ceux retenus.
    if (t === 'live') {
      const p = lireParametresDirect(recherche())
      if (p.categorie || p.mode || p.favoris !== undefined) {
        const actuel = untrack(parametresDirect)
        const suivant = { ...actuel, ...p }
        if (!memesParametres(actuel, suivant)) poserParametresRetenus(suivant)
      }
    }
  })
}

export const ecran = (): Ecran => ecranDuChemin(lireChemin())
export const cleLecture = (): string | undefined => cleDuChemin(lireChemin(), 'lecture')
export const cleFiche = (): string | undefined => cleDuChemin(lireChemin(), 'serie')
export const cleFicheFilm = (): string | undefined => cleDuChemin(lireChemin(), 'film')

function cheminOnglet(t: TypeContenu): string {
  // L'onglet du rail ramene a la categorie et au mode retenus, pas a la vue
  // des favorites : celle-ci est un detour depuis l'accueil.
  return t === 'live' ? cheminDirect({ ...parametresDirect(), favoris: false }) : CHEMIN_ONGLET[t]
}

export function poserEcran(e: EcranSimple): void {
  aller(e === 'parcours' ? cheminOnglet(onglet()) : CHEMIN[e])
}

export function poserOnglet(t: TypeContenu): void {
  aller(cheminOnglet(t))
}

/** La requête voyage dans l'URL : un résultat de recherche se partage. */
export function ouvrirRecherche(requete: string): void {
  const q = requete.trim()
  aller(q ? `/recherche?q=${encodeURIComponent(q)}` : '/recherche')
}

// --- Contenu ouvert -------------------------------------------------------
// L'URL porte la CLÉ du contenu ; l'entrée elle-même vit ici, parce que le
// lecteur reste monté après qu'on a quitté son écran et qu'il doit continuer à
// décrire ce qu'il joue. La coque relit la clé depuis le catalogue quand elle
// arrive par un lien ou un rechargement (voir App.tsx).

export interface Episode {
  cle: string
  nom: string
  url: string
  extension: string
}

const [selection, poserSelection] = createSignal<EntreeCatalogue | null>(null)
const [urlEpisode, poserUrlEpisode] = createSignal<string | undefined>(undefined)
const [episodeSuivant, poserEpisodeSuivant] = createSignal<Episode | undefined>(undefined)
const [serieOuverte, poserSerieOuverte] = createSignal<EntreeCatalogue | null>(null)
const [filmOuvert, poserFilmOuvert] = createSignal<EntreeCatalogue | null>(null)

export { selection, poserSelection, urlEpisode, episodeSuivant, serieOuverte, poserSerieOuverte, filmOuvert, poserFilmOuvert }

import { cheminApresLecture } from './lib/sortie-lecteur'
import { chargerSaisons } from './lib/saisons'
import { episodeApres } from './lib/episodes-suivants'

const cheminLecture = (cle: string) => `/lecture/${cle}`

export function ouvrir(e: EntreeCatalogue): void {
  // Une série n'est pas lisible telle quelle : on passe par sa fiche pour y
  // choisir un épisode.
  if (e.type === 'series') {
    ouvrirFiche(e)
    return
  }
  // Groupé : la coque relit l'URL pour reconstruire une sélection manquante,
  // et un état intermédiaire où la clé et la sélection divergent la lancerait
  // sur l'entrée précédente.
  batch(() => {
    poserUrlEpisode(undefined)
    poserEpisodeSuivant(undefined)
    poserSelection(e)
    aller(cheminLecture(e.cle))
  })
}

/**
 * Fiche d'un film (synopsis, genre, casting...) AVANT de le lancer : « Voir les
 * details » de l'encart « A la une ». Cliquer un film dans une liste continue de
 * le lire directement. Une serie a toujours sa fiche.
 */
export function ouvrirDetails(e: EntreeCatalogue): void {
  if (e.type === 'vod') {
    poserFilmOuvert(e)
    aller(`/film/${e.cle}`)
    return
  }
  ouvrir(e)
}

export function ouvrirFiche(e: EntreeCatalogue): void {
  poserSerieOuverte(e)
  aller(`/serie/${e.cle}`)
}

export function lireEpisode(ep: Episode & { suivant?: Episode }): void {
  // La fiche ouverte EST la serie de cet episode. Le serveur range l'historique
  // d'un episode sous sa serie : on la declare avant que le lecteur ne note quoi
  // que ce soit.
  const serie = serieOuverte()
  if (serie) associerSerie(ep.cle, serie.cle)
  // L'episode d'apres n'est connu de la fiche que pour la saison affichee et le
  // premier lancement : au-dela (US-43 CA4, enchainement continu), on le relit
  // dans les saisons de l'API, deja en cache.
  if (!ep.suivant && serie) void chargerSuivant(serie, ep.cle)
  batch(() => {
    poserEpisodeSuivant(ep.suivant)
    poserUrlEpisode(ep.url)
    poserSelection({
      cle: ep.cle,
      type: 'series',
      // Un episode n'est pas au catalogue : son identifiant serveur se lit dans
      // sa cle, et son adresse de lecture est celle que la fiche a recue de l'API.
      idServeur: idServeurDeCle(ep.cle),
      lecture: ep.url,
      serie: serie?.cle,
      id: 0,
      nom: ep.nom,
      recherche: ep.nom.toLowerCase(),
      extension: ep.extension,
    })
    aller(cheminLecture(ep.cle))
  })
}

async function chargerSuivant(serie: EntreeCatalogue, cle: string): Promise<void> {
  try {
    const n = episodeApres(await chargerSaisons(serie.idServeur), serie.nom, cle)
    if (n && selection()?.cle === cle && !episodeSuivant())
      poserEpisodeSuivant({ cle: n.cle, nom: n.nom, url: n.url, extension: n.extension })
  } catch {
    // Sans saisons lisibles, pas d'enchainement : le lecteur n'arme simplement rien.
  }
}

/** Retour au lecteur, depuis l'en-tête ou depuis le mini-lecteur. */
export function revenirAuLecteur(): void {
  const s = selection()
  if (s) aller(cheminLecture(s.cle))
}

/**
 * Zapping depuis le lecteur. L'URL suit la chaîne mais REMPLACE l'entrée
 * d'historique : sans cela, le bouton retour redescendrait une à une les trente
 * chaînes essayées au lieu de quitter le lecteur.
 */
export function changerDeChaine(e: EntreeCatalogue): void {
  // Depuis l'ecran du lecteur, on REMPLACE ; depuis ailleurs (mini-lecteur),
  // c'est une nouvelle entree : Retour ramenera a l'ecran d'avant la lecture.
  const auLecteur = ecran() === 'lecture'
  batch(() => {
    poserSelection(e)
    aller(cheminLecture(e.cle), { replace: auLecteur })
  })
}

/**
 * Quitter l'écran du lecteur SANS arrêter : la lecture continue dans le
 * mini-lecteur. Retour = l'ecran precedent (pile d'historique) ; sans pile
 * (lien direct), la fiche de la serie d'un episode, sinon la liste du contenu
 * (voir lib/sortie-lecteur).
 */
export function quitterLecteur(): void {
  if (ecran() !== 'lecture') return
  revenirEnArriere(cheminApresLecture(selection()))
}

/**
 * Cle du dernier contenu ARRETE : la coque ne doit pas la relire dans le
 * catalogue pour rouvrir le flux tant que l'URL `/lecture/<cle>` n'a pas encore
 * change (l'arret et le retour d'historique ne sont pas simultanes).
 */
const [cleArretee, poserCleArretee] = createSignal<string | undefined>(undefined)
export { cleArretee }

/**
 * Arrêt explicite : c'est le seul geste qui libère la connexion du relais.
 * Depuis le lecteur, on revient a l'ecran precedent ; depuis ailleurs (le
 * mini-lecteur sur l'Accueil, la Recherche...), on RESTE ou l'on est : fermer
 * une lecture n'a jamais ete une raison de changer d'ecran (audit A, bug 8).
 */
export function arreterLecture(): void {
  const s = selection()
  const auLecteur = ecran() === 'lecture'
  const sortie = cheminApresLecture(s)
  batch(() => {
    poserCleArretee(s?.cle)
    poserSelection(null)
  })
  if (auLecteur) revenirEnArriere(sortie)
}

/**
 * Fin de session. Ce qui est ouvert vit ici pour survivre à la NAVIGATION, pas
 * à la déconnexion : sans cet oubli, se reconnecter rouvrirait tout seul le
 * flux d'avant — sur un abonnement à une connexion, c'est une coupure chez
 * celui qui regarde.
 */
export function oublierContenuOuvert(): void {
  batch(() => {
    poserSelection(null)
    poserSerieOuverte(null)
    poserFilmOuvert(null)
    poserUrlEpisode(undefined)
    poserEpisodeSuivant(undefined)
  })
}

/**
 * Lecture réellement en cours, c'est-à-dire lecteur monté — et non écran
 * affiché. Dérivée de la sélection plutôt que posée par un effet : le lecteur
 * est monté exactement quand une entrée est sélectionnée, donc une seule des
 * deux informations a le droit d'exister.
 */
export interface LectureEnCours {
  titre: string
  /** Rubrique de la barre que le flux concerne. */
  type: TypeContenu
}

export function lectureEnCours(): LectureEnCours | null {
  const e = selection()
  return e ? { titre: e.nom, type: e.type } : null
}

// --- Barre latérale -------------------------------------------------------
// Deux états, et le choix survit à la session : celui qui a replié la barre
// pour gagner 148 px de catalogue ne veut pas la retrouver dépliée au
// rechargement suivant.

const CLE_BARRE = 'mytv.barre-deployee'

function barreInitiale(): boolean {
  try {
    const brut = localStorage.getItem(CLE_BARRE)
    // Par défaut déployée : la maquette s'ouvre ainsi, et les libellés sont la
    // seule chose qui distingue « Films » de « Séries » au premier regard.
    return brut === null ? true : brut === '1'
  } catch {
    return true
  }
}

const [barreDeployee, poserBarreInterne] = createSignal<boolean>(barreInitiale())
export { barreDeployee }

export function basculerBarre(): void {
  const suivant = !barreDeployee()
  poserBarreInterne(suivant)
  try {
    localStorage.setItem(CLE_BARRE, suivant ? '1' : '0')
  } catch {
    // Mode privé : l'état reste valable pour la session, ce qui suffit.
  }
}

// La « qualite » que le panneau de l'en-tete posait ici n'etait lue par
// personne (audit A, bug 2) : le seul reglage de qualite est `lib/qualite.ts`
// (Auto / Eco), lu par le lecteur et memorise.
