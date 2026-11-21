import type { EntreeCatalogue } from './db'
import type { Programme } from './epg'
import { cheminContenu } from './identifiants'

// Replay (catch-up) d'un programme du guide, lu par le lecteur comme un film.
// Module PUR : il se teste sous node.

/**
 * Un programme se revoit s'il porte un identifiant de replay (le serveur ne le donne
 * qu'aux programmes commences d'une chaine avec replay) et qu'il est TERMINE : un
 * programme en cours s'ouvre en direct, comme avant.
 */
export function revisible(p: Programme, maintenant: number): p is Programme & { replay: string } {
  return !!p.replay && p.fin <= maintenant
}

/**
 * Entree de lecture d'un replay : un « film » hors catalogue, nomme d'apres le
 * programme, avec le logo de la chaine. Sa cle commence par `vod:` comme celle
 * d'un film : le lecteur passe par HEAD puis `?t=` pour se deplacer.
 */
export function entreeReplay(chaine: EntreeCatalogue, p: Programme & { replay: string }): EntreeCatalogue {
  const nom = `${p.titre} · ${chaine.nom}`
  return {
    cle: `vod:${p.replay}`,
    type: 'vod',
    idServeur: p.replay,
    lecture: `/api/v1/vod/${cheminContenu(p.replay)}`,
    id: 0,
    nom,
    recherche: nom.toLowerCase(),
    icone: chaine.icone,
    pays: chaine.pays,
  }
}
