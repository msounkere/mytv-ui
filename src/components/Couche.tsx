import { Show, createMemo, type JSX } from 'solid-js'

/**
 * Écran préservé : monté à sa première visite, masqué ensuite, jamais démonté.
 *
 * POURQUOI : quitter un écran le détruisait et y revenir le reconstruisait
 * entièrement — jusqu'à 2 180 nœuds et 81 requêtes pour un simple aller-retour.
 * Le routeur dit maintenant OÙ l'on est ; c'est cette couche qui décide que
 * l'écran quitté ne meurt pas pour autant.
 *
 * POURQUOI `visibility` ET JAMAIS `display: none` : une liste virtualisée
 * (@tanstack/solid-virtual) ne monte AUCUNE ligne si son conteneur n'a pas de
 * hauteur réelle au moment où elle s'y attache, et elle ne le signale pas —
 * elle calcule même une hauteur totale correcte, ce qui rend la panne muette.
 * `display: none` supprime cette hauteur ; `visibility: hidden` la conserve.
 * Même raison pour `position: absolute; inset: 0` (voir `.couche-ecran`) : la
 * couche tient sa hauteur de la zone, pas de son contenu.
 */
export default function Couche(props: {
  visible: boolean
  children: JSX.Element
}) {
  // Montage paresseux : un écran jamais ouvert ne coûte rien. Un mémo et non un
  // effet, pour que la première visite soit visible dès le premier rendu.
  const visitee = createMemo((vu: boolean) => vu || props.visible, false)

  return (
    <Show when={visitee()}>
      <div
        class="couche-ecran"
        aria-hidden={!props.visible}
        // RIEN n'est posé quand la couche est visible, et c'est volontaire :
        // `visibility` et `pointer-events` s'héritent, et un
        // `visibility: visible` explicite RESSUSCITE l'élément à l'intérieur
        // d'un parent masqué. Parcours imbrique deux couches — Direct et
        // Films/Séries — donc sa vue intérieure se repeignait par-dessus
        // l'Accueil pendant qu'on le regardait.
        style={{
          visibility: props.visible ? undefined : 'hidden',
          'pointer-events': props.visible ? undefined : 'none',
          'z-index': props.visible ? undefined : -1,
        }}
      >
        {props.children}
      </div>
    </Show>
  )
}
