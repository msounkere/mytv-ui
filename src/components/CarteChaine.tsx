import { Show, createSignal } from 'solid-js'
import { encreLogo, monogramme, tailleMonogramme } from './couleurs'
import type { EntreeCatalogue } from '../lib/db'

// Une chaîne favorite sans son programme en cours ne dit rien : c'est le titre
// et l'horaire qui décident de zapper, pas le nom de la chaîne. La carte porte
// donc les deux, et reste sur une seule ligne de 60 px.

export default function CarteChaine(props: {
  entree: EntreeCatalogue
  /** « 00:00–02:00 C à vous », vide tant que le guide n'a rien pour la chaîne. */
  programme?: string
  surOuvrir: (e: EntreeCatalogue) => void
}) {
  const [chargee, poserChargee] = createSignal(false)
  const texte = () => monogramme(props.entree.nom)

  return (
    <button class="carte-chaine" title={props.entree.nom} onClick={() => props.surOuvrir(props.entree)}>
      <div
        style={{
          position: 'relative', width: '44px', height: '30px', flex: 'none',
          'border-radius': 'var(--r-xs)', background: 'var(--plate)',
          color: encreLogo(props.entree.nom), display: 'flex',
          'align-items': 'center', 'justify-content': 'center',
          'font-family': 'var(--moov-font-heading)', 'font-size': tailleMonogramme(texte()),
          'font-weight': 'var(--w-strong)', 'letter-spacing': '-.01em', overflow: 'hidden',
        }}
      >
        {texte()}
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
              'object-fit': 'contain', background: 'var(--plate)',
              opacity: chargee() ? '1' : '0', transition: 'opacity var(--dur) var(--ease)',
            }}
          />
        </Show>
      </div>

      <div style={{ 'min-width': 0, flex: 1, display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'min-width': 0 }}>
          <span class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{props.entree.nom}</span>
          <Show when={props.entree.pays}>
            <span
              style={{
                flex: 'none', 'font-family': 'var(--moov-font-mono)',
                'font-size': '10px', 'line-height': '14px', padding: '0 4px',
                'border-radius': 'var(--r-2xs)', background: 'var(--elev)', color: 'var(--fg3)',
              }}
            >
              {props.entree.pays}
            </span>
          </Show>
        </div>
        <div class="tronque" style={{ 'font-size': '12px', color: 'var(--fg3)' }}>
          {props.programme ?? '—'}
        </div>
      </div>
    </button>
  )
}
