// Decision d'import du catalogue : pure, donc testable sans reseau ni base.
//
// L'etat persistant d'un import est ecrit dans IndexedDB par le worker
// (`catalogue.import`). Ce module ne fait que LIRE cet etat et dire quoi faire.

export type TypeExport = 'categories' | 'live' | 'vod' | 'series'

export const ORDRE_EXPORTS: readonly TypeExport[] = ['categories', 'live', 'vod', 'series']

/** Ce que la base locale sait de l'import precedent. */
export interface EtatImport {
  /** Version (ETag) du catalogue actuellement COMPLET en base, si elle l'est. */
  versionComplete?: string
  /** Import interrompu : version visee et exports deja termines pour elle. */
  enCours?: { version: string; faits: TypeExport[] }
}

export interface Manifeste {
  version: string
}

export type Decision =
  /** Le catalogue local est a jour : AUCUNE requete de donnees. */
  | { action: 'rien' }
  /** A faire : ces exports, pour cette version (les autres sont deja en base). */
  | { action: 'importer'; version: string; restants: TypeExport[]; reprise: boolean }

/**
 * `force` : l'utilisateur demande un reimport complet (bouton des Reglages),
 * meme si la version n'a pas change -- par exemple apres une base locale
 * suspecte.
 */
export function decider(etat: EtatImport, manifeste: Manifeste, force = false): Decision {
  if (!force && etat.versionComplete === manifeste.version) return { action: 'rien' }
  const reprise =
    !force && etat.enCours !== undefined && etat.enCours.version === manifeste.version
  const faits = reprise ? new Set(etat.enCours!.faits) : new Set<TypeExport>()
  // Les categories sont toujours reprises : elles sont petites, et leurs
  // compteurs se calculent avec les types (voir import-catalogue.ts).
  const restants = ORDRE_EXPORTS.filter((t) => t === 'categories' || !faits.has(t))
  return { action: 'importer', version: manifeste.version, restants, reprise }
}

/** Part d'avancement (0..1) apres `fait` lignes sur `total`, bornee. */
export function partAvancement(fait: number, total: number): number {
  if (!(total > 0)) return 0
  return Math.max(0, Math.min(1, fait / total))
}

/** Delai avant le nouvel essai `n` (0 = premier retry) : exponentiel, plafonne. */
export function delaiRetry(n: number, base = 500, plafond = 8000): number {
  return Math.min(plafond, base * 2 ** n)
}
