// Test actif d'une chaine (US-39 CA4) : « Tester cette chaine » enchaine les
// variantes UNE par UNE — jamais deux flux, l'abonnement n'en accorde qu'un —
// avec pour chacune UNE playlist et UN segment, et note latence et debit. Le
// lecteur a ferme son flux avant d'appeler ceci ; le resultat vaut 24 h.
//
// Si le serveur repond « compte_utilise_par_mytv » (une autre fenetre lit),
// ou toute autre occupation, le test s'arrete la : il ne disputera pas la
// place a quelqu'un qui regarde.

import { estOccupation } from './errors'
import type { Qualite } from './variantes'

export interface VarianteATester {
  cle: string
  nom: string
  qualite: Qualite
  /** Adresse de la playlist, telle que le lecteur l'ouvrirait (capacites comprises). */
  url: string
}

export interface ResultatVariante {
  cle: string
  nom: string
  qualite: Qualite
  /** Temps jusqu'aux en-tetes de la playlist, ms. */
  latenceMs?: number
  /** Debit du telechargement du premier segment, kbit/s. */
  debitKbps?: number
  octets?: number
  /** Duree du telechargement du segment, ms. */
  dureeMs?: number
  erreur?: string
  /** Code stable du serveur (`X-Mytv-Erreur`), quand il y en a un. */
  code?: string
}

export interface ResultatTest {
  /** Millisecondes du test. */
  a: number
  resultats: ResultatVariante[]
  /** Code d'occupation qui a interrompu le test. */
  refus?: string
}

export const DUREE_RESULTAT_MS = 24 * 3_600_000
const PREFIXE = 'mytv.test-chaine.'

/** Premiere adresse de segment d'une playlist (ligne non vide hors `#`), resolue contre celle de la playlist. */
export function premierSegment(playlist: string, base: string): string | undefined {
  for (const brute of playlist.split(/\r?\n/)) {
    const ligne = brute.trim()
    if (!ligne || ligne.startsWith('#')) continue
    try {
      return new URL(ligne, new URL(base, 'http://mytv.local/')).pathname + (ligne.includes('?') ? ligne.slice(ligne.indexOf('?')) : '')
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Resultat memorise encore valable (24 h), ou rien. Pur. */
export function resultatValide(brut: string | null | undefined, maintenant: number): ResultatTest | undefined {
  if (!brut) return undefined
  try {
    const r = JSON.parse(brut) as ResultatTest
    if (typeof r.a !== 'number' || !Array.isArray(r.resultats)) return undefined
    if (maintenant - r.a < 0 || maintenant - r.a >= DUREE_RESULTAT_MS) return undefined
    return r
  } catch {
    return undefined
  }
}

export function lireResultat(groupe: string, maintenant = Date.now()): ResultatTest | undefined {
  try {
    return resultatValide(localStorage.getItem(PREFIXE + groupe), maintenant)
  } catch {
    return undefined
  }
}

export function ecrireResultat(groupe: string, r: ResultatTest): void {
  try {
    localStorage.setItem(PREFIXE + groupe, JSON.stringify(r))
  } catch {
    /* confort seulement */
  }
}

export interface OptionsTest {
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  /** En-tetes a joindre (capacites, qualite). */
  entetes?: Record<string, string>
  maintenant?: () => number
  /** Appele apres chaque variante, avec les resultats acquis. */
  surProgres?: (resultats: ResultatVariante[]) => void
}

/**
 * Teste les variantes dans l'ordre donne, strictement l'une apres l'autre.
 * Jamais plus d'une requete en vol.
 */
export async function testerVariantes(variantes: readonly VarianteATester[], opts: OptionsTest = {}): Promise<ResultatTest> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const maintenant = opts.maintenant ?? (() => performance.now())
  const init: RequestInit = { credentials: 'same-origin', cache: 'no-store', headers: opts.entetes ?? {}, signal: opts.signal }
  const resultats: ResultatVariante[] = []
  let refus: string | undefined
  for (const v of variantes) {
    const r: ResultatVariante = { cle: v.cle, nom: v.nom, qualite: v.qualite }
    resultats.push(r)
    try {
      const t0 = maintenant()
      const rp = await fetchImpl(v.url, init)
      r.latenceMs = Math.round(maintenant() - t0)
      if (!rp.ok) {
        r.code = rp.headers.get('X-Mytv-Erreur') ?? undefined
        r.erreur = `HTTP ${rp.status}`
        if (estOccupation({ code: r.code })) {
          refus = r.code
          break
        }
        continue
      }
      const seg = premierSegment(await rp.text(), v.url)
      if (!seg) {
        r.erreur = 'playlist sans segment'
        continue
      }
      const t1 = maintenant()
      const rs = await fetchImpl(seg, init)
      if (!rs.ok) {
        r.code = rs.headers.get('X-Mytv-Erreur') ?? undefined
        r.erreur = `segment HTTP ${rs.status}`
        if (estOccupation({ code: r.code })) {
          refus = r.code
          break
        }
        continue
      }
      const corps = await rs.arrayBuffer()
      const duree = Math.max(1, maintenant() - t1)
      r.octets = corps.byteLength
      r.dureeMs = Math.round(duree)
      r.debitKbps = Math.round((corps.byteLength * 8) / duree)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      r.erreur = 'injoignable'
    } finally {
      opts.surProgres?.([...resultats])
    }
  }
  return { a: Date.now(), resultats, refus }
}
