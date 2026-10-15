import { For, Show } from 'solid-js'
import SubstitutLogo from './SubstitutLogo'
import EtiquettePays from './EtiquettePays'
import Icone from './Icone'
import { ENCRE, ENCRE2, ENCRE3 } from './ControlesLecteur'
import { estBureau, estMobile } from '../lib/gabarit'
import type { Programme } from '../lib/epg'
import type { EntreeCatalogue } from '../lib/db'

// Zapper à l'aveugle fait perdre la chaîne qu'on regardait. Le mini-guide
// montre ce qui passe autour, sans quitter le flux ni ouvrir le guide complet.

/** Chaînes montrées autour de celle en cours, mesuré sur la maquette. */
export const FENETRE_MINI_GUIDE = 8
/** Combien de chaînes restent visibles AVANT celle qu'on regarde. */
const AVANT = 2

/** Fenêtre circulaire centrée sur la chaîne en cours. */
export function fenetreAutour<T>(elements: T[], index: number, taille = FENETRE_MINI_GUIDE): T[] {
  if (elements.length === 0) return []
  const n = Math.min(taille, elements.length)
  const depart = index < 0 ? 0 : index - AVANT
  return Array.from({ length: n }, (_, d) => elements[(depart + d + elements.length * 2) % elements.length]!)
}

export interface MiniGuideProps {
  titre: string
  elements: EntreeCatalogue[]
  cleActive: string
  /** Programme du moment, quand le guide a répondu pour cette chaîne. */
  programme: (e: EntreeCatalogue) => Programme | undefined
  ensuite: (e: EntreeCatalogue) => Programme | undefined
  surChoisir: (e: EntreeCatalogue) => void
  surFermer: () => void
}

export default function MiniGuide(props: MiniGuideProps) {
  return (
    <div
      role="dialog"
      aria-label="Mini-guide"
      style={{
        position: 'absolute', left: '12px', right: '12px',
        // Dans la vidéo empilée il ne resterait que quelques pixels au-dessus
        // des contrôles : le guide prend toute la hauteur et les recouvre.
        ...(estBureau() ? { bottom: '96px', 'max-height': 'calc(100% - 180px)' } : { top: '8px', bottom: '8px' }),
        display: 'flex', 'flex-direction': 'column',
        'border-radius': 'var(--r-md)',
        background: 'rgba(20,20,20,.9)', 'backdrop-filter': 'blur(24px)',
        border: '1px solid rgba(255,255,255,.12)',
        'z-index': 6, overflow: 'hidden', color: ENCRE,
        animation: 'fadein var(--dur) var(--ease)',
      }}
    >
      <div
        style={{
          display: 'flex', 'align-items': 'center', gap: '8px',
          padding: '10px 12px',
          'border-bottom': '1px solid rgba(255,255,255,.1)',
        }}
      >
        <span aria-hidden="true" style={{ display: 'grid' }}>
          <Icone nom="tv_guide" taille={16} />
        </span>
        <span class="tronque" style={{ flex: 1, 'min-width': 0, 'font-weight': 'var(--w-strong)' }}>
          {props.titre}
        </span>
        <button
          onClick={props.surFermer}
          aria-label="Fermer le mini-guide"
          title="Fermer le mini-guide (G)"
          style={{
            display: 'grid', 'place-items': 'center', width: estMobile() ? '44px' : '28px', height: estMobile() ? '44px' : '28px',
            'border-radius': 'var(--r-xs)', color: ENCRE2,
          }}
        >
          <Icone nom="close" taille={16} />
        </button>
      </div>

      <div style={{ overflow: 'auto' }}>
        <For each={props.elements}>
          {(v) => {
            const actif = () => v.cle === props.cleActive
            const p = () => props.programme(v)
            return (
              <button
                onClick={() => props.surChoisir(v)}
                aria-current={actif() ? 'true' : undefined}
                style={{
                  display: 'grid', 'grid-template-columns': '28px 46px minmax(0,1fr)',
                  'align-items': 'center', gap: '10px',
                  width: '100%', padding: '8px 12px', 'min-height': estMobile() ? '44px' : undefined, 'text-align': 'left',
                  'border-radius': 0,
                  'border-left': `3px solid ${actif() ? 'var(--acc-fg)' : 'transparent'}`,
                  background: actif() ? 'rgba(98,171,245,.22)' : undefined,
                  color: ENCRE,
                }}
              >
                <span style={{ display: 'grid', 'justify-items': 'end' }}>
                  <EtiquettePays pays={v.pays} />
                </span>
                <SubstitutLogo nom={v.nom} src={v.icone} taille={30} />
                <span style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', 'min-width': 0 }}>
                  <span style={{ display: 'flex', gap: '8px', 'min-width': 0 }}>
                    <span
                      class="tronque"
                      style={{ flex: '0 0 auto', 'max-width': '40%', 'font-weight': 'var(--w-strong)' }}
                    >
                      {v.nom}
                    </span>
                    <span class="tronque" style={{ color: ENCRE2 }}>
                      {p()?.titre ?? 'Aucun programme'}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'flex', 'align-items': 'center', gap: '8px',
                      'min-width': 0, 'font-size': '11px', color: ENCRE3,
                    }}
                  >
                    <Show when={p()}>
                      {(x) => (
                        <>
                          <span class="num" style={{ flex: '0 0 auto' }}>{plage(x())}</span>
                          <span
                            style={{
                              flex: '0 0 auto', width: '60px', height: '3px',
                              'border-radius': '2px', background: 'rgba(255,255,255,.2)',
                            }}
                          >
                            <span
                              style={{
                                display: 'block', height: '100%', width: `${avancement(x())}%`,
                                'border-radius': '2px', background: 'var(--acc-fg)',
                              }}
                            />
                          </span>
                        </>
                      )}
                    </Show>
                    <Show when={props.ensuite(v)}>
                      {(n) => <span class="tronque">Ensuite : {n().titre}</span>}
                    </Show>
                  </span>
                </span>
              </button>
            )
          }}
        </For>
      </div>
    </div>
  )
}

/** « 20:00 – 21:00 » ; un programme sans horaire n'affiche pas de tirets. */
export function plage(p: Programme): string {
  if (!p.debut || !p.fin) return ''
  return `${hhmm(p.debut)} – ${hhmm(p.fin)}`
}

export function avancement(p: Programme, maintenant = Date.now()): number {
  if (!p.debut || p.fin <= p.debut) return 0
  return Math.max(0, Math.min(100, ((maintenant - p.debut) / (p.fin - p.debut)) * 100))
}

export function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
