import { createSignal, onCleanup } from 'solid-js'
import { ErreurLecteur } from '../../lib/errors'
import { noter } from '../../lib/diagnostic'
import { decider, ESSAIS_MAX, type MotifReprise } from '../../lib/politique-reprise'

// La reprise sur panne cote ecran : l'etat visible (essai n sur N, decompte) et
// le minuteur. La DECISION — reessayer ou abandonner, apres combien de temps —
// est dans `lib/politique-reprise`, testee seule. Le dossier interdit l'ecran
// noir silencieux : tant qu'un essai reste, on dit lequel et quand.
//
// Plus d'echelle de transcodage impose : c'est le serveur qui choisit remux ou
// reencodage audio, et qui refuse (415) ce qu'il ne sait pas rendre lisible.
// Un format illisible n'est donc plus « reessayable » : il est nomme.

export { ESSAIS_MAX }

export function creerReprisePanne(opts: {
  poserErreur: (e: ErreurLecteur | null) => void
}) {
  const [reconnexion, poserReconnexion] = createSignal<
    { essai: number; total: number; dans: number; motif: MotifReprise } | null
  >(null)
  const [relance, poserRelance] = createSignal(0)

  // Volontairement hors reactivite : le compteur d'essais est LU par le calque
  // d'erreur au moment ou il se monte, et le rendre reactif ferait se repeindre
  // le message a chaque tentative.
  let essais = 0
  let minuteur: ReturnType<typeof setInterval> | undefined

  function arreter() {
    clearInterval(minuteur)
    minuteur = undefined
    poserReconnexion(null)
  }

  function relancer() {
    poserRelance((n) => n + 1)
  }

  function signalerErreur(e: ErreurLecteur) {
    const decision = decider(e, essais)
    if (decision.action === 'abandonner') {
      noter('lecture:abandon', { couche: e.couche, essais, detail: e.detail })
      arreter()
      opts.poserErreur(e)
      return
    }
    essais = decision.essai
    noter('lecture:reessai', { couche: e.couche, essai: decision.essai, delai: decision.delai, motif: decision.motif })
    poserReconnexion({ essai: decision.essai, total: decision.total, dans: decision.delai, motif: decision.motif })
    clearInterval(minuteur)
    minuteur = setInterval(() => {
      const r = reconnexion()
      if (!r) return arreter()
      if (r.dans > 1) return poserReconnexion({ ...r, dans: r.dans - 1 })
      arreter()
      relancer()
    }, 1000)
  }

  onCleanup(() => clearInterval(minuteur))

  return {
    reconnexion,
    relance,
    relancer,
    signalerErreur,
    arreter,
    essais: () => essais,
    remettreAZero: () => {
      essais = 0
    },
  }
}
