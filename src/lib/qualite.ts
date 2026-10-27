// Mode economie (US-38 CA4) : « Qualite : Auto / Eco ». En Eco, chaque ouverture
// (direct ou film) porte `qualite=eco` en requete ET `X-Mytv-Qualite: eco` en
// en-tete (contrat US-38 CA1-CA2) : le serveur reencode alors a 480p / 1,2 Mbit/s,
// ce qu'une liaison a 3-5 Mbit/s avale sans blocage la ou un flux HD a 5,4 Mbit/s
// ne passe pas (lot 7, constats). Le reglage est memorise par appareil.
//
// La RECOMMANDATION « Passer en Eco ? » est une regle pure : la mediane glissante
// du debit mesure sur 5 segments reste sous 1,5 fois le debit du flux pendant
// 30 s, et on ne le propose qu'une fois par lecture.

import { createSignal } from 'solid-js'

export type ModeQualite = 'auto' | 'eco'

export const ENTETE_QUALITE = 'X-Mytv-Qualite'
export const PARAMETRE_QUALITE = 'qualite'
const CLE = 'mytv.qualite'

export function lireQualiteMemorisee(brut: string | null | undefined): ModeQualite {
  return brut === 'eco' ? 'eco' : 'auto'
}

function lire(): ModeQualite {
  try {
    return lireQualiteMemorisee(localStorage.getItem(CLE))
  } catch {
    return 'auto'
  }
}

const [qualite, poserQualiteInterne] = createSignal<ModeQualite>(lire())
export { qualite }

export function choisirQualite(q: ModeQualite): void {
  poserQualiteInterne(q)
  try {
    localStorage.setItem(CLE, q)
  } catch {
    /* mode prive : vaut pour la session */
  }
}

export const LIBELLE_QUALITE_MODE: Record<ModeQualite, string> = { auto: 'Auto', eco: 'Éco' }

/** Ajoute `qualite=eco` ; en Auto, retire un eventuel parametre et laisse l'adresse telle quelle. */
export function urlAvecQualite(url: string, q: ModeQualite): string {
  const [chemin = '', requete = ''] = url.split('?', 2)
  const p = requete ? requete.split('&').filter((x) => x && !x.startsWith(PARAMETRE_QUALITE + '=')) : []
  if (q === 'eco') p.push(`${PARAMETRE_QUALITE}=eco`)
  return p.length ? `${chemin}?${p.join('&')}` : chemin
}

/** En-tetes a joindre aux requetes du lecteur (segments compris). */
export function entetesQualite(q: ModeQualite): Record<string, string> {
  return q === 'eco' ? { [ENTETE_QUALITE]: 'eco' } : {}
}

// --- Regle « Passer en Eco ? » ----------------------------------------------

export const FACTEUR_ECO = 1.5
export const DUREE_ECO_MS = 30_000
export const TAILLE_FENETRE_ECO = 5

export interface EchantillonDebit {
  /** Millisecondes. */
  t: number
  /** Debit mesure par hls.js sur ce segment, kbit/s. */
  debitKbps: number
  /** Debit propre du flux (octets du segment / sa duree), kbit/s. */
  fluxKbps: number
}

export interface EtatEco {
  fenetre: EchantillonDebit[]
  /** Depuis quand la mediane est sous le seuil ; indefini sinon. */
  depuis?: number
  /** Deja propose pendant cette lecture : un seul rappel. */
  rappele: boolean
}

export const ETAT_ECO_INITIAL: EtatEco = { fenetre: [], rappele: false }

function mediane(xs: number[]): number {
  const t = [...xs].sort((a, b) => a - b)
  const m = Math.floor(t.length / 2)
  return t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2
}

/** Debit propre d'un segment : `octets` sur `dureeMediaS` secondes de video, en kbit/s. */
export function fluxKbpsDe(octets: number, dureeMediaS: number): number | undefined {
  if (!(octets > 0) || !(dureeMediaS > 0)) return undefined
  return Math.round((octets * 8) / dureeMediaS / 1000)
}

/**
 * Un echantillon de plus. `recommander` est vrai UNE fois : quand la mediane des
 * 5 derniers debits mesures est restee sous 1,5 x la mediane des debits du flux
 * pendant 30 s. Un retour au-dessus du seuil remet le chronometre a zero (sans
 * rendre le rappel). Pure.
 */
export function evaluerEco(etat: EtatEco, e: EchantillonDebit): { etat: EtatEco; recommander: boolean } {
  const fenetre = [...etat.fenetre, e].slice(-TAILLE_FENETRE_ECO)
  if (fenetre.length < TAILLE_FENETRE_ECO) return { etat: { ...etat, fenetre }, recommander: false }
  const mesure = mediane(fenetre.map((x) => x.debitKbps))
  const flux = mediane(fenetre.map((x) => x.fluxKbps))
  const juste = flux > 0 && mesure < FACTEUR_ECO * flux
  if (!juste) return { etat: { ...etat, fenetre, depuis: undefined }, recommander: false }
  const depuis = etat.depuis ?? e.t
  const assezLong = e.t - depuis >= DUREE_ECO_MS
  if (assezLong && !etat.rappele) return { etat: { fenetre, depuis, rappele: true }, recommander: true }
  return { etat: { ...etat, fenetre, depuis }, recommander: false }
}

export const MESSAGE_ECO = 'Liaison trop juste pour ce flux — passer en qualité Éco ?'
