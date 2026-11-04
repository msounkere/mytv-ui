// Adaptateur vers les composants communs d'ui-7 (lot 10, US-46) : les fichiers
// du lecteur et des fiches importent d'ici. Rien d'autre que des re-exports.
export { PART_VUE } from './vu'
export { default as ChipPreparation, phraseEtat } from '../components/ChipPreparation'
export type { ChipPreparationProps as PropsChipPreparation } from '../components/ChipPreparation'
export { emettreToast } from './toasts'
