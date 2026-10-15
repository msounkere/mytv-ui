// Diffusion vers un televiseur. On passe par la Remote Playback API, standard
// et supportee par Chrome (Cast) comme par Safari (AirPlay) : aucun SDK tiers
// n est charge, et les identifiants ne transitent par aucun service externe.
//
// CONTRAT (docs/openapi.yaml, « Cast ») : il n'y a PAS d'URL signee. L'appareil
// de diffusion va chercher `lecture`, en absolu, SANS cookie : le serveur le
// reconnait a son adresse reseau (compte technique local, GET/HEAD, plages
// `comptes.plages_locales`). Cela ne marche donc que depuis le reseau local : si
// la page est ouverte par un nom public (tunnel), l'appareil resoudrait ce nom
// vers le tunnel, y serait refuse faute de cookie, et le debit y est de toute
// facon trop faible. `diffusionPossible` desactive alors la fonction au lieu de
// laisser l'utilisateur essayer pour rien.

export type EtatDiffusion = 'indisponible' | 'prete' | 'connexion' | 'diffusion'

export interface Diffusion {
  disponible: () => boolean
  etat: () => EtatDiffusion
  /** Ouvre le selecteur d appareils du navigateur. */
  choisir: () => Promise<void>
  arreter: () => Promise<void>
  /** Prevenu a chaque changement d etat. */
  surChangement: (cb: (e: EtatDiffusion) => void) => () => void
}

interface VideoAirPlay extends HTMLVideoElement {
  webkitShowPlaybackTargetPicker?: () => void
  webkitCurrentPlaybackTargetIsWireless?: boolean
}

export function creerDiffusion(video: HTMLVideoElement): Diffusion {
  const ecouteurs = new Set<(e: EtatDiffusion) => void>()
  let etat: EtatDiffusion = 'indisponible'
  const remote = (video as HTMLVideoElement & { remote?: RemotePlayback }).remote
  const airplay = video as VideoAirPlay

  const poser = (e: EtatDiffusion) => {
    if (e === etat) return
    etat = e
    for (const cb of ecouteurs) cb(e)
  }

  if (remote) {
    remote.watchAvailability((dispo) => poser(dispo ? 'prete' : 'indisponible')).catch(() => {})
    remote.addEventListener('connecting', () => poser('connexion'))
    remote.addEventListener('connect', () => poser('diffusion'))
    remote.addEventListener('disconnect', () => poser('prete'))
  } else if (airplay.webkitShowPlaybackTargetPicker) {
    poser('prete')
    video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () =>
      poser(airplay.webkitCurrentPlaybackTargetIsWireless ? 'diffusion' : 'prete'),
    )
  }

  return {
    disponible: () => etat !== 'indisponible',
    etat: () => etat,
    async choisir() {
      if (remote) await remote.prompt()
      else airplay.webkitShowPlaybackTargetPicker?.()
    },
    async arreter() {
      if (remote) await remote.cancelWatchAvailability().catch(() => {})
      video.src = video.src // force la reprise locale
    },
    surChangement(cb) {
      ecouteurs.add(cb)
      return () => ecouteurs.delete(cb)
    },
  }
}

/**
 * HLS passe partout en diffusion. En revanche un MP4 EAC3, illisible dans le
 * navigateur, est en general parfaitement decode par le televiseur : diffuser
 * est alors la bonne action a proposer dans le message d erreur « codec ».
 */
export function diffusionResoutLeCodec(codecAudio: string | undefined): boolean {
  return !!codecAudio && /^(eac3|ac3|dts)$/i.test(codecAudio.trim())
}

/**
 * Le nom d'hote designe-t-il le reseau local ? Adresses privees (RFC 1918),
 * boucle locale, lien local, noms en `.local`/`.lan` et noms sans point.
 */
export function origineLocale(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h === '::1') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  if (/^f[cd][0-9a-f]{2}:/.test(h) || h.startsWith('fe80:')) return true
  return !h.includes('.') || h.endsWith('.local') || h.endsWith('.lan')
}

/** La diffusion n'est offerte que si la page est servie depuis le reseau local. */
export function diffusionPossible(hostname = typeof location === 'undefined' ? '' : location.hostname): boolean {
  return origineLocale(hostname)
}

/**
 * Adresse a donner a l'appareil : l'adresse `lecture` du serveur, rendue absolue
 * sur l'origine de la page. Aucun hote a configurer, aucun secret dans l'URL.
 */
export function urlPourDiffusion(lecture: string, origine = location.origin): string {
  return new URL(lecture, origine).toString()
}

/**
 * Prepare la video pour la diffusion et attend qu'un appareil se declare.
 *
 * En direct, hls.js attache le flux par MSE : il n'y a alors AUCUNE adresse a
 * envoyer au televiseur, et la Remote Playback API repond « aucun appareil »
 * quels que soient les Chromecast allumes. On repose donc une URL simple — que
 * ce navigateur ne saura peut-etre pas lire, mais ce n'est pas lui qui doit la
 * lire : l'appareil va la chercher seul, et lui sait demultiplexer le HLS.
 *
 * Renvoie `false` si aucun appareil ne s'annonce dans le delai imparti.
 */
export async function preparerDiffusion(
  video: HTMLVideoElement,
  url: string,
  delaiMs = 4000,
): Promise<boolean> {
  const remote = (video as HTMLVideoElement & { remote?: RemotePlayback }).remote
  if (!remote) return false

  if (video.src !== url) {
    // `load()` est indispensable : sans lui l'element garde son flux MSE et
    // la surveillance continue de ne rien voir.
    video.src = url
    video.load()
  }

  // La disponibilite est annoncee de maniere asynchrone, et la surveillance
  // installee a l'ouverture du lecteur l'a evaluee quand la source etait encore
  // en MSE : on la redemande ici, sur la nouvelle source.
  return new Promise<boolean>((resoudre) => {
    let fini = false
    const terminer = (v: boolean) => {
      if (fini) return
      fini = true
      resoudre(v)
    }
    remote
      .watchAvailability((dispo) => terminer(dispo))
      .catch(() => terminer(false))
    setTimeout(() => terminer(false), delaiMs)
  })
}
