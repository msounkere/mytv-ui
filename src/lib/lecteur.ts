import type Hls from 'hls.js'
import { ErreurLecteur } from './errors'
import { noter, observerVideo } from './diagnostic'

// Direct en HLS, VOD en MP4 natif. Chaque echec nomme sa couche : le lecteur
// precedent a ete abandonne pour avoir affiche « the error did not identify a
// specific codec, container, or network cause ».

export type Source = { kind: 'hls'; url: string } | { kind: 'fichier'; url: string }

export interface Attache {
  detacher: () => void
}

/**
 * Safari et iOS lisent reellement le HLS ; Chrome, lui, repond « maybe » a la
 * question sans savoir le demultiplexer. Se fier a cette reponse revient a lui
 * passer une playlist qu'il ne sait pas ouvrir : `DEMUXER_ERROR_COULD_NOT_PARSE`.
 * On n'accepte donc que la reponse franche.
 */
function hlsNatif(video: HTMLVideoElement): boolean {
  return video.canPlayType('application/vnd.apple.mpegurl') === 'probably'
}

export async function attacher(
  video: HTMLVideoElement,
  source: Source,
  surErreur: (e: ErreurLecteur) => void,
): Promise<Attache> {
  // Un fichier va droit au lecteur natif. Pour le HLS on interroge d'abord
  // hls.js : lui seul demultiplexe le direct dans Chrome, Firefox et Edge. Le
  // lecteur natif ne reprend la main que la ou hls.js ne tourne pas — Safari et
  // iOS, les seuls a lire reellement le HLS.
  const viaNatif =
    source.kind === 'fichier' ||
    (!(await import('hls.js')).default.isSupported() && hlsNatif(video))

  if (source.kind === 'hls' && !viaNatif && !(await import('hls.js')).default.isSupported())
    throw new ErreurLecteur(
      'codec',
      'Ce navigateur ne sait pas lire le direct.',
      'Utiliser Chrome, Edge, Firefox ou Safari a jour.',
    )

  if (viaNatif) {
    video.src = source.url
    const auMedia = () => surErreur(erreurMedia(video))
    video.addEventListener('error', auMedia)
    return {
      detacher: () => {
        video.removeEventListener('error', auMedia)
        video.removeAttribute('src')
        video.load()
      },
    }
  }

  // hls.js est charge a la demande : il ne doit pas peser sur le premier rendu.
  const { default: HlsCtor } = await import('hls.js')

  // Le relais ne tient le creneau du fournisseur que pendant les requetes
  // actives : entre deux segments, il garde une reservation de 15 s seulement
  // (`hls_session_ttl_secs`). Un tampon large fait avaler au lecteur une rafale
  // de segments puis l'endort une minute — la reservation expire, et la reprise
  // se heurte a la limite d'une seule connexion simultanee. D'ou des coupures
  // en pleine lecture, alors meme que le debit est dix fois suffisant.
  // On garde donc une avance courte, qui maintient un rythme de requetes
  // regulier : environ trois segments, soit ~30 s ici.
  const hls: Hls = new HlsCtor({
    maxBufferLength: 30,
    maxMaxBufferLength: 45,
    maxBufferSize: 40 * 1000 * 1000,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 10,
    // La basse latence colle au direct et transforme le moindre retard en
    // coupure ; elle n'a aucun interet sur un relais qui va rechercher chaque
    // segment chez le fournisseur.
    lowLatencyMode: false,
    // Memoire bornee sur un direct laisse ouvert des heures.
    backBufferLength: 30,
    // Reessais patients : une reprise ratee coute une reconnexion complete.
    manifestLoadingMaxRetry: 4,
    levelLoadingMaxRetry: 4,
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 500,
    fragLoadingMaxRetryTimeout: 8000,
  })

  // Mesure : on enregistre TOUT ce que hls.js signale, y compris les erreurs non
  // fatales qu'il rattrape seul. Le serveur ne voit ni les unes ni les autres :
  // il a servi chaque segment en ~1 s et ne comprend pas les coupures.
  const arretVideo = observerVideo(video, { mode: 'hls' })
  hls.on(HlsCtor.Events.ERROR, (_e, data) => {
    noter('hls:erreur', {
      genre: data.type,
      detail: data.details,
      fatale: data.fatal,
      http: data.response?.code,
      url: data.frag?.url ?? data.url,
    })
    if (!data.fatal) return
    surErreur(traduireHls(HlsCtor, data))
  })
  hls.on(HlsCtor.Events.FRAG_LOADED, (_e, d) => {
    const st = d.frag.stats
    noter('hls:segment', {
      sn: typeof d.frag.sn === 'number' ? d.frag.sn : undefined,
      duree: Math.round(((st.loading.end - st.loading.start) / 1000) * 100) / 100,
      attente: Math.round(((st.loading.first - st.loading.start) / 1000) * 100) / 100,
      octets: st.total,
      debitKbps: Math.round(hls.bandwidthEstimate / 1000),
    })
  })
  hls.on(HlsCtor.Events.LEVEL_LOADED, (_e, d) => {
    const st = d.stats
    noter('hls:playlist', { duree: Math.round(((st.loading.end - st.loading.start) / 1000) * 100) / 100, segments: d.details.fragments.length })
  })

  hls.loadSource(source.url)
  hls.attachMedia(video)

  return {
    detacher: () => {
      arretVideo()
      hls.destroy()
    },
  }
}

function traduireHls(Ctor: typeof Hls, data: { type: string; details: string; response?: { code?: number } }): ErreurLecteur {
  const code = data.response?.code
  if (code === 401 || code === 403)
    return new ErreurLecteur(
      'auth',
      'Le relais a refuse l acces a ce flux.',
      'Verifier le compte dans les Reglages.',
      `${data.details} (HTTP ${code})`,
    )
  // Le fournisseur n autorise qu une connexion simultanee : c est la cause la
  // plus frequente d un refus soudain alors que tout fonctionnait.
  if (code === 429 || code === 509)
    return new ErreurLecteur(
      'limite',
      'La limite d une connexion simultanee est atteinte.',
      'Fermer l autre lecture en cours, puis reessayer.',
      `${data.details} (HTTP ${code})`,
    )
  if (data.type === Ctor.ErrorTypes.NETWORK_ERROR)
    return new ErreurLecteur(
      'reseau',
      'Le flux s est interrompu.',
      'Reessayer ; si cela persiste, verifier la liaison avec le relais.',
      data.details,
    )
  if (data.type === Ctor.ErrorTypes.MEDIA_ERROR)
    return new ErreurLecteur(
      'codec',
      'Le navigateur ne parvient pas a decoder ce flux.',
      'Diffuser vers un televiseur, qui decodera le format.',
      data.details,
    )
  return new ErreurLecteur('relais', 'Lecture impossible.', 'Reessayer.', data.details)
}

/** Les codes MediaError sont pauvres : on nomme malgre tout la couche. */
function erreurMedia(video: HTMLVideoElement): ErreurLecteur {
  const e = video.error
  switch (e?.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return new ErreurLecteur('reseau', 'Le telechargement du flux a echoue.', 'Reessayer.', e.message)
    case MediaError.MEDIA_ERR_DECODE:
      return new ErreurLecteur(
        'codec',
        'Le navigateur ne decode pas ce format — typiquement une piste audio EAC3.',
        'Diffuser vers un televiseur, qui decodera la piste.',
        e.message,
      )
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return new ErreurLecteur(
        'codec',
        'Conteneur ou codec non pris en charge par ce navigateur.',
        'Diffuser vers un televiseur, ou choisir une autre version du contenu.',
        e.message,
      )
    case MediaError.MEDIA_ERR_ABORTED:
      return new ErreurLecteur('reseau', 'Lecture interrompue.', 'Relancer la lecture.', e.message)
    default:
      return new ErreurLecteur('relais', 'Lecture impossible.', 'Reessayer.', e?.message)
  }
}
