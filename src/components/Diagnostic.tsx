import { Show } from 'solid-js'

// « Jamais d'erreur qui ne dit rien » : ce panneau affiche à l'écran ce qui
// échoue, plutôt que de laisser une zone vide et une erreur en console.

export default function Diagnostic(props: { titre: string; erreur: unknown; surReessayer?: () => void }) {
  const texte = () => {
    const e = props.erreur
    if (e instanceof Error) return `${e.name}: ${e.message}`
    return String(e)
  }
  const pile = () => (props.erreur instanceof Error ? props.erreur.stack : undefined)

  return (
    <div
      style={{
        margin: '12px', padding: '12px 14px',
        background: 'var(--err-bg)', border: '1px solid var(--err)',
        'border-radius': 'var(--r-md)',
      }}
    >
      <strong style={{ color: 'var(--err)' }}>{props.titre}</strong>
      <p style={{ margin: '4px 0', 'font-family': 'var(--moov-font-mono)', 'font-size': '12px' }}>{texte()}</p>
      <Show when={pile()}>
        <pre
          class="tertiaire"
          style={{ margin: '6px 0 0', 'font-size': '11px', 'max-height': '160px', overflow: 'auto', 'white-space': 'pre-wrap' }}
        >
          {pile()}
        </pre>
      </Show>
      <Show when={props.surReessayer}>
        <button onClick={() => props.surReessayer?.()} style={{ 'margin-top': '8px', border: '1px solid var(--line2)', padding: '4px 10px' }}>
          Réessayer
        </button>
      </Show>
    </div>
  )
}
