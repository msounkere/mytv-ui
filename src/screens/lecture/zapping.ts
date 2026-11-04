import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { fenetreAutour } from '../../components/MiniGuide'
import type { NotificationLecteur } from '../../components/Notification'
import { entreesDeCategorie } from '../../lib/catalogue'
import { epg, type EnCours } from '../../lib/epg'
import { idServeurDe } from '../../lib/source-lecture'
import { donneePartagee, cles } from '../../lib/requetes'
import { db, type EntreeCatalogue } from '../../lib/db'
import { grouperVariantes } from '../../lib/variantes'
import { indiceGroupeActif, ouvrirGroupe } from './groupes-stub'
import { donnee } from './donnee'

// Tout ce qui dépend des chaînes VOISINES de celle qu'on regarde : la colonne
// de zapping, le mini-guide, le bandeau de changement de chaîne et la touche
// « R » lisent les mêmes voisines et les mêmes grilles EPG. Les tenir ensemble
// est ce qui garantit qu'une seule lecture du catalogue les sert toutes.
//
// Rien ici ne passe par une requête lue pendant le rendu : voir `donnee`.
//
// EPG : la chaîne regardée interroge `/epg/chaines/{id}/maintenant` ; les huit
// lignes du mini-guide, UN SEUL appel de grille (jamais un appel par ligne).
// Le cache est celui du client EPG (`lib/epg`), pas celui de TanStack : il sait
// quand un programme finit, ce qu'un délai fixe ignore.

/** Les programmes ne changent qu'à des heures rondes : une minute suffit. */
const RAFRAICHISSEMENT_MS = 30_000

const VIDE: EnCours = { courant: undefined, suivant: undefined }

export function creerZapping(opts: {
  entree: () => EntreeCatalogue
  direct: () => boolean
  /** Le mini-guide ne demande ses huit grilles que lorsqu'il est ouvert. */
  guideOuvert: () => boolean
  surChanger: (e: EntreeCatalogue) => void
  notifier: (message: string, ton?: NotificationLecteur['ton']) => void
}) {
  const [filtre, poserFiltre] = createSignal('')
  const [derniereChaine, poserDerniereChaine] = createSignal<EntreeCatalogue | null>(null)

  // Voisines de la même catégorie : la liste de zapping.
  // Même clé que la colonne de Direct : la liste de zapping d'une catégorie
  // déjà parcourue est servie par le cache, sans relire 154 106 entrées.
  const voisines = donnee(
    () => [opts.entree().type, opts.entree().categorie] as const,
    ([type, cat]) =>
      cat
        ? donneePartagee(cles.categorie(type, cat), () => entreesDeCategorie(type, cat))
        : Promise.resolve([]),
    [] as EntreeCatalogue[],
  )

  const liste = createMemo(() => {
    const toutes = voisines()
    const q = filtre().trim().toLowerCase()
    if (!q) return toutes
    return toutes.filter((v) => v.nom.toLowerCase().includes(q))
  })

  // `categorie` porte l'identifiant Xtream, pas un libellé : affiché tel quel,
  // l'en-tête de la colonne annoncerait « 1 » au lieu de « FR · Généraliste ».
  const nomCategorie = donnee(
    () => (opts.entree().categorie ? `${opts.entree().type}:${opts.entree().categorie}` : undefined),
    (cle) => (cle ? db.categories.get(cle).then((c) => c?.nom) : Promise.resolve(undefined)),
    undefined as string | undefined,
  )

  // Programme en cours et suivant, uniquement en direct. Le serveur répond
  // « null » pour une chaîne sans guide : l'écran le dit, sans erreur.
  const [tic, poserTic] = createSignal(0)
  createEffect(() => {
    if (!opts.direct()) return
    const t = setInterval(() => poserTic((n) => n + 1), RAFRAICHISSEMENT_MS)
    onCleanup(() => clearInterval(t))
  })

  const [enCoursSuivant, poserEnCoursSuivant] = createSignal<EnCours>(VIDE)
  let chaineCourante: string | undefined
  createEffect(() => {
    tic()
    if (!opts.direct()) {
      chaineCourante = undefined
      poserEnCoursSuivant(VIDE)
      return
    }
    const id = idServeurDe(opts.entree())
    // Zapper efface le programme de l'ancienne chaîne ; un simple
    // rafraîchissement, lui, garde l'affichage jusqu'à la réponse.
    if (id !== chaineCourante) poserEnCoursSuivant(VIDE)
    chaineCourante = id
    let annule = false
    onCleanup(() => {
      annule = true
    })
    epg
      .maintenant(id)
      .then((v) => {
        if (!annule) poserEnCoursSuivant(v)
      })
      .catch(() => {
        // Un guide muet ne doit jamais gêner la lecture.
      })
  })

  /** Le programme n'est « en cours » que tant qu'il l'est : la minute le périme. */
  const enCours = createMemo(() => {
    tic()
    const c = enCoursSuivant().courant
    const t = Date.now()
    return c && c.debut <= t && t < c.fin ? c : undefined
  })
  const ensuite = () => (enCours() ? enCoursSuivant().suivant : undefined)

  // Le dossier est explicite : ↑ ↓ parcourent la LISTE D'ORIGINE, pas la
  // colonne filtrée. Filtrer sert à retrouver une chaîne, pas à restreindre le
  // zapping à trois entrées sans s'en apercevoir. Et ils parcourent les GROUPES
  // de variantes, comme la liste Direct (US-47 CA2, A UX15) : « TF1 », « TF1 HD »
  // et « TF1 4K » sont une seule chaine, ouverte dans sa variante recommandee.
  function zapper(pas: number) {
    const groupes = grouperVariantes(voisines())
    if (groupes.length === 0) return
    const i = indiceGroupeActif(groupes, opts.entree().cle)
    if (i < 0) return
    void ouvrirGroupe(groupes[(i + pas + groupes.length) % groupes.length]!, opts.surChanger)
  }

  function revenirDerniereChaine() {
    const c = derniereChaine()
    if (!c) return opts.notifier('Aucune chaîne précédente', 'limite')
    opts.surChanger(c)
  }

  // --- Mini-guide : grilles des chaînes voisines -------------------------
  const chainesGuide = createMemo(() =>
    opts.guideOuvert()
      ? fenetreAutour(voisines(), voisines().findIndex((v) => v.cle === opts.entree().cle))
      : [],
  )

  // Les huit lignes du mini-guide en UN appel, demandé seulement quand il est
  // ouvert : zéro au repos. Volontairement un signal et non une ressource — une
  // ressource en attente, lue pendant le rendu, suspendrait la coque entière et
  // décrocherait le lecteur de la page.
  const grillesGuide = donnee(
    () => chainesGuide().map(idServeurDe),
    (ids) =>
      ids.length === 0
        ? Promise.resolve(new Map<string, EnCours>())
        : epg.enCoursPour(ids).catch(() => new Map<string, EnCours>()),
    new Map<string, EnCours>(),
  )

  const programmeDe = (e: EntreeCatalogue) =>
    e.cle === opts.entree().cle ? enCours() : grillesGuide().get(idServeurDe(e))?.courant
  const ensuiteDe = (e: EntreeCatalogue) =>
    e.cle === opts.entree().cle ? ensuite() : grillesGuide().get(idServeurDe(e))?.suivant

  return {
    filtre, poserFiltre,
    voisines, liste, nomCategorie,
    enCours, ensuite,
    zapper,
    derniereChaine, poserDerniereChaine, revenirDerniereChaine,
    chainesGuide, programmeDe, ensuiteDe,
  }
}
