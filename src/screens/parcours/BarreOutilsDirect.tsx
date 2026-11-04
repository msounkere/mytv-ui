import { estBureau, estMobile } from '../../lib/gabarit'
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js'
import Icone from '../../components/Icone'
import SelecteurSegmente from '../../components/SelecteurSegmente'

// La rangée de commandes de Direct, mesurée à 56 px sur la maquette : ce qu'on
// regarde, ce qu'on y cherche, et sous quelle forme on le voit. Les trois sont
// côte à côte parce qu'ils portent sur la MÊME liste.
//
// Lot 10 (US-47 CA2, audit A bug 11 / D5) : sous 1100 px, le titre et le
// compteur gardent la place ; les commandes rares (masquer la catégorie, les
// 4K, le guide) se replient dans un menu « ⋯ », et le champ de filtre prend une
// seconde rangée — il n'est plus dans le panneau des catégories, où il
// doublait « Rechercher une catégorie » (A UX16). « Guide TV » n'est plus un
// troisième mode du sélecteur : c'est un lien distinct (A UX12).

export const MODES: Array<{ cle: string; libelle: string; icone: string }> = [
  { cle: 'liste', libelle: 'Liste', icone: 'view_list' },
  { cle: 'cartes', libelle: 'Cartes', icone: 'grid_view' },
]

export type ModeDirect = 'liste' | 'cartes'

export default function BarreOutilsDirect(props: {
  titre: string
  compte: string
  filtre: string
  surFiltre: (valeur: string) => void
  /** Absent quand aucune catégorie n'est active : rien à masquer. */
  masquee?: boolean
  surMasquer: () => void
  mode: string
  surMode: (cle: string) => void
  /** Option « masquer les chaînes 4K » (absente : pas de bouton). */
  masquer4K?: boolean
  surMasquer4K?: () => void
  /** Mobile : ouvre le panneau des catégories. */
  surCategories?: () => void
  /** Lien vers l'écran Guide. */
  surGuide: () => void
}): JSX.Element {
  const libelleMasquage = () =>
    props.masquee ? 'Réafficher la catégorie' : 'Masquer la catégorie'
  const libelle4K = () => (props.masquer4K ? 'Réafficher les chaînes 4K' : 'Masquer les chaînes 4K')
  const compact = () => !estBureau()

  const champFiltre = (hauteur: number) => (
    <div style={{ position: 'relative', flex: compact() ? '1' : 'none', width: compact() ? undefined : '230px', 'min-width': '0' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', left: '10px', top: `${(hauteur - 16) / 2}px`,
          display: 'flex', color: 'var(--fg3)', 'pointer-events': 'none',
        }}
      >
        <Icone nom="filter_list" taille={16} />
      </span>
      <input
        value={props.filtre}
        onInput={(e) => props.surFiltre(e.currentTarget.value)}
        placeholder="Filtrer cette liste"
        aria-label="Filtrer les chaînes de cette liste"
        style={{
          width: '100%',
          height: `${hauteur}px`,
          padding: '0 10px 0 32px',
          'border-radius': 'var(--r-sm)',
          border: '1px solid var(--line2)',
          'border-bottom-color': 'var(--fg3)',
          background: 'var(--elev)',
          'font-size': '13px',
        }}
      />
    </div>
  )

  const titre = (
    <div style={{ display: 'flex', 'flex-direction': 'column', 'min-width': '0', flex: '1' }}>
      <h1 class="tronque" data-role="titre-direct" style={{ 'font-size': '18px', 'line-height': '22px' }}>{props.titre}</h1>
      <span class="num tronque" data-role="compte-direct" style={{ 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)', 'white-space': 'nowrap' }}>
        {props.compte}
      </span>
    </div>
  )

  const selecteur = (
    <SelecteurSegmente
      etiquette="Mode d’affichage"
      segments={MODES}
      actif={props.mode}
      surChoisir={props.surMode}
      iconesSeules={!estBureau()}
    />
  )

  return (
    <Show
      when={!compact()}
      fallback={
        <div style={{ 'flex': 'none', 'border-bottom': '1px solid var(--line)', 'min-width': '0' }}>
          <div
            style={{
              display: 'flex', 'align-items': 'center', gap: '8px', height: '56px',
              padding: estMobile() ? '0 8px 0 12px' : '0 12px 0 16px', 'min-width': '0',
            }}
          >
            <Show when={estMobile() && props.surCategories}>
              <button
                aria-label="Catégories"
                aria-haspopup="dialog"
                data-role="ouvrir-categories"
                onClick={() => props.surCategories?.()}
                style={{
                  width: '44px', height: '44px', 'flex': 'none', padding: '0',
                  display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                  'border-radius': 'var(--r-btn-sm)', border: '1px solid var(--line2)',
                }}
              >
                <Icone nom="filter_list" taille={20} />
              </button>
            </Show>
            {titre}
            <MenuOutils
              entrees={[
                ...(props.masquee !== undefined
                  ? [{ libelle: libelleMasquage(), icone: props.masquee ? 'star' : 'filter_alt_off', action: props.surMasquer }]
                  : []),
                ...(props.surMasquer4K
                  ? [{ libelle: libelle4K(), icone: 'hd', action: () => props.surMasquer4K?.(), presse: !!props.masquer4K }]
                  : []),
                { libelle: 'Ouvrir le guide TV', icone: 'tv_guide', action: props.surGuide },
              ]}
            />
          </div>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: estMobile() ? '0 12px 8px' : '0 16px 8px', 'min-width': '0' }}>
            {champFiltre(44)}
            {selecteur}
          </div>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '10px',
          height: '56px',
          padding: '0 20px',
          'border-bottom': '1px solid var(--line)',
          'flex': 'none',
          'min-width': '0',
        }}
      >
        {titre}
        {champFiltre(32)}

        <Show when={props.masquee !== undefined}>
          <button
            aria-label={libelleMasquage()}
            title={libelleMasquage()}
            onClick={props.surMasquer}
            style={{
              width: '32px', height: '32px', 'flex': 'none', padding: '0',
              'border-radius': 'var(--r-btn-sm)',
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              color: 'var(--fg2)',
            }}
          >
            <Icone nom={props.masquee ? 'star' : 'filter_alt_off'} taille={18} />
          </button>
        </Show>

        <Show when={props.surMasquer4K}>
          <button
            data-role="filtre-4k"
            aria-pressed={!!props.masquer4K}
            aria-label={libelle4K()}
            title={props.masquer4K ? 'Réafficher les chaînes 4K' : 'Masquer les chaînes 4K (souvent illisibles en navigateur)'}
            onClick={() => props.surMasquer4K?.()}
            style={{
              height: '32px', 'flex': 'none',
              padding: '0 8px', 'border-radius': 'var(--r-btn-sm)', 'font-size': '12px',
              border: '1px solid var(--line2)', color: props.masquer4K ? 'var(--lim)' : 'var(--fg2)',
              background: props.masquer4K ? 'var(--lim-bg)' : 'transparent',
            }}
          >
            {props.masquer4K ? '4K masquée' : '4K'}
          </button>
        </Show>

        {selecteur}

        {/* Un lien, pas un mode : il quitte l'écran (A UX12). */}
        <button
          data-role="lien-guide"
          onClick={props.surGuide}
          style={{
            height: '32px', 'flex': 'none', padding: '0 10px', display: 'flex', 'align-items': 'center', gap: '6px',
            'border-radius': 'var(--r-btn-sm)', 'font-size': '13px', 'font-weight': 'var(--w-strong)',
            color: 'var(--acc-fg)', 'white-space': 'nowrap',
          }}
        >
          <Icone nom="tv_guide" taille={16} />
          Guide TV
          <Icone nom="chevron_right" taille={16} />
        </button>
      </div>
    </Show>
  )
}

interface EntreeMenu {
  libelle: string
  icone: string
  action: () => void
  presse?: boolean
}

/**
 * Menu « ⋯ » des commandes repliées. Ouverture au `click`, fermeture au clic
 * extérieur (phase bouillonnante, après le clic), à Échap et au choix ; le
 * focus entre dans le menu et revient au bouton (US-47 CA7).
 */
function MenuOutils(props: { entrees: EntreeMenu[] }): JSX.Element {
  const [ouvert, poserOuvert] = createSignal(false)
  let bouton: HTMLButtonElement | undefined
  let menu: HTMLDivElement | undefined

  createEffect(() => {
    if (!ouvert()) return
    requestAnimationFrame(() => menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    const dehors = (e: MouseEvent) => {
      if (menu?.contains(e.target as Node) || bouton?.contains(e.target as Node)) return
      poserOuvert(false)
    }
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        fermer()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const liste = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
      const i = liste.indexOf(document.activeElement as HTMLElement)
      if (i < 0) return
      e.preventDefault()
      liste[(i + (e.key === 'ArrowDown' ? 1 : liste.length - 1)) % liste.length]?.focus()
    }
    document.addEventListener('click', dehors)
    document.addEventListener('keydown', clavier)
    onCleanup(() => {
      document.removeEventListener('click', dehors)
      document.removeEventListener('keydown', clavier)
    })
  })

  function fermer() {
    poserOuvert(false)
    bouton?.focus()
  }

  return (
    <div style={{ position: 'relative', 'flex': 'none' }}>
      <button
        ref={bouton}
        aria-label="Plus d’options"
        title="Plus d’options"
        aria-haspopup="menu"
        aria-expanded={ouvert()}
        data-role="menu-direct"
        onClick={() => poserOuvert((v) => !v)}
        style={{
          width: '44px', height: '44px', padding: '0', display: 'flex', 'align-items': 'center', 'justify-content': 'center',
          'border-radius': 'var(--r-btn-sm)', color: 'var(--fg2)',
        }}
      >
        <Icone nom="more_vert" taille={22} />
      </button>
      <Show when={ouvert()}>
        <div
          ref={menu}
          role="menu"
          aria-label="Options de la liste"
          style={{
            position: 'absolute', right: '0', top: 'calc(100% + 4px)', 'z-index': '45',
            'min-width': '220px', 'max-width': '90vw', padding: '6px',
            'border-radius': 'var(--r-md)', background: 'var(--elev)',
            border: '1px solid var(--line2)', 'box-shadow': 'var(--moov-shadow-2xl)',
          }}
        >
          <For each={props.entrees}>
            {(e) => (
              <button
                role="menuitem"
                aria-pressed={e.presse}
                onClick={() => {
                  e.action()
                  fermer()
                }}
                style={{
                  display: 'flex', 'align-items': 'center', gap: '10px', width: '100%',
                  'min-height': '44px', padding: '0 10px', 'border-radius': 'var(--r-xs)',
                  'text-align': 'left', 'font-size': '14px', 'white-space': 'nowrap',
                  color: e.presse ? 'var(--lim)' : 'var(--fg)',
                }}
              >
                <Icone nom={e.icone} taille={18} />
                <span style={{ flex: 1 }}>{e.libelle}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
