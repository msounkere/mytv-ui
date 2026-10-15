import { For, Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js'
import Icone from './Icone'
import { estMobile } from '../lib/gabarit'

// Les rangées de l'accueil partagent toutes la même mécanique : un en-tête qui
// nomme et compte, une piste qui défile à l'horizontale, deux flèches. Les
// factoriser évite que chaque section réinvente son défilement — et garantit
// que « une rangée vide n'est jamais affichée » soit vrai partout, puisque le
// composant refuse de se rendre sans contenu.

/** Pas de défilement : 85 % de la largeur visible, comme dans la maquette. */
const PROPORTION_PAS = 0.85

function Fleche(props: { sens: -1 | 1; surClic: () => void }) {
  const [survol, poserSurvol] = createSignal(false)
  return (
    <span
      role="button"
      tabindex="0"
      aria-label={props.sens < 0 ? 'Faire défiler vers la gauche' : 'Faire défiler vers la droite'}
      onClick={props.surClic}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          props.surClic()
        }
      }}
      onMouseEnter={() => poserSurvol(true)}
      onMouseLeave={() => poserSurvol(false)}
      style={{
        display: 'flex', width: '32px', height: '32px', flex: 'none',
        'border-radius': 'var(--r-xs)', border: '1px solid var(--line2)',
        'align-items': 'center', 'justify-content': 'center',
        cursor: 'pointer', color: 'var(--fg2)',
        background: survol() ? 'var(--hover)' : 'transparent',
      }}
    >
      <Icone nom={props.sens < 0 ? 'chevron_left' : 'chevron_right'} taille={18} />
    </span>
  )
}

export interface RangeeHorizontaleProps<T> {
  titre: string
  /** Compteur affiché à côté du titre ; vide = pas de compteur. */
  compteur?: string
  /** Libellé et action du lien « Tout voir » ; absent = pas de lien. */
  surToutVoir?: () => void
  elements: T[]
  /** Largeur fixe de chaque carte : la piste ne doit jamais les comprimer. */
  largeurCarte: number
  /** Écart entre cartes ; 10 px en mobile, 14 px ailleurs. */
  ecart?: number
  gabarit: (element: T, index: number) => JSX.Element
}

export default function RangeeHorizontale<T>(props: RangeeHorizontaleProps<T>) {
  let piste: HTMLDivElement | undefined
  const [survolVoir, poserSurvolVoir] = createSignal(false)

  function defiler(sens: -1 | 1) {
    piste?.scrollBy({ left: sens * piste.clientWidth * PROPORTION_PAS, behavior: 'smooth' })
  }

  // La molette d'une souris ne produit que du défilement vertical : sur une
  // piste horizontale, elle ne sert donc à rien et oblige à viser les flèches.
  // On la reporte sur l'axe horizontal — mais seulement tant que la piste peut
  // réellement avancer, sinon la page se retrouverait prisonnière de la rangée.
  createEffect(() => {
    const el = piste
    if (!el) return
    const auDefilement = (e: WheelEvent) => {
      // Un pavé tactile qui défile déjà à l'horizontale n'a pas besoin d'aide.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const avant = el.scrollLeft
      el.scrollLeft = avant + e.deltaY
      if (el.scrollLeft !== avant) e.preventDefault()
    }
    // `passive: false` est indispensable : sans lui, preventDefault est ignoré.
    el.addEventListener('wheel', auDefilement, { passive: false })
    onCleanup(() => el.removeEventListener('wheel', auDefilement))
  })

  return (
    <Show when={props.elements.length > 0}>
      <section aria-label={props.titre} style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'min-width': 0 }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'min-width': 0 }}>
          <h2
            style={{
              margin: 0, 'font-family': 'var(--moov-font-heading)',
              'font-size': '18px', 'line-height': '24px', 'font-weight': 'var(--w-strong)',
              'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis', 'min-width': 0,
            }}
          >
            {props.titre}
          </h2>
          <Show when={props.compteur}>
            <span class="num" style={{ 'font-size': '12px', color: 'var(--fg3)', 'white-space': 'nowrap' }}>
              {props.compteur}
            </span>
          </Show>
          <Show when={props.surToutVoir}>
            {(aller) => (
              <span
                role="button"
                tabindex="0"
                onClick={() => aller()()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    aller()()
                  }
                }}
                onMouseEnter={() => poserSurvolVoir(true)}
                onMouseLeave={() => poserSurvolVoir(false)}
                style={{
                  'font-size': '13px', color: 'var(--acc-fg)', cursor: 'pointer',
                  'white-space': 'nowrap', 'font-weight': 'var(--w-strong)',
                  'text-decoration': survolVoir() ? 'underline' : 'none',
                }}
              >
                Tout voir
              </span>
            )}
          </Show>
          <span style={{ flex: 1 }} />
          {/* Au doigt, la piste se fait défiler d'elle-même : deux flèches de
              32 px y seraient des cibles trop petites pour un geste inutile. */}
          <Show when={!estMobile()}>
            <Fleche sens={-1} surClic={() => defiler(-1)} />
            <Fleche sens={1} surClic={() => defiler(1)} />
          </Show>
        </div>
        <div
          ref={piste}
          style={{
            display: 'flex', gap: `${props.ecart ?? 14}px`,
            'overflow-x': 'auto', 'overflow-y': 'hidden',
            'scroll-snap-type': 'x proximity',
            padding: '4px 2px 8px', 'scrollbar-width': 'none',
          }}
        >
          <For each={props.elements}>
            {(e, i) => (
              <div style={{ width: `${props.largeurCarte}px`, flex: 'none', 'scroll-snap-align': 'start', 'min-width': 0 }}>
                {props.gabarit(e, i())}
              </div>
            )}
          </For>
        </div>
      </section>
    </Show>
  )
}
