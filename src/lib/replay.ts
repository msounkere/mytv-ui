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

/** Vrai pour l'adresse de lecture d'un replay (`/api/v1/vod/iptva:replay-…`, requete eventuelle). */
export function estLectureReplay(lecture: string): boolean {
  return /\/vod\/[A-Za-z0-9_-]{1,32}:replay-[0-9]+-[0-9]+-[0-9]+(?:[?#]|$)/.test(lecture)
}

/**
 * Position effectivement demandee pour un deplacement dans un replay : la MINUTE entiere
 * inferieure. POURQUOI : le fournisseur ne sait partir que d'une minute pile et sert le
 * replay a peu pres au rythme de la lecture ; le reste (jusqu'a 59 s) devait etre lu puis
 * jete avant la premiere image (mesure du 21/11 : 19 s d'attente pour 22 s de reste,
 * contre 3 s a la minute pile). Mieux vaut repartir un peu avant le point vise, tout de suite.
 */
export function positionReplay(lecture: string, cible: number): number {
  return estLectureReplay(lecture) ? Math.floor(cible / 60) * 60 : cible
}
