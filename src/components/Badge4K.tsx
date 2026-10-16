import { Show } from 'solid-js'
import { est4K, MESSAGE_4K } from '../lib/modes-direct'

// Pastille « 4K » d'une chaine : ces flux sont souvent illisibles dans un
// navigateur (HEVC) ou lents a demarrer (conversion). On le dit avant le clic.
export default function Badge4K(props: { nom: string }) {
  return (
    <Show when={est4K(props.nom)}>
      <span
        data-role="badge-4k"
        title={MESSAGE_4K}
        aria-label="Chaîne 4K : peut être non lisible dans ce navigateur"
        style={{
          flex: 'none', 'font-family': 'var(--moov-font-mono)', 'font-size': '10px', 'line-height': '14px',
          padding: '0 4px', 'border-radius': 'var(--r-2xs)', background: 'var(--lim-bg)', color: 'var(--lim)',
        }}
      >
        4K
      </span>
    </Show>
  )
}
