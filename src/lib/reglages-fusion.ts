// Fusion des reglages de profil (`/profil/reglages`) : logique PURE, sans import,
// donc testable sous node.
//
// Le contrat est un dictionnaire de chaines + une `revision` : `PUT` ne passe que
// si la revision envoyee est la courante, sinon `409 conflit`. Deux machines qui
// ecrivent « en meme temps » se heurtent donc, et la machine battue doit
// FUSIONNER ce que l'autre a ecrit avec ce qu'elle voulait ecrire, puis reessayer
// -- ecraser perdrait le geste de l'autre, abandonner perdrait le sien.
//
// Fusion A TROIS POINTS : `base` est l'etat sur lequel le serveur et nous nous
// etions accordes la derniere fois. Sans lui, « absent chez moi, present chez
// l'autre » ne dit pas qui a raison (j'ai supprime ? il a ajoute ?) ; avec lui,
// seul ce que NOUS avons change depuis la base l'emporte, le reste suit le serveur.

export type Valeurs = Record<string, string>

/** Reglages dont la valeur est une liste JSON de chaines a traiter comme un
 *  ENSEMBLE : on fusionne les ajouts et retraits, pas la liste entiere (deux
 *  machines qui epinglent chacune une categorie doivent garder les deux). */
export const CLES_ENSEMBLES: readonly string[] = ['epingles.live', 'masquees']

export function lireEnsemble(brut: string | undefined): string[] {
  if (!brut) return []
  try {
    const v: unknown = JSON.parse(brut)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Ecriture canonique (triee) : deux ensembles egaux donnent la meme chaine. */
export function ecrireEnsemble(e: Iterable<string>): string {
  return JSON.stringify([...new Set(e)].sort())
}

function fusionEnsemble(base: string[], local: string[], distant: string[]): string[] {
  const B = new Set(base)
  const L = new Set(local)
  const resultat = new Set(distant)
  for (const x of L) if (!B.has(x)) resultat.add(x) // ajoute ici
  for (const x of B) if (!L.has(x)) resultat.delete(x) // retire ici
  return [...resultat]
}

/**
 * `base` absent = premiere synchronisation de ce profil sur cette machine :
 * un reglage « scalaire » local n'exprime alors aucun choix (le theme sombre
 * par defaut d'une machine neuve ne doit pas ecraser le theme clair demande
 * ailleurs), donc le serveur l'emporte quand il a une valeur. Les ensembles,
 * eux, s'unissent.
 */
export function fusionner(base: Valeurs | undefined, local: Valeurs, distant: Valeurs): Valeurs {
  const sortie: Valeurs = {}
  const cles = new Set([...Object.keys(local), ...Object.keys(distant), ...Object.keys(base ?? {})])
  for (const k of cles) {
    if (CLES_ENSEMBLES.includes(k)) {
      const e = fusionEnsemble(
        lireEnsemble(base?.[k]), lireEnsemble(local[k]), lireEnsemble(distant[k]),
      )
      if (e.length > 0) sortie[k] = ecrireEnsemble(e)
      continue
    }
    let v: string | undefined
    if (base === undefined) v = distant[k] ?? local[k]
    else v = local[k] !== base[k] ? local[k] : distant[k]
    if (v !== undefined) sortie[k] = v
  }
  return sortie
}

/** Deux dictionnaires disent-ils la meme chose ? (les ensembles s'ignorent l'ordre) */
export function egaux(a: Valeurs, b: Valeurs): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) =>
    CLES_ENSEMBLES.includes(k)
      ? ecrireEnsemble(lireEnsemble(a[k])) === ecrireEnsemble(lireEnsemble(b[k]))
      : a[k] === b[k],
  )
}
