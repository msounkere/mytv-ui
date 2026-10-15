import { For, Show } from 'solid-js'
import { estBureau, estMobile } from '../lib/gabarit'
import Icone from './Icone'
import { LIBELLE_COUCHE, type Couche, type ErreurLecteur } from '../lib/errors'
import { ENCRE, ENCRE2, ENCRE3 } from './ControlesLecteur'

// L'écran précédent a été abandonné pour avoir affiché « the error did not
// identify a specific codec, container, or network cause » : la carte nomme
// donc la couche, montre le diagnostic brut et propose une sortie.

const ICONE: Record<Couche, string> = {
  reseau: 'wifi',
  auth: 'vpn_lock',
  limite: 'connected_tv',
  codec: 'volume_up',
  relais: 'signal_cellular_alt',
  donnees: 'list',
}

/** Teinte de la couche : la limite de connexions n'est pas une panne. */
const TEINTE: Record<Couche, { fg: string; bg: string }> = {
  reseau: { fg: 'var(--err)', bg: 'var(--err-bg)' },
  auth: { fg: 'var(--err)', bg: 'var(--err-bg)' },
  relais: { fg: 'var(--err)', bg: 'var(--err-bg)' },
  donnees: { fg: 'var(--err)', bg: 'var(--err-bg)' },
  limite: { fg: 'var(--lim)', bg: 'var(--lim-bg)' },
  codec: { fg: 'var(--cod)', bg: 'var(--cod-bg)' },
}

export interface ActionErreur {
  libelle: string
  principale?: boolean
  surAction: () => void
}

export default function ErreurLecture(props: {
  erreur: ErreurLecteur
  /** Essais de reconnexion déjà consommés : le dossier veut la cause ET le
      compte des tentatives, pour qu'on sache que l'attente a eu lieu. */
  tentatives?: number
  actions: ActionErreur[]
}) {
  const teinte = () => TEINTE[props.erreur.couche]

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        // Dans une vidéo 16:9 de 219 px de haut, la carte déborde : la zone
        // défile, et `margin: auto` de la carte centre sans jamais rogner le haut.
        display: 'grid', 'place-items': 'center', overflow: 'auto',
        padding: estBureau() ? '24px' : '8px',
        background: 'rgba(5,8,12,.7)',
      }}
    >
      <div
        role="alert"
        style={{
          display: 'grid',
          width: '100%', 'max-width': '520px', margin: 'auto',
          padding: estBureau() ? '24px' : '14px', gap: estBureau() ? '14px' : '8px',
          background: 'rgba(13,20,30,.86)',
          'backdrop-filter': 'blur(20px) saturate(1.4)',
          border: '1px solid rgba(160,190,225,.16)',
          'border-radius': 'var(--r-xl)',
          color: ENCRE,
        }}
      >
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <span
            aria-hidden="true"
            style={{
              flex: '0 0 auto', display: 'grid', 'place-items': 'center',
              width: '33px', height: '33px', 'border-radius': 'var(--r-md)',
              background: teinte().bg, color: teinte().fg,
            }}
          >
            <Icone nom={ICONE[props.erreur.couche]} taille={18} />
          </span>
          <span
            style={{
              'font-size': '11px', 'font-weight': 'var(--w-strong)',
              'text-transform': 'uppercase', 'letter-spacing': '.06em',
              color: teinte().fg,
            }}
          >
            {LIBELLE_COUCHE[props.erreur.couche]}
          </span>
        </div>

        <h2 style={{ 'font-size': estBureau() ? '20px' : '16px', 'line-height': estBureau() ? '26px' : '21px' }}>{props.erreur.message}</h2>

        <p style={{ margin: 0, 'font-size': '13px', 'line-height': '20px', color: ENCRE2 }}>
          {props.erreur.action}
        </p>

        <Show when={props.tentatives}>
          {(n) => (
            <p class="num" style={{ margin: 0, 'font-size': '12px', color: ENCRE3 }}>
              {n()} tentative{n() > 1 ? 's' : ''} de reconnexion avant d’abandonner.
            </p>
          )}
        </Show>

        <Show when={props.erreur.detail}>
          {(detail) => (
            <code
              style={{
                display: 'block', padding: '8px 10px',
                background: '#0a0f16', 'border-radius': 'var(--r-xs)',
                'font-family': 'var(--moov-font-mono)', 'font-size': '11px', 'line-height': '16px',
                color: ENCRE3, 'overflow-wrap': 'anywhere',
              }}
            >
              {detail()}
            </code>
          )}
        </Show>

        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px' }}>
          <For each={props.actions}>
            {(a) => (
              <button
                onClick={a.surAction}
                style={{
                  height: estMobile() ? '44px' : '36px', padding: '0 14px',
                  'font-size': '13px', 'font-weight': 'var(--w-strong)',
                  'border-radius': 'var(--r-btn-md)',
                  background: a.principale ? 'var(--acc)' : 'transparent',
                  color: a.principale ? 'var(--acc-ink)' : ENCRE,
                  border: `1px solid ${a.principale ? 'var(--acc)' : '#26344a'}`,
                }}
              >
                {a.libelle}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
