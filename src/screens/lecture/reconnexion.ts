import { createSignal, onCleanup } from 'solid-js'
import { ErreurLecteur, estOccupation } from '../../lib/errors'
import { REPOS, surErreur, tic, PLAFOND_ATTENTE_OCCUPATION, type EtatOccupation } from '../../lib/machine-occupation'
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
    {
      essai: number; total: number; dans: number; motif: MotifReprise
      /** Attente « compte occupe » : message propre, decompte, pas de « n sur N ». */
      occupation?: { message: string; coupure: boolean; attendu: number; plafond: number }
    } | null
  >(null)
  const [relance, poserRelance] = createSignal(0)

  // Volontairement hors reactivite : le compteur d'essais est LU par le calque
  // d'erreur au moment ou il se monte, et le rendre reactif ferait se repeindre
  // le message a chaque tentative.
  let essais = 0
  let minuteur: ReturnType<typeof setInterval> | undefined
  // Attente « compte occupe » : machine d'etats pure (lib/machine-occupation).
  let occ: EtatOccupation = REPOS
  let messageOcc = ''
  let coupureOcc = false

  function arreter() {
    clearInterval(minuteur)
    minuteur = undefined
    // Un decompte arrete ne bloque plus rien : l'utilisateur ou un autre
    // contenu reprend la main (le cumul, lui, survit jusqu'a `remettreAZero`).
    occ = { ...occ, actif: false, dans: 0 }
    poserReconnexion(null)
  }

  function afficherOccupation() {
    poserReconnexion({
      essai: occ.essai, total: 0, dans: occ.dans, motif: 'occupe',
      occupation: { message: messageOcc, coupure: coupureOcc, attendu: occ.cumul + (occ.delai - occ.dans), plafond: PLAFOND_ATTENTE_OCCUPATION },
    })
  }

  function signalerOccupation(e: ErreurLecteur) {
    const ev = surErreur(occ, e.attenteSecondes)
    noter('occupation:code', { code: e.code, retryAfter: e.attenteSecondes, coupure: !!e.coupure, ignore: ev.action === 'ignorer' })
    if (ev.action === 'ignorer') return
    if (ev.action === 'plafond') {
      noter('occupation:abandon', { code: e.code, attendu: occ.cumul, essais: occ.essai })
      arreter()
      opts.poserErreur(new ErreurLecteur(
        e.couche, e.message,
        'Toujours pas de place après 10 minutes : fermer l’autre lecture, puis réessayer.',
        e.detail, e.attenteSecondes, { code: e.code, coupure: e.coupure },
      ))
      return
    }
    occ = ev.etat
    messageOcc = e.message
    coupureOcc = !!e.coupure
    noter('occupation:attente', { code: e.code, delai: occ.delai, cumul: occ.cumul, essai: occ.essai })
    afficherOccupation()
    clearInterval(minuteur)
    minuteur = setInterval(() => {
      const t = tic(occ)
      occ = t.etat
      if (!t.relancer) return afficherOccupation()
      clearInterval(minuteur)
      minuteur = undefined
      poserReconnexion(null)
      relancer()
    }, 1000)
  }

  function relancer() {
    poserRelance((n) => n + 1)
  }

  function signalerErreur(e: ErreurLecteur) {
    if (estOccupation(e)) return signalerOccupation(e)
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
    essais: () => essais + occ.essai,
    /** Des images arrivent : si une attente « compte occupe » vient de finir, c'est une reprise reussie. */
    reussir: () => {
      if (occ.essai > 0) noter('occupation:reprise', { essais: occ.essai, attendu: occ.cumul })
    },
    remettreAZero: () => {
      essais = 0
      occ = REPOS
    },
  }
}
