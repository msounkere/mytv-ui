import { createSignal } from 'solid-js'
import { config } from './config'
import { urlApi } from './lib/xtream'

// Le débit affiché par l'en-tête était une constante (« 24 Mbit/s ») reprise de
// la maquette. Sur cette installation la valeur est doublement fausse : le
// tunnel plafonne autour de 10 Mbit/s et le réseau local fait plus de dix fois
// mieux. Un chiffre décoratif à cet endroit est pire que pas de chiffre, parce
// que c'est précisément sur lui qu'on décide d'une qualité de flux.

/** Hôtes que l'on ne peut pas joindre autrement que par le réseau local. */
const PRIVE = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

/**
 * Hôte d'une adresse saisie par l'utilisateur, avec ou sans schéma.
 * `new URL('http://' + valeur)` ne suffit pas : quand la valeur porte déjà son
 * schéma, l'URL obtenue a pour hôte « http », et la comparaison avec
 * `location.hostname` échoue toujours — le mode local n'était donc jamais
 * détecté, quelle que soit la machine.
 */
function hoteDe(brut: string): string {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(brut) ? brut : `http://${brut}`).hostname
  } catch {
    return ''
  }
}

/** Vrai quand la page est servie sans passer par le tunnel. */
export function enLocal(): boolean {
  const hote = location.hostname
  if (PRIVE.test(hote)) return true
  const declare = hoteDe(config().hoteLocal ?? '')
  return declare.length > 0 && declare === hote
}

export interface MesureReseau {
  /** Mbit/s observés sur la liaison qui sert l'application. */
  debit: number
  /** Temps jusqu'au premier octet : ce que chaque zapping paiera d'avance. */
  latence: number
  /** Volume réellement téléchargé pour obtenir ce chiffre. */
  octets: number
}

export type EtatSonde =
  | { etat: 'jamais' }
  | { etat: 'mesure' }
  | { etat: 'ok'; mesure: MesureReseau; a: number }
  | { etat: 'echec'; cause: string }

const [sonde, poserSonde] = createSignal<EtatSonde>({ etat: 'jamais' })
export { sonde }

/** Au-delà, on sait déjà ce qu'on voulait savoir et on rend la liaison. */
const PLAFOND_OCTETS = 3 * 1024 * 1024
const PLAFOND_MS = 1500
/** En deçà, l'échantillon est trop court pour qu'un débit veuille dire quelque chose. */
const PLANCHER_OCTETS = 96 * 1024

let enCours: AbortController | undefined

/**
 * Mesure le débit en chronométrant une vraie réponse du relais, sur la liaison
 * qui sert réellement l'application.
 *
 * Le catalogue des chaînes est choisi comme charge parce qu'il pèse plusieurs
 * mégaoctets — assez pour saturer la liaison — et qu'il n'ouvre AUCUN flux :
 * l'abonnement n'autorise qu'une connexion simultanée, et une sonde qui la
 * consommerait rendrait le lecteur indisponible pour se mesurer lui-même.
 *
 * La lecture s'interrompt dès qu'on en sait assez (3 Mo ou 1,5 s) : si un flux
 * est en cours, la sonde ne lui dispute la bande passante que le temps d'une
 * réponse, pas celui d'un catalogue entier.
 */
export async function mesurerDebit(): Promise<void> {
  enCours?.abort()
  const stop = new AbortController()
  enCours = stop
  poserSonde({ etat: 'mesure' })

  // Le relais comme le navigateur mettent cette réponse en cache ; servie
  // depuis le cache elle mesurerait la vitesse du disque, pas celle du lien.
  // `_sonde` suffit à la casser : le service ignore ce qu'il ne connaît pas,
  // mais le navigateur, lui, voit bien une URL différente.
  const url = urlApi({ action: 'get_live_streams', _sonde: Date.now() })

  const depart = performance.now()
  try {
    const r = await fetch(url, {
      signal: stop.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    })
    if (!r.ok || !r.body) throw new Error(`relais : ${r.status}`)
    const latence = performance.now() - depart

    const lecteur = r.body.getReader()
    const debutCorps = performance.now()
    let octets = 0
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done || value === undefined) break
      octets += value.byteLength
      if (octets >= PLAFOND_OCTETS || performance.now() - debutCorps >= PLAFOND_MS) break
    }
    const duree = performance.now() - debutCorps
    void lecteur.cancel().catch(() => {})

    if (octets < PLANCHER_OCTETS || duree <= 0) {
      poserSonde({ etat: 'echec', cause: 'réponse trop courte pour être mesurée' })
      return
    }
    poserSonde({
      etat: 'ok',
      a: Date.now(),
      mesure: { debit: (octets * 8) / duree / 1000, latence, octets },
    })
  } catch (e) {
    if (stop.signal.aborted) return
    poserSonde({ etat: 'echec', cause: e instanceof Error ? e.message : 'liaison injoignable' })
  } finally {
    if (enCours === stop) enCours = undefined
  }
}

/** « 9,6 Mbit/s » — arrondi à ce que la mesure permet vraiment d'affirmer. */
export function formaterDebit(mbps: number): string {
  if (mbps >= 100) return `${Math.round(mbps)} Mbit/s`
  if (mbps >= 10) return `${mbps.toFixed(0)} Mbit/s`
  return `${mbps.toFixed(1).replace('.', ',')} Mbit/s`
}

/**
 * Libellé réseau en clair, celui que le dossier de conception déplace de la
 * barre vers le panneau technique et l'infobulle du compteur de flux.
 */
export function libelleReseau(): string {
  const base = enLocal() ? 'Domicile' : 'Distant'
  const s = sonde()
  if (s.etat === 'ok') return `${base} · ${formaterDebit(s.mesure.debit)}`
  if (s.etat === 'mesure') return `${base} · mesure…`
  return `${base} · débit non mesuré`
}
