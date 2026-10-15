import { ErreurLecteur, depuisReponse } from './errors'

// ============================================================================
// RELIQUAT DE L'ANCIENNE API (TuliProx) -- A SUPPRIMER PAR US-20 / US-21.
//
// US-19 a remplace tout ce qui relevait de la couche de donnees : catalogue,
// categories, authentification et fiches vont desormais a `/api/v1` (voir
// api.ts). Ne subsistent ici QUE les appels que l'EPG (epg.ts, xmltv.worker.ts,
// zapping.ts) et la lecture (screens/lecture/sources.ts) utilisent encore, et
// qui appartiennent a ces deux US. Ils pointent sur des routes qui n'existent
// plus : ils sont gardes pour que le build reste vert, pas pour fonctionner.
// ============================================================================

const RELAIS = '/flux/relais'

/** URL d'un appel a l'ancienne API Xtream (EPG court). */
export function urlApi(params: Record<string, string | number | undefined>): string {
  const u = new URL(`${RELAIS}/player_api.php`, location.origin)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v))
  return u.toString()
}

/** URL du guide XMLTV complet (ancienne API). */
export const URL_XMLTV = `${RELAIS}/xmltv.php`

export interface Identifiants {
  base: string
  username: string
  password: string
}

export interface ChaineXtream {
  stream_id: number
  name: string
  stream_icon?: string
  category_id?: string
  epg_channel_id?: string
  tv_archive?: number
  added?: string
}

export type ActionCatalogue = 'get_short_epg' | 'get_simple_data_table' | 'get_live_streams'

const SANS_IDENTIFIANTS: Identifiants = { base: '', username: '', password: '' }

export class ClientXtream {
  constructor(private readonly ids: Identifiants = SANS_IDENTIFIANTS) {}

  async appelBrut<T>(
    action: ActionCatalogue,
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    const cible = urlApi({ action, ...params })
    let r: Response
    try {
      r = await fetch(cible, { signal, credentials: 'same-origin' })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      throw new ErreurLecteur('reseau', 'Le relais est injoignable.', 'Verifier la connexion, puis reessayer.', String(e))
    }
    if (!r.ok) throw depuisReponse(r, action)
    return (await r.json()) as T
  }

  chaines = (categorie?: string, s?: AbortSignal) =>
    this.appelBrut<ChaineXtream[]>('get_live_streams', { category_id: categorie }, s)

  fluxDirect(streamId: number): string {
    return this.chemin(`/live/${this.enc(this.ids.username)}/${this.enc(this.ids.password)}/${streamId}.m3u8`)
  }

  fluxFilm(streamId: number, extension = 'mp4'): string {
    return this.chemin(`/movie/${this.enc(this.ids.username)}/${this.enc(this.ids.password)}/${streamId}.${extension}`)
  }

  fluxEpisode(episodeId: string, extension = 'mp4'): string {
    return this.chemin(`/series/${this.enc(this.ids.username)}/${this.enc(this.ids.password)}/${episodeId}.${extension}`)
  }

  private chemin(p: string): string {
    return this.ids.base ? new URL(p, this.ids.base).toString() : p
  }

  private enc = (v: string) => encodeURIComponent(v)
}
