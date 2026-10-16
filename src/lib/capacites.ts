// Capacites REELLES du navigateur (US-32 CA5). Le serveur ne convertit que ce
// que le navigateur ne sait pas lire : il faut donc lui dire, a chaque requete,
// ce que celui-ci decode. Format (docs/lot5.md, US-30 CA5) : liste separee par
// des virgules parmi `hevc`, `eac3`, `ac3`, dans `?cap=` et `X-Mytv-Capacites`.
// Absence = navigateur suppose incapable de tout sauf h264 + aac.
//
// Detection : MediaSource.isTypeSupported (le codec existe) ET, pour l'HEVC 4K,
// MediaCapabilities.decodingInfo (le decodage est plausible : `supported` et
// fluide ou econome). Memorisee dans localStorage (avec repli memoire).

import { noter } from './diagnostic'

export type Capacite = 'hevc' | 'eac3' | 'ac3'
export type Capacites = readonly Capacite[]

export const ENTETE_CAPACITES = 'X-Mytv-Capacites'
const CLE = 'mytv.capacites'
const CLE_HEVC_DEFAILLANT = 'mytv.capacites.hevc-defaillant'
const VERSION_FORMAT = 1

const HEVC = ['video/mp4; codecs="hvc1.2.4.L153.B0"', 'video/mp4; codecs="hev1.2.4.L153.B0"']
const EAC3 = 'audio/mp4; codecs="ec-3"'
const AC3 = 'audio/mp4; codecs="ac-3"'

/** Ce que la detection lit : injectable pour les tests (doublures). */
export interface EnvCapacites {
  MediaSource?: { isTypeSupported?: (t: string) => boolean }
  mediaCapabilities?: {
    decodingInfo?: (c: unknown) => Promise<{ supported: boolean; smooth?: boolean; powerEfficient?: boolean }>
  }
}

function supporte(env: EnvCapacites, type: string): boolean {
  try {
    return env.MediaSource?.isTypeSupported?.(type) === true
  } catch {
    return false
  }
}

export async function detecter(env: EnvCapacites): Promise<Capacites> {
  const sortie: Capacite[] = []
  // HEVC : le codec doit etre annonce, puis le decodage 4K juge plausible. Sans
  // MediaCapabilities, l'annonce du codec fait foi ; si elle echoue, on n'annonce pas.
  let hevc = HEVC.some((t) => supporte(env, t))
  if (hevc && env.mediaCapabilities?.decodingInfo) {
    try {
      const info = await env.mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: { contentType: HEVC[0], width: 3840, height: 2160, bitrate: 25_000_000, framerate: 25 },
      })
      hevc = info.supported === true && (info.smooth === true || info.powerEfficient === true)
    } catch {
      /* API presente mais en echec : on garde l'annonce du codec */
    }
  }
  if (hevc) sortie.push('hevc')
  if (supporte(env, EAC3)) sortie.push('eac3')
  if (supporte(env, AC3)) sortie.push('ac3')
  return sortie
}

// --- Memorisation -----------------------------------------------------------

const memoire = new Map<string, string>()
function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return memoire.get(cle) ?? null
  }
}
function ecrire(cle: string, valeur: string): void {
  memoire.set(cle, valeur)
  try {
    localStorage.setItem(cle, valeur)
  } catch {
    /* repli memoire */
  }
}

const VALIDES: readonly string[] = ['hevc', 'eac3', 'ac3']
export function analyserMemorisation(brut: string | null): Capacites | undefined {
  if (!brut) return undefined
  try {
    const o = JSON.parse(brut) as { v?: number; cap?: unknown }
    if (o.v !== VERSION_FORMAT || !Array.isArray(o.cap)) return undefined
    return o.cap.filter((c): c is Capacite => typeof c === 'string' && VALIDES.includes(c))
  } catch {
    return undefined
  }
}

let detectees: Capacites | undefined = analyserMemorisation(lire(CLE))
let pret: Promise<Capacites> | undefined

/** Nom et version du navigateur, pour la telemetrie. */
export function nomNavigateur(ua: string): { nom: string; version: string } {
  const essais: Array<[string, RegExp]> = [
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ]
  for (const [nom, re] of essais) {
    const m = re.exec(ua)
    if (m) return { nom, version: m[1]!.split('.')[0]! }
  }
  return { nom: 'inconnu', version: '' }
}

/** Detecte une fois (au demarrage), memorise, journalise. Les appels suivants rendent la meme promesse. */
export function initialiserCapacites(env?: EnvCapacites): Promise<Capacites> {
  pret ??= (async () => {
    const e = env ?? ({ MediaSource: (globalThis as { MediaSource?: EnvCapacites['MediaSource'] }).MediaSource,
      mediaCapabilities: typeof navigator !== 'undefined' ? navigator.mediaCapabilities : undefined } as EnvCapacites)
    const cap = await detecter(e)
    detectees = cap
    ecrire(CLE, JSON.stringify({ v: VERSION_FORMAT, cap }))
    const nav = nomNavigateur(typeof navigator !== 'undefined' ? navigator.userAgent : '')
    noter('navigateur:capacites', {
      navigateur: nav.nom, version: nav.version, cap: cap.join(',') || 'aucune',
      hevc: cap.includes('hevc'), eac3: cap.includes('eac3'), ac3: cap.includes('ac3'),
      hevcDefaillant: hevcDefaillant(),
    })
    return cap
  })()
  return pret
}

export const capacitesPretes = (): Promise<Capacites> => initialiserCapacites()

/** Duree pendant laquelle un echec HEVC retire la capacite (une panne passagere ne l'enleve pas a vie). */
export const DUREE_HEVC_DEFAILLANT_MS = 24 * 3_600_000

/** Pur : le marquage (horodatage en ms) est-il encore valable ? */
export function marquageValide(brut: string | null, maintenantMs: number): boolean {
  if (!brut) return false
  const t = Number(brut)
  return Number.isFinite(t) && t > 0 && maintenantMs - t >= 0 && maintenantMs - t < DUREE_HEVC_DEFAILLANT_MS
}

/** Le serveur dit-il que la source est HEVC ? (`X-Mytv-Codec` de la playlist) */
export function codecEstHevc(codec: string | null | undefined): boolean {
  return /hevc|h\.?265/i.test(codec ?? '')
}

export function hevcDefaillant(maintenantMs = Date.now()): boolean {
  return marquageValide(lire(CLE_HEVC_DEFAILLANT), maintenantMs)
}
/** A n'appeler que si la source est HEVC : memorise 24 h avec horodatage. */
export function marquerHevcDefaillant(maintenantMs = Date.now()): void {
  ecrire(CLE_HEVC_DEFAILLANT, String(maintenantMs))
}

/** Capacites a annoncer : detectees, moins l'HEVC si on sait qu'il ne passe pas ici. */
export function capacitesAnnoncees(sansHevc = false): Capacites {
  const c = detectees ?? []
  return sansHevc || hevcDefaillant() ? c.filter((x) => x !== 'hevc') : c
}

export function formaterCapacites(c: Capacites): string {
  return c.join(',')
}

/** Ajoute `?cap=` a une adresse relative ; sans capacite le parametre reste ABSENT-vide explicite (`cap=`). */
export function urlAvecCapacites(url: string, c: Capacites): string {
  const [chemin = '', requete = ''] = url.split('?', 2)
  const p = requete ? requete.split('&').filter((x) => x && !x.startsWith('cap=')) : []
  p.push('cap=' + formaterCapacites(c))
  return `${chemin}?${p.join('&')}`
}
