import { createEffect, onCleanup } from 'solid-js'

// « Position de défilement mémorisée par catégorie ET par mode d'affichage »
// (règles de comportement du dossier). Trois zones en ont besoin — la grille
// d'affiches, la liste de Direct, ses cartes — et toutes trois confient leur
// défilement à ListeVirtuelle, qui n'expose rien. On passe donc par le DOM,
// une fois, ici, plutôt que trois fois ailleurs.
//
// La mémoire vit hors des composants : changer de mode démonte la zone, et
// c'est précisément ce moment-là qu'il faut survivre.

const MEMOIRE = new Map<string, { generation: number; y: number }>()

/** Au-delà, c'est que la liste ne reprendra pas la hauteur attendue : on pose
 *  la position telle quelle plutôt que d'attendre indéfiniment. */
const ESSAIS_MAX = 12

export interface MemoireDefilement {
  /** Élément qui contient la zone de défilement (pas la zone elle-même). */
  hote: () => HTMLElement | null
  /** Identité de la vue. Chaque valeur distincte a sa propre position. */
  cle: () => string | null
  /** Changer ce nombre remet la vue en haut sans oublier les autres. */
  generation?: () => number
  /** Tant que c'est faux, la zone n'a pas son contenu et `scrollTop` est perdu. */
  pret: () => boolean
}

export function memoriserDefilement(o: MemoireDefilement): void {
  createEffect(() => {
    const cle = o.cle()
    const generation = o.generation?.() ?? 0
    if (!cle || !o.pret()) return
    const hote = o.hote()
    if (!hote) return

    // `onCleanup` est posé dans le corps de l'effet, jamais dans le rappel
    // d'animation : appelé de là il n'aurait plus de propriétaire, Solid ne le
    // rattacherait à rien, et chaque catégorie visitée continuerait d'écrire
    // la position des suivantes sous sa propre clé.
    let trame = 0
    let detacher: (() => void) | undefined
    let essais = 0

    const poser = () => {
      const zone = hote.querySelector('div')
      if (!zone) return
      const vu = MEMOIRE.get(cle)
      const cible = vu && vu.generation === generation ? vu.y : 0

      // Changer de catégorie vide la liste avant de la repeupler, et
      // ListeVirtuelle ne rend sa hauteur totale qu'une fois mesurée : poser
      // la position trop tôt la ferait rogner à zéro par le navigateur.
      if (cible > zone.scrollHeight - zone.clientHeight && essais < ESSAIS_MAX) {
        essais++
        trame = requestAnimationFrame(poser)
        return
      }

      zone.scrollTop = cible
      const noter = () => {
        // Une zone sans rien à faire défiler n'a pas de position : pendant le
        // vidage, le navigateur ramène scrollTop à zéro et émet un évènement
        // qui n'exprime aucune intention du spectateur.
        if (zone.scrollHeight <= zone.clientHeight + 1) return
        MEMOIRE.set(cle, { generation, y: zone.scrollTop })
      }
      noter()
      zone.addEventListener('scroll', noter, { passive: true })
      detacher = () => zone.removeEventListener('scroll', noter)
    }

    trame = requestAnimationFrame(poser)
    onCleanup(() => {
      cancelAnimationFrame(trame)
      detacher?.()
    })
  })
}
