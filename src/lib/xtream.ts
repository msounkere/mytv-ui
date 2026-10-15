import { ErreurLecteur, depuisReponse } from './errors'

// REGLE ABSOLUE (brief, section 05) : cette interface ne parle QU AU RELAIS
// configure. Aucune URL de repli, aucun service tiers, aucun envoi des
// identifiants ailleurs. En l absence de configuration, on echoue franchement.
//
// L'API et le guide passent par le SERVICE, qui y injecte les identifiants du
// relais depuis son `.env`. POURQUOI ce detour : appeles directement, ces deux
// chemins exigeaient que le navigateur connaisse le mot de passe du
// fournisseur -- une injection de script dans la page le lisait alors en
// memoire, il voyageait dans la barre d'adresse de chaque requete, et le relais
// le replaçait dans l'URL de chaque logo, que l'import ecrivait ensuite sur le
// disque du navigateur. Le cookie de session, lui, est `HttpOnly` : aucun
// JavaScript ne le lit, et le navigateur le joint seul.
const RELAIS = '/flux/relais'

/**
 * URL d'un appel a l'API Xtream, relayee. Exportee pour les rares appels qui
 * ont besoin de la reponse brute (la sonde de debit lit un flux d'octets).
 */
export function urlApi(params: Record<string, string | number | undefined>): string {
  const u = new URL(`${RELAIS}/player_api.php`, location.origin)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v))
  return u.toString()
}

/** URL relayee du guide XMLTV complet. */
export const URL_XMLTV = `${RELAIS}/xmltv.php`

export interface Identifiants {
  /** Vide = meme origine que la page, cas nominal en production. */
  base: string
  username: string
  password: string
}

export interface CategorieXtream {
  category_id: string
  category_name: string
  parent_id?: number
}

export interface ChaineXtream {
  stream_id: number
  name: string
  stream_icon?: string
  category_id?: string
  epg_channel_id?: string
  tv_archive?: number
  /** Horodatage Unix en secondes, renseigné sur 100 % du catalogue. */
  added?: string
}

export interface FilmXtream {
  stream_id: number
  name: string
  stream_icon?: string
  category_id?: string
  container_extension?: string
  rating?: string
  /** Horodatage Unix en secondes, renseigné sur 100 % du catalogue. */
  added?: string
}

export interface SerieXtream {
  series_id: number
  name: string
  cover?: string
  category_id?: string
  plot?: string
  rating?: string
  /** Les séries n'ont pas d'`added` : le relais ne publie que `last_modified`. */
  last_modified?: string
  releaseDate?: string
}

export interface EpisodeXtream {
  id: string
  episode_num: number
  title: string
  container_extension: string
  info?: { duration_secs?: number; movie_image?: string; plot?: string }
}

export interface InfosSerie {
  seasons: unknown[]
  info: { name?: string; cover?: string; plot?: string; genre?: string }
  episodes: Record<string, EpisodeXtream[]>
}

export type ActionCatalogue =
  | 'get_short_epg'
  | 'get_simple_data_table'
  | 'get_live_categories'
  | 'get_live_streams'
  | 'get_vod_categories'
  | 'get_vod_streams'
  | 'get_series_categories'
  | 'get_series'
  | 'get_series_info'

/** Aucun identifiant n'est attendu : les identifiants vides du demarrage. */
const SANS_IDENTIFIANTS: Identifiants = { base: '', username: '', password: '' }

export class ClientXtream {
  /**
   * `ids` ne sert PLUS QU'aux URL de lecture (`fluxDirect`, `fluxFilm`,
   * `fluxEpisode`), que le relais exige dans leur chemin. Le catalogue, le
   * guide et les images passent par le service et n'en ont aucun besoin.
   */
  constructor(private readonly ids: Identifiants = SANS_IDENTIFIANTS) {}

  /**
   * Un appel catalogue. Pas de disjoncteur, pas de verdict memorise : chaque
   * appel repart de zero (brief, section 05 — « jamais de disjoncteur silencieux »).
   */
  async appelBrut<T>(
    action: ActionCatalogue,
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.appel<T>(action, params, signal)
  }

  private async appel<T>(
    action: ActionCatalogue | undefined,
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ): Promise<T> {
    const cible = urlApi({ action, ...params })
    let r: Response
    try {
      // `same-origin` et non `omit` : c'est le cookie de session que le service
      // attend, et le navigateur le joint aussi depuis un worker -- un worker
      // de module partage l'origine du document qui l'a cree.
      r = await fetch(cible, { signal, credentials: 'same-origin' })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      throw new ErreurLecteur(
        'reseau',
        'Le relais est injoignable.',
        'Verifier la connexion, puis reessayer.',
        String(e),
      )
    }
    if (!r.ok) throw depuisReponse(r, action ?? 'authentification')
    try {
      return (await r.json()) as T
    } catch {
      throw new ErreurLecteur(
        'donnees',
        'Le relais a renvoye une reponse illisible.',
        'Reessayer ; si cela persiste, verifier la configuration de TuliProx.',
        `reponse non-JSON pour ${action ?? 'auth'}`,
      )
    }
  }

  /** Verifie les identifiants ; renvoie le profil et les limites du compte. */
  authentifier(signal?: AbortSignal) {
    return this.appel<{
      user_info?: { auth?: number; status?: string; max_connections?: string; active_cons?: string }
      server_info?: Record<string, unknown>
    }>(undefined, {}, signal)
  }

  categoriesDirect = (s?: AbortSignal) => this.appel<CategorieXtream[]>('get_live_categories', {}, s)
  categoriesFilms = (s?: AbortSignal) => this.appel<CategorieXtream[]>('get_vod_categories', {}, s)
  categoriesSeries = (s?: AbortSignal) => this.appel<CategorieXtream[]>('get_series_categories', {}, s)

  chaines = (categorie?: string, s?: AbortSignal) =>
    this.appel<ChaineXtream[]>('get_live_streams', { category_id: categorie }, s)
  films = (categorie?: string, s?: AbortSignal) =>
    this.appel<FilmXtream[]>('get_vod_streams', { category_id: categorie }, s)
  series = (categorie?: string, s?: AbortSignal) =>
    this.appel<SerieXtream[]>('get_series', { category_id: categorie }, s)
  infosSerie = (id: number, s?: AbortSignal) =>
    this.appel<InfosSerie>('get_series_info', { series_id: id }, s)

  // ── URL de lecture ───────────────────────────────────────────────────────
  // Toutes servies par le relais en HTTPS : aucune redirection a suivre,
  // aucun contenu mixte possible.
  //
  // SEUL ENDROIT ou les identifiants du relais subsistent cote navigateur. Le
  // relais les exige dans le CHEMIN de ces trois URL, et ce sont elles que
  // `lib/flux.ts` donne au lecteur quand la source est lisible telle quelle --
  // zero processeur, un saut de moins, et c'est ce choix qui evite de sonder le
  // direct, donc de depenser la connexion unique du fournisseur a chaque zap.
  // Les fermer suppose de changer cette decision de lecture, qui ne se decide
  // pas ici (voir le compte rendu).

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

/**
 * Les libelles arrivent prefixes par le pays : « FR - TF1 », « |EU| Canal+ ».
 * Le brief demande de traiter le pays comme une etiquette distincte.
 */
const PREFIXE = /^\s*(?:\|([A-Z]{2,4})\||([A-Z]{2,4})\s*[-:])\s*/

export function separerPrefixe(nom: string): { pays?: string; titre: string } {
  const m = PREFIXE.exec(nom)
  if (!m) return { titre: nom.trim() }
  return { pays: m[1] ?? m[2], titre: nom.slice(m[0].length).trim() }
}

/**
 * Les navigateurs ne decodent pas EAC3 : le brief impose de l anticiper plutot
 * que d echouer en lecture.
 */
const AUDIO_NON_LISIBLE = /^(eac3|ac3|dts|truehd)$/i

export function audioLisible(codec: string | undefined): boolean {
  return !codec || !AUDIO_NON_LISIBLE.test(codec.trim())
}
