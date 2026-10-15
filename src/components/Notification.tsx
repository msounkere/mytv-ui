import { Show, createEffect, onCleanup } from 'solid-js'
import Icone from './Icone'

// Une notification n'interrompt rien : elle raconte ce qui vient de se passer
// au flux pendant que la lecture continue. Elle se pose sous l'écran, au-dessus
// du mini-lecteur, parce que c'est là que l'œil revient après un changement.

/** Durée d'affichage mesurée sur la maquette. */
export const DUREE_NOTIFICATION = 3800

export interface NotificationLecteur {
  /** Change à chaque émission : relance le minuteur même à message identique. */
  id: number
  message: string
  ton?: 'ok' | 'limite' | 'erreur'
}

const TEINTE = {
  ok: { icone: 'check_circle', couleur: 'var(--ok)' },
  limite: { icone: 'connected_tv', couleur: 'var(--lim)' },
  erreur: { icone: 'wifi_off', couleur: 'var(--err)' },
} as const

export default function Notification(props: {
  notification: NotificationLecteur
  /** Hauteur à laisser sous la notification — le mini-lecteur, s'il est là. */
  basPx: number
  surExpiration: () => void
}) {
  // Le minuteur suit l'identifiant : deux notifications de suite ne doivent pas
  // partager un compte à rebours déjà entamé.
  createEffect(() => {
    props.notification.id
    const t = setTimeout(props.surExpiration, DUREE_NOTIFICATION)
    onCleanup(() => clearTimeout(t))
  })

  const teinte = () => TEINTE[props.notification.ton ?? 'ok']

  return (
    <div
      role="status"
      aria-live="polite"
      data-role="notification"
      style={{
        // La barre d'onglets (mobile) est ajoutée par la variable CSS : 0 ailleurs.
        position: 'fixed', left: '50%', bottom: `calc(var(--hauteur-onglets, 0px) + ${props.basPx}px)`,
        transform: 'translateX(-50%)', 'z-index': 95,
        'max-width': 'calc(100% - 32px)',
        display: 'flex', 'align-items': 'center', gap: '10px',
        padding: '10px 16px',
        'border-radius': 'var(--r-sm)',
        background: 'var(--elev)', color: 'var(--fg)',
        border: '1px solid var(--line2)',
        'box-shadow': 'var(--moov-shadow-2xl)',
        'font-size': '13px',
        animation: 'fadein var(--dur) var(--ease)',
      }}
    >
      <Show when={teinte()}>
        {(t) => (
          <span aria-hidden="true" style={{ flex: '0 0 auto', display: 'grid', color: t().couleur }}>
            <Icone nom={t().icone} taille={16} plein />
          </span>
        )}
      </Show>
      {props.notification.message}
    </div>
  )
}
