// Diffusion vers un televiseur. On passe par la Remote Playback API, standard
// et supportee par Chrome (Cast) comme par Safari (AirPlay) : aucun SDK tiers
// n est charge, et les identifiants ne transitent par aucun service externe.
//
// CONTRAT (docs/lot8.md, US-40) : le serveur remet au lecteur un LIEN SIGNE a
// duree limitee (`POST /api/v1/cast/lien` → `{ url, expire }`), que l'appareil
// de diffusion va chercher SANS cookie, par Internet ou par le reseau local —
// un seul chemin, d'ou que la page soit servie. Le jeton porte la session, la
// ressource et l'expiration ; il ne quitte jamais cette page vers la
// telemetrie (`detailsDiffusion` ne note que la ressource).
//
// UN SEUL FLUX (US-41 CA3) : pendant la diffusion, le navigateur ne doit PAS
// ouvrir le flux lui-meme. `preparerDiffusion` pose `preload="none"` AVANT la
// source signee, et aucun `play()` local n'est fait tant que l'appareil n'a
// pas pris la main.

import { createSignal } from 'solid-js'
import { json } from './api'
import { formaterCapacites, nomNavigateur, type Capacite, type Capacites } from './capacites'
import { masquerUrl } from './diagnostic'
import type { ModeQualite } from './qualite'

export type EtatDiffusion = 'indisponible' | 'prete' | 'connexion' | 'diffusion'

export interface Diffusion {
  /** Le navigateur sait diffuser (Remote Playback API ou AirPlay). */
  supportee: () => boolean
  disponible: () => boolean
  etat: () => EtatDiffusion
  /** Ouvre le selecteur d appareils du navigateur. */
  choisir: () => Promise<void>
  /**
   * Demande a l'utilisateur de lacher l'appareil : la Remote Playback API n'a
   * pas de deconnexion programmee, `prompt()` en etat connecte propose
   * « Arreter la diffusion » (idem AirPlay). L'evenement `disconnect` suit.
   */
  arreter: () => Promise<void>
  /** Retire la source signee de l'element, sans rien charger a la place. */
  vider: () => void
  /** Prevenu a chaque changement d etat. */
  surChangement: (cb: (e: EtatDiffusion) => void) => () => void
  detacher: () => void
}

interface VideoAirPlay extends HTMLVideoElement {
  webkitShowPlaybackTargetPicker?: () => void
  webkitCurrentPlaybackTargetIsWireless?: boolean
}

type VideoRemote = HTMLVideoElement & { remote?: RemotePlayback }

export function creerDiffusion(video: HTMLVideoElement): Diffusion {
  const ecouteurs = new Set<(e: EtatDiffusion) => void>()
  let etat: EtatDiffusion = 'indisponible'
  const remote = (video as VideoRemote).remote
  const airplay = video as VideoAirPlay
  const supportee = !!remote || !!airplay.webkitShowPlaybackTargetPicker
  const nettoyages: Array<() => void> = []

  const poser = (e: EtatDiffusion) => {
    if (e === etat) return
    etat = e
    for (const cb of ecouteurs) cb(e)
  }

  if (remote) {
    remote.watchAvailability((dispo) => poser(dispo ? 'prete' : 'indisponible')).catch(() => {})
    const surEvenement: Array<[string, () => void]> = [
      ['connecting', () => poser('connexion')],
      ['connect', () => poser('diffusion')],
      ['disconnect', () => poser('prete')],
    ]
    for (const [nom, cb] of surEvenement) {
      remote.addEventListener(nom, cb)
      nettoyages.push(() => remote.removeEventListener(nom, cb))
    }
  } else if (airplay.webkitShowPlaybackTargetPicker) {
    poser('prete')
    const cb = () => poser(airplay.webkitCurrentPlaybackTargetIsWireless ? 'diffusion' : 'prete')
    video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', cb)
    nettoyages.push(() => video.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', cb))
  }

  return {
    supportee: () => supportee,
    disponible: () => etat !== 'indisponible',
    etat: () => etat,
    async choisir() {
      if (remote) await remote.prompt()
      else airplay.webkitShowPlaybackTargetPicker?.()
    },
    async arreter() {
      if (remote) {
        if (remote.state !== 'disconnected') await remote.prompt()
      } else airplay.webkitShowPlaybackTargetPicker?.()
    },
    vider() {
      if (remote) void remote.cancelWatchAvailability().catch(() => {})
      video.removeAttribute('src')
      video.removeAttribute('preload')
      video.load()
    },
    surChangement(cb) {
      ecouteurs.add(cb)
      return () => ecouteurs.delete(cb)
    },
    detacher() {
      for (const n of nettoyages) n()
      ecouteurs.clear()
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

// --- Capacites de l'appareil de diffusion (US-41 CA2) -------------------------
// Distinctes de celles du navigateur : un televiseur decode HEVC, EAC3 et AC3.
// Reglables dans Reglages > Lecture, memorisees PAR APPAREIL comme la qualite
// (ce sont les televiseurs de CE foyer qu'on decrit).

export interface ReglagesTeleviseur {
  /** Le televiseur decode EAC3 / AC3. */
  eac3: boolean
  /** Le televiseur decode HEVC. */
  hevc: boolean
}

const CLE_TV_EAC3 = 'mytv.televiseur.eac3'
const CLE_TV_HEVC = 'mytv.televiseur.hevc'

/** Par defaut vrai : seul « non » ecrit tel quel desactive. */
export function lireReglageTeleviseur(brut: string | null | undefined): boolean {
  return brut !== 'non'
}

function lireReglage(cle: string): boolean {
  try {
    return lireReglageTeleviseur(localStorage.getItem(cle))
  } catch {
    return true
  }
}

const [televiseurEac3, poserEac3Interne] = createSignal(lireReglage(CLE_TV_EAC3))
const [televiseurHevc, poserHevcInterne] = createSignal(lireReglage(CLE_TV_HEVC))
export { televiseurEac3, televiseurHevc }

function ecrireReglage(cle: string, valeur: boolean): void {
  try {
    localStorage.setItem(cle, valeur ? 'oui' : 'non')
  } catch {
    /* mode prive : vaut pour la session */
  }
}

export function choisirTeleviseurEac3(v: boolean): void {
  poserEac3Interne(v)
  ecrireReglage(CLE_TV_EAC3, v)
}

export function choisirTeleviseurHevc(v: boolean): void {
  poserHevcInterne(v)
  ecrireReglage(CLE_TV_HEVC, v)
}

export const reglagesTeleviseur = (): ReglagesTeleviseur => ({ eac3: televiseurEac3(), hevc: televiseurHevc() })

/** Capacites a annoncer pour l'appareil de diffusion : par defaut `hevc,eac3,ac3`. */
export function capacitesTeleviseur(r: ReglagesTeleviseur): Capacites {
  const c: Capacite[] = []
  if (r.hevc) c.push('hevc')
  if (r.eac3) c.push('eac3', 'ac3')
  return c
}

/**
 * Parametres de diffusion (`parametres` de `POST /cast/lien`, recopies dans
 * l'adresse signee) : les capacites du TELEVISEUR, et JAMAIS `qualite=eco` —
 * le televiseur a le debit, et Eco couterait un coeur au serveur. La qualite
 * du navigateur est recue pour etre ignoree sciemment.
 */
export function parametresDiffusion(r: ReglagesTeleviseur, _qualiteNavigateur: ModeQualite = 'auto'): string {
  return 'cap=' + formaterCapacites(capacitesTeleviseur(r))
}

// --- Lien signe (US-41 CA1) ---------------------------------------------------

export interface LienDiffusion {
  /** Adresse relative, signee : `/api/v1/cast/<jeton>/live/<chaine>.m3u8` ou `/vod/<id>`. */
  url: string
  /** Expiration, RFC 3339. */
  expire: string
}

export const PREFIXE_CAST = '/api/v1/cast/'

/** Le chemin signe est bien l'une des deux formes du contrat (rien d'autre n'est donne a un appareil). */
export function lienValide(url: unknown): url is string {
  return typeof url === 'string' && /^\/api\/v1\/cast\/[A-Za-z0-9_.~-]+\/(live\/[A-Za-z0-9_-]+\.m3u8|vod\/[^/?#]+)(\?[^#]*)?$/.test(url)
}

/**
 * Demande au serveur un lien signe pour `lecture` (adresse de lecture de
 * l'entree, telle que `lectureDe` la donne) avec les parametres de diffusion.
 * `appel` est injectable pour les tests.
 */
export async function demanderLien(
  lecture: string,
  parametres: string,
  appel: <T>(chemin: string, o: { methode: 'POST'; corps: unknown }) => Promise<T> = json,
): Promise<LienDiffusion> {
  const r = await appel<Partial<LienDiffusion>>('/cast/lien', { methode: 'POST', corps: { lecture, parametres } })
  if (!lienValide(r.url) || typeof r.expire !== 'string') throw new Error('lien de diffusion inattendu')
  return { url: r.url, expire: r.expire }
}

/**
 * Adresse a donner a l'appareil ou a copier : le lien signe rendu absolu sur
 * l'origine de la page. Aucun hote a configurer, aucun secret de plus.
 */
export function lienAbsolu(url: string, origine = location.origin): string {
  return new URL(url, origine).toString()
}

/** « Lien copié — valable jusqu'à 23:15 » : l'heure locale de l'expiration. */
export function libelleExpiration(expire: string, maintenant = Date.now()): string {
  const t = Date.parse(expire)
  if (!Number.isFinite(t)) return 'valable 12 h'
  const memeJour = new Date(t).toDateString() === new Date(maintenant).toDateString()
  const d = new Date(t)
  const heure = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return memeJour ? `valable jusqu’à ${heure}` : `valable jusqu’à demain ${heure}`
}

// --- Telemetrie (US-41 CA4, CA5) ------------------------------------------------

/**
 * Ce que la telemetrie note d'une diffusion : la ressource (adresse de lecture
 * sans requete), le navigateur, la duree. JAMAIS le jeton ni le lien signe :
 * on part de l'adresse de lecture, pas du lien.
 */
export function detailsDiffusion(
  lecture: string,
  ua: string,
  dureeS?: number,
): { ressource: string; navigateur: string; duree?: number } {
  const ressource = (masquerUrl(lecture) ?? '').replace(/^\/api\/v1\/cast\/[^/]+/, '/api/v1')
  const d = { ressource, navigateur: nomNavigateur(ua).nom }
  return dureeS === undefined ? d : { ...d, duree: Math.max(0, Math.round(dureeS)) }
}

// --- Preparation de l'element (US-41 CA3) ---------------------------------------

/**
 * Prepare la video pour la diffusion et attend qu'un appareil se declare.
 *
 * En direct, hls.js attache le flux par MSE : il n'y a alors AUCUNE adresse a
 * envoyer au televiseur, et la Remote Playback API repond « aucun appareil »
 * quels que soient les Chromecast allumes. On pose donc le lien signe comme
 * source simple — que ce navigateur ne doit PAS charger : `preload="none"`
 * est pose avant, et l'appelant ne fait aucun `play()` local. L'appareil va
 * chercher le flux seul, et lui sait demultiplexer le HLS.
 *
 * Renvoie `false` si aucun appareil ne s'annonce dans le delai imparti.
 */
export async function preparerDiffusion(
  video: HTMLVideoElement,
  url: string,
  delaiMs = 4000,
): Promise<boolean> {
  const remote = (video as VideoRemote).remote
  const airplay = video as VideoAirPlay
  if (!remote && !airplay.webkitShowPlaybackTargetPicker) return false

  if (video.getAttribute('src') !== url) {
    // Un tour de boucle d'abord : le flux precedent vient d'etre detache par un
    // `load()` explicite (hls.js vide l'element), et Firefox rattache une source
    // posee dans la meme tache a CE chargement explicite — qui ignore
    // `preload="none"` (mesure : une requete de playlist). Apres le tour, le
    // chargement explicite s'est acheve sur un element vide.
    await new Promise<void>((r) => setTimeout(r, 0))
    // `preload="none"` AVANT la source : le navigateur ne doit rien aller
    // chercher — le flux est pour l'appareil, et l'abonnement n'en admet qu'un.
    video.preload = 'none'
    // Poser `src` suffit a lancer l'algorithme de chargement (le flux MSE est
    // detache, la surveillance voit la nouvelle adresse). SURTOUT PAS `load()` :
    // un appel explicite vaut intention de lire, et Chromium ignore alors
    // `preload="none"` — mesure : playlist et segments charges localement.
    video.src = url
  }
  if (!remote) return true

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
