import { createVirtualizer } from '@tanstack/solid-virtual'
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js'

// Non négociable : rendre 21 791 éléments fige le navigateur. Toute liste de
// cette application passe par ici — seules les lignes visibles sont montées.

export interface ListeVirtuelleProps<T> {
  elements: T[]
  hauteurLigne: number
  /** Lignes montées de part et d'autre de la fenêtre visible. */
  marge?: number
  ligne: (element: T, index: number) => JSX.Element
  vide?: JSX.Element
}

interface Taille {
  width: number
  height: number
}

export default function ListeVirtuelle<T>(props: ListeVirtuelleProps<T>) {
  const [scroller, poserScroller] = createSignal<HTMLDivElement | null>(null)
  const [taille, poserTaille] = createSignal<Taille>({ width: 0, height: 0 })

  // On mesure nous-mêmes la zone de défilement. L'observateur interne du
  // virtualiseur ne notifie pas quand l'élément est inséré dans une grille
  // déjà dimensionnée : il garde une fenêtre visible de 0 px et ne monte
  // alors aucune ligne, tout en calculant correctement la hauteur totale.
  createEffect(() => {
    const el = scroller()
    if (!el) return
    const mesurer = () => poserTaille({ width: el.clientWidth, height: el.clientHeight })
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(el)
    mesurer()
    onCleanup(() => observateur.disconnect())
  })

  return (
    <div ref={poserScroller} style={{ height: '100%', overflow: 'auto' }}>
      <Show when={props.elements.length > 0} fallback={props.vide}>
        {/* Forme non-callback : l'accesseur d'un <Show> est invalidé au
            démontage et Solid signale alors une « stale value » quand le
            virtualiseur le relit pendant son nettoyage. */}
        <Show when={taille().height > 0 && scroller() !== null}>
          <Interieur {...props} scroller={scroller()!} rect={taille()} />
        </Show>
      </Show>
    </div>
  )
}

function Interieur<T>(props: ListeVirtuelleProps<T> & { scroller: HTMLDivElement; rect: Taille }) {
  const virtualiseur = createVirtualizer({
    get count() {
      return props.elements.length
    },
    getScrollElement: () => props.scroller,
    estimateSize: () => props.hauteurLigne,
    // Mesure fournie d'emblée : le virtualiseur sait dès sa création quelle
    // hauteur de fenêtre il doit remplir.
    get initialRect() {
      return props.rect
    },
    get overscan() {
      return props.marge ?? 8
    },
  })

  return (
    <div style={{ height: `${virtualiseur.getTotalSize()}px`, position: 'relative', width: '100%' }}>
      <For each={virtualiseur.getVirtualItems()}>
        {(item) => (
          <div
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%',
              height: `${item.size}px`,
              transform: `translateY(${item.start}px)`,
            }}
          >
            {props.ligne(props.elements[item.index]!, item.index)}
          </div>
        )}
      </For>
    </div>
  )
}
