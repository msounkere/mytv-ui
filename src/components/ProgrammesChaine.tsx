import { For, Show, createEffect, createResource, createSignal, onCleanup } from 'solid-js'
import Icone from './Icone'
import SubstitutLogo from './SubstitutLogo'
import { ENCRE, ENCRE2, ENCRE3 } from './ControlesLecteur'
import { estBureau, estMobile } from '../lib/gabarit'
import { epg, type Programme } from '../lib/epg'
import type { EntreeCatalogue } from '../lib/db'
import { joursProgrammes, statutProgramme, type StatutProgramme } from '../lib/replay'

// Les programmes de LA chaine qu'on regarde (direct ou replay), jour par jour : le
// programme en cours ramene au direct, un programme termine avec replay se revoit sans
// quitter le lecteur. C'est l'acces au replay depuis la chaine (lot 2 du chantier
// enregistrement) ; le guide complet reste l'acces par l'heure.

const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

export interface ProgrammesChaineProps {
  chaine: EntreeCatalogue
  /** Identifiant de replay en cours de lecture, s'il y en a un (sinon : le direct). */
  replayActif?: string
  surRevoir: (p: Programme & { replay: string }) => void
  surDirect: () => void
  surFermer: () => void
}

export default function ProgrammesChaine(props: ProgrammesChaineProps) {
  const [maintenant, poserMaintenant] = createSignal(Date.now())
  const minuteur = setInterval(() => poserMaintenant(Date.now()), 30_000)
  onCleanup(() => clearInterval(minuteur))

  const jours = () => joursProgrammes(maintenant())
  // Le jour du replay en cours, sinon aujourd'hui.
  const jourInitial = () => {
    const debut = props.replayActif ? Number(props.replayActif.split('-').at(-2)) * 1000 : NaN
    const i = Number.isFinite(debut) ? jours().findIndex((j) => j.debut <= debut && debut < j.fin) : -1
    return Math.max(0, i)
  }
  const [jour, poserJour] = createSignal(jourInitial())

  const [programmes] = createResource(
    () => ({ id: props.chaine.idServeur, ...jours()[jour()]! }),
    async (q) => (await epg.grille([q.id], q.debut, q.fin)).get(q.id) ?? [],
  )

  // Amene sous les yeux le programme en lecture (replay) ou en cours (direct).
  let liste: HTMLDivElement | undefined
  createEffect(() => {
    if (!programmes() || !liste) return
    queueMicrotask(() => liste?.querySelector<HTMLElement>('[data-actif="1"]')?.scrollIntoView({ block: 'center' }))
  })

  function choisir(p: Programme, s: StatutProgramme) {
    if (s === 'direct') props.surDirect()
    else if (s === 'revoir' && p.replay) props.surRevoir(p as Programme & { replay: string })
  }

  return (
    <div
      role="dialog"
      aria-label={`Programmes de ${props.chaine.nom}`}
      style={{
        position: 'absolute', right: '12px', width: estMobile() ? 'auto' : '380px', left: estMobile() ? '12px' : 'auto',
        ...(estBureau() ? { bottom: '96px', 'max-height': 'calc(100% - 180px)' } : { top: '8px', bottom: '8px' }),
        display: 'flex', 'flex-direction': 'column',
        'border-radius': 'var(--r-md)',
        background: 'rgba(20,20,20,.9)', 'backdrop-filter': 'blur(24px)',
        border: '1px solid rgba(255,255,255,.12)',
        'z-index': 6, overflow: 'hidden', color: ENCRE,
        animation: 'fadein var(--dur) var(--ease)',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: '10px 12px', 'border-bottom': '1px solid rgba(255,255,255,.1)' }}>
        <SubstitutLogo nom={props.chaine.nom} src={props.chaine.icone} taille={24} />
        <span class="tronque" style={{ flex: 1, 'min-width': 0, 'font-weight': 'var(--w-strong)' }}>{props.chaine.nom}</span>
        <button
          onClick={props.surFermer}
          aria-label="Fermer les programmes"
          title="Fermer les programmes (P)"
          style={{
            display: 'grid', 'place-items': 'center', width: estMobile() ? '44px' : '28px', height: estMobile() ? '44px' : '28px',
            'border-radius': 'var(--r-xs)', color: ENCRE2,
          }}
        >
          <Icone nom="close" taille={16} />
        </button>
      </div>

      <div role="tablist" aria-label="Jour" style={{ display: 'flex', gap: '4px', padding: '8px 12px', 'border-bottom': '1px solid rgba(255,255,255,.1)' }}>
        <For each={jours()}>
          {(j, i) => (
            <button
              role="tab"
              aria-selected={jour() === i()}
              onClick={() => poserJour(i())}
              style={{
                padding: '4px 10px', 'border-radius': 'var(--r-sm)', 'font-size': '13px', 'text-transform': 'capitalize',
                color: jour() === i() ? '#000' : ENCRE2,
                background: jour() === i() ? 'var(--vacc, #62abf5)' : 'transparent',
                'min-height': estMobile() ? '40px' : undefined,
              }}
            >
              {j.libelle}
            </button>
          )}
        </For>
      </div>

      <div ref={liste} style={{ overflow: 'auto' }}>
        <Show when={!programmes.loading} fallback={<p style={{ padding: '12px', color: ENCRE3 }}>Chargement du guide…</p>}>
          <Show when={!programmes.error} fallback={<p style={{ padding: '12px', color: ENCRE3 }}>Guide indisponible pour l’instant.</p>}>
            <Show when={(programmes() ?? []).length > 0} fallback={<p style={{ padding: '12px', color: ENCRE3 }}>Aucun programme ce jour-là dans le guide.</p>}>
              <For each={programmes()}>
                {(p) => {
                  const s = () => statutProgramme(p, maintenant())
                  const actif = () => (props.replayActif ? p.replay === props.replayActif : s() === 'direct')
                  const cliquable = () => s() === 'direct' || s() === 'revoir'
                  return (
                    <button
                      data-role="programme-chaine"
                      data-statut={s()}
                      data-actif={actif() ? '1' : '0'}
                      aria-current={actif() ? 'true' : undefined}
                      disabled={!cliquable()}
                      onClick={() => choisir(p, s())}
                      title={p.description ?? p.titre}
                      style={{
                        display: 'grid', 'grid-template-columns': '48px minmax(0,1fr) auto', 'align-items': 'center', gap: '10px',
                        width: '100%', padding: '8px 12px', 'min-height': estMobile() ? '44px' : undefined, 'text-align': 'left',
                        'border-radius': 0,
                        'border-left': `3px solid ${actif() ? 'var(--acc-fg)' : 'transparent'}`,
                        background: actif() ? 'rgba(98,171,245,.22)' : undefined,
                        color: cliquable() ? ENCRE : ENCRE3,
                        cursor: cliquable() ? 'pointer' : 'default',
                      }}
                    >
                      <span class="num" style={{ 'font-size': '12px', color: ENCRE2 }}>{HEURE.format(new Date(p.debut))}</span>
                      <span class="tronque" style={{ 'min-width': 0 }}>{p.titre}</span>
                      <span style={{ 'font-size': '12px', 'white-space': 'nowrap', color: s() === 'revoir' ? 'var(--acc-fg)' : s() === 'direct' ? '#ff5a5a' : ENCRE3 }}>
                        {s() === 'direct' ? '● Direct' : s() === 'revoir' ? '↺ Revoir' : s() === 'a-venir' ? 'à venir' : ''}
                      </span>
                    </button>
                  )
                }}
              </For>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  )
}
