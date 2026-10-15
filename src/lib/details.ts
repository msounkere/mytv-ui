import { createEffect, createSignal, onCleanup } from 'solid-js'
import { ErreurApi, json, type FilmDetailApi, type SerieDetailApi } from './api'
import { versDetails, type CibleDetails, type Details } from './details-donnees'
import { cheminContenu } from './identifiants'
import { FRAICHEUR, cles, requeteClefee, type Donnee, type Relance } from './requetes'

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

/** Le service n'a pas pu donner de details (panne, coupe-circuit, delai). */
export class DetailsIndisponibles extends Error {
  constructor() {
    super('Details momentanement indisponibles')
    this.name = 'DetailsIndisponibles'
  }
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
    // Donnee secondaire : sa lenteur ne doit jamais masquer la fiche (voir `suspendre`).
    { fraicheur: FRAICHEUR.details, peremption: FRAICHEUR.details, reessais: 0, suspendre: false },
  )
}


export { aDuContenu, cibleDe, dureeLongue, versDetails, type CibleDetails, type Details } from './details-donnees'
