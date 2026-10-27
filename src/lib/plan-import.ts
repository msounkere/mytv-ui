// Decision d'import du catalogue : pure, donc testable sans reseau ni base.
//
// L'etat persistant d'un import est ecrit dans IndexedDB par le worker
// (`catalogue.import`). Ce module ne fait que LIRE cet etat et dire quoi faire.

export type TypeExport = 'categories' | 'live' | 'vod' | 'series'

export const ORDRE_EXPORTS: readonly TypeExport[] = ['categories', 'live', 'vod', 'series']

/**
 * `complet` : chaque type est retelecharge en entier ; `difference` : le serveur
 * n'envoie que ce qui a change depuis la version deja en base (US-36).
 */
export type ModeImport = 'complet' | 'difference'

/** Ce que la base locale sait de l'import precedent. */
export interface EtatImport {
  /** Version (ETag) du catalogue actuellement COMPLET en base, si elle l'est. */
  versionComplete?: string
  /**
   * Import interrompu : version visee et exports deja termines pour elle.
   * `depuis` : l'import en cours etait une difference depuis cette version
   * (la base est entre les deux versions ; la reprise redemande la meme
   * difference, idempotente).
   */
  enCours?: { version: string; faits: TypeExport[]; depuis?: string }
}

export interface Manifeste {
  version: string
}

export interface OptionsDecision {
  /**
   * L'utilisateur demande un reimport complet (bouton des Reglages), meme si la
   * version n'a pas change -- par exemple apres une base locale suspecte.
   */
  force?: boolean
  /**
   * Le serveur vient de refuser la difference (`409 version_inconnue` : version
   * trop ancienne, ou logos du guide changes) : on repart en complet.
   */
  sansDifference?: boolean
}

export type Decision =
  /** Le catalogue local est a jour : AUCUNE requete de donnees. */
  | { action: 'rien' }
  /** A faire : ces exports, pour cette version (les autres sont deja en base). */
  | {
      action: 'importer'
      version: string
      restants: TypeExport[]
      reprise: boolean
      mode: ModeImport
      /** Mode difference : la version deja en base, a passer en `depuis=`. */
      depuis?: string
    }

export function decider(
  etat: EtatImport,
  manifeste: Manifeste,
  options: boolean | OptionsDecision = {},
): Decision {
  const o = typeof options === 'boolean' ? { force: options } : options
  const force = o.force === true
  if (!force && etat.versionComplete === manifeste.version) return { action: 'rien' }
  const reprise =
    !force && etat.enCours !== undefined && etat.enCours.version === manifeste.version
  const faits = reprise ? new Set(etat.enCours!.faits) : new Set<TypeExport>()
  // Les categories sont toujours reprises : elles sont petites, et leurs
  // compteurs se calculent avec les types (voir import-catalogue.ts).
  const restants = ORDRE_EXPORTS.filter((t) => t === 'categories' || !faits.has(t))
  // POURQUOI la difference seulement depuis une base COMPLETE a une version
  // connue : le serveur decrit « ce qui a change entre V1 et V2 » ; appliquer
  // cela a une base qui n'est pas a V1 laisserait des entrees fantomes.
  const depuis = force || o.sansDifference ? undefined : reprise ? etat.enCours!.depuis : etat.versionComplete
  return {
    action: 'importer',
    version: manifeste.version,
    restants,
    reprise,
    mode: depuis ? 'difference' : 'complet',
    ...(depuis ? { depuis } : {}),
  }
}

/** Part d'avancement (0..1) apres `fait` lignes sur `total`, bornee. */
export function partAvancement(fait: number, total: number): number {
  if (!(total > 0)) return 0
  return Math.max(0, Math.min(1, fait / total))
}

/**
 * Avancement d'un import par difference : le total n'est pas connu d'avance
 * (chaque export annonce le sien par `X-Elements`), on avance type par type :
 * `rang` types termines sur `nTypes`, puis `lu` lignes sur `annonce` du type en
 * cours. Un type vide compte comme termine des son ouverture.
 */
export function partDifference(rang: number, nTypes: number, lu: number, annonce: number): number {
  if (!(nTypes > 0)) return 0
  const courant = annonce > 0 ? partAvancement(lu, annonce) : 1
  return partAvancement(rang + courant, nTypes)
}

/** Delai avant le nouvel essai `n` (0 = premier retry) : exponentiel, plafonne. */
export function delaiRetry(n: number, base = 500, plafond = 8000): number {
  return Math.min(plafond, base * 2 ** n)
}
