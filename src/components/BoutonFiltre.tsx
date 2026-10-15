import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { Portal } from 'solid-js/web'
import Icone from './Icone'
import type { Terme } from '../lib/facettes'

// Bouton de filtre et son menu. Mesures relevées au getComputedStyle sur
// « Lecteur IPTV.dc.html », écran Films : bouton 30 px, retraits 12/8 px,
// écart 4 px, rayon 4 px, 13 px de texte ; à l'état actif, bord --acc,
// fond --acc-bg, texte --acc-fg et un compteur « Genre · 2 » dans le libellé.
// Menu : 280 px de large, 380 px de haut au plus, options de 34 px.
//
// Le menu passe par un <Portal> : la barre de filtres vit dans un conteneur
// qui défile et qui écrête, le menu en serait tranché.

export interface BoutonFiltreProps {
  libelle: string
  options: Terme[]
  /** Clés choisies. Une seule case cochable quand `unique`. */
  choix: string[]
  unique?: boolean
  surChoix: (choix: string[]) => void
}

export default function BoutonFiltre(props: BoutonFiltreProps) {
  const [ouvert, poserOuvert] = createSignal(false)
  const [ancre, poserAncre] = createSignal<HTMLButtonElement>()
  let bouton!: HTMLButtonElement

  const actif = () => props.choix.length > 0
  const etiquette = () => {
    if (!actif()) return props.libelle
    if (props.unique) {
      const t = props.options.find((o) => o.cle === props.choix[0])
      return `${props.libelle} · ${t?.libelle ?? props.choix[0]}`
    }
    return `${props.libelle} · ${props.choix.length}`
  }

  function basculer(cle: string) {
    if (props.unique) {
      props.surChoix(props.choix[0] === cle ? [] : [cle])
      poserOuvert(false)
      return
    }
    props.surChoix(
      props.choix.includes(cle) ? props.choix.filter((c) => c !== cle) : [...props.choix, cle],
    )
  }

  return (
    <>
      <button
        ref={bouton}
        aria-haspopup="listbox"
        aria-expanded={ouvert() ? 'true' : 'false'}
        onClick={() => { poserAncre(bouton); poserOuvert((v) => !v) }}
        style={{
          height: '30px',
          padding: '0 8px 0 12px',
          display: 'flex',
          'align-items': 'center',
          gap: '4px',
          'border-radius': 'var(--r-btn-sm)',
          border: `1px solid ${actif() ? 'var(--acc)' : 'var(--line2)'}`,
          background: actif() ? 'var(--acc-bg)' : undefined,
          color: actif() ? 'var(--acc-fg)' : 'var(--fg)',
          'font-size': '13px',
          'white-space': 'nowrap',
          'flex': 'none',
        }}
      >
        {etiquette()}
        <Icone nom={ouvert() ? 'expand_less' : 'expand_more'} taille={14} />
      </button>

      <Show when={ouvert()}>
        <MenuFiltre
          ancre={ancre()!}
          titre={props.libelle}
          options={props.options}
          choix={props.choix}
          unique={props.unique}
          surBasculer={basculer}
          surEffacer={() => props.surChoix([])}
          surFermer={() => poserOuvert(false)}
        />
      </Show>
    </>
  )
}

function MenuFiltre(props: {
  ancre: HTMLElement
  titre: string
  options: Terme[]
  choix: string[]
  unique?: boolean
  surBasculer: (cle: string) => void
  surEffacer: () => void
  surFermer: () => void
}) {
  const r = props.ancre.getBoundingClientRect()
  const gauche = Math.max(8, Math.min(r.left, window.innerWidth - 288))
  let panneau!: HTMLDivElement

  onMount(() => {
    // Le test d'appartenance porte aussi sur le panneau : Solid délègue ses
    // gestionnaires au document, un stopPropagation posé dans le menu n'y
    // arriverait pas à temps. Sans cela, le menu se démonte entre le mousedown
    // et le mouseup, le clic n'est jamais émis et l'option ne se coche pas.
    const dehors = (e: MouseEvent) => {
      const cible = e.target as Node
      if (!props.ancre.contains(cible) && !panneau.contains(cible)) props.surFermer()
    }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') props.surFermer() }
    setTimeout(() => document.addEventListener('mousedown', dehors), 0)
    document.addEventListener('keydown', echap)
    onCleanup(() => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', echap)
    })
  })

  return (
    <Portal>
      <div
        ref={panneau}
        role="listbox"
        aria-label={props.titre}
        style={{
          position: 'fixed',
          left: `${gauche}px`,
          top: `${r.bottom + 4}px`,
          'z-index': '60',
          width: '280px',
          'max-height': '380px',
          overflow: 'auto',
          padding: '6px',
          'border-radius': 'var(--r-md)',
          background: 'var(--elev)',
          border: '1px solid var(--line2)',
          'box-shadow': 'var(--moov-shadow-2xl)',
        }}
      >
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'space-between',
            padding: '6px 10px',
          }}
        >
          <span
            style={{
              'font-size': '11px',
              'font-weight': 'var(--w-strong)',
              'letter-spacing': '.04em',
              'text-transform': 'uppercase',
              color: 'var(--fg3)',
            }}
          >
            {props.titre}
          </span>
          <Show when={props.choix.length > 0}>
            <button
              onClick={props.surEffacer}
              style={{ padding: '0', 'font-size': '12px', 'font-weight': 'var(--w-strong)', color: 'var(--acc-fg)' }}
            >
              Effacer
            </button>
          </Show>
        </div>

        <For each={props.options}>
          {(o) => {
            const coche = () => props.choix.includes(o.cle)
            // Fluent ne dessine pas de case à cocher : un choix multiple se
            // marque donc d'une coche, et garde sa gouttière quand il est vide
            // pour que la colonne de libellés ne danse pas.
            const icone = () =>
              props.unique
                ? coche() ? 'radio_button_checked' : 'radio_button_unchecked'
                : coche() ? 'check' : ''
            return (
              <button
                role="option"
                aria-selected={coche()}
                onClick={() => props.surBasculer(o.cle)}
                style={{
                  display: 'flex',
                  'align-items': 'center',
                  gap: '10px',
                  width: '100%',
                  height: '34px',
                  padding: '0 10px',
                  'border-radius': 'var(--r-btn-sm)',
                  'text-align': 'left',
                  'font-size': '14px',
                  color: coche() ? 'var(--acc-fg)' : 'var(--fg)',
                }}
              >
                <Show when={icone()} fallback={<span style={{ width: '16px', 'flex': 'none' }} />}>
                  <Icone nom={icone()} taille={16} />
                </Show>
                <span class="tronque">{o.libelle}</span>
              </button>
            )
          }}
        </For>
      </div>
    </Portal>
  )
}
