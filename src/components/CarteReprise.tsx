import { estMobile } from '../lib/gabarit'
import { Show, createSignal } from 'solid-js'
import Icone from './Icone'
import { plaqueTexte } from './couleurs'
import { RAYON_VISUEL, couverture } from './aplats'
import { titreCourt } from './titres'
import type { EntreeCatalogue } from '../lib/db'

// Carte enrichie de « Continuer à regarder » : miniature 16:9, barre de
// progression, temps restant et menu « … ». Le temps restant est la seule
// information que l'utilisateur regarde vraiment ici — il décide s'il a le
// temps de finir —, il est donc en clair plutôt que déduit de la barre.

const TRANSITION = 'transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease)'
const OMBRE_REPOS = '0 0 0 1px rgba(255,255,255,.06), 0 2px 4px rgba(0,0,0,.28)'
const OMBRE_SURVOL = '0 0 0 1px rgba(255,255,255,.2), 0 10px 22px rgba(0,0,0,.45)'

export interface CarteRepriseProps {
  entree: EntreeCatalogue
  /** Avancement entre 0 et 1. */
  progression: number
  sousTitre: string
  /** « Reste 17 min ». */
  reste: string
  surOuvrir: (e: EntreeCatalogue) => void
  surMenu: (e: EntreeCatalogue, position: { x: number; y: number }) => void
}

export default function CarteReprise(props: CarteRepriseProps) {
  const [survol, poserSurvol] = createSignal(false)
  const [survolMenu, poserSurvolMenu] = createSignal(false)
  const [chargee, poserChargee] = createSignal(false)
  const titre = () => titreCourt(props.entree.nom)

  function ouvrirMenu(e: MouseEvent) {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    props.surMenu(props.entree, { x: r.right - 260, y: r.bottom + 6 })
  }

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'min-width': 0 }}>
      <div
        role="button"
        tabindex="0"
        aria-label={`Reprendre ${titre()}, ${props.sousTitre}`}
        onClick={() => props.surOuvrir(props.entree)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            props.surOuvrir(props.entree)
          }
        }}
        onMouseEnter={() => poserSurvol(true)}
        onMouseLeave={() => poserSurvol(false)}
        onFocusIn={() => poserSurvol(true)}
        onFocusOut={() => poserSurvol(false)}
        style={{
          position: 'relative', 'aspect-ratio': '16 / 9',
          'border-radius': RAYON_VISUEL, overflow: 'hidden',
          background: couverture(props.entree.nom), cursor: 'pointer',
          'box-shadow': survol() ? OMBRE_SURVOL : OMBRE_REPOS,
          transform: survol() ? 'translateY(-3px)' : 'none',
          transition: TRANSITION,
        }}
      >
        <div
          style={{
            position: 'absolute', left: '14px', right: '56px', bottom: '16px',
            'font-family': 'var(--moov-font-heading)', 'font-size': '17px', 'line-height': '21px',
            'font-weight': 'var(--w-strong)', color: plaqueTexte(props.entree.nom), 'text-wrap': 'balance',
          }}
        >
          {titre()}
        </div>

        <Show when={props.entree.icone}>
          <img
            src={props.entree.icone}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => poserChargee(true)}
            onError={() => poserChargee(false)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              'object-fit': 'cover', opacity: chargee() ? 1 : 0,
              transition: 'opacity var(--dur) var(--ease)',
            }}
          />
        </Show>

        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', 'align-items': 'center', 'justify-content': 'center',
            background: 'rgba(0,0,0,.35)', opacity: survol() ? 1 : 0,
            'pointer-events': 'none', transition: 'opacity 150ms ease-out',
          }}
        >
          <span
            style={{
              width: '48px', height: '48px', 'border-radius': '50%', background: '#fff', color: '#000',
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              'box-shadow': '0 4px 14px rgba(0,0,0,.4)',
            }}
          >
            <Icone nom="play_arrow" taille={26} plein />
          </span>
        </div>

        <span
          role="button"
          tabindex="0"
          aria-label={`Plus d’options pour ${titre()}`}
          title="Plus d’options"
          onClick={ouvrirMenu}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              props.surMenu(props.entree, { x: r.right - 260, y: r.bottom + 6 })
            }
          }}
          onMouseEnter={() => poserSurvolMenu(true)}
          onMouseLeave={() => poserSurvolMenu(false)}
          style={{
            position: 'absolute', top: estMobile() ? '0' : '6px', right: estMobile() ? '0' : '6px',
            width: estMobile() ? '44px' : '30px', height: estMobile() ? '44px' : '30px',
            'border-radius': 'var(--r-xs)', background: survolMenu() ? 'rgba(70,70,70,.95)' : 'rgba(32,32,32,.85)',
            color: '#fff', display: 'flex', 'align-items': 'center', 'justify-content': 'center', cursor: 'pointer',
          }}
        >
          <Icone nom="more_horiz" taille={18} />
        </span>

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '4px', background: 'rgba(0,0,0,.55)' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.round(props.progression * 100))}%`, background: 'var(--acc-fg)' }} />
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px', 'min-width': 0 }}>
        <span class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{titre()}</span>
        <div class="num" style={{ display: 'flex', 'justify-content': 'space-between', gap: '8px', 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)' }}>
          <span class="tronque">{props.sousTitre}</span>
          <span style={{ 'white-space': 'nowrap' }}>{props.reste}</span>
        </div>
      </div>
    </div>
  )
}
