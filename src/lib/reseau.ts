import { createSignal } from 'solid-js'
import { reseauCoupe } from './api'
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
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => poserEnLigne(true))
  window.addEventListener('offline', () => poserEnLigne(false))
}

export const horsLigne = (): boolean =>
  !enLigneNavigateur() || reseauCoupe() || etatSynchro() === 'hors-ligne'

/** Suffixe des gestes de liste, de favori et de progression faits hors ligne. */
export const SUFFIXE_HORS_LIGNE = 'sera envoyé au retour du réseau'

/** « Ajouté à Ma liste · sera envoyé au retour du réseau » quand il n'y a pas de reseau. */
export function libelleGeste(message: string, horsReseau: boolean = horsLigne()): string {
  return horsReseau ? `${message} · ${SUFFIXE_HORS_LIGNE}` : message
}

/** Phrase du bandeau : le nombre de gestes en attente, s'il y en a. */
export function phraseHorsLigne(gestesEnAttente: number): string {
  if (gestesEnAttente <= 0) return 'Hors ligne · catalogue local'
  return gestesEnAttente === 1
    ? `Hors ligne · 1 geste ${SUFFIXE_HORS_LIGNE}`
    : `Hors ligne · ${gestesEnAttente} gestes seront envoyés au retour du réseau`
}
