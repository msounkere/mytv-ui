import { For, Show } from 'solid-js'

export interface PisteLecteur {
  libelle: string
  codec?: string
  /** Piste que le navigateur n'ouvrira pas — EAC3, typiquement. */
  indecodable?: boolean
}

export interface PistesLecteurProps {
  titre: string
  pistes: PisteLecteur[]
  selection: number
  surChoisir: (index: number) => void
  /** Message quand le navigateur n'expose aucune piste pour ce fichier. */
  vide: string
}

export default function PistesLecteur(props: PistesLecteurProps) {
  return (
    <section style={{ display: 'grid', 'align-content': 'start', gap: '4px' }}>
      <h2
        class="tertiaire"
        style={{
          padding: '0 6px 4px', 'font-size': '11px',
          'text-transform': 'uppercase', 'letter-spacing': '.06em',
        }}
      >
        {props.titre}
      </h2>

      <Show
        when={props.pistes.length > 0}
        fallback={
          <p class="tertiaire" style={{ margin: 0, padding: '0 6px', 'font-size': '12px' }}>{props.vide}</p>
        }
      >
        <For each={props.pistes}>
          {(piste, i) => {
            const actif = () => i() === props.selection
            return (
              <button
                onClick={() => props.surChoisir(i())}
                role="radio"
                aria-checked={actif()}
                style={{
                  display: 'flex', 'align-items': 'center', gap: '10px',
                  width: '100%', padding: '8px', 'text-align': 'left',
                  'border-radius': 'var(--r-xs)',
                  background: actif() ? 'var(--acc-bg)' : undefined,
                  color: actif() ? 'var(--acc-fg)' : undefined,
                }}
              >
                {/* Le sous-ensemble de police n'embarque pas les ronds de
                    sélection : on les dessine, c'est exact et sans octet. */}
                <span
                  aria-hidden="true"
                  style={{
                    flex: '0 0 auto', display: 'grid', 'place-items': 'center',
                    width: '18px', height: '18px', 'border-radius': '50%',
                    border: `1.5px solid ${actif() ? 'var(--acc-fg)' : 'var(--fg3)'}`,
                  }}
                >
                  <Show when={actif()}>
                    <span style={{ width: '8px', height: '8px', 'border-radius': '50%', background: 'var(--acc-fg)' }} />
                  </Show>
                </span>

                <span style={{ flex: 1, 'min-width': 0, display: 'grid' }}>
                  <span class="tronque" style={{ 'font-size': '13px', 'font-weight': 'var(--w-strong)' }}>
                    {piste.libelle}
                  </span>
                  <Show when={piste.codec}>
                    {(c) => (
                      <span class="tronque tertiaire num" style={{ 'font-size': '11px' }}>{c()}</span>
                    )}
                  </Show>
                </span>

                <Show when={piste.indecodable}>
                  <span
                    style={{
                      flex: '0 0 auto', padding: '1px 6px', 'font-size': '11px',
                      'border-radius': 'var(--r-2xs)',
                      background: 'var(--cod-bg)', color: 'var(--cod)',
                    }}
                  >
                    Non décodable
                  </span>
                </Show>
              </button>
            )
          }}
        </For>
      </Show>
    </section>
  )
}
