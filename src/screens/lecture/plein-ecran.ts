// Plein ecran (US-45 CA7, D4/B8). Sur WebKit iPhone, `Element.requestFullscreen`
// n'existe pas : seul `video.webkitEnterFullscreen()` (plein ecran natif de la
// video, commandes du systeme) fonctionne -- et c'est l'appareil le plus utilise.
// Le CHOIX de l'API est une fonction pure, testee seule ; la bascule l'applique.

export type ApiPleinEcran = 'standard' | 'webkit' | 'aucune'

export interface EnvPleinEcran {
  /** `cadre.requestFullscreen` existe. */
  requestFullscreen?: unknown
  /** `document.fullscreenEnabled` (faux sur WebKit iPhone, ou en iframe sans permission). */
  fullscreenEnabled?: boolean
  /** `video.webkitEnterFullscreen` existe (WebKit). */
  webkitEnterFullscreen?: unknown
}

export function choisirApiPleinEcran(env: EnvPleinEcran): ApiPleinEcran {
  if (typeof env.requestFullscreen === 'function' && env.fullscreenEnabled !== false) return 'standard'
  if (typeof env.webkitEnterFullscreen === 'function') return 'webkit'
  return 'aucune'
}

type VideoWebkit = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitDisplayingFullscreen?: boolean
  webkitSupportsFullscreen?: boolean
}

/** Bascule le plein ecran du cadre (standard) ou de la video (WebKit). Rend l'API retenue. */
export function basculerPleinEcran(cadre: HTMLElement, video: HTMLVideoElement): ApiPleinEcran {
  const v = video as VideoWebkit
  const api = choisirApiPleinEcran({
    requestFullscreen: cadre.requestFullscreen,
    fullscreenEnabled: typeof document !== 'undefined' ? document.fullscreenEnabled : undefined,
    webkitEnterFullscreen: v.webkitEnterFullscreen,
  })
  if (api === 'standard') {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void cadre.requestFullscreen().catch(() => {})
  } else if (api === 'webkit') {
    try {
      if (v.webkitDisplayingFullscreen) v.webkitExitFullscreen?.()
      else v.webkitEnterFullscreen?.()
    } catch {
      // WebKit refuse avant les metadonnees : le bouton reste operant, l'essai suivant passera.
    }
  }
  return api
}
