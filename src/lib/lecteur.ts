import type Hls from 'hls.js'
import { erreurDeMedia, ErreurLecteur, erreurDeStatut } from './errors'
import { noter, observerVideo, masquerUrl } from './diagnostic'
import { lectureArretee, lectureOuverte } from './bail'
import { signalerSiNonAuthentifie } from './session-expiree'
import { ENTETE_CAPACITES, formaterCapacites, type Capacites } from './capacites'
import {
  DELAI_CONVERSION_MS, DELAI_PLAYLIST_DIRECT_MS, lireModeDirect, type ModeDirect, type ModeForce,
} from './modes-direct'
import { DETAIL_SANS_PROGRES, ETAT_HLS_INITIAL, reagir, type EtatHls } from './erreurs-hls'

// Direct en HLS, VOD en MP4 natif. Chaque echec nomme sa couche : le lecteur
// precedent a ete abandonne pour avoir affiche « the error did not identify a
// specific codec, container, or network cause ».

export type Source =
  /** `chaine` : numero de la chaine, pour rendre la place a la fermeture. */
  | { kind: 'hls'; url: string; chaine?: string }
  | { kind: 'fichier'; url: string }

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

export interface OptionsAttache {
  /** Mode annonce par le serveur (`X-Mytv-Mode`) sur la playlist d'un direct. */
  surMode?: (mode: ModeDirect, codec?: string) => void
  /** Mode impose par l'interface (`?forcer=`) : le demarrage sera plus long. */
  forcer?: ModeForce | null
  /** Capacites annoncees sur CHAQUE requete (en-tete ; la playlist les porte aussi en `?cap=`). */
  capacites?: Capacites
  /** En-tetes de plus sur chaque requete hls.js (`X-Mytv-Qualite: eco`, US-38 CA4). */
  entetes?: Record<string, string>
}

export async function attacher(
  video: HTMLVideoElement,
  source: Source,
  surErreur: (e: ErreurLecteur) => void,
  options: OptionsAttache = {},
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

  // Un direct ouvert reprend la place du fournisseur ; le film aussi. Dans les
  // deux cas, une fin differee en attente (zapping) n'a plus lieu d'etre.
  const chaine = source.kind === 'hls' ? source.chaine : undefined
  lectureOuverte(chaine)
  const rendrePlace = () => {
    if (chaine) lectureArretee(chaine)
  }

  if (viaNatif) {
    video.src = source.url
    const auMedia = () => surErreur(erreurMedia(video))
    video.addEventListener('error', auMedia)
    return {
      detacher: () => {
        video.removeEventListener('error', auMedia)
        // Vider `src` ferme la requete en vol : pour un film, c'est ce qui
        // rend la place au fournisseur.
        video.removeAttribute('src')
        video.load()
        rendrePlace()
      },
    }
  }

  // hls.js est charge a la demande : il ne doit pas peser sur le premier rendu.
  const { default: HlsCtor } = await import('hls.js')

  // Le serveur ne tient le creneau du fournisseur que pendant les requetes
  // actives : entre deux segments, il garde une reservation de duree limitee
  // (TTL du bail, 90 s). Un tampon large fait avaler au lecteur une rafale
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
    // Les segments gardent des adresses stables (pas de requete ajoutee) : les
    // capacites voyagent donc par en-tete, meme origine.
    xhrSetup: (xhr: XMLHttpRequest) => {
      if (options.capacites) xhr.setRequestHeader(ENTETE_CAPACITES, formaterCapacites(options.capacites))
      for (const [nom, valeur] of Object.entries(options.entetes ?? {})) xhr.setRequestHeader(nom, valeur)
    },
    // Memoire bornee sur un direct laisse ouvert des heures.
    backBufferLength: 30,
    ...politiquesChargement(options.forcer),
  })

  // Un refus « place occupee » (503, ou 403/407 de segment) ne se soigne pas par
  // un reessai muet de hls.js : six reessais rapproches sur un segment martelaient
  // le serveur, donc le fournisseur. On remonte l'erreur tout de suite a la
  // politique de reprise, qui respecte `Retry-After` et affiche le decompte.
  for (const politique of [hls.config.fragLoadPolicy, hls.config.playlistLoadPolicy, hls.config.manifestLoadPolicy]) {
    const reessai = politique?.default?.errorRetry
    if (reessai) reessai.shouldRetry = (_c, _n, _t, reponse, parDefaut) => parDefaut && !statutPlacePrise(reponse?.code)
  }

  // Mesure : on enregistre TOUT ce que hls.js signale, y compris les erreurs non
  // fatales qu'il rattrape seul. Le serveur ne voit ni les unes ni les autres :
  // il a servi chaque segment en ~1 s et ne comprend pas les coupures.
  let placeSignalee = false
  let etatHls: EtatHls = ETAT_HLS_INITIAL
  // La chaine voyage avec chaque evenement : le score de fluidite (US-39 CA2)
  // agrege la telemetrie PAR chaine, sur la page, a partir de ces memes notes.
  const arretVideo = observerVideo(video, { mode: 'hls', chaine })
  hls.on(HlsCtor.Events.ERROR, (_e, data) => {
    noter('hls:erreur', {
      genre: data.type,
      detail: data.details,
      fatale: data.fatal,
      http: data.response?.code,
      url: masquerUrl(data.frag?.url ?? data.url),
    })
    // Une place prise sur un segment ou une playlist est traitee comme FATALE
    // tout de suite : hls.js, sinon, la reessaierait six fois en quelques
    // secondes (mesure : 403 sur le meme segment a 0,5 / 1 / 2 / 4 / 8 / 8 s),
    // soit autant de refus de plus chez un fournisseur a connexion unique.
    const placePrise = statutPlacePrise(data.response?.code) && data.type === HlsCtor.ErrorTypes.NETWORK_ERROR
    if (placePrise && !data.fatal) {
      if (placeSignalee) return
      placeSignalee = true
      hls.stopLoad()
      surErreur(traduireHls(HlsCtor, data))
      return
    }
    if (placeSignalee) return
    // Avant de tout rouvrir (playlist, segments, place du fournisseur), les gestes
    // moins couteux que prevoit hls.js — bornes par `erreurs-hls`, testes seuls.
    const decision = reagir(etatHls, {
      type: data.type, details: data.details, fatal: data.fatal, statut: data.response?.code, placePrise,
      maintenant: Date.now(), position: video.currentTime,
    })
    etatHls = decision.etat
    if (decision.action === 'ignorer') return
    if (decision.action !== 'remonter') noter('hls:recuperation', { action: decision.action, detail: data.details, http: data.response?.code })
    switch (decision.action) {
      case 'recuperer':
        hls.recoverMediaError()
        return
      case 'permuter-audio':
        hls.swapAudioCodec()
        hls.recoverMediaError()
        return
      case 'recharger':
        hls.startLoad()
        return
    }
    if (!data.fatal) {
      // Boucle `bufferAppendNoProgress` deja recuperee une fois : la lecture est
      // figee sans erreur fatale, c'est une coupure, la reprise habituelle decide.
      surErreur(new ErreurLecteur('reseau', 'Le flux s est interrompu.', 'Reessayer ; si cela persiste, verifier la liaison avec le serveur.', DETAIL_SANS_PROGRES))
      return
    }
    signalerSiNonAuthentifie(data.response?.code ?? 0)
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
      // Duree de video du segment : avec `octets`, le debit propre du flux (regle Eco, US-38 CA4).
      dureeMedia: Math.round(d.frag.duration * 100) / 100,
    })
  })
  // Le mode decide par le serveur est dans l'en-tete de la playlist.
  let modeVu = false
  const lireMode = (d: { networkDetails?: unknown }) => {
    if (modeVu) return
    const mode = lireModeDirect(enteteDe(d.networkDetails, 'X-Mytv-Mode'))
    if (!mode) return
    modeVu = true
    noter('live:mode', { mode, codec: enteteDe(d.networkDetails, 'X-Mytv-Codec') ?? undefined, force: options.forcer ?? undefined, chaine: source.kind === 'hls' ? source.chaine : undefined })
    options.surMode?.(mode, enteteDe(d.networkDetails, 'X-Mytv-Codec') ?? undefined)
  }
  hls.on(HlsCtor.Events.MANIFEST_LOADED, (_e, d) => lireMode(d))
  hls.on(HlsCtor.Events.LEVEL_LOADED, (_e, d) => lireMode(d))
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
      rendrePlace()
    },
  }
}

/** Statuts qui disent « la place est prise » : jamais reessayes en silence. */
export function statutPlacePrise(code: number | undefined): boolean {
  return code === 503 || code === 429 || code === 403 || code === 407
}

/** Premier octet d'un segment : le serveur patiente jusqu'a 8 s sur un 407 avant de repondre 503. */
export const DELAI_PREMIER_OCTET_MS = 15_000
/** Chargement complet d'un segment, hors conversion. */
export const DELAI_SEGMENT_MS = 20_000

type Politiques = Pick<Hls['config'], 'fragLoadPolicy' | 'playlistLoadPolicy' | 'manifestLoadPolicy'>

/**
 * Politiques de chargement, explicites. hls.js 1.7 mappe encore les cles
 * heritees (`fragLoadingTimeOut`...) mais en avertissant, et le mappage posait
 * le MEME delai au premier octet et au chargement complet : 20 s pour tout.
 *
 * Playlists : peu de reessais internes — un 503 « place occupee » doit remonter
 * vite a la politique de reprise, qui annonce l'attente et la borne (quatre
 * reessais muets la cachaient puis la doublaient). Et un direct converti attend
 * qu'ffmpeg ait produit son premier segment avant de repondre : 45 s dans tous
 * les cas, le mode n'etant connu qu'avec la playlist.
 *
 * Segments : le serveur patiente desormais jusqu'a 8 s sur un segment refuse 407
 * avant de repondre 503 avec Retry-After — le premier octet doit donc pouvoir
 * attendre bien plus (15 s), sans quoi hls.js tranchait avant le serveur. Sous
 * conversion imposee, le chargement complet tolere le demarrage d'ffmpeg.
 */
export function politiquesChargement(forcer?: ModeForce | null): Politiques {
  const playlist = {
    maxTimeToFirstByteMs: DELAI_PLAYLIST_DIRECT_MS,
    maxLoadTimeMs: DELAI_PLAYLIST_DIRECT_MS,
    timeoutRetry: { maxNumRetry: 1, retryDelayMs: 0, maxRetryDelayMs: 0 },
    errorRetry: { maxNumRetry: 1, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
  }
  return {
    manifestLoadPolicy: { default: { ...playlist, timeoutRetry: { ...playlist.timeoutRetry }, errorRetry: { ...playlist.errorRetry } } },
    playlistLoadPolicy: { default: { ...playlist, timeoutRetry: { ...playlist.timeoutRetry }, errorRetry: { ...playlist.errorRetry } } },
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: DELAI_PREMIER_OCTET_MS,
        maxLoadTimeMs: forcer ? DELAI_CONVERSION_MS : DELAI_SEGMENT_MS,
        // Reessais patients : une reprise ratee coute une reconnexion complete.
        timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
        errorRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 8000 },
      },
    },
  }
}

/** En-tete de la reponse en cause : hls.js la rend en XHR ou en Response. */
function enteteDe(details: unknown, nom: string): string | null {
  const d = details as
    | { getResponseHeader?: (n: string) => string | null; headers?: { get?: (n: string) => string | null } }
    | undefined
  return d?.getResponseHeader?.(nom) ?? d?.headers?.get?.(nom) ?? null
}

export function traduireHls(
  Ctor: Pick<typeof Hls, 'ErrorTypes'>,
  data: { type: string; details: string; response?: { code?: number }; networkDetails?: unknown },
): ErreurLecteur {
  const code = data.response?.code
  // Tout statut HTTP connu (401, 403, 404, 503...) a sa traduction : le 503
  // devient « place occupee » avec son delai, le 401 un retour a la connexion.
  if (code !== undefined && code >= 400)
    return erreurDeStatut(code, {
      retryAfter: enteteDe(data.networkDetails, 'Retry-After'),
      // hls.js ne rend jamais le corps d'une reponse en echec : le serveur repete
      // le code (et la date d'expiration) dans des en-tetes.
      code: enteteDe(data.networkDetails, 'X-Mytv-Erreur') ?? undefined,
      expiration: enteteDe(data.networkDetails, 'X-Mytv-Expiration'),
      contexte: data.details,
    })
  if (data.type === Ctor.ErrorTypes.NETWORK_ERROR)
    return new ErreurLecteur(
      'reseau',
      'Le flux s est interrompu.',
      'Reessayer ; si cela persiste, verifier la liaison avec le serveur.',
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

/** Les codes MediaError sont pauvres : la classification (pure, testee) est dans errors.ts. */
function erreurMedia(video: HTMLVideoElement): ErreurLecteur {
  return erreurDeMedia(video.error?.code, video.error?.message)
}
