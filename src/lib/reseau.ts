import { createSignal } from 'solid-js'
import { poserReseauCoupe, reseauCoupe } from './api'
import { etatSynchro } from './synchro'

// « Hors ligne » : UN signal pour tous les ecrans (US-47 CA4). Trois sources,
// parce qu'aucune ne suffit seule : `navigator.onLine` ignore un serveur
// arrete ; un appel sans reponse (`api.ts`) ne dit rien tant qu'on n'appelle
// pas ; la synchronisation ne tourne que par moments. Le bandeau de la coque,
// le bandeau d'import et les toasts de geste lisent ce signal, jamais une
// source directement.

const [enLigneNavigateur, poserEnLigne] = createSignal(
  typeof navigator === 'undefined' ? true : navigator.onLine,
)
// `navigator.onLine` ment parfois (WebKit sans gestionnaire de reseau le dit
// « hors ligne » alors que tout passe) : quand il dit non, on VERIFIE par un
// appel leger ; s'il passe, on cesse de croire `onLine` et on s'en remet aux
// appels eux-memes (`reseauCoupe`).
const [onLineFiable, poserOnLineFiable] = createSignal(true)

async function verifier(): Promise<void> {
  try {
    const r = await fetch('/api/v1/sante', { cache: 'no-store', credentials: 'same-origin' })
    if (r.ok) {
      poserOnLineFiable(false)
      poserReseauCoupe(false)
    } else poserReseauCoupe(true)
  } catch {
    poserReseauCoupe(true)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => poserEnLigne(true))
  window.addEventListener('offline', () => {
    poserEnLigne(false)
    void verifier()
  })
  if (!navigator.onLine) void verifier()
}

export const horsLigne = (): boolean =>
  (onLineFiable() && !enLigneNavigateur()) || reseauCoupe() || etatSynchro() === 'hors-ligne'

export { SUFFIXE_HORS_LIGNE, phraseHorsLigne } from './hors-ligne'
import { libelleGeste as libelleGestePur } from './hors-ligne'

/** « Ajouté à Ma liste · sera envoyé au retour du réseau » quand il n'y a pas de reseau. */
export function libelleGeste(message: string, horsReseau: boolean = horsLigne()): string {
  return libelleGestePur(message, horsReseau)
}
