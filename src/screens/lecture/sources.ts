import { ClientXtream } from '../../lib/xtream'
import { config } from '../../config'
import type { EntreeCatalogue } from '../../lib/db'

// Ce que le lecteur donne au navigateur, et ce qu'il en montre : deux fonctions
// pures, parce qu'une URL de flux ne dépend que de l'entrée — jamais de l'état
// du lecteur.

/**
 * URL TuliProx, sans intermédiaire. Elle reste la référence : c'est elle qu'on
 * donne au téléviseur, qui décode nativement, et c'est sur elle qu'on retombe
 * quand le service de remux est muet.
 *
 * `forcee` n'est renseignée que pour un épisode de série, dont l'identifiant de
 * flux n'est pas celui du catalogue.
 */
export function urlDirecte(e: EntreeCatalogue, forcee?: string): string {
  if (forcee) return forcee
  const c = new ClientXtream(config())
  if (e.type === 'live') return c.fluxDirect(e.id)
  return c.fluxFilm(e.id, e.extension ?? 'mp4')
}

/**
 * L'URL est affichée pour diagnostiquer : le mot de passe du relais n'y a pas
 * sa place, il est au même rang que les identifiants des Réglages.
 */
export function urlMasquee(brute: string): string {
  try {
    const u = new URL(brute, location.origin)
    const parts = u.pathname.split('/')
    // Les URL du service ne portent aucun identifiant : rien n'y est à cacher.
    if (parts[1] !== 'flux' && parts.length >= 4) parts[3] = '•••'
    return u.host + parts.join('/') + (u.search || '')
  } catch {
    return ''
  }
}
