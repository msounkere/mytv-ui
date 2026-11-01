import { createEffect, createSignal, on } from 'solid-js'
import { json } from './api'
import { cheminContenu } from './identifiants'
import { cles, requeteClefee, type Donnee } from './requetes'
import type { Disponibilite } from './a-voir-regles'

// Sonde de disponibilite d'un film ou d'un episode (US-42 CA6, US-43 CA5) :
// « sera-t-il fluide ? ». Le serveur lit trois morceaux du fichier par trois
// connexions SEQUENTIELLES chez un fournisseur qui n'en tolere qu'une : la
// sonde ne part donc QU'A L'OUVERTURE d'une fiche, et SEULEMENT si aucune
// lecture n'est en cours a cet instant -- jamais pendant qu'on regarde, et pas
// non plus quand la lecture s'arrete ensuite sous la fiche deja ouverte.

/** Le serveur garde sa mesure 10 min : l'interface aussi. */
export const FRAICHEUR_SONDE = 10 * 60_000

export function sonder(idServeur: string): Promise<Disponibilite> {
  return json<Disponibilite>(`/vod/${cheminContenu(idServeur)}/disponibilite`)
}

/**
 * @param id identifiant serveur du film ou de l'episode affiche
 * @param autorisee vrai quand aucune lecture n'est en cours (lu a l'ouverture seulement)
 */
export function useDisponibilite(id: () => string | undefined, autorisee: () => boolean): Donnee<Disponibilite> {
  const [cible, poserCible] = createSignal<string | undefined>()
  // `on(id)` : la decision est prise quand la cible change (l'ouverture), pas
  // quand la lecture en cours change.
  createEffect(on(id, (v) => poserCible(v && autorisee() ? v : undefined)))
  const [donnee] = requeteClefee<string, Disponibilite>(
    (i) => cles.disponibilite(i),
    cible,
    sonder,
    { fraicheur: FRAICHEUR_SONDE, peremption: FRAICHEUR_SONDE, reessais: 0, suspendre: false },
  )
  return donnee
}
