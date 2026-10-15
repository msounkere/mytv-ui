import type { DetailsApi, StatutDetailsApi } from './api'
import type { EntreeCatalogue } from './db'

// Partie PURE des details (US-28) : mise en forme de ce que le service rend, sans
// reseau ni reactivite, donc testable sous node (tests/unit/details.test.ts).

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

/** Au moins un champ a montrer ? Sinon l'ecran dit « pas de resume ». */
export function aDuContenu(d: Details | undefined): boolean {
  return !!d && !!(d.synopsis || d.genre || d.casting || d.realisateur || d.pays || d.sortie || d.bandeAnnonce || d.dureeSecondes || d.note || d.age)
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

/** « 1 h 38 » / « 52 min ». */
export function dureeLongue(secondes: number | undefined): string | undefined {
  if (!secondes || !Number.isFinite(secondes) || secondes <= 0) return undefined
  const min = Math.round(secondes / 60)
  if (min < 60) return `${Math.max(1, min)} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}
