// Barre d'avancement d'un film ou d'un episode (US-45 CA3/CA4) : la part vue,
// sans texte -- le libelle (« reste 23 min ») est a cote, porte par l'appelant.
export default function BarreProgression(props: { part: number; hauteur?: number; largeur?: string }) {
  const pc = () => Math.max(0, Math.min(100, Math.round(props.part * 100)))
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pc()}
      data-role="progression"
      style={{
        display: 'block', width: props.largeur ?? '100%', height: `${props.hauteur ?? 4}px`,
        'border-radius': '2px', background: 'var(--line2)', overflow: 'hidden', flex: '0 0 auto',
      }}
    >
      <span style={{ display: 'block', height: '100%', width: `${pc()}%`, background: 'var(--acc-fg)' }} />
    </span>
  )
}
