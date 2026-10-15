import { Show, createSignal } from 'solid-js'
import { encreLogo, monogramme, plaque, plaqueTexte, tailleMonogramme } from './couleurs'
import type { EntreeCatalogue } from '../lib/db'

// Colonne « Récents » : une ligne de 48 px, donc aucune place pour une
// vignette lisible. La maquette donne 44 px au logo d'une chaîne — reconnaissable
// — et seulement 20 px à une affiche, réduite à un repère de couleur.

export default function LigneRecente(props: {
  entree: EntreeCatalogue
  /** « Direct · Généraliste ». */
  sousTitre: string
  /** « il y a 12 min ». */
  depuis: string
  surOuvrir: (e: EntreeCatalogue) => void
}) {
  const [chargee, poserChargee] = createSignal(false)
  const direct = () => props.entree.type === 'live'
  const texte = () => (direct() ? monogramme(props.entree.nom) : '')

  return (
    <button class="ligne-recente" title={props.entree.nom} onClick={() => props.surOuvrir(props.entree)}>
      <div
        style={{
          position: 'relative', width: direct() ? '44px' : '20px', height: '30px', flex: 'none',
          'border-radius': 'var(--r-xs)',
          background: direct() ? 'var(--plate)' : plaque(props.entree.nom),
          color: direct() ? encreLogo(props.entree.nom) : plaqueTexte(props.entree.nom),
          display: 'flex', 'align-items': 'center', 'justify-content': 'center',
          'font-family': 'var(--moov-font-heading)',
          'font-size': direct() ? tailleMonogramme(texte()) : '9px',
          'font-weight': 'var(--w-strong)', overflow: 'hidden',
        }}
      >
        {texte()}
        <Show when={direct() && props.entree.icone}>
          <img
            src={props.entree.icone}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => poserChargee(true)}
            onError={() => poserChargee(false)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              'object-fit': 'contain', background: 'var(--plate)',
              opacity: chargee() ? '1' : '0', transition: 'opacity var(--dur) var(--ease)',
            }}
          />
        </Show>
      </div>

      <div style={{ 'min-width': 0, flex: 1 }}>
        <div class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{props.entree.nom}</div>
        <div class="tronque" style={{ 'font-size': '12px', color: 'var(--fg3)' }}>{props.sousTitre}</div>
      </div>

      <span class="num" style={{ 'font-size': '11px', color: 'var(--fg3)', 'white-space': 'nowrap' }}>
        {props.depuis}
      </span>
    </button>
  )
}
