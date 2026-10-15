import { createEffect, createSignal, onCleanup } from 'solid-js'
import { ErreurApi, json, type DetailsApi, type FilmDetailApi, type SerieDetailApi, type StatutDetailsApi } from './api'
import { cheminContenu } from './identifiants'
import { FRAICHEUR, cles, requeteClefee, type Donnee, type Relance } from './requetes'
import type { EntreeCatalogue } from './db'

// Details d'un film ou d'une serie (synopsis, genre, duree, casting, realisateur,
// bande-annonce, image de fond, date de sortie) : US-28.
//
// POURQUOI ils ne sont PAS dans le catalogue importe : le fournisseur ne les donne
// que contenu par contenu (get_vod_info / get_series_info), et chaque appel pese
// sur son serveur. L'interface ne les demande donc QUE pour le contenu qu'elle
// affiche en grand -- l'encart « A la une », une fiche ouverte -- jamais pour une
// carte d'une liste. Le service decide s'il appelle le fournisseur ou s'il sert son
// cache (30 jours) et ne fait jamais echouer la fiche : en cas de panne il rend les
// champs de la liste avec un statut.

/** Ce que les ecrans affichent. Tout est facultatif : un champ absent se masque. */
export interface Details {
  statut: StatutDetailsApi
  synopsis?: string
  genre?: string
  casting?: string
  realisateur?: string
  pays?: string
  /** Annee de sortie (4 chiffres), tiree de la date du fournisseur. */
  annee?: string
  /** Date de sortie telle que le fournisseur l'ecrit. */
  sortie?: string
  bandeAnnonce?: string
  fond?: string
  affiche?: string
  note?: number
  age?: string
  dureeSecondes?: number
}

/** Adresses de bande-annonce acceptees : YouTube en https, rien d'autre ne devient un lien. */
const BANDE_ANNONCE = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/

/** Texte du fournisseur : espaces normalises, vide -> absent. */
function texte(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.replace(/\s+/g, ' ').trim()
  return t === '' ? undefined : t
}

function nombre(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
}

/** Adresse d'image : http(s) ou chemin du service (proxy d'images), jamais autre chose. */
function image(v: unknown): string | undefined {
  const t = texte(v)
  return t && /^(https?:\/\/|\/api\/v1\/image\/)/.test(t) ? t : undefined
}

export function versDetails(statut: StatutDetailsApi | undefined, d: DetailsApi | undefined): Details {
  const sortie = texte(d?.sortie)
  const annee = sortie ? /(?:19|20)\d{2}/.exec(sortie)?.[0] : undefined
  const bande = texte(d?.bande_annonce)
  return {
    statut: statut ?? 'absent',
    synopsis: texte(d?.synopsis),
    genre: texte(d?.genre),
    casting: texte(d?.casting),
    realisateur: texte(d?.realisateur),
    pays: texte(d?.pays),
    sortie,
    annee,
    bandeAnnonce: bande && BANDE_ANNONCE.test(bande) ? bande : undefined,
    fond: image(d?.image_fond),
    affiche: image(d?.affiche),
    note: nombre(d?.note),
    age: texte(d?.age),
    dureeSecondes: nombre(d?.duree) ?? nombre(d?.duree_episode),
  }
}

/** Le service n'a pas pu donner de details (panne, coupe-circuit, delai). */
export class DetailsIndisponibles extends Error {
  constructor() {
    super('Details momentanement indisponibles')
    this.name = 'DetailsIndisponibles'
  }
}

/** Au moins un champ a montrer ? Sinon l'ecran dit « pas de resume ». */
export function aDuContenu(d: Details | undefined): boolean {
  return !!d && !!(d.synopsis || d.genre || d.casting || d.realisateur || d.pays || d.sortie || d.bandeAnnonce || d.dureeSecondes || d.note || d.age)
}

export async function chargerDetails(type: 'vod' | 'series', idServeur: string): Promise<Details> {
  const chemin = type === 'series' ? `/series/${cheminContenu(idServeur)}` : `/films/${cheminContenu(idServeur)}`
  try {
    const r = await json<FilmDetailApi | SerieDetailApi>(chemin)
    // « indisponible » n'est PAS memorise comme une donnee : lever fait de l'echec un
    // etat d'erreur, que le cache relance a la prochaine ouverture.
    if (r.details_statut === 'indisponible') throw new DetailsIndisponibles()
    return versDetails(r.details_statut, r.details)
  } catch (e) {
    if (e instanceof ErreurApi && e.statut === 404) return versDetails('absent', undefined)
    throw e
  }
}

/** Contenu dont on veut les details : films et series seulement. */
export interface CibleDetails {
  type: 'vod' | 'series'
  idServeur: string
}

export function cibleDe(e: EntreeCatalogue | null | undefined): CibleDetails | undefined {
  if (!e || (e.type !== 'vod' && e.type !== 'series')) return undefined
  // Un episode n'a pas de details propres : les siens viennent des saisons.
  if (/\.[A-Za-z0-9]+$/.test(e.idServeur.slice(e.idServeur.indexOf(':') + 1))) return undefined
  return { type: e.type, idServeur: e.idServeur }
}

/**
 * Details du contenu donne, demandes A L'OUVERTURE (a l'affichage du composant qui
 * l'appelle) et mis en cache par identifiant.
 *
 * `delaiMs` > 0 : la demande ne part que si la cible reste la meme ce temps-la. C'est
 * pour le carrousel « A la une », ou un clic rapide sur les pastilles ferait sinon
 * une rafale de demandes pour des contenus qu'on ne regarde pas.
 */
export function useDetails(cible: () => CibleDetails | undefined, delaiMs = 0): [Donnee<Details>, Relance] {
  const [stable, poserStable] = createSignal<CibleDetails | undefined>(delaiMs > 0 ? undefined : cible())
  createEffect(() => {
    const c = cible()
    if (delaiMs <= 0) return poserStable(c)
    const t = setTimeout(() => poserStable(c), delaiMs)
    onCleanup(() => clearTimeout(t))
  })
  return requeteClefee<CibleDetails, Details>(
    (c) => cles.details(c.idServeur),
    () => {
      // Pendant l'attente, la cible affichee n'est plus la cible stabilisee : rien ne part.
      const c = cible()
      const s = stable()
      return c && s && c.idServeur === s.idServeur ? s : undefined
    },
    (c) => chargerDetails(c.type, c.idServeur),
    { fraicheur: FRAICHEUR.details, peremption: FRAICHEUR.details, reessais: 0 },
  )
}

/** « 1 h 38 » / « 52 min ». */
export function dureeLongue(secondes: number | undefined): string | undefined {
  if (!secondes || !Number.isFinite(secondes) || secondes <= 0) return undefined
  const min = Math.round(secondes / 60)
  if (min < 60) return `${Math.max(1, min)} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}
