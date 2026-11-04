import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { Portal, render } from 'solid-js/web'
import Icone from './Icone'
import { agirToast, fermerToast, reprendreToast, suspendreToast, toastCourant, type TonToast } from '../lib/toasts'

// Hote des toasts (lot 10, US-46 CA4). UN seul dans toute l'application : le
// premier monte rend, les suivants ne font rien (l'Accueil le monte par
// defaut, la coque peut le monter elle-meme). Pose en `Portal` dans `body` :
// une couche masquee (`visibility: hidden`) ne le masque donc pas.
//
// Accessible : `role=status` + `aria-live=polite` pour le lecteur d'ecran ;
// « Annuler » est un vrai bouton, focalisable (Tab), et le minuteur se suspend
// tant que la souris ou le focus est dessus.

// Le premier hote monte est celui qui rend ; les autres attendent qu'il parte.
const [hoteActif, poserHoteActif] = createSignal<number | null>(null)
let numeroHote = 0

/**
 * Hote AUTONOME : monte dans `body` par `lib/toasts.ts` au premier toast si
 * aucun ecran n'en a monte un (un geste fait depuis une fiche ouverte par un
 * lien direct, avant que l'Accueil n'ait jamais ete visite). Un hote monte
 * ensuite par un ecran attend son tour, comme les autres.
 */
let autonome: (() => void) | undefined
export function assurerHoteToasts(): void {
  if (hoteActif() !== null || autonome || typeof document === 'undefined') return
  const racine = document.createElement('div')
  racine.dataset['role'] = 'hote-toasts'
  document.body.appendChild(racine)
  autonome = render(() => <ToastHote />, racine)
}

const TEINTE: Record<TonToast, { icone: string; couleur: string }> = {
  ok: { icone: 'check_circle', couleur: 'var(--ok)' },
  info: { icone: 'info', couleur: 'var(--fg2)' },
  erreur: { icone: 'warning', couleur: 'var(--err)' },
}

export default function ToastHote(props: {
  /** Hauteur a laisser sous le toast (mini-lecteur) ; la barre d'onglets est deja comptee. */
  basPx?: number
}) {
  const moi = ++numeroHote
  onMount(() => {
    if (hoteActif() === null) poserHoteActif(moi)
  })
  onCleanup(() => {
    if (hoteActif() === moi) poserHoteActif(null)
  })

  return (
    <Show when={hoteActif() === moi}>
      <Portal>
        <Show when={toastCourant()}>
          {(t) => (
            <ToastVue
              message={t().message}
              ton={t().ton ?? 'info'}
              libelleAction={t().action ? t().libelleAction ?? 'Annuler' : undefined}
              basPx={props.basPx ?? 0}
            />
          )}
        </Show>
      </Portal>
    </Show>
  )
}

function ToastVue(props: { message: string; ton: TonToast; libelleAction?: string; basPx: number }) {
  // Le toast qui remplace un autre repart avec son propre minuteur : la file
  // s'en charge ; ici on ne fait que suspendre au survol/focus.
  createEffect(() => {
    props.message
    reprendreToast()
  })
  const teinte = () => TEINTE[props.ton]

  return (
    <div
      role="status"
      aria-live="polite"
      data-role="toast"
      onMouseEnter={suspendreToast}
      onMouseLeave={reprendreToast}
      onFocusIn={suspendreToast}
      onFocusOut={reprendreToast}
      style={{
        position: 'fixed', left: '50%', bottom: `calc(var(--hauteur-onglets, 0px) + ${props.basPx + 16}px)`,
        transform: 'translateX(-50%)', 'z-index': 96,
        'max-width': 'calc(100% - 32px)', 'min-width': '240px',
        display: 'flex', 'align-items': 'center', gap: '12px',
        padding: '10px 12px 10px 16px',
        'border-radius': 'var(--r-sm)',
        background: 'var(--elev)', color: 'var(--fg)',
        border: '1px solid var(--line2)',
        'box-shadow': 'var(--moov-shadow-2xl)',
        'font-size': '13px', 'line-height': '18px',
        animation: 'fadein var(--dur) var(--ease)',
      }}
    >
      <span aria-hidden="true" style={{ flex: '0 0 auto', display: 'grid', color: teinte().couleur }}>
        <Icone nom={teinte().icone} taille={16} plein />
      </span>
      <span style={{ flex: '1 1 auto', 'min-width': 0 }}>{props.message}</span>
      <Show when={props.libelleAction}>
        {(l) => (
          <button
            type="button"
            data-role="toast-action"
            onClick={() => void agirToast()}
            style={{
              flex: '0 0 auto', height: '32px', padding: '0 10px', 'border-radius': 'var(--r-xs)',
              border: '1px solid var(--line2)', background: 'transparent', color: 'var(--acc-fg)',
              'font-weight': 'var(--w-strong)', cursor: 'pointer', 'font-size': '13px',
            }}
          >
            {l()}
          </button>
        )}
      </Show>
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => fermerToast()}
        style={{
          flex: '0 0 auto', width: '28px', height: '28px', display: 'flex', 'align-items': 'center', 'justify-content': 'center',
          'border-radius': 'var(--r-xs)', border: 'none', background: 'transparent', color: 'var(--fg3)', cursor: 'pointer',
        }}
      >
        <Icone nom="close" taille={16} />
      </button>
    </div>
  )
}
