import { createSignal } from 'solid-js'

/**
 * Gabarit courant de la fenêtre, partagé par la coque et les écrans.
 * Les seuils viennent du cahier des charges (§6) : bureau ≥ 1100 px,
 * tablette 700–1099 px, mobile < 700 px. On s'appuie sur matchMedia plutôt
 * que sur innerWidth pour rester aligné avec les @media du CSS.
 */
export type Gabarit = 'bureau' | 'tablette' | 'mobile'

export const SEUIL_BUREAU = 1100
export const SEUIL_TABLETTE = 700

const mqBureau =
  typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${SEUIL_BUREAU}px)`) : null
const mqTablette =
  typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${SEUIL_TABLETTE}px)`) : null

function calculer(): Gabarit {
  if (mqBureau?.matches !== false) return 'bureau' // rendu hors navigateur : bureau par défaut
  return mqTablette?.matches ? 'tablette' : 'mobile'
}

const [gabarit, definir] = createSignal<Gabarit>(calculer())
// Module singleton : les écouteurs vivent autant que la page, un seul abonnement pour tous.
mqBureau?.addEventListener('change', () => definir(calculer()))
mqTablette?.addEventListener('change', () => definir(calculer()))

/** Signal réactif : `gabarit()` renvoie 'bureau' | 'tablette' | 'mobile'. */
export { gabarit }
export const estMobile = () => gabarit() === 'mobile'
export const estTablette = () => gabarit() === 'tablette'
export const estBureau = () => gabarit() === 'bureau'
