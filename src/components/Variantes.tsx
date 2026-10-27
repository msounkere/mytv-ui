import { For, Show } from 'solid-js'
import Icone from './Icone'
import { ENCRE, ENCRE2 } from './ControlesLecteur'
import { LIBELLE_QUALITE } from '../lib/variantes'
import type { Choix, VarianteNotee } from '../lib/fluidite'
import type { ResultatTest } from '../lib/test-chaine'

// Bande des VARIANTES d'une chaine dans le lecteur (US-39 CA3, CA4) : la
// recommandation en une ligne, un bouton par variante, « Tester cette chaine »
// et le resultat du test. Posee sous les commandes, elle ne cache pas l'image.

export interface VariantesProps {
  variantes: VarianteNotee[]
  choix: Choix
  /** Cle de catalogue de la variante actuellement lue. */
  cleLue: string
  explication: string
  /** Test actif en cours : les resultats s'accumulent. */
  testEnCours: boolean
  resultat?: ResultatTest
  surChoisir: (v: VarianteNotee) => void
  surTester: () => void
  surAnnulerTest: () => void
  surFermer: () => void
}

function formaterKbps(kbps: number | undefined): string {
  if (kbps === undefined) return '—'
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1).replace('.', ',')} Mbit/s` : `${kbps} kbit/s`
}

const LIBELLE_REFUS: Record<string, string> = {
  compte_utilise_par_mytv: 'Test interrompu : une autre fenêtre de MyTV lit déjà un flux.',
  compte_utilise_ailleurs: 'Test interrompu : le compte IPTV est utilisé sur un autre appareil.',
  compte_occupe: 'Test interrompu : la connexion du fournisseur est occupée.',
}

export default function Variantes(props: VariantesProps) {
  const resultatDe = (cle: string) => props.resultat?.resultats.find((r) => r.cle === cle)
  return (
    <div
      role="dialog"
      aria-label="Variantes de la chaîne"
      data-role="variantes"
      style={{
        position: 'absolute', left: 0, right: 0, bottom: '84px', margin: '0 16px',
        padding: '12px 14px', 'border-radius': '10px', 'z-index': 5,
        background: 'rgba(20,20,20,.9)', 'backdrop-filter': 'blur(18px)',
        border: '1px solid rgba(255,255,255,.12)', color: ENCRE, 'font-size': '13px',
        display: 'grid', gap: '10px', animation: 'fadein var(--dur) var(--ease)',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
        <Icone nom="hd" taille={18} />
        <span data-role="recommandation" style={{ flex: 1, 'line-height': '18px' }}>{props.explication}</span>
        <button type="button" aria-label="Fermer" onClick={props.surFermer} style={{ color: ENCRE2, padding: '4px' }}>
          <Icone nom="close" taille={16} />
        </button>
      </div>

      <div role="group" aria-label="Choisir une variante" style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '6px' }}>
        <For each={props.variantes}>
          {(v) => {
            const lue = () => v.entree.cle === props.cleLue
            const recommandee = () => v === props.choix.recommandee
            const r = () => resultatDe(v.entree.cle)
            return (
              <button
                type="button"
                data-role="variante"
                data-qualite={v.qualite}
                data-cle={v.entree.cle}
                aria-pressed={lue()}
                title={v.entree.nom}
                onClick={() => props.surChoisir(v)}
                style={{
                  display: 'grid', gap: '2px', 'justify-items': 'start',
                  padding: '6px 10px', 'border-radius': '8px', 'text-align': 'left',
                  border: `1px solid ${lue() ? 'var(--vacc)' : 'rgba(255,255,255,.18)'}`,
                  background: lue() ? 'rgba(255,255,255,.12)' : 'transparent', color: ENCRE,
                }}
              >
                <span style={{ display: 'flex', gap: '6px', 'align-items': 'baseline' }}>
                  <strong>{LIBELLE_QUALITE[v.qualite]}</strong>
                  <Show when={recommandee()}><span style={{ 'font-size': '11px', color: 'var(--vacc)' }}>recommandé</span></Show>
                  <Show when={v.score !== undefined}><span class="num" style={{ 'font-size': '11px', color: ENCRE2 }}>note {v.score}/100</span></Show>
                </span>
                <span class="tronque" style={{ 'font-size': '11px', color: ENCRE2, 'max-width': '220px' }}>{v.entree.nom}</span>
                <Show when={r()}>
                  {(x) => (
                    <span class="num" data-role="mesure" style={{ 'font-size': '11px', color: x().erreur ? 'var(--lim)' : ENCRE2 }}>
                      {x().erreur ? `échec (${x().erreur})` : `${x().latenceMs} ms · ${formaterKbps(x().debitKbps)}`}
                    </span>
                  )}
                </Show>
              </button>
            )
          }}
        </For>
      </div>

      <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'flex-wrap': 'wrap' }}>
        <Show
          when={!props.testEnCours}
          fallback={
            <>
              <span data-role="test-en-cours" style={{ color: ENCRE2 }}>Test en cours — une variante à la fois…</span>
              <button type="button" onClick={props.surAnnulerTest} style={{ border: '1px solid rgba(255,255,255,.2)', padding: '4px 10px', 'border-radius': '6px', color: ENCRE }}>
                Annuler
              </button>
            </>
          }
        >
          <button type="button" onClick={props.surTester} style={{ border: '1px solid rgba(255,255,255,.3)', padding: '5px 12px', 'border-radius': '6px', color: ENCRE, display: 'inline-flex', gap: '6px', 'align-items': 'center' }}>
            <Icone nom="speed" taille={16} />
            Tester cette chaîne
          </button>
          <Show when={props.resultat}>
            {(r) => (
              <span data-role="test-date" style={{ 'font-size': '11px', color: ENCRE2 }}>
                {r().refus
                  ? LIBELLE_REFUS[r().refus!] ?? 'Test interrompu.'
                  : `Testé ${new Date(r().a).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} — gardé 24 h.`}
              </span>
            )}
          </Show>
        </Show>
      </div>
    </div>
  )
}
