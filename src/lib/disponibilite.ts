import { createEffect, createMemo, createSignal, on } from 'solid-js'
import { json } from './api'
import { cheminContenu, cleDe, estIdentifiantEpisode } from './identifiants'
import { cles, requeteClefee, type Donnee } from './requetes'
import { estPret } from './a-voir-serveur'
import type { Disponibilite } from './ma-liste-regles'

// Sonde de disponibilite d'un film ou d'un episode (US-42 CA6, US-43 CA5) :
// « sera-t-il fluide ? ». Le serveur lit trois morceaux du fichier par trois
// connexions SEQUENTIELLES chez un fournisseur qui n'en tolere qu'une : la
// sonde ne part donc QU'A L'OUVERTURE d'une fiche, et SEULEMENT si aucune
// lecture n'est en cours a cet instant -- jamais pendant qu'on regarde, et pas
// non plus quand la lecture s'arrete ensuite sous la fiche deja ouverte.
//
// Lot 10 (US-46 CA7) : le resultat garde 10 min est INVALIDE par l'etat
// « Prêt » (C10) -- un fichier que le serveur tient repond « Prêt » sans
// resonder, quoi que la mesure d'avant ait dit.

/** Le serveur garde sa mesure 10 min : l'interface aussi. */
export const FRAICHEUR_SONDE = 10 * 60_000

const PRET: Disponibilite = { etat: 'pret', debit_kbps: 0 }

export function sonder(idServeur: string): Promise<Disponibilite> {
  return json<Disponibilite>(`/vod/${cheminContenu(idServeur)}/disponibilite`)
}

/** Cle locale du contenu sonde : un episode est toujours `series:`, un film `vod:`. */
function cleLocale(id: string): string {
  return estIdentifiantEpisode(id) ? cleDe('series', id) : cleDe('vod', id)
}

/**
 * @param id identifiant serveur du film ou de l'episode affiche
 * @param autorisee vrai quand aucune lecture n'est en cours (lu a l'ouverture seulement)
 */
export function useDisponibilite(id: () => string | undefined, autorisee: () => boolean): Donnee<Disponibilite> {
  const [cible, poserCible] = createSignal<string | undefined>()
  // `on(id)` : la decision est prise quand la cible change (l'ouverture), pas
  // quand la lecture en cours change. Un contenu deja pret n'est jamais sonde.
  createEffect(on(id, (v) => poserCible(v && autorisee() && !estPret(cleLocale(v)) ? v : undefined)))
  const [donnee] = requeteClefee<string, Disponibilite>(
    (i) => cles.disponibilite(i),
    cible,
    sonder,
    { fraicheur: FRAICHEUR_SONDE, peremption: FRAICHEUR_SONDE, reessais: 0, suspendre: false },
  )
  const pret = createMemo(() => {
    const v = id()
    return v !== undefined && estPret(cleLocale(v))
  })
  const acces = (() => (pret() ? PRET : donnee())) as Donnee<Disponibilite>
  Object.defineProperties(acces, {
    loading: { get: () => !pret() && donnee.loading },
    error: { get: () => (pret() ? undefined : donnee.error) },
  })
  return acces
}
