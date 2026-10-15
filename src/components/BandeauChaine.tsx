import { Show } from 'solid-js'
import SubstitutLogo from './SubstitutLogo'
import EtiquettePays from './EtiquettePays'
import { ENCRE, ENCRE2 } from './ControlesLecteur'
import { estMobile } from '../lib/gabarit'
import type { EntreeCatalogue } from '../lib/db'

// Après un zap, l'image met une seconde ou deux à dire sur quoi on est tombé.
// Ce bandeau le dit tout de suite, puis s'efface — il ne reste jamais assez
// longtemps pour gêner le programme qu'il annonce.

/** Durée d'affichage après chaque changement de chaîne, mesurée sur la maquette. */
export const DUREE_BANDEAU = 3500

export default function BandeauChaine(props: {
  entree: EntreeCatalogue
  /** Programme en cours quand le guide le connaît. */
  programme?: string
  /** Tranche horaire du programme, « 20:00 – 21:00 ». */
  horaire?: string
}) {
  return (
    <div
      data-role="bandeau-chaine"
      style={{
        position: 'absolute', left: estMobile() ? '8px' : '16px', top: estMobile() ? '52px' : '76px',
        display: 'flex', 'align-items': 'center', gap: '12px',
        padding: '10px 14px 10px 10px',
        'max-width': estMobile() ? 'calc(100% - 16px)' : 'calc(100% - 32px)',
        'border-radius': 'var(--r-md)',
        background: 'rgba(20,20,20,.86)', 'backdrop-filter': 'blur(24px)',
        border: '1px solid rgba(255,255,255,.12)',
        'z-index': 4, color: ENCRE,
        animation: 'fadein var(--dur) var(--ease)',
      }}
    >
      <EtiquettePays pays={props.entree.pays} />
      <SubstitutLogo nom={props.entree.nom} src={props.entree.icone} taille={40} />
      <div style={{ display: 'flex', 'flex-direction': 'column', 'min-width': 0 }}>
        <span class="tronque" style={{ 'font-size': '14px', 'font-weight': 'var(--w-strong)' }}>
          {props.entree.nom}
        </span>
        <span class="tronque" style={{ 'font-size': '13px', color: ENCRE2 }}>
          <Show when={props.horaire}>
            <span class="num">{props.horaire} · </span>
          </Show>
          {props.programme ?? 'Aucun programme au guide pour cette chaîne'}
        </span>
      </div>
    </div>
  )
}
