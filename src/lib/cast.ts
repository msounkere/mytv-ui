// Diffusion vers un televiseur. On passe par la Remote Playback API, standard
// et supportee par Chrome (Cast) comme par Safari (AirPlay) : aucun SDK tiers
// n est charge, et les identifiants ne transitent par aucun service externe.
//
// POINT DE VIGILANCE RESEAU : l appareil de diffusion va chercher le flux
// LUI-MEME. Les Chromecast interrogent des resolveurs publics cables en dur,
// donc ils resolvent mytv.msocasa.com vers Cloudflare et passent par le tunnel
// (10-40 Mbit/s) au lieu du reseau local. `urlPourDiffusion` permet de forcer
// l adresse locale du relais pour rester en plein debit.

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
 * Remplace l hote public par l adresse locale du relais quand elle est connue,
 * pour que l appareil de diffusion reste sur le reseau local.
 */
export function urlPourDiffusion(url: string, hoteLocal: string | undefined): string {
  if (!hoteLocal) return url
  const u = new URL(url, location.origin)
  const local = new URL(hoteLocal)
  u.protocol = local.protocol
  u.host = local.host
  return u.toString()
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
