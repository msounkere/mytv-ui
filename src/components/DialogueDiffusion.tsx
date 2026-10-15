import { Show } from 'solid-js'
import Icone from './Icone'
import { estBureau, estMobile } from '../lib/gabarit'
import { ENCRE, ENCRE2, ENCRE3 } from './ControlesLecteur'
import type { EtatDiffusion } from '../lib/cast'

// Le choix de l'appareil appartient au navigateur (Remote Playback API) : aucun
// SDK tiers n'est chargé. Ce panneau explique ce qui va se passer et déclenche
// le sélecteur natif — il ne liste pas des appareils qu'il ne peut pas voir.

const LIBELLE_ETAT: Record<EtatDiffusion, string> = {
  indisponible: 'Aucun appareil visible depuis ce réseau',
  prete: 'Chrome, Edge et Safari proposent leurs appareils',
  connexion: 'Connexion à l’appareil…',
  diffusion: 'Diffusion en cours — cette page sert de télécommande',
}

export default function DialogueDiffusion(props: {
  etat: EtatDiffusion
  /** Hauteur à réserver sous le panneau pour ne pas couvrir les contrôles. */
  basPx: number
  /** Le téléviseur décode l'EAC3 que le navigateur refuse. */
  resoutLeCodec: boolean
  surChoisir: () => void
  surArreter: () => void
  surFermer: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label="Diffuser sur un écran"
      style={{
        position: 'absolute', right: estBureau() ? '16px' : '8px',
        bottom: estBureau() ? `${props.basPx}px` : '8px',
        // Dans la vidéo empilée, le panneau couvre les contrôles plutôt que de
        // déborder en haut : il garde un défilement propre.
        width: estBureau() ? '330px' : 'min(330px, calc(100% - 16px))', padding: '6px',
        ...(estBureau() ? {} : { 'max-height': 'calc(100% - 16px)', overflow: 'auto', 'z-index': 6 }),
        background: 'rgba(13,20,30,.86)',
        'backdrop-filter': 'blur(20px) saturate(1.4)',
        border: '1px solid rgba(160,190,225,.16)',
        'border-radius': 'var(--r-xl)',
        color: ENCRE,
      }}
    >
      <div style={{ display: 'grid', gap: '2px', padding: '10px 10px 8px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <h2 style={{ flex: 1, 'font-size': '14px' }}>Diffuser sur un écran</h2>
          <button
            onClick={props.surFermer} aria-label="Fermer" title="Fermer (C)"
            style={{ display: 'grid', 'place-items': 'center', color: ENCRE2, ...(estMobile() ? { width: '44px', height: '44px' } : {}) }}
          >
            <Icone nom="close" taille={18} />
          </button>
        </div>
        <p style={{ margin: 0, 'font-size': '12px', 'line-height': '17px', color: ENCRE2 }}>
          Le téléviseur va chercher le flux lui-même, en plein débit sur le réseau local.
        </p>
      </div>

      <div style={{ padding: '6px 10px 4px' }}>
        <span
          style={{
            'font-size': '11px', 'font-weight': 'var(--w-strong)',
            'text-transform': 'uppercase', 'letter-spacing': '.06em', color: ENCRE3,
          }}
        >
          Appareils du navigateur
        </span>
      </div>

      <button
        onClick={props.etat === 'diffusion' ? props.surArreter : props.surChoisir}
        disabled={props.etat === 'indisponible'}
        aria-disabled={props.etat === 'indisponible'}
        style={{
          display: 'flex', 'align-items': 'center', gap: '10px',
          width: '100%', padding: '8px 10px', 'text-align': 'left',
          'border-radius': 'var(--r-xs)',
          color: props.etat === 'diffusion' ? 'var(--acc-fg)' : ENCRE,
          background: props.etat === 'diffusion' ? 'var(--acc-bg)' : undefined,
          opacity: props.etat === 'indisponible' ? 0.5 : undefined,
          cursor: props.etat === 'indisponible' ? 'not-allowed' : undefined,
        }}
      >
        <span style={{ flex: '0 0 auto', display: 'grid', color: props.etat === 'diffusion' ? 'var(--acc-fg)' : ENCRE2 }}>
          <Icone nom="cast" taille={20} plein={props.etat === 'diffusion'} />
        </span>
        <span style={{ flex: 1, 'min-width': 0, display: 'grid' }}>
          <span style={{ 'font-size': '13px', 'font-weight': 'var(--w-strong)' }}>
            {props.etat === 'diffusion' ? 'Arrêter la diffusion' : 'Choisir un appareil'}
          </span>
          <span class="tronque" style={{ 'font-size': '12px', color: ENCRE2 }}>{LIBELLE_ETAT[props.etat]}</span>
        </span>
        <Show when={props.resoutLeCodec}>
          <span
            class="num"
            style={{
              flex: '0 0 auto', padding: '1px 6px', 'font-size': '11px',
              'border-radius': 'var(--r-2xs)', background: 'var(--cod-bg)', color: 'var(--cod)',
            }}
          >
            EAC3 OK
          </span>
        </Show>
      </button>

      <p
        style={{
          margin: 0, padding: '10px', 'font-size': '12px', 'line-height': '17px',
          'border-top': '1px solid rgba(160,190,225,.16)', color: ENCRE2,
        }}
      >
        Une seule connexion : la lecture s’arrête ici quand le téléviseur prend le relais.
      </p>
    </div>
  )
}
