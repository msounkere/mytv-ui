import { For, Show, createSignal } from 'solid-js'
import { Portal } from 'solid-js/web'

// ADAPTATEUR vers les composants communs fournis par ui-7 (lot 10, US-46) :
// `components/ChipPreparation.tsx`, `components/Toast.tsx` + `lib/toasts.ts`,
// `lib/vu.ts`. Leur contrat est attendu dans /opt/mytv-work/statut/ui-7.composants.pret.
//
// Ce fichier porte un STUB minimal a l'interface PUBLIEE par ui-7
// (/opt/mytv-work/statut/ui-7.composants.pret). A LA FUSION, le coordinateur
// remplace le corps de ce fichier par trois re-exports :
//   export { PART_VUE } from './vu'
//   export { default as ChipPreparation, phraseEtat } from '../components/ChipPreparation'
//   export { emettreToast } from './toasts'
// Tous les fichiers d'ui-6 n'importent que d'ici : un seul endroit a changer.
// (Les gestes d'ui-7 -- marquerVu, ajouterMaListe... -- emettent leurs propres
// toasts : si la fusion branche les fiches sur eux, retirer les emettreToast d'ui-6.)

/** Seuil UNIQUE « vu » (part de la duree), serveur et interface (US-44 CA5, US-46 CA3). */
export const PART_VUE = 0.9

// --- Chip d'etat de preparation --------------------------------------------------

export type EtatChip = 'attente' | 'en_cours' | 'pret' | 'echec'

export interface PropsChipPreparation {
  etat?: EtatChip
  /** Raccourci : l'objet tel que GET /profil/a_voir le rend (prime sur les champs). */
  preparation?: { etat?: string; octets?: number; total?: number; debitKbps?: number; debit_kbps?: number; raison?: string; position?: number; cause?: string; reessai?: string }
  forme?: 'chip' | 'badge' | 'ligne'
  compact?: boolean
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
function normaliser(p: Omit<PropsChipPreparation, 'surReessayer'>): Omit<PropsChipPreparation, 'surReessayer'> & { etat: EtatChip } {
  const q = p.preparation
  const etat = (q?.etat ?? p.etat) as EtatChip | undefined
  return {
    ...p,
    etat: etat === 'attente' || etat === 'en_cours' || etat === 'pret' || etat === 'echec' ? etat : 'attente',
    octets: q?.octets ?? p.octets, total: q?.total ?? p.total, debit_kbps: q?.debitKbps ?? q?.debit_kbps ?? p.debit_kbps,
    raison: (q?.raison as PropsChipPreparation['raison']) ?? p.raison, position: q?.position ?? p.position, cause: q?.cause ?? p.cause, reessai: q?.reessai ?? p.reessai,
  }
}

export function phraseEtat(brut: Omit<PropsChipPreparation, 'surReessayer'>): string {
  const p = normaliser(brut)
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
  const etat = () => normaliser(props).etat
  const teinte = () => (etat() === 'pret' ? 'var(--ok)' : etat() === 'echec' ? 'var(--err)' : etat() === 'en_cours' ? 'var(--acc-fg)' : 'var(--fg2)')
  return (
    <span
      data-role={props.forme === 'badge' ? 'badge-preparation' : 'chip-preparation'}
      data-etat={etat()}
      style={{
        display: 'inline-flex', 'align-items': 'center', gap: '6px', 'max-width': '100%',
        'font-size': '12px', 'line-height': '18px', padding: '0 8px', 'border-radius': 'var(--r-2xs)',
        border: `1px solid ${teinte()}`, color: teinte(), 'white-space': 'nowrap',
      }}
    >
      <span class="tronque">{phraseEtat(props)}</span>
      <Show when={etat() === 'echec' && props.surReessayer}>
        {(f) => (
          <button type="button" data-role="reessayer" onClick={() => f()()} style={{ padding: '0 4px', color: 'inherit', 'text-decoration': 'underline', font: 'inherit' }}>
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
  ton?: 'ok' | 'info' | 'erreur'
  /** Le geste inverse (« Annuler » par defaut, 6 s). */
  action?: () => void | Promise<void>
  libelleAction?: string
  dureeMs?: number
}

interface ToastVivant extends OptionsToast {
  id: number
}

const [toasts, poserToasts] = createSignal<ToastVivant[]>([])
let numero = 0
let hoteMonte = false

/** Un seul toast a la fois (4 s, 6 s avec action), aria-live, accessible au clavier. Rend l'identifiant. */
export function emettreToast(o: OptionsToast): number {
  if (typeof document === 'undefined') return 0
  numero += 1
  const t: ToastVivant = { ...o, id: numero }
  poserToasts([t])
  setTimeout(() => poserToasts((l) => l.filter((x) => x.id !== t.id)), o.dureeMs ?? (o.action ? 6000 : 4000))
  if (!hoteMonte) {
    hoteMonte = true
    void import('solid-js/web').then(({ render }) => {
      const hote = document.createElement('div')
      document.body.append(hote)
      render(() => <HoteToasts />, hote)
    })
  }
  return numero
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
              <Show when={t.action}>
                {(a) => (
                  <button
                    type="button"
                    data-role="toast-action"
                    onClick={() => { void a()(); poserToasts((l) => l.filter((x) => x.id !== t.id)) }}
                    style={{ padding: '4px 8px', 'font-weight': 'var(--w-strong)', color: 'var(--acc-fg)' }}
                  >
                    {t.libelleAction ?? 'Annuler'}
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
