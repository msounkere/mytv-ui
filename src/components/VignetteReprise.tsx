import { Show, createSignal } from 'solid-js'
import Icone from './Icone'
import { plaque } from './couleurs'
import type { EntreeCatalogue } from '../lib/db'

// Grande vignette 16/9 : la reprise est l'action la plus probable à l'ouverture
// de l'application, elle mérite la plus grande cible de l'écran.

export default function VignetteReprise(props: {
  entree: EntreeCatalogue
  /** Fraction lue, entre 0 et 1. */
  progression: number
  sousTitre: string
  /** « reste 17 min ». */
  reste: string
  surOuvrir: (e: EntreeCatalogue) => void
}) {
  const [chargee, poserChargee] = createSignal(false)

  return (
    <button class="reprise" title={props.entree.nom} onClick={() => props.surOuvrir(props.entree)}>
      <div class="reprise-media" style={{ background: plaque(props.entree.nom) }}>
        <Show when={props.entree.icone}>
          <img
            src={props.entree.icone}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => poserChargee(true)}
            onError={() => poserChargee(false)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              'object-fit': 'cover', opacity: chargee() ? '1' : '0',
              transition: 'opacity var(--dur) var(--ease)',
            }}
          />
          {/* Un voile n'est posé que sous l'image : sur la plaque unie, le titre
              est déjà lisible et un dégradé y salirait la couleur. */}
          <Show when={chargee()}>
            <div
              style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(5,8,12,.82) 0%, rgba(5,8,12,.15) 55%, transparent 100%)',
              }}
            />
          </Show>
        </Show>

        <span
          style={{
            position: 'relative', 'font-family': 'var(--moov-font-heading)',
            'font-size': '16px', 'line-height': '20px', 'font-weight': 'var(--w-strong)',
            color: '#fff', 'text-wrap': 'balance', 'text-shadow': '0 1px 8px rgba(0,0,0,.45)',
          }}
        >
          {props.entree.nom}
        </span>

        <div class="reprise-voile">
          <span
            style={{
              width: '48px', height: '48px', 'border-radius': '50%',
              background: 'rgba(255,255,255,.92)', color: '#0a0f16',
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              'box-shadow': '0 4px 16px rgba(0,0,0,.4)',
            }}
          >
            <Icone nom="play_arrow" taille={30} plein />
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={Math.round(props.progression * 100)}
          aria-label={`Progression de ${props.entree.nom}`}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: '4px', background: 'rgba(0,0,0,.45)',
          }}
        >
          <div
            style={{
              height: '100%', width: `${Math.min(100, Math.max(0, props.progression * 100))}%`,
              background: 'var(--acc)',
            }}
          />
        </div>
      </div>

      <div
        class="num"
        style={{
          display: 'flex', 'justify-content': 'space-between', gap: '8px',
          'font-size': '12px', color: 'var(--fg2)',
        }}
      >
        <span class="tronque">{props.sousTitre}</span>
        <span style={{ 'white-space': 'nowrap', color: 'var(--fg3)' }}>{props.reste}</span>
      </div>
    </button>
  )
}
