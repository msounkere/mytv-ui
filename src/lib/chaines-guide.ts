import { db, type EntreeCatalogue } from './db'
import { epg, type Programme } from './epg'
import { epgIdDe, idServeurDe } from './source-lecture'
import { FRAICHEUR, cles, donneePartagee } from './requetes'

// Les chaines du direct qui ONT un guide, et le programme en cours d'un lot de
// chaines. Avant, la jointure « flux ↔ identifiant XMLTV » etait dans une base
// locale remplie par le worker XMLTV ; elle est maintenant portee par le
// catalogue (`epg_id` de chaque chaine) et le programme vient du serveur.

/**
 * Chaines du direct dont le catalogue annonce un identifiant de guide. Lue UNE
 * fois pour toute l'application (Accueil, Direct, Guide) : le catalogue ne
 * change qu'a l'import.
 */
export function chainesAvecGuide(): Promise<EntreeCatalogue[]> {
  return donneePartagee(
    cles.epgChaines,
    () => db.catalogue.where('type').equals('live').filter((e) => epgIdDe(e) !== undefined).toArray(),
    FRAICHEUR.guide,
  )
}

/**
 * Programme en cours de chaque chaine du lot, par `cle` d'entree. Les chaines
 * sans guide sont ignorees SANS appel ; le reste part en un seul appel de
 * grille (decoupe selon `api.pagination_max`) — jamais un appel par chaine.
 */
export async function programmesEnCours(
  entrees: readonly EntreeCatalogue[],
  signal?: AbortSignal,
): Promise<Map<string, Programme>> {
  const out = new Map<string, Programme>()
  const avecGuide = entrees.filter((e) => epgIdDe(e) !== undefined)
  if (avecGuide.length === 0) return out
  // Un horizon d'une minute : on ne cherche que le programme du moment, ce qui
  // tient dans un seul bloc de la grille.
  const lot = await epg.enCoursPour(avecGuide.map(idServeurDe), signal, 60_000)
  for (const e of avecGuide) {
    const c = lot.get(idServeurDe(e))?.courant
    if (c) out.set(e.cle, c)
  }
  return out
}
