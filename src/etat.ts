import { batch, createComputed, createSignal } from 'solid-js'
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

const CHEMIN: Record<Exclude<EcranSimple, 'parcours'>, string> = {
  accueil: '/',
  guide: '/guide',
  reglages: '/reglages',
  a_voir: '/a-voir',
}

/** Direct, Films et Séries sont le MÊME écran : seule l'URL les distingue. */
const CHEMIN_ONGLET: Record<TypeContenu, string> = {
  live: '/direct',
  vod: '/films',
  series: '/series',
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
let aller: Aller = () => {}

// L'onglet suit l'URL, mais SURVIT aux écrans qui n'en portent pas : Parcours
// reste monté sous l'Accueil et le Guide, et le remettre sur Direct à chaque
// détour relancerait exactement les requêtes que cette préservation évite.
const [ongletRetenu, poserOngletRetenu] = createSignal<TypeContenu>('live')

export const onglet = ongletRetenu

export function brancherRouteur(chemin: () => string, navigation: Aller): void {
  lireChemin = chemin
  aller = navigation
  // `createComputed` et non `createEffect` : l'onglet doit être à jour AVANT
  // que Parcours ne se rende, faute de quoi il se peint une fois sur l'onglet
  // précédent — et sa grille repartirait du mauvais catalogue.
  createComputed(() => {
    const t = ONGLET_DU_CHEMIN[tete(chemin())]
    if (t) poserOngletRetenu(t)
  })
}

export const ecran = (): Ecran => ecranDuChemin(lireChemin())
export const cleLecture = (): string | undefined => cleDuChemin(lireChemin(), 'lecture')
export const cleFiche = (): string | undefined => cleDuChemin(lireChemin(), 'serie')
export const cleFicheFilm = (): string | undefined => cleDuChemin(lireChemin(), 'film')

export function poserEcran(e: EcranSimple): void {
  aller(e === 'parcours' ? CHEMIN_ONGLET[onglet()] : CHEMIN[e])
}

export function poserOnglet(t: TypeContenu): void {
  aller(CHEMIN_ONGLET[t])
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

/**
 * Un tap/clic sur une affiche OUVRE TOUJOURS LA FICHE (lot 10, regle
 * transverse) : film -> fiche film, serie -> fiche serie. Seule une chaine se
 * lit directement (elle n'a pas de fiche). La lecture directe est `lire()`.
 *
 * Transitoire : « Regarder » de la fiche film passe encore par `ouvrir` chez
 * certains appelants (App.tsx) ; ouvrir le film DONT LA FICHE EST DEJA AFFICHEE
 * ne peut vouloir dire que « le lire ». A retirer quand tous passent `lire`.
 */
export function ouvrir(e: EntreeCatalogue): void {
  if (e.type === 'live') {
    lire(e)
    return
  }
  if (e.type === 'series') {
    ouvrirFiche(e)
    return
  }
  if (ecran() === 'film' && cleFicheFilm() === e.cle) {
    lire(e)
    return
  }
  ouvrirFicheFilm(e)
}

/** Lecture directe (bouton ▶ explicite). Une serie n'est pas lisible telle quelle : sa fiche. */
export function lire(e: EntreeCatalogue): void {
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
    aller(cheminLecture(e.cle), { replace: dejaEnLecture() })
  })
}

/**
 * Deja sur /lecture/… (enchainement, « Prochain dans Ma liste ») : la lecture
 * suivante REMPLACE l'entree d'historique, pour que « Retour » revienne a la
 * fiche ou a l'ecran d'avant, et non a l'episode precedent (arbitrage ui-6).
 */
function dejaEnLecture(): boolean {
  return ecran() === 'lecture'
}

export function ouvrirFicheFilm(e: EntreeCatalogue): void {
  poserFilmOuvert(e)
  aller(`/film/${e.cle}`)
}

/** Compat : la fiche d'un film ou d'une serie, c'est desormais `ouvrir`. */
export function ouvrirDetails(e: EntreeCatalogue): void {
  if (e.type === 'live') {
    lire(e)
    return
  }
  ouvrir(e)
}

/** « Tout voir » des chaines favorites : le Direct FILTRE sur les favorites (A9). */
export function ouvrirDirectFavoris(): void {
  aller(`${CHEMIN_ONGLET.live}?favoris=1`)
}

export function ouvrirFiche(e: EntreeCatalogue): void {
  poserSerieOuverte(e)
  aller(`/serie/${e.cle}`)
}

/**
 * Lecture d'un episode depuis une carte « Reprendre » : la serie n'est pas la
 * fiche ouverte, on la declare d'abord (l'historique de l'episode se range sous elle).
 */
export function lireEpisodeDe(serie: EntreeCatalogue, ep: Episode & { suivant?: Episode }): void {
  poserSerieOuverte(serie)
  lireEpisode(ep)
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
    aller(cheminLecture(ep.cle), { replace: dejaEnLecture() })
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
  batch(() => {
    poserSelection(e)
    aller(cheminLecture(e.cle), { replace: true })
  })
}

/**
 * Quitter l'écran du lecteur SANS arrêter : la lecture continue dans le
 * mini-lecteur. Un épisode ramène à la fiche de sa série, un film ou une chaîne
 * à sa liste (voir lib/sortie-lecteur).
 */
export function quitterLecteur(): void {
  aller(cheminApresLecture(selection()))
}

/** Arrêt explicite : c'est le seul geste qui libère la connexion du relais. */
export function arreterLecture(): void {
  const sortie = cheminApresLecture(selection())
  batch(() => {
    poserSelection(null)
    aller(sortie)
  })
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

// --- Qualité du flux ------------------------------------------------------
// Choisie dans le panneau « Lecteur », lue par le panneau lui-même. Elle vit
// ici parce que la barre, l'en-tête et le panneau en parlent tous les trois.

export type ClefQualite = 'auto' | '1080' | '720' | '480'

export const [qualite, poserQualite] = createSignal<ClefQualite>('auto')
