import { Show, createMemo } from 'solid-js'
import { estMobile } from '../lib/gabarit'
import {
  LIBELLES, SYMBOLE_ETAT, badgeEtat, morceauxEtat, phraseEtat, repere, resumeSerie, resumeSerieCourt,
  type EtatPreparation, type Preparation, type RaisonAttente,
} from '../lib/ma-liste-regles'

// Chip d'etat de preparation (lot 10, US-46 CA5) : UN composant, le meme sur la
// fiche, la carte, la ligne d'episode, l'ecran « Ma liste » et le lecteur. Les
// phrases viennent de `ma-liste-regles.ts` (rapport C §5.5) ; ici on ne fait
// que les poser avec leur teinte et, en echec, le bouton « Réessayer ».
//
// Deux formes : `chip` (phrase complete) et `badge` (coin de carte : `Prêt`,
// `⟳ 42 %`, `En attente`, `✕ Échec`). `phraseEtat()` est reexporte pour les
// legendes qui n'ont pas de place pour un composant.

export { phraseEtat, badgeEtat, resumeSerie }

export interface ChipPreparationProps {
  etat?: EtatPreparation
  octets?: number
  total?: number
  /** kbit/s, comme le contrat l'ecrit. */
  debit_kbps?: number
  raison?: RaisonAttente
  position?: number
  cause?: string
  reessai?: string
  /** Serie : l'episode porte par le chip, et ce qui suit (`suivant` : « S01E03 en préparation »). */
  serie?: { saison: number; episode: number; suivant?: string }
  /** Raccourci : l'etat tel que `GET /profil/a_voir` l'a rendu (prime sur les champs a plat). */
  preparation?: Preparation
  /** `chip` (defaut) : phrase entiere ; `badge` : coin de carte ; `ligne` : une serie en une ligne. */
  forme?: 'chip' | 'badge' | 'ligne'
  /** Telephone : phrase courte (`⟳ 42 % · ~6 min`). */
  compact?: boolean
  /** Rend le bouton « Réessayer » a cote d'un echec. */
  surReessayer?: () => void
}

const TEINTE: Record<EtatPreparation, string> = {
  attente: 'var(--fg3)',
  en_cours: 'var(--acc-fg)',
  pret: 'var(--ok)',
  echec: 'var(--err)',
}

function versPreparation(p: ChipPreparationProps): Preparation | undefined {
  if (p.preparation) return p.preparation
  if (!p.etat) return undefined
  return {
    etat: p.etat, octets: p.octets, total: p.total, debitKbps: p.debit_kbps,
    raison: p.raison, position: p.position, cause: p.cause, reessai: p.reessai,
  }
}

/** « nouvel essai à 21:10 » quand le serveur a planifie une nouvelle tentative. */
function phraseReessai(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return undefined
  return `nouvel essai à ${new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function ChipPreparation(props: ChipPreparationProps) {
  const preparation = createMemo(() => versPreparation(props))
  const etat = () => preparation()?.etat
  const teinte = () => (etat() ? TEINTE[etat()!] : 'var(--fg3)')

  const texte = createMemo(() => {
    const p = preparation()
    if (props.forme === 'badge') return badgeEtat(p)
    if (props.forme === 'ligne') return props.compact || estMobile() ? resumeSerieCourt(p) : resumeSerie(p)
    if (!p) return phraseEtat(undefined)
    if (props.serie) {
      const m = morceauxEtat(p)
      const tete = `${SYMBOLE_ETAT[p.etat]} ${repere(props.serie.saison, props.serie.episode)} ${m.mot.toLowerCase()}`
      const suite = props.serie.suivant ? [props.serie.suivant] : []
      return [tete, ...m.details, ...suite].join(' · ')
    }
    if (props.compact || estMobile()) {
      // Telephone : le mot d'etat saute quand les details suffisent (`⟳ 42 % · ~6 min`).
      const m = morceauxEtat(p)
      if (p.etat === 'en_cours' && m.details.length) return [`${m.symbole} ${m.details[0]}`, ...m.details.slice(1)].join(' · ')
      if (p.etat === 'attente' && m.details.length) return `${m.symbole} En attente · ${m.details[0]!.replace('une lecture est en cours', 'lecture en cours')}`
    }
    return phraseEtat(p)
  })

  const reessayable = () => etat() === 'echec' && !!props.surReessayer
  const infobulle = () => {
    const p = preparation()
    if (!p) return undefined
    const r = phraseReessai(p.reessai)
    if (p.etat === 'pret') return 'Préparé d’avance par le serveur : lecture sans coupure'
    if (p.etat === 'echec') return r ?? 'Le serveur n’a pas pu préparer ce fichier'
    return undefined
  }

  return (
    <Show when={texte()}>
      {(t) => (
        <span
          data-role={props.forme === 'badge' ? 'badge-preparation' : 'chip-preparation'}
          data-etat={etat() ?? 'inconnu'}
          title={infobulle()}
          style={
            props.forme === 'badge'
              ? {
                  display: 'inline-flex', 'align-items': 'center', gap: '3px',
                  'font-size': '10px', 'line-height': '16px', padding: '0 6px', 'white-space': 'nowrap',
                  'border-radius': 'var(--r-2xs)', 'font-weight': 'var(--w-strong)',
                  background: etat() === 'pret' ? 'var(--ok)' : 'rgba(20,20,20,.82)',
                  color: etat() === 'pret' ? '#000' : etat() === 'echec' ? 'var(--err)' : '#fff',
                  border: etat() === 'pret' ? 'none' : '1px solid rgba(255,255,255,.22)',
                }
              : {
                  display: 'inline-flex', 'align-items': 'center', 'flex-wrap': 'wrap', gap: '4px 8px',
                  'font-size': props.compact ? '12px' : '13px', 'line-height': '18px', 'min-width': 0,
                  color: teinte(), 'font-variant-numeric': 'tabular-nums',
                }
          }
        >
          <span class="tronque" style={{ 'min-width': 0 }}>{t()}</span>
          <Show when={reessayable()}>
            <button
              type="button"
              data-role="reessayer"
              onClick={(e) => {
                e.stopPropagation()
                props.surReessayer?.()
              }}
              style={{
                height: estMobile() ? '32px' : '24px', padding: '0 8px', 'border-radius': 'var(--r-xs)',
                border: '1px solid var(--line2)', background: 'transparent', color: 'var(--acc-fg)',
                'font-size': '12px', 'font-weight': 'var(--w-strong)', cursor: 'pointer',
              }}
            >
              {LIBELLES.reessayer}
            </button>
          </Show>
        </span>
      )}
    </Show>
  )
}
