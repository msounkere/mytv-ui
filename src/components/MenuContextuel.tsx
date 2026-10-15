import { estMobile } from '../lib/gabarit'
import { For, createSignal, onCleanup, onMount } from 'solid-js'
import Icone from './Icone'

// Menu « … » des cartes de reprise. Positionné en `fixed` sur le point de clic
// plutôt qu'en `absolute` dans la carte : la piste de la rangée est en
// `overflow:auto`, un menu posé dedans serait coupé dès la deuxième carte.

export interface EntreeMenu {
  icone: string
  libelle: string
  action: () => void
}

const LARGEUR = 260

export default function MenuContextuel(props: {
  x: number
  y: number
  entrees: EntreeMenu[]
  surFermer: () => void
}) {
  const [survol, poserSurvol] = createSignal(-1)

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') props.surFermer()
  }
  onMount(() => {
    window.addEventListener('keydown', auClavier)
    // `capture` : refermer avant que le clic n'atteigne la carte sous le menu.
    window.addEventListener('pointerdown', props.surFermer, { capture: true })
  })
  onCleanup(() => {
    window.removeEventListener('keydown', auClavier)
    window.removeEventListener('pointerdown', props.surFermer, { capture: true })
  })

  // 44 px au doigt : une entrée de 36 px est une cible qu'on rate.
  const hauteurEntree = () => (estMobile() ? 44 : 36)

  // Le menu doit rester dans la fenêtre même ouvert sur la dernière carte.
  const gauche = () => Math.max(12, Math.min(props.x, window.innerWidth - LARGEUR - 12))
  const haut = () => Math.min(props.y, window.innerHeight - props.entrees.length * hauteurEntree() - 24)

  return (
    <div
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left: `${gauche()}px`, top: `${haut()}px`, 'z-index': 60,
        width: `${LARGEUR}px`, padding: '6px', 'border-radius': 'var(--r-md)',
        background: 'var(--elev)', border: '1px solid var(--line2)',
        'box-shadow': 'var(--moov-shadow-2xl)',
      }}
    >
      <For each={props.entrees}>
        {(e, i) => (
          <div
            role="menuitem"
            tabindex="0"
            onClick={() => {
              props.surFermer()
              e.action()
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault()
                props.surFermer()
                e.action()
              }
            }}
            onMouseEnter={() => poserSurvol(i())}
            onMouseLeave={() => poserSurvol(-1)}
            style={{
              display: 'flex', 'align-items': 'center', gap: '10px', height: `${hauteurEntree()}px`,
              padding: '0 10px', 'border-radius': 'var(--r-xs)', cursor: 'pointer',
              background: survol() === i() ? 'var(--hover)' : 'transparent',
            }}
          >
            <span style={{ color: 'var(--fg2)', display: 'flex' }}>
              <Icone nom={e.icone} taille={18} />
            </span>
            {e.libelle}
          </div>
        )}
      </For>
    </div>
  )
}
