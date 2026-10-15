import { createSignal, onCleanup } from 'solid-js'
import { ErreurLecteur, type Couche } from '../../lib/errors'
import type { Forcage, Plan } from '../../lib/flux'

// La politique de reprise sur panne, et elle seule : trois essais annoncés,
// puis l'échelle de transcodage imposé. Le dossier interdit l'écran noir
// silencieux — tant qu'un essai reste, on dit lequel et quand.

/** Reconnexion : trois essais avant de nommer la panne. */
export const ESSAIS_MAX = 3
const DELAI_RECONNEXION = 3

/** Pannes qu'une nouvelle tentative peut lever : inutile de réessayer un EAC3. */
const RECUPERABLE: readonly Couche[] = ['reseau', 'relais', 'limite']

/**
 * Mesuré sur TF1 : une même chaîne change d'encodage en cours de journée. Le
 * verdict de la sonde devient faux en pleine lecture, et le navigateur rend
 * la main sur un `fragParsingError`.
 *
 * Repasser par le service ne suffisait pas : consulté à nouveau il rendait le
 * même verdict, donc la même redirection vers le même flux illisible. On lui
 * impose donc la sortie, qui ne dépend plus d'aucun diagnostic.
 *
 * L'échelle monte d'un cran par échec : l'audio d'abord — seul défaut mesuré,
 * et 2,5 % d'un cœur —, l'image ensuite, parce qu'elle coûte 78 à 106 % d'un
 * cœur et passe donc par l'accord de l'utilisateur.
 */
const ECHELLE: readonly Forcage[] = ['audio', 'video']

export function creerReprisePanne(opts: {
  /** Clé du contenu courant : un forçage ne vaut que pour celui qui a échoué. */
  cle: () => string
  plan: () => Plan | null
  poserErreur: (e: ErreurLecteur | null) => void
}) {
  const [reconnexion, poserReconnexion] = createSignal<{ essai: number; dans: number } | null>(null)
  const [relance, poserRelance] = createSignal(0)
  const [forcage, poserForcage] = createSignal<{ cle: string; mode: Forcage } | null>(null)

  /** Le forçage ne vaut que pour le contenu qui a échoué, jamais pour le suivant. */
  const forcageActif = (): Forcage | undefined => {
    const f = forcage()
    return f && f.cle === opts.cle() ? f.mode : undefined
  }

  // Volontairement hors réactivité : le compteur d'essais est LU par le calque
  // d'erreur au moment où il se monte, et le rendre réactif ferait se repeindre
  // le message à chaque tentative.
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

  function imposerTranscodage(): boolean {
    if (!opts.plan()) return false
    const courant = forcageActif()
    // Le verdict de la sonde n'est volontairement PAS oublié : il ne décide
    // plus de rien ici, et le réinterroger dépenserait la connexion unique
    // pour un renseignement d'affichage.
    const suivant = ECHELLE[courant === undefined ? 0 : ECHELLE.indexOf(courant) + 1]
    if (!suivant) return false
    poserForcage({ cle: opts.cle(), mode: suivant })
    relancer()
    return true
  }

  function signalerErreur(e: ErreurLecteur) {
    if (e.couche === 'codec' && imposerTranscodage()) return
    if (!RECUPERABLE.includes(e.couche) || essais >= ESSAIS_MAX) {
      arreter()
      opts.poserErreur(e)
      return
    }
    essais += 1
    poserReconnexion({ essai: essais, dans: DELAI_RECONNEXION })
    clearInterval(minuteur)
    minuteur = setInterval(() => {
      const r = reconnexion()
      if (!r) return arreter()
      if (r.dans > 1) return poserReconnexion({ essai: r.essai, dans: r.dans - 1 })
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
    forcageActif,
    /** Un réessai explicite rend le transcodage imposé à nouveau négociable. */
    oublierForcage: () => poserForcage(null),
    essais: () => essais,
    remettreAZero: () => {
      essais = 0
    },
  }
}
