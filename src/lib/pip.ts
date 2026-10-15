// Deux niveaux d image dans l image :
//  1. Document PiP (Chrome/Edge 116+) : une vraie fenetre detachee qui accueille
//     la video ET ses controles, donc le zapping reste possible pendant qu on
//     parcourt le catalogue. C est l usage decrit au brief.
//  2. PiP natif <video> : partout ailleurs, image seule sans controles.

export type ModePip = 'document' | 'natif' | 'indisponible'

interface FenetrePipOptions {
  largeur?: number
  hauteur?: number
}

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(o?: { width?: number; height?: number }): Promise<Window>
      window: Window | null
    }
  }
}

export function modePipDisponible(): ModePip {
  if (typeof window !== 'undefined' && window.documentPictureInPicture) return 'document'
  if (typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled)
    return 'natif'
  return 'indisponible'
}

/**
 * Ouvre la fenetre PiP et y deplace `contenu` (le lecteur et ses controles).
 * Le noeud est DEPLACE, pas clone : la lecture n est pas interrompue et aucun
 * second flux n est ouvert — l abonnement n autorise qu une connexion.
 */
export async function ouvrirPipDocument(
  contenu: HTMLElement,
  options: FenetrePipOptions = {},
): Promise<{ fenetre: Window; fermer: () => void }> {
  const api = window.documentPictureInPicture
  if (!api) throw new Error('Document Picture-in-Picture indisponible')

  const fenetre = await api.requestWindow({
    width: options.largeur ?? 480,
    height: options.hauteur ?? 320,
  })

  // La fenetre PiP est un document vierge : on y rejoue les feuilles de style
  // pour que les controles gardent l apparence de l application.
  for (const feuille of Array.from(document.styleSheets)) {
    try {
      const regles = Array.from(feuille.cssRules).map((r) => r.cssText).join('')
      const style = fenetre.document.createElement('style')
      style.textContent = regles
      fenetre.document.head.append(style)
    } catch {
      // Feuille d une autre origine (les polices Google) : on la relie plutot.
      if (feuille.href) {
        const lien = fenetre.document.createElement('link')
        lien.rel = 'stylesheet'
        lien.href = feuille.href
        fenetre.document.head.append(lien)
      }
    }
  }
  fenetre.document.documentElement.dataset.theme =
    document.documentElement.dataset.theme ?? 'dark'
  fenetre.document.documentElement.dataset.style =
    document.documentElement.dataset.style ?? ''

  // Le conteneur deplace tirait sa hauteur de la grille de la page. Dans cette
  // fenetre vierge plus rien ne la lui donne : avec son `min-height: 0` il
  // s'effondre a zero, et la video en `height: 100%` avec lui — fenetre noire.
  // On redonne donc une hauteur a toute la chaine, et on la retire au retour.
  const cadrage = fenetre.document.createElement('style')
  cadrage.textContent =
    // Chrome dessine lui-meme la barre de titre de cette fenetre et en choisit
    // les couleurs d'apres `color-scheme`. Sans declaration, elle reste claire
    // et ses icones disparaissent sur fond blanc.
    ':root{color-scheme:dark}' +
    'html,body{height:100%;margin:0;overflow:hidden;background:var(--video,#000)}' +
    'body>*{height:100%;min-height:0}'
  fenetre.document.head.append(cadrage)

  // On note la place d'origine de DEUX facons : une ancre posee dans l'arbre,
  // et le couple parent/voisin. L'ancre seule ne suffit pas — l'interface se
  // re-rend pendant que la fenetre est ouverte, l'ancre quitte alors le
  // document, et la remettre en place echouerait sans un mot.
  const ancre = document.createComment('pip')
  const parent = contenu.parentNode
  const voisin = contenu.nextSibling
  const hauteurInitiale = contenu.style.height
  contenu.replaceWith(ancre)
  fenetre.document.body.append(contenu)
  contenu.style.height = '100%'

  let rendu = false
  const rapatrier = () => {
    if (rendu) return
    rendu = true
    contenu.style.height = hauteurInitiale
    if (ancre.isConnected) ancre.replaceWith(contenu)
    else if (parent && (parent as Node).isConnected)
      (parent as Node).insertBefore(contenu, voisin && voisin.isConnected ? voisin : null)
    else document.body.append(contenu)
    ancre.remove()
  }

  // Chrome n'emet pas toujours le meme evenement a la fermeture selon qu'elle
  // vient du bouton, du retour a l'onglet ou de la navigation : on ecoute les
  // trois, et `rendu` garantit qu'on ne rapatrie qu'une fois.
  for (const nom of ['pagehide', 'unload', 'beforeunload'])
    fenetre.addEventListener(nom, rapatrier, { once: true })

  return {
    fenetre,
    fermer: () => {
      rapatrier()
      fenetre.close()
    },
  }
}

/** Repli : PiP natif, image seule. */
export async function basculerPipNatif(video: HTMLVideoElement): Promise<boolean> {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture()
    return false
  }
  await video.requestPictureInPicture()
  return true
}
