import { For, Show, createSignal } from 'solid-js'
import { Portal } from 'solid-js/web'

// ADAPTATEUR vers les composants communs fournis par ui-7 (lot 10, US-46) :
// `components/ChipPreparation.tsx`, `components/Toast.tsx` + `lib/toasts.ts`,
// `lib/vu.ts`. Leur contrat est attendu dans /opt/mytv-work/statut/ui-7.composants.pret.
//
// Tant qu'il n'est pas publie, ce fichier porte un STUB minimal a l'interface
// annoncee par docs/lot10.md (US-46 CA3-CA5). A LA FUSION, le coordinateur
// remplace le corps de ce fichier par trois re-exports :
//   export { PART_VUE } from './vu'
//   export { default as ChipPreparation, phraseEtat } from '../components/ChipPreparation'
//   export { toast } from './toasts'
// Tous les fichiers d'ui-6 n'importent que d'ici : un seul endroit a changer.

/** Seuil UNIQUE « vu » (part de la duree), serveur et interface (US-44 CA5, US-46 CA3). */
export const PART_VUE = 0.9

// --- Chip d'etat de preparation --------------------------------------------------

export type EtatChip = 'attente' | 'en_cours' | 'pret' | 'echec'

export interface PropsChipPreparation {
  etat: EtatChip
  octets?: number
  total?: number
  debit_kbps?: number
  raison?: 'lecture_en_cours' | 'file' | 'budget_plein' | 'reprise_apres'
  position?: number
  cause?: string
  reessai?: string
  serie?: { saison: number; episode: number; suivant?: EtatChip }
  /** « Reessayer » apres un echec. */
  surReessayer?: () => void
}

const RAISON: Record<NonNullable<PropsChipPreparation['raison']>, string> = {
  lecture_en_cours: 'une lecture est en cours',
  file: 'dans la file',
  budget_plein: 'disque plein',
  reprise_apres: 'reprise après la lecture',
}

function repere(s: number, e: number): string {
  return `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`
}

/** Phrase d'etat, pour une legende : « ○ En attente · une lecture est en cours », « ⟳ En préparation · 42 % · ~6 min », « ● Prêt », « ✕ Échec · disque plein ». */
export function phraseEtat(p: Omit<PropsChipPreparation, 'surReessayer'>): string {
  const prefixe = p.serie ? `${repere(p.serie.saison, p.serie.episode)} ` : ''
  if (p.etat === 'pret') return `● ${prefixe}Prêt`
  if (p.etat === 'echec') return `✕ ${prefixe}Échec${p.cause ? ` · ${p.cause}` : ''}`
  if (p.etat === 'en_cours') {
    const parts = [`⟳ ${prefixe}En préparation`]
    if (p.octets !== undefined && p.total && p.total > 0) {
      parts.push(`${Math.max(0, Math.min(100, Math.round((p.octets / p.total) * 100)))} %`)
      if (p.debit_kbps && p.debit_kbps > 0) {
        const s = ((p.total - p.octets) * 8) / (p.debit_kbps * 1000)
        parts.push(s < 90 ? '~1 min' : `~${Math.round(s / 60)} min`)
      }
    }
    return parts.join(' · ')
  }
  const raison = p.raison === 'file' && p.position ? `${p.position}e dans la file` : p.raison ? RAISON[p.raison] : undefined
  return `○ ${prefixe}En attente${raison ? ` · ${raison}` : ''}`
}

export function ChipPreparation(props: PropsChipPreparation) {
  const teinte = () => (props.etat === 'pret' ? 'var(--ok)' : props.etat === 'echec' ? 'var(--err)' : props.etat === 'en_cours' ? 'var(--acc-fg)' : 'var(--fg2)')
  return (
    <span
      data-role="chip-preparation"
      data-etat={props.etat}
      style={{
        display: 'inline-flex', 'align-items': 'center', gap: '6px', 'max-width': '100%',
        'font-size': '12px', 'line-height': '18px', padding: '0 8px', 'border-radius': 'var(--r-2xs)',
        border: `1px solid ${teinte()}`, color: teinte(), 'white-space': 'nowrap',
      }}
    >
      <span class="tronque">{phraseEtat(props)}</span>
      <Show when={props.etat === 'echec' && props.surReessayer}>
        {(f) => (
          <button type="button" onClick={() => f()()} style={{ padding: '0 4px', color: 'inherit', 'text-decoration': 'underline', font: 'inherit' }}>
            Réessayer
          </button>
        )}
      </Show>
    </span>
  )
}

// --- Toasts -------------------------------------------------------------------------

export interface OptionsToast {
  message: string
  /** « Annuler » (6 s) : refait le geste inverse. */
  annuler?: () => void
  ton?: 'ok' | 'info' | 'erreur'
}

interface ToastVivant extends OptionsToast {
  id: number
}

const [toasts, poserToasts] = createSignal<ToastVivant[]>([])
let numero = 0
let hoteMonte = false

/** Un seul toast a la fois (4 s, 6 s avec « Annuler »), aria-live, accessible au clavier. */
export function toast(o: OptionsToast): void {
  if (typeof document === 'undefined') return
  numero += 1
  const t: ToastVivant = { ...o, id: numero }
  poserToasts([t])
  setTimeout(() => poserToasts((l) => l.filter((x) => x.id !== t.id)), o.annuler ? 6000 : 4000)
  if (!hoteMonte) {
    hoteMonte = true
    void import('solid-js/web').then(({ render }) => {
      const hote = document.createElement('div')
      document.body.append(hote)
      render(() => <HoteToasts />, hote)
    })
  }
}

function HoteToasts() {
  return (
    <Portal>
      <div aria-live="polite" style={{ position: 'fixed', left: '50%', bottom: 'calc(var(--hauteur-onglets, 0px) + 72px)', transform: 'translateX(-50%)', 'z-index': 96, display: 'grid', gap: '8px', 'max-width': 'calc(100% - 32px)' }}>
        <For each={toasts()}>
          {(t) => (
            <div
              role="status"
              data-role="toast"
              style={{
                display: 'flex', 'align-items': 'center', gap: '12px', padding: '10px 16px',
                'border-radius': 'var(--r-sm)', background: 'var(--elev)', color: 'var(--fg)',
                border: '1px solid var(--line2)', 'box-shadow': 'var(--moov-shadow-2xl)', 'font-size': '13px',
              }}
            >
              <span>{t.message}</span>
              <Show when={t.annuler}>
                {(a) => (
                  <button
                    type="button"
                    onClick={() => { a()(); poserToasts((l) => l.filter((x) => x.id !== t.id)) }}
                    style={{ padding: '4px 8px', 'font-weight': 'var(--w-strong)', color: 'var(--acc-fg)' }}
                  >
                    Annuler
                  </button>
                )}
              </Show>
            </div>
          )}
        </For>
      </div>
    </Portal>
  )
}
