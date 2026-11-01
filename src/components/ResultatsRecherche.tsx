import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js'
import Icone from './Icone'
import CarteAffiche from './CarteAffiche'
import SelecteurSegmente from './SelecteurSegmente'
import { encreLogo, monogramme } from './couleurs'
import { anneeDuTitre, titreCourt } from './titres'
import { db, type EntreeCatalogue, type TypeContenu } from '../lib/db'
import {
  chercherPage,
  etatIndex,
  type Facette,
  type Groupes,
  type Totaux,
  type Tri,
} from '../lib/recherche-client'
import type { ResultatRecherche } from '../lib/recherche.worker'
import { useAVoirCles } from './BoutonAVoir'
import { basculerAVoir } from '../lib/a-voir'
import { estPret } from '../lib/a-voir-serveur'

// Page de résultats du dossier de conception : filtrable par type et par
// langue. Mesures relevées au getComputedStyle sur « Lecteur IPTV.dc.html »,
// écran « Résultats de recherche » (1440 px, surface de 1220 px) : colonne
// plafonnée à 1560 px, retraits 24/32/64 px, écart 18 px ; titre 22/28 px
// semi-gras ; onglets de 40 px à écart 4 px sur un filet --line, barre active
// de 3 px ; pastilles de langue 28 px, rayon 14 px, texte 13 px ; liste de
// chaînes à filet --line et rayon 8 px, lignes en grille 52 / 1fr / 36 px,
// retraits 8/12 px, fond --card ; grilles d'affiches minmax(148px,1fr) à 16 px.

const PAS = { live: 30, vod: 24, series: 24 } as const
const ORDRE: TypeContenu[] = ['live', 'vod', 'series']
const LIBELLE: Record<TypeContenu, string> = { live: 'Chaînes', vod: 'Films', series: 'Séries' }

const VIDE: Groupes = { live: [], vod: [], series: [] }
const ZERO: Totaux = { live: 0, vod: 0, series: 0 }

const TRIS = [
  { cle: 'pertinence', libelle: 'Pertinence' },
  { cle: 'recent', libelle: 'Récents' },
  { cle: 'note', libelle: 'Mieux notés' },
]

const fr = (n: number) => n.toLocaleString('fr-FR')

export interface ResultatsRechercheProps {
  requete: string
  surOuvrir: (e: EntreeCatalogue) => void
}

export default function ResultatsRecherche(props: ResultatsRechercheProps) {
  const [groupes, poserGroupes] = createSignal<Groupes>(VIDE)
  const [totaux, poserTotaux] = createSignal<Totaux>(ZERO)
  const [langues, poserLangues] = createSignal<Facette[]>([])
  const [millisecondes, poserMillisecondes] = createSignal(0)
  const [charge, poserCharge] = createSignal(true)

  const [type, poserType] = createSignal<TypeContenu | 'tout'>('tout')
  const [langue, poserLangue] = createSignal<string | null>(null)
  const [tri, poserTri] = createSignal<Tri>('pertinence')
  const [limites, poserLimites] = createSignal<Totaux>({ ...PAS })
  // US-43 CA1 : « À voir » depuis un resultat de recherche (films et series).
  const aVoir = useAVoirCles()

  // Changer de requête, de langue ou de tri remet la page en haut de pile :
  // garder « afficher 60 de plus » d'une recherche à l'autre n'aurait aucun
  // sens, et la règle de comportement veut qu'un filtre reparte du début.
  createEffect(on([() => props.requete, langue, tri], () => poserLimites({ ...PAS }), { defer: true }))

  createEffect(() => {
    const q = props.requete.trim()
    const l = langue()
    const t = tri()
    const lim = limites()
    if (!q) {
      poserGroupes(VIDE)
      poserTotaux(ZERO)
      poserCharge(false)
      return
    }
    poserCharge(true)
    void chercherPage(q, l, t, lim).then((r) => {
      if (props.requete.trim() !== q) return
      poserGroupes(r.groupes)
      poserTotaux(r.totaux)
      poserLangues(r.langues)
      poserMillisecondes(r.ms)
      poserCharge(false)
    })
  })

  const total = () => ORDRE.reduce((n, t) => n + totaux()[t], 0)
  const visibles = createMemo<TypeContenu[]>(() => {
    const t = type()
    return (t === 'tout' ? ORDRE : [t]).filter((x) => totaux()[x] > 0)
  })

  const onglets = createMemo(() => [
    { cle: 'tout' as const, libelle: 'Tout', compte: total() },
    ...ORDRE.map((t) => ({ cle: t, libelle: LIBELLE[t], compte: totaux()[t] })),
  ])

  const plus = (t: TypeContenu) => poserLimites((l) => ({ ...l, [t]: l[t] + PAS[t] }))

  async function ouvrir(r: ResultatRecherche) {
    const entree = await db.catalogue.get(r.cle)
    if (entree) props.surOuvrir(entree)
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div
        style={{
          'max-width': '1560px', margin: '0 auto', padding: '24px 32px 64px',
          display: 'flex', 'flex-direction': 'column', gap: '18px',
        }}
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
          <h1 style={{ margin: 0, 'font-size': '22px', 'line-height': '28px', 'font-weight': '600', 'overflow-wrap': 'anywhere' }}>
            Résultats pour « {props.requete.trim()} »
          </h1>
          <span class="tertiaire num" style={{ 'font-size': '12px' }}>
            <Show when={etatIndex() === 'pret'} fallback="Indexation du catalogue…">
              {fr(total())} résultat{total() > 1 ? 's' : ''} · {millisecondes()} ms
            </Show>
          </span>
        </div>

        <div role="tablist" style={{ display: 'flex', gap: '4px', 'border-bottom': '1px solid var(--line)', 'overflow-x': 'auto' }}>
          <For each={onglets()}>
            {(o) => {
              const actif = () => type() === o.cle
              return (
                <button
                  role="tab"
                  aria-selected={actif()}
                  onClick={() => poserType(o.cle)}
                  style={{
                    position: 'relative', height: '40px', padding: '0 12px',
                    display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer',
                    color: actif() ? 'var(--fg)' : 'var(--fg3)',
                    'font-weight': actif() ? '600' : '400',
                    'white-space': 'nowrap',
                    background: 'transparent', border: 'none',
                  }}
                >
                  {o.libelle}
                  <span class="num" style={{ 'font-size': '12px', color: 'var(--fg3)', 'font-weight': '400' }}>{fr(o.compte)}</span>
                  <span
                    style={{
                      position: 'absolute', left: '12px', right: '12px', bottom: '-1px',
                      height: '3px', 'border-radius': '2px',
                      background: actif() ? 'var(--acc)' : 'transparent',
                    }}
                  />
                </button>
              )
            }}
          </For>
        </div>

        <div style={{ display: 'flex', gap: '12px', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
          <div role="group" aria-label="Filtrer par langue" style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
            <For each={[{ cle: '', libelle: 'Toutes les langues', compte: total() }, ...langues()]}>
              {(l) => {
                const actif = () => (langue() ?? '') === l.cle
                return (
                  <button
                    aria-pressed={actif()}
                    onClick={() => poserLangue(l.cle || null)}
                    style={{
                      height: '28px', padding: '0 12px', display: 'flex', 'align-items': 'center',
                      'border-radius': '14px', 'font-size': '13px', cursor: 'pointer', 'white-space': 'nowrap',
                      border: `1px solid ${actif() ? 'var(--acc)' : 'var(--line2)'}`,
                      background: actif() ? 'var(--acc-bg)' : 'transparent',
                      color: actif() ? 'var(--acc-fg)' : 'var(--fg)',
                    }}
                  >
                    {l.libelle}
                  </button>
                )
              }}
            </For>
          </div>
          {/* Mesuré sur le catalogue réel : `ajouteLe` couvre 100 % des trois
              types, `note` 84,5 % des films et 82,2 % des séries mais 0 % des
              21 791 chaînes. D'où deux tris explicites plutôt qu'un
              départage caché dans la pertinence : il n'aurait rien départagé
              là où les ex æquo sont les plus nombreux, c'est-à-dire en
              Direct. */}
          <SelecteurSegmente
            etiquette="Trier les résultats"
            segments={TRIS}
            actif={tri()}
            surChoisir={(c) => poserTri(c as Tri)}
          />
        </div>

        <Show when={charge() && total() === 0}>
          <div aria-busy="true" style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
            <For each={[0, 1, 2, 3, 4, 5]}>
              {() => (
                <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
                  <div style={{ width: '52px', height: '34px', 'border-radius': '4px', background: 'var(--elev)' }} />
                  <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
                    <div style={{ height: '12px', width: '40%', 'border-radius': '3px', background: 'var(--elev)' }} />
                    <div style={{ height: '10px', width: '25%', 'border-radius': '3px', background: 'var(--elev)' }} />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={!charge() && total() === 0 && props.requete.trim()}>
          <div class="tertiaire" style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '10px', padding: '56px 16px', 'text-align': 'center' }}>
            <Icone nom="search_off" taille={36} />
            <div style={{ 'font-size': '16px', 'font-weight': '600', color: 'var(--fg)' }}>
              Aucun résultat pour « {props.requete.trim()} »
            </div>
            <div>Vérifiez l’orthographe ou retirez le filtre de langue.</div>
            <Show when={langue()}>
              <button
                onClick={() => poserLangue(null)}
                style={{ height: '32px', padding: '0 14px', 'border-radius': '4px', border: '1px solid var(--line2)', 'font-weight': '600', cursor: 'pointer', background: 'transparent', color: 'var(--fg)' }}
              >
                Retirer le filtre de langue
              </button>
            </Show>
          </div>
        </Show>

        <For each={visibles()}>
          {(t) => (
            <section style={{ display: 'flex', 'flex-direction': 'column', gap: t === 'live' ? '6px' : '8px' }}>
              <div style={{ display: 'flex', 'align-items': 'baseline', gap: '8px' }}>
                <h2 style={{ margin: 0, 'font-size': '17px', 'font-weight': '600' }}>{LIBELLE[t]}</h2>
                <span class="tertiaire num" style={{ 'font-size': '12px' }}>{fr(totaux()[t])}</span>
              </div>

              <Show
                when={t === 'live'}
                fallback={
                  <div style={{ display: 'grid', 'grid-template-columns': 'repeat(auto-fill, minmax(148px, 1fr))', gap: '16px' }}>
                    <For each={groupes()[t]}>
                      {(r) => (
                        <CarteAffiche
                          entree={versEntree(r)}
                          meta={meta(r)}
                          aVoir={aVoir()?.has(r.cle) ?? false}
                          pret={estPret(r.cle)}
                          surOuvrir={() => void ouvrir(r)}
                          surAVoir={(e) => void basculerAVoir(e.cle)}
                        />
                      )}
                    </For>
                  </div>
                }
              >
                <div style={{ 'border-radius': '8px', border: '1px solid var(--line)', overflow: 'hidden' }}>
                  <For each={groupes().live}>{(r) => <LigneChaineResultat resultat={r} surOuvrir={() => void ouvrir(r)} />}</For>
                </div>
              </Show>

              <Show when={groupes()[t].length < totaux()[t]}>
                <button
                  onClick={() => plus(t)}
                  style={{ 'align-self': 'flex-start', 'font-size': '13px', 'font-weight': '600', color: 'var(--acc-fg)', cursor: 'pointer', padding: '4px 0', background: 'transparent', border: 'none' }}
                >
                  Afficher {fr(Math.min(PAS[t], totaux()[t] - groupes()[t].length))} {LIBELLE[t].toLowerCase()} de plus
                </button>
              </Show>
            </section>
          )}
        </For>
      </div>
    </div>
  )
}

/** CarteAffiche attend une entrée de catalogue ; le worker n'en renvoie que la
 *  part utile à l'affichage, le reste étant relu à l'ouverture. */
function versEntree(r: ResultatRecherche): EntreeCatalogue {
  return { cle: r.cle, type: r.type, idServeur: r.idServeur, lecture: '', id: 0, nom: r.nom, recherche: '', pays: r.pays, icone: r.icone, note: r.note, ajouteLe: r.ajouteLe }
}

function meta(r: ResultatRecherche): string {
  const bouts = [anneeDuTitre(r.nom), r.note ? `${r.note.toFixed(1)}/10` : undefined, r.pays]
  return bouts.filter(Boolean).join(' · ')
}

function LigneChaineResultat(props: { resultat: ResultatRecherche; surOuvrir: () => void }) {
  const [charge, poserCharge] = createSignal(false)
  const nom = () => props.resultat.nom
  return (
    <button
      title={nom()}
      onClick={props.surOuvrir}
      style={{
        display: 'grid', 'grid-template-columns': '52px minmax(0, 1fr) 36px', gap: '12px',
        'align-items': 'center', width: '100%', padding: '8px 12px', 'text-align': 'left',
        border: 'none', 'border-radius': '0',
        // Déclaré APRÈS `border` : l'inverse effaçait le filet qui sépare les
        // lignes, puisque la forme courte réinitialise les quatre côtés.
        'border-bottom': '1px solid var(--line)',
        cursor: 'pointer', background: 'var(--card)', color: 'var(--fg)',
      }}
    >
      <span
        style={{
          position: 'relative', width: '52px', height: '34px', 'border-radius': '4px', overflow: 'hidden',
          background: 'var(--plate)', color: encreLogo(nom()),
          display: 'flex', 'align-items': 'center', 'justify-content': 'center',
          'font-size': '11px', 'font-weight': '600', 'white-space': 'nowrap',
        }}
      >
        {/* Masqué dès que le logo est là : la plupart sont transparents. */}
        <span style={{ opacity: charge() ? '0' : '1' }}>{monogramme(nom())}</span>
        <Show when={props.resultat.icone}>
          <img
            src={props.resultat.icone}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => poserCharge(true)}
            onError={() => poserCharge(false)}
            style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', 'object-fit': 'contain', opacity: charge() ? '1' : '0' }}
          />
        </Show>
      </span>
      <span style={{ 'min-width': 0 }}>
        <span style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'min-width': 0 }}>
          <span class="tronque" style={{ 'font-weight': '600' }}>{titreCourt(nom())}</span>
          <Show when={props.resultat.pays}>
            <span class="num" style={{ flex: 'none', 'font-size': '10px', 'line-height': '14px', padding: '0 4px', 'border-radius': '3px', border: '1px solid var(--line2)', color: 'var(--fg3)' }}>
              {props.resultat.pays}
            </span>
          </Show>
        </span>
        <span class="tronque tertiaire" style={{ display: 'block', 'font-size': '12px' }}>Direct</span>
      </span>
      <span style={{ display: 'flex', 'justify-content': 'center', color: 'var(--fg3)' }}>
        <Icone nom="play_arrow" taille={18} />
      </span>
    </button>
  )
}
