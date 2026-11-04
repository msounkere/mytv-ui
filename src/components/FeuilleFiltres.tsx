import { For, Show, createEffect, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'

// Feuille de filtres du mobile (« Filtres · n »). Sur 390 px, la rangée de
// boutons-menus de la barre de bureau déborde sur trois lignes et ses menus de
// 280 px ne laissent plus de place à la grille : tout passe ici, d'un seul
// geste, en pastilles à cocher qui s'appliquent au fil de l'eau.
//
// Mesures relevées sur la maquette à 390 px : feuille posée en bas, montant
// jusqu'à y = 127 (soit 717 px sur 844), titre 18 px, rubriques de 12 px en
// gras, pastilles à coins pleins espacées de 8 px, bouton d'action pleine
// largeur. Les pastilles passent de 35 à 44 px : cahier des charges, cibles
// tactiles.
//
// Elle passe par un <Portal> : elle doit recouvrir la barre d'onglets du bas,
// qui n'appartient pas à cet écran. Fermeture au `click` du voile et jamais au
// `pointerdown` : Solid délègue ses événements au document, une feuille
// démontée entre l'appui et le relâchement n'émettrait pas son clic.

export interface GroupeFeuille {
  titre: string
  options: Array<{ cle: string; libelle: string }>
  choisi: (cle: string) => boolean
  basculer: (cle: string) => void
  /** Un seul choix possible (tri, année) : sémantique « radio ». */
  unique?: boolean
}

export default function FeuilleFiltres(props: {
  groupes: GroupeFeuille[]
  /** Libellé du bouton d'action, par ex. « Afficher 106 973 résultats ». */
  actionLibelle: string
  surEffacerTout: () => void
  surFermer: () => void
}) {
  let feuille: HTMLDivElement | undefined
  createEffect(() => {
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.surFermer()
    }
    document.addEventListener('keydown', echap)
    // Le focus entre dans la feuille et revient au bouton « Filtres » a la
    // fermeture (US-47 CA7, A UX5).
    const ancre = document.activeElement instanceof HTMLElement ? document.activeElement : null
    requestAnimationFrame(() => feuille?.querySelector<HTMLElement>('button')?.focus())
    onCleanup(() => {
      document.removeEventListener('keydown', echap)
      if (ancre && ancre.isConnected) ancre.focus()
    })
  })

  return (
    <Portal>
      <div
        onClick={props.surFermer}
        aria-hidden="true"
        style={{ position: 'fixed', inset: '0', 'z-index': '70', background: 'rgba(0,0,0,.55)' }}
      />
      <div
        ref={feuille}
        role="dialog"
        aria-modal="true"
        aria-label="Filtres"
        style={{
          position: 'fixed', left: '0', right: '0', bottom: '0', 'z-index': '71',
          // `dvh` : sur mobile, `vh` ignore la barre d'adresse et la feuille
          // dépasserait en haut.
          'max-height': 'calc(100dvh - 127px)',
          display: 'flex', 'flex-direction': 'column',
          'border-radius': 'var(--r-lg, 12px) var(--r-lg, 12px) 0 0',
          background: 'var(--panel)', color: 'var(--fg)',
          'box-shadow': 'var(--moov-shadow-2xl)',
        }}
      >
        <div
          style={{
            display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
            height: '48px', padding: '0 16px', 'flex': 'none',
            'border-bottom': '1px solid var(--line)',
          }}
        >
          <h2 style={{ margin: '0', 'font-size': '18px', 'line-height': '24px', 'font-weight': 'var(--w-strong)' }}>
            Filtres
          </h2>
          <button
            onClick={props.surEffacerTout}
            style={{
              height: '44px', padding: '0 4px', 'font-size': '14px',
              'font-weight': 'var(--w-strong)', color: 'var(--acc-fg)',
            }}
          >
            Tout effacer
          </button>
        </div>

        <div style={{ flex: '1', 'min-height': '0', 'overflow-y': 'auto', padding: '4px 16px 8px' }}>
          <For each={props.groupes}>
            {(g) => (
              <Show when={g.options.length > 0}>
                <section aria-label={g.titre} style={{ 'padding-top': '14px' }}>
                  <h3
                    style={{
                      margin: '0 0 8px', 'font-size': '12px', 'line-height': '16px',
                      'font-weight': 'var(--w-strong)', color: 'var(--fg2)',
                    }}
                  >
                    {g.titre}
                  </h3>
                  <div
                    role={g.unique ? 'radiogroup' : 'group'}
                    aria-label={g.titre}
                    style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px' }}
                  >
                    <For each={g.options}>
                      {(o) => (
                        <button
                          role={g.unique ? 'radio' : undefined}
                          aria-checked={g.unique ? g.choisi(o.cle) : undefined}
                          aria-pressed={g.unique ? undefined : g.choisi(o.cle)}
                          onClick={() => g.basculer(o.cle)}
                          style={{
                            height: '44px', padding: '0 16px', 'border-radius': '22px',
                            border: `1px solid ${g.choisi(o.cle) ? 'var(--acc)' : 'var(--line2)'}`,
                            background: g.choisi(o.cle) ? 'var(--acc-bg)' : undefined,
                            color: g.choisi(o.cle) ? 'var(--acc-fg)' : 'var(--fg)',
                            'font-size': '14px', 'white-space': 'nowrap',
                          }}
                        >
                          {o.libelle}
                        </button>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
            )}
          </For>
        </div>

        <div
          style={{
            'flex': 'none', padding: '12px 16px', 'border-top': '1px solid var(--line)',
            // Zone sûre : l'indicateur d'accueil des téléphones recouvre le bas.
            'padding-bottom': 'max(12px, env(safe-area-inset-bottom))',
          }}
        >
          <button
            onClick={props.surFermer}
            style={{
              width: '100%', height: '48px', 'border-radius': 'var(--r-btn-sm)',
              background: 'var(--acc)', color: '#fff', 'font-size': '14px',
              'font-weight': 'var(--w-strong)',
            }}
          >
            {props.actionLibelle}
          </button>
        </div>
      </div>
    </Portal>
  )
}
