import { onCleanup, onMount } from 'solid-js'

// La table des raccourcis du lecteur. C'est une SPÉCIFICATION du dossier de
// conception — les mêmes lettres sont annoncées dans les infobulles et dans
// l'indice de la barre de contrôles — et non de la logique de lecture : la
// garder d'un bloc est ce qui permet de la relire d'un coup d'œil.

export interface ActionsClavier {
  /** Le lecteur reste monté hors de son écran : il n'y écoute plus rien. */
  surSonEcran: () => boolean
  direct: () => boolean
  /** Un calque ouvert change ce qu'Échap signifie, même depuis une saisie. */
  calqueOuvert: () => boolean
  reveiller: () => void
  fermerCalque: () => void
  zapper: (pas: number) => void
  deplacer: (secondes: number) => void
  basculerLecture: () => void
  basculerMuet: () => void
  basculerDiffusion: () => void
  basculerFavori: () => void
  revenirDerniereChaine: () => void
  basculerMiniGuide: () => void
  basculerInfos: () => void
}

/**
 * Branche les touches et rend le gestionnaire, que la racine du lecteur pose
 * aussi sur son `onKeyDown`.
 *
 * POURQUOI la fenêtre et non la racine : un calque qui se remonte — l'attente
 * d'une ressource suffit — ferait perdre le focus au `<div>`, et ↑ ↓ ne
 * zapperaient plus qu'après un clic.
 */
export function brancherClavier(a: ActionsClavier): (e: KeyboardEvent) => void {
  function auClavier(e: KeyboardEvent) {
    const cible = e.target as HTMLElement | null
    const saisie = cible?.tagName === 'INPUT' || cible?.tagName === 'TEXTAREA'
    a.reveiller()

    if (e.key === 'Escape') {
      if (saisie && !a.calqueOuvert()) cible!.blur()
      else a.fermerCalque()
    } else if (saisie) return
    else if ((e.key === 'ArrowDown' || e.key === 'PageDown') && a.direct()) a.zapper(1)
    else if ((e.key === 'ArrowUp' || e.key === 'PageUp') && a.direct()) a.zapper(-1)
    else if (e.key === 'ArrowRight' && !a.direct()) a.deplacer(10)
    else if (e.key === 'ArrowLeft' && !a.direct()) a.deplacer(-10)
    else if (e.key === ' ') a.basculerLecture()
    else if (e.key === 'm' || e.key === 'M') a.basculerMuet()
    else if (e.key === 'c' || e.key === 'C') a.basculerDiffusion()
    else if (e.key === 'f' || e.key === 'F') a.basculerFavori()
    else if ((e.key === 'r' || e.key === 'R') && a.direct()) a.revenirDerniereChaine()
    else if ((e.key === 'g' || e.key === 'G') && a.direct()) a.basculerMiniGuide()
    else if (e.key === 'i' || e.key === 'I') a.basculerInfos()
    else return
    e.preventDefault()
  }

  onMount(() => {
    const ecouter = (e: KeyboardEvent) => {
      if (!a.surSonEcran()) return
      auClavier(e)
    }
    window.addEventListener('keydown', ecouter)
    onCleanup(() => window.removeEventListener('keydown', ecouter))
  })

  return auClavier
}
