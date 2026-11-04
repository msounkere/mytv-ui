// Ordre et numeros des chaines du Direct (US-47 CA2, audit A UX13). Module PUR :
// aucune base, aucun composant, il se teste sous node.
//
// Un televiseur respecte l'ordre du bouquet : la liste suit le `numero` du
// fournisseur quand il existe. Sans numero, le nom en ordre NATUREL (« Chaîne
// 2 » avant « Chaîne 12 »), ce que `localeCompare` seul ne fait pas.

export interface ChaineTriable {
  nom: string
  numero?: number
}

const COLLATION = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

export function comparerChaines(a: ChaineTriable, b: ChaineTriable): number {
  const na = numeroValide(a.numero)
  const nb = numeroValide(b.numero)
  if (na !== undefined && nb !== undefined && na !== nb) return na - nb
  // Les chaines numerotees passent devant celles qui ne le sont pas.
  if (na !== undefined && nb === undefined) return -1
  if (na === undefined && nb !== undefined) return 1
  return COLLATION.compare(a.nom, b.nom)
}

function numeroValide(n: number | undefined): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined
}

/** Copie triee : par numero du bouquet, sinon nom naturel. */
export function trierChaines<T extends ChaineTriable>(liste: readonly T[]): T[] {
  return [...liste].sort(comparerChaines)
}

/**
 * Numero affiche dans la colonne « N° » d'un groupe de variantes : le plus
 * petit numero de ses variantes (celui du bouquet), sinon le rang dans la liste
 * (1-based) — jamais un numero invente.
 */
export function numeroDuGroupe(variantes: readonly ChaineTriable[], rang: number): number {
  const numeros = variantes.map((v) => numeroValide(v.numero)).filter((n): n is number => n !== undefined)
  return numeros.length ? Math.min(...numeros) : rang
}

/** Libelle court de la variante jouee, pour le bandeau de zapping. */
export function libelleVariante(qualite: string, nombreVariantes: number): string | undefined {
  if (nombreVariantes <= 1) return undefined
  return `Variante ${qualite} · choisie pour votre liaison`
}

/**
 * Indice du groupe de variantes qui contient la chaine `cle` (jouee), -1 si
 * aucun : la colonne de zapping et le mini-guide surlignent ce groupe.
 */
export function indiceGroupeActif(groupes: readonly { variantes: readonly { cle?: string }[] }[], cle: string): number {
  return groupes.findIndex((g) => g.variantes.some((v) => v.cle === cle))
}
