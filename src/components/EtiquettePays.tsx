import { Show } from 'solid-js'

// Le pays arrive colle au nom (« FR - TF1 ») : le brief demande de le traiter
// comme une etiquette distincte, pas comme du texte.

export default function EtiquettePays(props: { pays?: string }) {
  return (
    <Show when={props.pays}>
      <span
        class="num"
        style={{
          flex: '0 0 auto', padding: '1px 5px',
          'font-size': '11px', 'font-weight': 'var(--w-strong)',
          color: 'var(--fg3)', background: 'var(--elev)',
          border: '1px solid var(--line)', 'border-radius': 'var(--r-2xs)',
        }}
      >
        {props.pays}
      </span>
    </Show>
  )
}
