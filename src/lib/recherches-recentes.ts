import { createSignal } from 'solid-js'

// Huit recherches au maximum, supprimables une à une, et qui survivent à la
// session : retaper « ligue 1 » à chaque ouverture est exactement ce que le
// panneau de suggestions doit éviter.

const CLE = 'mytv.recherches-recentes'
const MAXIMUM = 8

/** Même tamis que l'index : « Pokémon » ne doit pas s'empiler sur « pokemon ». */
function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function lire(): string[] {
  try {
    const brut = localStorage.getItem(CLE)
    if (!brut) return []
    const v: unknown = JSON.parse(brut)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAXIMUM) : []
  } catch {
    return []
  }
}

function ecrire(v: string[]): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(v))
  } catch {
    // Mode privé ou quota plein : la liste reste valable pour la session.
  }
}

const [recherchesRecentes, poser] = createSignal<string[]>(lire())
export { recherchesRecentes }

export function retenirRecherche(requete: string): void {
  const q = requete.trim()
  if (!q) return
  const n = normaliser(q)
  const suivant = [q, ...recherchesRecentes().filter((x) => normaliser(x) !== n)].slice(0, MAXIMUM)
  poser(suivant)
  ecrire(suivant)
}

export function oublierRecherche(requete: string): void {
  const suivant = recherchesRecentes().filter((x) => x !== requete)
  poser(suivant)
  ecrire(suivant)
}
