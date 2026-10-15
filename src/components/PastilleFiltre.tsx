import Icone from './Icone'

// Pastille supprimable : le rappel de ce qui est effectivement filtré, sous la
// rangée de boutons. Mesures relevées au getComputedStyle sur « Lecteur
// IPTV.dc.html » : 26 px de haut, retraits 10/4 px, rayon 13 px, fond --elev2,
// texte 12 px, bouton de retrait rond de 20 px.

export default function PastilleFiltre(props: { libelle: string; surRetirer: () => void }) {
  return (
    <span
      style={{
        height: '26px',
        padding: '0 4px 0 10px',
        display: 'flex',
        'align-items': 'center',
        gap: '4px',
        'border-radius': '13px',
        background: 'var(--elev2)',
        color: 'var(--fg)',
        'font-size': '12px',
        'white-space': 'nowrap',
      }}
    >
      {props.libelle}
      <button
        aria-label={`Retirer le filtre ${props.libelle}`}
        onClick={props.surRetirer}
        style={{
          width: '20px',
          height: '20px',
          padding: '0',
          'border-radius': '50%',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          color: 'var(--fg2)',
        }}
      >
        <Icone nom="close" taille={13} />
      </button>
    </span>
  )
}
