import type { EntreeCatalogue } from './db'
import { cheminContenu } from './identifiants'

// UN SEUL point de contact entre la lecture/l'EPG et la forme de l'entree du
// catalogue : ce que les routes /live, /vod et /epg attendent (identifiant
// `fournisseur:numero`, adresse de lecture relative, identifiant de guide). Si
// l'entree change de forme, c'est ce fichier — et lui seul — qu'on ajuste.

export type EntreeLisible = Pick<EntreeCatalogue, 'type' | 'idServeur' | 'lecture' | 'epgId'>

const PREFIXE_API = '/api/v1'

/** Identifiant a donner a l'API pour ce contenu. */
export function idServeurDe(e: EntreeLisible): string {
  return e.idServeur
}

/**
 * Adresse de lecture RELATIVE. Une adresse imposee (episode) prime sur celle de
 * l'entree. Reconstruite en dernier recours seulement : le serveur reste maitre
 * de ses adresses, on ne fabrique celle-ci que si l'entree n'en porte pas.
 */
export function lectureDe(e: EntreeLisible, imposee?: string): string {
  if (imposee) return imposee
  if (e.lecture) return e.lecture
  const id = idServeurDe(e)
  if (e.type === 'live') return `${PREFIXE_API}/live/${numeroDe(id)}.m3u8`
  return `${PREFIXE_API}/vod/${cheminContenu(id)}`
}

/** `iptva:845410` → `845410` ; un identifiant sans fournisseur reste tel quel. */
export function numeroDe(id: string): string {
  const i = id.lastIndexOf(':')
  return i < 0 ? id : id.slice(i + 1)
}

/**
 * Numero de chaine d'une adresse `/api/v1/live/845410.m3u8` : c'est le segment
 * `{chaine}` de `/live/{chaine}/fin`. Indefini si l'adresse n'est pas celle d'un
 * direct.
 */
export function chaineDeLecture(lecture: string): string | undefined {
  const m = /\/live\/([A-Za-z0-9_-]{1,64})\.m3u8(?:[?#]|$)/.exec(lecture)
  return m?.[1]
}

/** Vrai pour une adresse de direct (playlist HLS). */
export function estDirect(lecture: string): boolean {
  return chaineDeLecture(lecture) !== undefined
}

/** Identifiant EPG de la chaine, ou rien quand elle n'a pas de guide. */
export function epgIdDe(e: EntreeLisible): string | undefined {
  return e.epgId ? e.epgId : undefined
}
