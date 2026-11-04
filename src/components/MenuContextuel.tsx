import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { estMobile } from '../lib/gabarit'
import Icone from './Icone'

// Menu « ⋯ » de toutes les cartes et lignes (lot 10, US-46 CA1). Reecrit apres
// l'audit (A1, B2, C1, C2) : l'ancienne version se fermait au `pointerdown`
// capture sur `window`, AVANT que le `click` n'atteigne l'entree -- aucune
// action ne partait a la souris ni au doigt.
//
// Regles : ouvert au `click` (par l'ancre) ; ferme par un clic EXTERIEUR
// (document, phase bouillonnante, pose apres le clic d'ouverture), par Echap
// (qui rend le focus a l'ancre), par la perte de focus ; le focus va sur la
// premiere entree ; fleches ↑↓, Entree/Espace activent (vrais `<button>`,
// `role=menuitem`) ; largeur adaptee au contenu (220 px min, 90 vw max, D11) ;
// 44 px par entree au doigt. Positionne en `fixed` : la piste d'une rangee est
// en `overflow:auto`, un menu pose dedans serait coupe.

export interface EntreeMenu {
  icone?: string
  libelle: string
  action?: () => void
  /** Texte a droite : un raccourci clavier annonce (« Suppr », « Alt+↑ »). */
  raccourci?: string
  desactive?: boolean
  /** Geste de retrait : en rouge. */
  danger?: boolean
  /** Entree a compteur « − / + » (« Préparer 2 épisodes d’avance ») ; ← → au clavier. */
  compteur?: { surMoins: () => void; surPlus: () => void; moinsDesactive?: boolean; plusDesactive?: boolean }
  /** Entree a choix (« À partir de… ») : un `<select>`, le menu reste ouvert. */
  choix?: { valeur: string; options: Array<{ valeur: string; libelle: string }>; surChoisir: (valeur: string) => void }
}

export interface MenuContextuelProps {
  x: number
  y: number
  entrees: EntreeMenu[]
  surFermer: () => void
  /** Element qui a ouvert le menu : Echap et la fermeture lui rendent le focus. */
  ancre?: HTMLElement | null
  /** Intitule lu par le lecteur d'ecran. */
  libelle?: string
}

const LARGEUR_MIN = 220
const MARGE = 12

/** Position d'ancrage d'un menu sous un bouton (coin bas-droit aligne). */
export function positionSous(el: HTMLElement): { x: number; y: number; ancre: HTMLElement } {
  const r = el.getBoundingClientRect()
  return { x: r.right, y: r.bottom + 6, ancre: el }
}

export default function MenuContextuel(props: MenuContextuelProps) {
  let racine: HTMLDivElement | undefined
  const [taille, poserTaille] = createSignal({ largeur: LARGEUR_MIN, hauteur: 0 })
  const hauteurEntree = () => (estMobile() ? 44 : 36)

  const fermer = (rendreFocus = false) => {
    props.surFermer()
    if (rendreFocus) props.ancre?.focus?.()
  }

  const entreesFocalisables = () => Array.from(racine?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]), select') ?? [])

  function focaliser(index: number) {
    const l = entreesFocalisables()
    if (!l.length) return
    const i = ((index % l.length) + l.length) % l.length
    l[i]?.focus()
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      fermer(true)
      return
    }
    if (e.key === 'Tab') {
      // Le menu est un calque : Tab n'a nulle part ou aller dedans.
      fermer(true)
      return
    }
    const cible = e.target as HTMLElement
    if (cible.tagName === 'SELECT' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return
    const l = entreesFocalisables()
    const i = l.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); focaliser(i + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focaliser(i - 1) }
    else if (e.key === 'Home') { e.preventDefault(); focaliser(0) }
    else if (e.key === 'End') { e.preventDefault(); focaliser(-1) }
  }

  // Clic exterieur : document, phase bouillonnante, pose APRES le clic qui a
  // ouvert le menu (sinon il le refermerait dans le meme tour).
  function auClicDocument(e: MouseEvent) {
    if (racine && e.target instanceof Node && racine.contains(e.target)) return
    fermer(false)
  }
  function auFocusDocument(e: FocusEvent) {
    const cible = e.target
    if (racine && cible instanceof Node && racine.contains(cible)) return
    if (cible === props.ancre) return
    fermer(false)
  }

  let poseur: ReturnType<typeof setTimeout> | undefined
  onMount(() => {
    poseur = setTimeout(() => {
      poseur = undefined
      document.addEventListener('click', auClicDocument)
      document.addEventListener('focusin', auFocusDocument)
    }, 0)
    if (racine) {
      const r = racine.getBoundingClientRect()
      poserTaille({ largeur: Math.max(LARGEUR_MIN, Math.ceil(r.width)), hauteur: Math.ceil(r.height) })
    }
    focaliser(0)
  })
  onCleanup(() => {
    if (poseur) clearTimeout(poseur)
    document.removeEventListener('click', auClicDocument)
    document.removeEventListener('focusin', auFocusDocument)
  })

  // Le menu doit rester dans la fenetre, meme ouvert sur la derniere carte ou
  // en bas de l'ecran : ancre par son coin haut-droit (x = bord droit du bouton).
  const largeurMax = () => Math.floor(window.innerWidth * 0.9)
  const gauche = () => {
    const l = Math.min(taille().largeur, largeurMax())
    return Math.max(MARGE, Math.min(props.x - l, window.innerWidth - l - MARGE))
  }
  const haut = () => {
    const h = taille().hauteur || props.entrees.length * hauteurEntree() + 12
    return Math.max(MARGE, Math.min(props.y, window.innerHeight - h - MARGE))
  }

  const styleEntree = (e: EntreeMenu) => ({
    display: 'flex', 'align-items': 'center', gap: '10px', 'min-height': `${hauteurEntree()}px`,
    padding: '0 12px 0 10px', 'border-radius': 'var(--r-xs)', cursor: e.desactive ? 'default' : 'pointer',
    background: 'transparent', border: 'none', color: e.danger ? 'var(--err)' : 'inherit', 'text-align': 'left' as const,
    width: '100%', 'font-size': '14px', 'white-space': 'nowrap' as const, opacity: e.desactive ? 0.45 : 1,
  })

  return (
    <div
      ref={racine}
      role="menu"
      aria-label={props.libelle ?? 'Options'}
      data-role="menu-contextuel"
      onKeyDown={auClavier}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left: `${gauche()}px`, top: `${haut()}px`, 'z-index': 60,
        'min-width': `${LARGEUR_MIN}px`, 'max-width': '90vw', width: 'max-content',
        padding: '6px', 'border-radius': 'var(--r-md)',
        background: 'var(--elev)', border: '1px solid var(--line2)',
        'box-shadow': 'var(--moov-shadow-2xl)',
      }}
    >
      <style>{'[data-role="menu-contextuel"] [role="menuitem"]:hover:not([disabled]),[data-role="menu-contextuel"] [role="menuitem"]:focus-visible{background:var(--hover);outline:none}'}</style>
      <For each={props.entrees}>
        {(e) => (
          <Show
            when={!e.compteur && !e.choix}
            fallback={
              <div
                role="menuitem"
                tabindex={e.choix ? -1 : 0}
                aria-label={e.libelle}
                data-role="menu-entree"
                onKeyDown={(ev) => {
                  if (!e.compteur) return
                  if (ev.key === 'ArrowLeft' && !e.compteur.moinsDesactive) { ev.preventDefault(); ev.stopPropagation(); e.compteur.surMoins() }
                  if (ev.key === 'ArrowRight' && !e.compteur.plusDesactive) { ev.preventDefault(); ev.stopPropagation(); e.compteur.surPlus() }
                }}
                style={{ ...styleEntree(e), cursor: 'default' }}
              >
                <Show when={e.icone}>{(i) => <span style={{ color: 'var(--fg2)', display: 'flex', flex: 'none' }}><Icone nom={i()} taille={18} /></span>}</Show>
                <span style={{ flex: 1 }}>{e.libelle}</span>
                <Show when={e.compteur}>
                  {(c) => (
                    <span style={{ display: 'flex', gap: '4px', flex: 'none' }}>
                      <PetitBouton role="menu-moins" libelle="Un épisode de moins" desactive={c().moinsDesactive} surClic={c().surMoins}>−</PetitBouton>
                      <PetitBouton role="menu-plus" libelle="Un épisode de plus" desactive={c().plusDesactive} surClic={c().surPlus}>+</PetitBouton>
                    </span>
                  )}
                </Show>
                <Show when={e.choix}>
                  {(c) => (
                    <select
                      aria-label={e.libelle}
                      value={c().valeur}
                      onChange={(ev) => c().surChoisir(ev.currentTarget.value)}
                      style={{ height: '28px', 'max-width': '180px', 'border-radius': 'var(--r-xs)', border: '1px solid var(--line2)', background: 'var(--elev)', color: 'inherit' }}
                    >
                      <For each={c().options}>{(o) => <option value={o.valeur}>{o.libelle}</option>}</For>
                    </select>
                  )}
                </Show>
              </div>
            }
          >
            <button
              type="button"
              role="menuitem"
              disabled={e.desactive}
              data-role="menu-entree"
              onClick={() => {
                if (e.desactive) return
                fermer(true)
                e.action?.()
              }}
              style={styleEntree(e)}
            >
              <Show when={e.icone}>{(i) => <span style={{ color: e.danger ? 'var(--err)' : 'var(--fg2)', display: 'flex', flex: 'none' }}><Icone nom={i()} taille={18} /></span>}</Show>
              <span style={{ flex: 1 }}>{e.libelle}</span>
              <Show when={e.raccourci}>{(r) => <span class="num" style={{ 'font-size': '11px', color: 'var(--fg3)', flex: 'none' }}>{r()}</span>}</Show>
            </button>
          </Show>
        )}
      </For>
    </div>
  )
}

function PetitBouton(props: { role: string; libelle: string; desactive?: boolean; surClic: () => void; children: string }) {
  return (
    <button
      type="button"
      data-role={props.role}
      aria-label={props.libelle}
      disabled={props.desactive}
      onClick={(e) => {
        e.stopPropagation()
        props.surClic()
      }}
      style={{
        width: estMobile() ? '36px' : '28px', height: estMobile() ? '36px' : '28px', 'border-radius': 'var(--r-xs)',
        border: '1px solid var(--line2)', background: 'transparent', color: 'inherit', cursor: props.desactive ? 'default' : 'pointer',
        opacity: props.desactive ? 0.4 : 1, 'font-size': '16px', 'line-height': 1,
      }}
    >
      {props.children}
    </button>
  )
}
