import { json, type SaisonApi } from './api'
import { cheminContenu } from './identifiants'
import { FRAICHEUR, cles, donneePartagee } from './requetes'

/**
 * Saisons d'une serie (`/series/{id}/saisons`), lues une fois par session et
 * partagees entre la fiche, l'enchainement du lecteur (US-43 CA4) et la sonde
 * de la fiche (CA5) : une serie deja ouverte ne redemande rien au service qui
 * pousse peut-etre un flux au meme moment.
 */
export function chargerSaisons(idServeur: string): Promise<SaisonApi[]> {
  return donneePartagee(cles.saisons(idServeur), () => lireSaisons(idServeur), FRAICHEUR.relais, FRAICHEUR.relais)
}

/**
 * L'appel brut, pour une requete d'ecran clefee `cles.saisons(id)` : elle ne
 * doit PAS passer par `chargerSaisons`, qui attendrait la requete en vol sous la
 * meme cle -- c'est-a-dire elle-meme.
 */
export async function lireSaisons(idServeur: string): Promise<SaisonApi[]> {
  return (await json<{ elements: SaisonApi[] }>(`/series/${cheminContenu(idServeur)}/saisons`)).elements
}
