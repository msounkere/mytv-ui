import Icone from './Icone'

// Bascule en pilule de la barre de filtres. Mesures relevées au
// getComputedStyle sur « Lecteur IPTV.dc.html » : 30 px de haut, retraits
// 8/12 px, écart 6 px, rayon 15 px, icône 15 px, texte 13 px. Allumée, elle
// reprend le triplet d'accent du bouton de filtre et son icône passe en plein.

export default function BasculeFiltre(props: {
  libelle: string
  icone: string
  actif: boolean
  surBasculer: () => void
}) {
  return (
    <button
      aria-pressed={props.actif}
      onClick={props.surBasculer}
      style={{
        height: '30px',
        padding: '0 12px 0 8px',
        display: 'flex',
        'align-items': 'center',
        gap: '6px',
        'border-radius': '15px',
        border: `1px solid ${props.actif ? 'var(--acc)' : 'var(--line2)'}`,
        background: props.actif ? 'var(--acc-bg)' : undefined,
        color: props.actif ? 'var(--acc-fg)' : 'var(--fg)',
        'font-size': '13px',
        'white-space': 'nowrap',
        'flex': 'none',
      }}
    >
      <Icone nom={props.icone} taille={15} plein={props.actif} />
      {props.libelle}
    </button>
  )
}
