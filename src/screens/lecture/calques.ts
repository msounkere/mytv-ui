import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { DUREE_BANDEAU } from '../../components/BandeauChaine'
import { AVANT_FIN_EPISODE, REBOURS_EPISODE } from '../../components/CalquesLecture'

// Les calques qui se posent sur l'image sans jamais la couper, et la règle qui
// retient les commandes à l'écran. Un seul fichier parce que c'est une seule
// question : qu'est-ce qui attend une décision de l'utilisateur ?
//
// Le lecteur, lui, apporte SES raisons de retenir les commandes — une pause, un
// chargement, une erreur, une diffusion en cours — par `decisionEnAttente` :
// les calques n'ont pas à connaître l'état du média.

/** Inactivité au bout de laquelle les commandes s'effacent. */
const DELAI_MASQUAGE = 3200

export function creerCalques(opts: {
  /** Clé du contenu courant : le refus du décompte ne vaut que pour lui. */
  cle: () => string
  /** Ce que le lecteur attend d'une décision, hors calques. */
  decisionEnAttente: () => boolean
  suivant: () => { titre: string; lire: () => void } | undefined
  duree: () => number
  position: () => number
  /** Le dernier Échap rend l'écran, jamais le flux. */
  surQuitterEcran: () => void
}) {
  const [commandesVisibles, poserCommandesVisibles] = createSignal(true)
  const [bandeau, poserBandeau] = createSignal(0)
  const [miniGuideOuvert, poserMiniGuideOuvert] = createSignal(false)
  const [infosOuvertes, poserInfosOuvertes] = createSignal(false)
  const [diffusionOuverte, poserDiffusionOuverte] = createSignal(false)
  const [reprise, poserReprise] = createSignal<number | null>(null)
  const [rebours, poserRebours] = createSignal<number | null>(null)
  const [reboursRefuse, poserReboursRefuse] = createSignal('')

  // --- Masquage automatique des commandes --------------------------------
  // Tout ce qui attend une décision retient les commandes à l'écran : une
  // pause, une erreur, un menu, une reprise proposée, une diffusion en cours.
  const masquageAutorise = () =>
    !opts.decisionEnAttente() && !diffusionOuverte() &&
    !infosOuvertes() && !miniGuideOuvert() && reprise() === null &&
    rebours() === null

  let minuteurMasquage: ReturnType<typeof setTimeout> | undefined
  function reveiller() {
    poserCommandesVisibles(true)
    clearTimeout(minuteurMasquage)
    minuteurMasquage = setTimeout(() => {
      if (masquageAutorise()) poserCommandesVisibles(false)
    }, DELAI_MASQUAGE)
  }

  // Un calque qui s'ouvre rappelle les commandes ; sa fermeture relance le
  // décompte, sans quoi elles resteraient à l'écran jusqu'au prochain geste.
  createEffect(() => {
    if (masquageAutorise()) reveiller()
    else poserCommandesVisibles(true)
  })

  onMount(reveiller)

  // --- Bandeau de changement de chaîne -----------------------------------
  createEffect(() => {
    if (!bandeau()) return
    const t = setTimeout(() => poserBandeau(0), DUREE_BANDEAU)
    onCleanup(() => clearTimeout(t))
  })

  // --- Compte à rebours de fin d'épisode ---------------------------------
  let minuteurRebours: ReturnType<typeof setInterval> | undefined

  function arreterRebours() {
    clearInterval(minuteurRebours)
    minuteurRebours = undefined
    poserRebours(null)
  }

  function demarrerRebours() {
    if (minuteurRebours) return
    poserRebours(REBOURS_EPISODE)
    minuteurRebours = setInterval(() => {
      const r = rebours()
      if (r !== null && r > 1) return poserRebours(r - 1)
      arreterRebours()
      opts.suivant()?.lire()
    }, 1000)
  }

  function annulerRebours() {
    poserReboursRefuse(opts.cle())
    arreterRebours()
  }

  /** Vraie fin de l'episode (US-43 CA4) : le decompte demarre s'il n'a pas deja tourne ni ete refuse. */
  function reboursAlaFin() {
    if (!opts.suivant() || reboursRefuse() === opts.cle()) return
    demarrerRebours()
  }

  // Le décompte démarre à 15 s de la fin, une seule fois, et jamais si
  // l'utilisateur l'a déjà refusé pour ce contenu.
  createEffect(() => {
    if (!opts.suivant() || reboursRefuse() === opts.cle()) return
    const d = opts.duree()
    if (!d || d - opts.position() > AVANT_FIN_EPISODE) return
    demarrerRebours()
  })

  onCleanup(() => {
    clearTimeout(minuteurMasquage)
    clearInterval(minuteurRebours)
  })

  /** Échap ferme le calque le plus haut ; le dernier rend l'écran, pas le flux. */
  function fermerCalque() {
    if (diffusionOuverte()) return poserDiffusionOuverte(false)
    if (infosOuvertes()) return poserInfosOuvertes(false)
    if (miniGuideOuvert()) return poserMiniGuideOuvert(false)
    if (rebours() !== null) return annulerRebours()
    // Quitter le lecteur ne coupe jamais la lecture : le mini-lecteur prend le
    // relais, et lui seul porte le bouton qui libère la connexion.
    opts.surQuitterEcran()
  }

  /** Un autre contenu : aucun calque du précédent ne le concerne. */
  function nouveauContenu(direct: boolean) {
    arreterRebours()
    poserReboursRefuse('')
    poserMiniGuideOuvert(false)
    poserInfosOuvertes(false)
    if (direct) poserBandeau((n) => n + 1)
  }

  return {
    commandesVisibles, reveiller,
    bandeau,
    miniGuideOuvert, poserMiniGuideOuvert,
    infosOuvertes, poserInfosOuvertes,
    diffusionOuverte, poserDiffusionOuverte,
    reprise, poserReprise,
    rebours, arreterRebours, annulerRebours, reboursAlaFin,
    fermerCalque, nouveauContenu,
  }
}
