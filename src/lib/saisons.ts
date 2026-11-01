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
  return donneePartagee(
    cles.saisons(idServeur),
    async () => (await json<{ elements: SaisonApi[] }>(`/series/${cheminContenu(idServeur)}/saisons`)).elements,
    FRAICHEUR.relais,
    FRAICHEUR.relais,
  )
}
