import { estMobile } from '../lib/gabarit'
import { For } from 'solid-js'
import Icone from './Icone'

// Sélecteur segmenté du dossier de conception : mode d'affichage pour Direct,
// tri pour Films et Séries. Mesures relevées au getComputedStyle sur « Lecteur
// IPTV.dc.html » : groupe à fond --elev2, 2 px de retrait et d'écart, rayon
// 6 px ; segment de 28 px, retrait 10 px, écart 6 px, rayon 4 px, texte 13 px
// semi-gras. Le segment actif se détache par un fond --card et une ombre md,
// pas par une couleur d'accent.

export interface Segment {
  cle: string
  libelle: string
  icone?: string
}

export default function SelecteurSegmente(props: {
  etiquette: string
  segments: Segment[]
  actif: string
  surChoisir: (cle: string) => void
  /** Mobile : l'icône seule, faute de place pour les libellés. */
  iconesSeules?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props.etiquette}
      style={{
        display: 'flex',
        gap: '2px',
        padding: '2px',
        'border-radius': 'var(--r-sm)',
        background: 'var(--elev2)',
        'flex': 'none',
      }}
    >
      <For each={props.segments}>
        {(s) => {
          const actif = () => props.actif === s.cle
          return (
            <button
              role="radio"
              aria-checked={actif()}
              title={s.libelle}
              aria-label={s.libelle}
              onClick={() => props.surChoisir(s.cle)}
              style={{
                // 44 px au doigt (cahier des charges, mobile) ; 28 px sinon.
                height: estMobile() ? '44px' : '28px',
                'min-width': props.iconesSeules && estMobile() ? '44px' : undefined,
                'justify-content': props.iconesSeules ? 'center' : undefined,
                padding: props.iconesSeules && estMobile() ? '0' : '0 10px',
                display: 'flex',
                'align-items': 'center',
                gap: '6px',
                'border-radius': 'var(--r-btn-sm)',
                background: actif() ? 'var(--card)' : undefined,
                color: actif() ? 'var(--fg)' : 'var(--fg3)',
                'box-shadow': actif() ? 'var(--moov-shadow-md)' : undefined,
                'font-size': '13px',
                'font-weight': 'var(--w-strong)',
                'white-space': 'nowrap',
              }}
            >
              {s.icone ? <Icone nom={s.icone} taille={16} plein={actif()} /> : null}
              {props.iconesSeules && s.icone ? null : s.libelle}
            </button>
          )
        }}
      </For>
    </div>
  )
}
