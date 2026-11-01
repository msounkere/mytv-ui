import { QueryClient, useQuery } from '@tanstack/solid-query'
import type { QueryKey } from '@tanstack/solid-query'
import type { TypeContenu } from './db'

// Cache de données partagé par toute l'application.
//
// POURQUOI il fallait autre chose que `createResource`. Une ressource Solid
// appartient au composant qui la déclare : deux écrans qui lisent la même
// chose la lisent deux fois, et une ressource RECLEFÉE jette ce qu'elle avait.
// L'étape 1 a rendu gratuit le RETOUR sur un écran (il n'est plus démonté),
// mais pas le changement de clé : basculer Films → Séries reclefait l'index de
// facettes, donc le relançait et reconstruisait la grille — 1 427 nœuds
// mesurés. Un cache indexé par clé supprime ce reste, et rend la PREMIÈRE
// visite d'un écran immédiate quand la donnée a déjà été lue ailleurs.
//
// POURQUOI un adaptateur plutôt que vingt-deux réécritures. Les écrans lisent
// `donnee()`, `donnee.loading`, `donnee.error` — le vocabulaire des
// ressources. `requete()` ci-dessous rend exactement cette forme au-dessus de
// TanStack Query : le code de production garde ses conditions d'affichage, ses
// squelettes et ses frontières de suspension, et ne change que de source.
// Sur du code en production, c'est la différence entre une bascule de socle et
// une réécriture de vingt-deux comportements.

// --- Durées de fraîcheur ---------------------------------------------------
// Chacune décrit CE QUI ÉCRIT la donnée, jamais une intuition de péremption.

export const FRAICHEUR = {
  /**
   * Le catalogue vit dans IndexedDB et n'est écrit QUE par l'import : aucune
   * durée ne décrirait cela honnêtement, c'est l'import qui le périme (voir
   * `invaliderCatalogue`). Le relire « au cas où » coûterait 154 106 entrées.
   */
  catalogue: Infinity,
  /**
   * Même raisonnement pour l'EPG : la base `mytv-epg` n'est écrite que par le
   * worker XMLTV, au clic sur « Charger le guide ». 201 315 programmes ne se
   * revalident pas à l'horloge.
   */
  guide: Infinity,
  /**
   * Favoris, historique, reprises : un geste de l'utilisateur les change, et il
   * doit le voir tout de suite. Toujours périmé, donc toute relecture repart de
   * la base — mais l'immédiateté vient de l'invalidation posée au geste, pas
   * d'une durée qui attendrait.
   */
  geste: 0,
  /**
   * « En direct maintenant » et les programmes en cours vieillissent avec
   * l'horloge et avec rien d'autre. Une minute est en dessous de tout ce qui se
   * voit : la case en cours change au plus une fois par programme, et les
   * écrans qui l'affichent rafraîchissent déjà leur surlignage toutes les 30 s.
   */
  horloge: 60_000,
  /**
   * Fiches à l'unité du relais (`get_series_info`, `get_vod_info`) : un
   * aller-retour réseau sur le SERVICE QUI POUSSE LA VIDÉO. Une fiche de série
   * ne change pas dans la demi-heure ; la redemander pour rien prendrait de la
   * bande à la lecture en cours.
   */
  relais: 30 * 60_000,
  /**
   * Details d'un film ou d'une serie (synopsis, genre, casting...). Le SERVICE les
   * garde 30 jours : l'interface n'a donc aucune raison de les redemander dans la
   * session, sauf apres un echec (une erreur n'est jamais mise en cache).
   */
  details: 30 * 60_000,
} as const

// --- Clés ------------------------------------------------------------------
// Structurées du général au particulier : `['catalogue', …]` se périme d'un
// bloc à l'import, `['catalogue', 'vod', …]` pour un seul type. Les écrans ne
// composent jamais une clé à la main — deux orthographes d'une même clé font
// deux caches, et le partage serait perdu sans que rien ne le signale.

export const cles = {
  catalogue: ['catalogue'] as const,
  categories: (type: TypeContenu) => ['catalogue', type, 'categories'] as const,
  index: (type: TypeContenu) => ['catalogue', type, 'index'] as const,
  nombre: (type: TypeContenu) => ['catalogue', type, 'nombre'] as const,
  recents: (type: TypeContenu, limite: number) => ['catalogue', type, 'recents', limite] as const,
  categorie: (type: TypeContenu, id: string) => ['catalogue', type, 'categorie', id] as const,
  aLaUne: ['catalogue', 'a-la-une'] as const,

  /** « Parce que vous avez regardé… ». Hors de `['historique']` à dessein :
   *  voir `invaliderHistorique`. */
  recommandation: ['recommandation'] as const,

  favoris: ['favoris'] as const,
  favorisTries: ['favoris', 'tries'] as const,
  favorisCles: ['favoris', 'cles'] as const,
  chainesFavorites: ['favoris', 'chaines'] as const,

  historique: ['historique'] as const,
  chainesRecentes: ['historique', 'chaines'] as const,

  reprises: ['reprises'] as const,
  reprisesCles: ['reprises', 'cles'] as const,
  aReprendre: ['reprises', 'a-reprendre'] as const,
  /** Par série et par saison, et non par liste de clés : la clé d'un cache doit
   *  rester lisible dans les outils, et 268 identifiants d'épisodes concaténés
   *  ne le sont pas. */
  progressions: (serie: string, saison: number) => ['reprises', 'progressions', serie, saison] as const,

  epg: ['epg'] as const,
  epgEtat: ['epg', 'etat'] as const,
  epgLignes: ['epg', 'lignes'] as const,
  epgJointure: ['epg', 'jointure'] as const,
  /** Table de jointure brute du XMLTV : 4 048 lignes, lues par l'Accueil, par
   *  Direct et par le Guide. */
  epgChaines: ['epg', 'chaines'] as const,
  epgEnDirect: ['epg', 'en-direct'] as const,
  epgEnCours: (type: TypeContenu, categorie: string) => ['epg', 'en-cours', type, categorie] as const,
  /** Grille courte d'UNE chaîne, telle que le relais la rend. */
  epgChaine: (streamId: number) => ['epg', streamId] as const,

  epingles: ['epingles', 'live'] as const,

  /** Fiche détaillée d'une série, telle que le relais la rend. */
  /** Saisons d'une serie, telles que l'API les rend (`/series/{id}/saisons`). */
  serie: (id: string) => ['serie', id] as const,
  /** Saisons brutes de l'API, partagees entre la fiche et l'enchainement (US-43 CA4). */
  saisons: (id: string) => ['serie', id, 'saisons'] as const,
  /** Liste « À voir » (US-43) : une cle de geste, perimee par chaque ecriture et chaque relecture du serveur. */
  aVoir: ['a_voir'] as const,
  aVoirCles: ['a_voir', 'cles'] as const,
  aVoirAccueil: ['a_voir', 'accueil'] as const,
  /** Sonde de disponibilite d'un film ou d'un episode (US-43 CA5), gardee 10 min comme au serveur. */
  disponibilite: (id: string) => ['disponibilite', id] as const,
  /** Details (synopsis, genre...) d'un film ou d'une serie, par identifiant serveur. */
  details: (id: string) => ['details', id] as const,
} as const

// --- Client ----------------------------------------------------------------

/**
 * Un seul client, exporté, et NON créé dans `index.tsx` : l'invalidation doit
 * pouvoir partir d'un module sans composant — `preferences.ts` au moment du
 * geste, `synchro.ts` au retour d'une autre machine. Passer par le contexte
 * Solid aurait obligé ces modules à devenir des composants.
 *
 * Pas de disjoncteur silencieux : aucun verdict d'indisponibilité n'est
 * mémorisé, une requête en erreur est toujours périmée et repart au montage
 * suivant.
 */
export const clientRequetes = new QueryClient({
  defaultOptions: {
    queries: {
      // Les relectures IndexedDB ne gagnent rien à être rejouées : un échec
      // vient d'une base fermée ou d'un schéma absent, pas d'un aléa. Les
      // requêtes réseau demandent leurs réessais explicitement (`reessais`).
      retry: 0,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
      // Revenir sur l'onglet ne doit rien relire : la synchronisation s'en
      // charge déjà, et elle invalide ce qu'elle a vraiment changé.
      refetchOnWindowFocus: false,
      // La plupart des requêtes lisent IndexedDB : hors ligne, elles doivent
      // répondre, pas rester « en pause » (comportement par défaut de TanStack
      // quand `navigator.onLine` est faux — constaté : un ajout à « À voir »
      // sans réseau n'apparaissait pas sur la fiche, US-43 CA1). Les requêtes
      // réseau échouent alors franchement, et chaque écran sait déjà le dire.
      networkMode: 'always',
      staleTime: FRAICHEUR.catalogue,
      // Le cas courant est une lecture d'IndexedDB : la garder coûte de la
      // mémoire, la rebâtir coûte 154 106 entrées. On la garde — et c'est
      // exactement ce qui fait qu'une bascule Films/Séries ne reconstruit plus
      // rien. Ce qui vient du RELAIS demande une péremption explicite : une
      // fiche par série visitée et un compteur par chaîne zappée n'ont aucune
      // raison de s'accumuler pour la session entière.
      gcTime: Infinity,
    },
  },
})

// --- Adaptateur -------------------------------------------------------------

/**
 * Enveloppe opaque autour de la valeur mise en cache.
 *
 * POURQUOI elle existe : `solid-query` range son résultat dans un store Solid,
 * qui met en PROXY tout objet ordinaire qu'il contient. L'index de facettes
 * porte 107 204 entrées et des `Int32Array` d'ordre de tri que `filtrer()`
 * parcourt cent fois : les traverser à travers un proxy de store, et en créer
 * un par entrée rendue, coûterait plus que le filtrage lui-même. Un objet de
 * classe n'est pas « wrappable » pour le store — il traverse donc intact.
 */
class Boite<T> {
  constructor(readonly contenu: T) {}
}

/** Même vocabulaire qu'une ressource Solid : les écrans n'ont rien à réécrire. */
export interface Donnee<T> {
  (): T | undefined
  readonly loading: boolean
  readonly error: unknown
}

export interface Relance {
  refetch: () => void
}

export interface OptionsRequete {
  /** Durée de fraîcheur ; prendre une valeur de `FRAICHEUR`. */
  fraicheur?: number
  /** Réessais, pour les seules requêtes réseau. */
  reessais?: number
  /**
   * Laisser l'erreur remonter à l'`ErrorBoundary` au lieu de la poser dans
   * `.error`. C'est le comportement d'une ressource Solid lue en rendu : les
   * écrans qui affichent un diagnostic en dépendent.
   */
  propager?: boolean
  /** Durée pendant laquelle une entrée SANS LECTEUR est conservée. Par défaut
   *  pour toujours ; à borner pour ce qui est clefé à l'unité. */
  peremption?: number
  /**
   * Faux : lire la donnée AVANT son arrivée ne suspend aucune frontière `Suspense`
   * (par défaut TanStack suspend la plus proche tant que la requête est en vol, ce
   * qui remplace tout l'écran par « Chargement… »). Pour une donnée SECONDAIRE --
   * le résumé d'une fiche -- qui doit arriver sans masquer le reste.
   */
  suspendre?: boolean
}

/** Chaque appel garde SA clé d'attente : une clé partagée ferait du cache de
 *  l'un l'attente de l'autre. */
let attentes = 0

function monter<S, T>(
  cleDe: (s: S) => QueryKey,
  source: () => S | undefined | null | false,
  charger: (s: S) => Promise<T>,
  o: OptionsRequete,
): [Donnee<T>, Relance] {
  attentes += 1
  const inerte: QueryKey = ['en-attente', attentes]

  // `observee` et non `requete` : l'helper exporté plus bas porte ce nom, et
  // deux `requete` dans le même fichier se relisent mal.
  const observee = useQuery(
    () => {
      const s = source()
      // Même règle qu'une ressource Solid : source absente, rien ne part.
      const prete = s !== undefined && s !== null && s !== false
      return {
        // La garde ci-dessus est le seul narrowing possible ici : `prete` est
        // une valeur, pas un prédicat de type.
        queryKey: prete ? cleDe(s as S) : inerte,
        queryFn: async () => new Boite(await charger(s as S)),
        enabled: prete,
        staleTime: o.fraicheur ?? FRAICHEUR.catalogue,
        // La clé d'attente ne doit RIEN garder : sans cela, chaque montage
        // d'une fiche série laisserait derrière lui une entrée vide de plus.
        gcTime: prete ? (o.peremption ?? Infinity) : 0,
        retry: o.reessais ?? 0,
        throwOnError: o.propager ?? false,
      }
    },
    () => clientRequetes,
  )

  const acces = (
    o.suspendre === false
      ? // `isSuccess` ne suspend pas ; `data` n'est lu qu'une fois la requête réussie.
        () => (observee.isSuccess ? observee.data?.contenu : undefined)
      : () => observee.data?.contenu
  ) as Donnee<T>
  Object.defineProperties(acces, {
    loading: { get: () => observee.isLoading },
    // `createResource` rend `undefined` sans erreur, TanStack rend `null` :
    // les écrans testent la vérité de la valeur, pas son type.
    error: { get: () => observee.error ?? undefined },
  })
  return [acces, { refetch: () => void observee.refetch() }]
}

/** Donnée sans source : la clé est fixe, la lecture part au montage. */
export function requete<T>(
  cle: QueryKey,
  charger: () => Promise<T>,
  o: OptionsRequete = {},
): [Donnee<T>, Relance] {
  return monter<true, T>(() => cle, () => true, charger, o)
}

/**
 * Donnée dont la clé suit une source réactive — le type de contenu, la
 * catégorie choisie, l'identifiant d'une série. C'est ICI que le cache paie :
 * revenir sur une clé déjà lue rend la valeur dans le même rendu, donc sans
 * état de chargement, donc sans écran reconstruit.
 */
export function requeteClefee<S, T>(
  cleDe: (s: S) => QueryKey,
  source: () => S | undefined | null | false,
  charger: (s: S) => Promise<T>,
  o: OptionsRequete = {},
): [Donnee<T>, Relance] {
  return monter(cleDe, source, charger, o)
}

/**
 * Lecture partagée hors composant : une donnée qu'une autre requête a besoin
 * d'attendre. Remplace les caches de promesse écrits à la main — qui avaient
 * tous le même défaut, celui de ne jamais savoir qu'on venait de recharger le
 * guide ou le catalogue sous eux.
 */
export function donneePartagee<T>(
  cle: QueryKey,
  charger: () => Promise<T>,
  fraicheur: number = FRAICHEUR.catalogue,
  peremption = Infinity,
): Promise<T> {
  return clientRequetes
    .ensureQueryData({
      queryKey: cle,
      queryFn: async () => new Boite(await charger()),
      staleTime: fraicheur,
      gcTime: peremption,
      retry: 0,
    })
    .then((b) => b.contenu)
}

/** Pose une valeur déjà connue : un geste local n'a pas à attendre la base
 *  pour s'afficher, alors qu'il vient de l'y écrire. */
export function poserDonnee<T>(cle: QueryKey, valeur: T): void {
  clientRequetes.setQueryData(cle, new Boite(valeur))
}

// --- Invalidations ----------------------------------------------------------
// Une par geste qui écrit, posée AU GESTE. Rien n'est invalidé « pour être
// tranquille » : chaque ligne ci-dessous nomme ce que le geste a changé.

/** Import du catalogue : tout ce qui vient d'IndexedDB a changé, y compris les
 *  catégories, les index de facettes et les rangées de nouveautés. */
export function invaliderCatalogue(): Promise<void> {
  return Promise.all([
    clientRequetes.invalidateQueries({ queryKey: cles.catalogue }),
    clientRequetes.invalidateQueries({ queryKey: cles.recommandation }),
    // Les lignes du guide joignent le XMLTV au catalogue : un catalogue
    // réimporté change les entrées qu'elles portent.
    clientRequetes.invalidateQueries({ queryKey: cles.epgLignes }),
  ]).then(() => undefined)
}

/** Masquage d'une catégorie : seul le type concerné bouge, et son index de
 *  facettes avec lui — les catégories masquées en sont la matière première. */
/** Changement de compte ou de profil : tout ce qui est personnel est a relire. */
export function invaliderTout(): Promise<void> {
  return Promise.all([
    invaliderFavoris(),
    invaliderHistorique(),
    invaliderReprises(),
    invaliderEpingles(),
    invaliderAVoir(),
    invaliderCategories('live'),
    invaliderCategories('vod'),
    invaliderCategories('series'),
    clientRequetes.invalidateQueries({ queryKey: cles.recommandation }),
  ]).then(() => undefined)
}

export function invaliderCategories(type: TypeContenu): Promise<void> {
  return Promise.all([
    clientRequetes.invalidateQueries({ queryKey: cles.categories(type) }),
    clientRequetes.invalidateQueries({ queryKey: cles.index(type) }),
  ]).then(() => undefined)
}

/** Chargement du guide : la base EPG entière est remplacée. Les deux rangées
 *  de chaînes de l'Accueil en dépendent sans porter de clé `epg` — elles
 *  partent de favoris et d'historique, le guide ne leur donne que le
 *  programme. */
export function invaliderGuide(): Promise<void> {
  return Promise.all([
    clientRequetes.invalidateQueries({ queryKey: cles.epg }),
    clientRequetes.invalidateQueries({ queryKey: cles.chainesFavorites }),
    clientRequetes.invalidateQueries({ queryKey: cles.chainesRecentes }),
  ]).then(() => undefined)
}

/** Bascule d'un favori : la rangée de l'Accueil, les chaînes favorites et le
 *  filtre « Favoris » de Films/Séries parlent tous de cette table. */
export function invaliderFavoris(): Promise<void> {
  return clientRequetes.invalidateQueries({ queryKey: cles.favoris })
}

/**
 * Ouverture d'un contenu. « Parce que vous avez regardé… » n'en fait
 * volontairement PAS partie : sa clé est hors de `['historique']` parce que
 * cette rangée balaie toute une catégorie du catalogue, et qu'elle le ferait
 * alors à l'instant exact où le flux s'ouvre — pour reclasser sous les yeux du
 * spectateur la rangée qu'il vient de quitter. Elle se refait à l'import.
 */
export function invaliderHistorique(): Promise<void> {
  return clientRequetes.invalidateQueries({ queryKey: cles.historique })
}

/** Position de reprise, marquage « vu », retrait de la liste. */
export function invaliderReprises(): Promise<void> {
  return clientRequetes.invalidateQueries({ queryKey: cles.reprises })
}

/**
 * Même invalidation, mais au plus une fois par demi-minute.
 *
 * POURQUOI : le lecteur note la position TOUTES LES CINQ SECONDES pendant
 * qu'on regarde. Relire la table à chaque fois ne change rien à l'écran — on
 * est dans le lecteur — mais réveillerait le fil principal douze fois par
 * minute pendant la lecture. Même arbitrage que `DELAI_REPRISE` dans
 * `synchro.ts`, et pour la même raison.
 */
const PAS_REPRISE = 30_000
let derniereReprise = 0
let repriseEnAttente: ReturnType<typeof setTimeout> | undefined

export function invaliderReprisesRegroupees(): void {
  const depuis = Date.now() - derniereReprise
  if (depuis >= PAS_REPRISE) {
    derniereReprise = Date.now()
    void invaliderReprises()
    return
  }
  if (repriseEnAttente) return
  repriseEnAttente = setTimeout(() => {
    repriseEnAttente = undefined
    derniereReprise = Date.now()
    void invaliderReprises()
  }, PAS_REPRISE - depuis)
}

/** Liste « À voir » : ajout, retrait, ordre, options, et chaque relecture de l'etat de preparation. */
export function invaliderAVoir(): Promise<void> {
  return clientRequetes.invalidateQueries({ queryKey: cles.aVoir })
}

/** Épinglage d'une catégorie de Direct. */
export function invaliderEpingles(): Promise<void> {
  return clientRequetes.invalidateQueries({ queryKey: cles.epingles })
}

// Prise de mesure, en développement SEULEMENT — même convention que
// `window.mytvSynchro` dans `synchro.ts`. La recette doit pouvoir répondre à
// « combien de fois cette donnée a-t-elle été chargée », qui est la seule
// preuve directe qu'un cache partagé partage vraiment ; et elle doit la lire
// dans L'INSTANCE DE L'APPLICATION, pas dans une seconde copie du module.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window as unknown as Record<string, unknown>, {
    mytvCache: () =>
      clientRequetes.getQueryCache().getAll().map((q) => ({
        cle: JSON.stringify(q.queryKey),
        chargements: q.state.dataUpdateCount,
        echecs: q.state.fetchFailureCount,
        etat: q.state.status,
        lecteurs: q.getObserversCount(),
      })),
  })
}
