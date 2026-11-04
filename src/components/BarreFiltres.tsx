import { For, Show, createMemo, createSignal } from 'solid-js'
import FeuilleFiltres, { type GroupeFeuille } from './FeuilleFiltres'
import Icone from './Icone'
import { estMobile } from '../lib/gabarit'
import BoutonFiltre from './BoutonFiltre'
import BasculeFiltre from './BasculeFiltre'
import PastilleFiltre from './PastilleFiltre'
import SelecteurSegmente from './SelecteurSegmente'
import { TRIS, type Criteres, type Terme, type Vocabulaire } from '../lib/facettes'

// En-tête des écrans Films et Séries. Le dossier de conception supprime
// l'arborescence « catégorie → liste » : les 143 catégories de films et les 98
// catégories de séries du fournisseur ne sont plus une colonne à parcourir,
// seulement le gisement d'où sortent ces facettes.
//
// Mesures relevées au getComputedStyle sur « Lecteur IPTV.dc.html », écran
// Films : barre en colonne, retraits 14/20/10 px, écart 10 px ; titre 20/26 px
// semi-gras ; rangée de boutons de 30 px à écart 6 px, coupée par un filet de
// 1 × 20 px ; rangée de pastilles affichée seulement si quelque chose filtre.

/** Un filtre à facettes et son vocabulaire, prêts à être rendus. */
interface Champ {
  cle: keyof Criteres
  libelle: string
  options: Terme[]
  unique?: boolean
}

export interface BarreFiltresProps {
  titre: string
  compte: string
  vocabulaire: Vocabulaire
  criteres: Criteres
  /** Vrai pour les films seuls : une série n'a pas de conteneur à inspecter. */
  sonLisible: boolean
  surCriteres: (c: Criteres) => void
  surEffacerTout: () => void
  /** Nombre de résultats, pour le bouton de la feuille mobile. */
  nbResultats?: number
}

export default function BarreFiltres(props: BarreFiltresProps) {
  const champs = createMemo<Champ[]>(() => {
    const v = props.vocabulaire
    const tout: Champ[] = [
      { cle: 'genres', libelle: 'Genre', options: v.genres },
      { cle: 'langues', libelle: 'Langue', options: v.langues },
      { cle: 'annee', libelle: 'Année', options: v.annees, unique: true },
      { cle: 'pays', libelle: 'Pays', options: v.pays },
      { cle: 'services', libelle: 'Service', options: v.services },
    ]
    // Un menu vide est un cul-de-sac : on n'offre que les facettes peuplées.
    return tout.filter((c) => c.options.length > 0)
  })

  const lire = (c: Champ): string[] => {
    const v = props.criteres[c.cle]
    return c.unique ? (v ? [v as string] : []) : (v as string[])
  }

  const ecrire = (c: Champ, choix: string[]) =>
    props.surCriteres({ ...props.criteres, [c.cle]: c.unique ? (choix[0] ?? null) : choix })

  const bascules = createMemo(() => {
    const b = [
      { cle: 'nouveautes' as const, libelle: 'Nouveautés', icone: 'new_releases' },
      // Lot 10 : les favoris ne concernent plus que les chaines (US-46 CA6) ; la
      // bascule « Favoris » des grilles Films / Series a disparu.
      { cle: 'enCours' as const, libelle: 'En cours', icone: 'history' },
    ]
    return props.sonLisible
      ? [...b, { cle: 'sonLisible' as const, libelle: 'Son lisible', icone: 'graphic_eq' }]
      : b
  })

  const pastilles = createMemo(() => {
    const out: Array<{ libelle: string; retirer: () => void }> = []
    for (const c of champs()) {
      for (const cle of lire(c)) {
        const t = c.options.find((o) => o.cle === cle)
        out.push({
          libelle: t?.libelle ?? cle,
          retirer: () => ecrire(c, lire(c).filter((x) => x !== cle)),
        })
      }
    }
    for (const b of bascules()) {
      if (props.criteres[b.cle]) {
        out.push({
          libelle: b.libelle,
          retirer: () => props.surCriteres({ ...props.criteres, [b.cle]: false }),
        })
      }
    }
    return out
  })

  // Mobile : tout tient dans une feuille (voir FeuilleFiltres). Le groupe du
  // tri passe en premier, comme sur la maquette, puis les bascules, puis les
  // facettes peuplées.
  const [feuille, poserFeuille] = createSignal(false)
  const groupes = createMemo<GroupeFeuille[]>(() => [
    {
      titre: 'Trier par',
      unique: true,
      options: TRIS,
      choisi: (cle) => props.criteres.tri === cle,
      basculer: (tri) => props.surCriteres({ ...props.criteres, tri }),
    },
    {
      titre: 'Afficher',
      options: bascules().map((b) => ({ cle: b.cle, libelle: b.libelle })),
      choisi: (cle) => Boolean(props.criteres[cle as keyof Criteres]),
      basculer: (cle) =>
        props.surCriteres({ ...props.criteres, [cle]: !props.criteres[cle as keyof Criteres] }),
    },
    ...champs().map<GroupeFeuille>((c) => ({
      titre: c.libelle,
      unique: c.unique,
      options: c.options,
      choisi: (cle) => lire(c).includes(cle),
      basculer: (cle) =>
        ecrire(c, c.unique ? (lire(c)[0] === cle ? [] : [cle]) : lire(c).includes(cle) ? lire(c).filter((x) => x !== cle) : [...lire(c), cle]),
    })),
  ])

  return (
    <Show
      when={!estMobile()}
      fallback={
        <div
          style={{
            'flex': 'none', display: 'flex', 'align-items': 'center', gap: '10px',
            padding: '6px 12px', 'min-width': '0', 'border-bottom': '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', 'align-items': 'baseline', gap: '10px', 'min-width': '0', flex: '1' }}>
            <h1 class="tronque">{props.titre}</h1>
            <span class="num" style={{ 'font-size': '12px', color: 'var(--fg3)', 'white-space': 'nowrap' }}>
              {props.compte}
            </span>
          </div>
          <button
            aria-haspopup="dialog"
            onClick={() => poserFeuille(true)}
            style={{
              height: '44px', padding: '0 14px 0 12px', display: 'flex', 'align-items': 'center', gap: '6px',
              'flex': 'none', 'border-radius': 'var(--r-btn-sm)', 'font-size': '13px',
              'font-weight': 'var(--w-strong)', 'white-space': 'nowrap',
              border: `1px solid ${pastilles().length > 0 ? 'var(--acc)' : 'var(--line2)'}`,
              background: pastilles().length > 0 ? 'var(--acc-bg)' : undefined,
              color: pastilles().length > 0 ? 'var(--acc-fg)' : 'var(--fg)',
            }}
          >
            <Icone nom="tune" taille={16} />
            {pastilles().length > 0 ? `Filtres · ${pastilles().length}` : 'Filtres'}
          </button>
          <Show when={feuille()}>
            <FeuilleFiltres
              groupes={groupes()}
              actionLibelle={
                props.nbResultats === undefined
                  ? 'Afficher les résultats'
                  : `Afficher ${new Intl.NumberFormat('fr-FR').format(props.nbResultats)} résultat${props.nbResultats > 1 ? 's' : ''}`
              }
              surEffacerTout={props.surEffacerTout}
              surFermer={() => poserFeuille(false)}
            />
          </Show>
        </div>
      }
    >
    <div
      style={{
        'flex': 'none',
        display: 'flex',
        'flex-direction': 'column',
        gap: '10px',
        padding: '14px 20px 10px',
        'border-bottom': '1px solid var(--line)',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'min-width': '0' }}>
        <div style={{ display: 'flex', 'align-items': 'baseline', gap: '10px', 'min-width': '0', flex: '1' }}>
          <h1 class="tronque">{props.titre}</h1>
          <span
            class="num"
            style={{ 'font-size': '12px', color: 'var(--fg3)', 'white-space': 'nowrap', 'flex': 'none' }}
          >
            {props.compte}
          </span>
        </div>
        <SelecteurSegmente
          etiquette="Trier par"
          segments={TRIS.map((t) => ({ cle: t.cle, libelle: t.libelle }))}
          actif={props.criteres.tri}
          surChoisir={(tri) => props.surCriteres({ ...props.criteres, tri })}
        />
      </div>

      <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'align-items': 'center' }}>
        <For each={champs()}>
          {(c) => (
            <BoutonFiltre
              libelle={c.libelle}
              options={c.options}
              choix={lire(c)}
              unique={c.unique}
              surChoix={(choix) => ecrire(c, choix)}
            />
          )}
        </For>

        <span
          aria-hidden="true"
          style={{ width: '1px', height: '20px', background: 'var(--line2)', margin: '0 4px', 'flex': 'none' }}
        />

        <For each={bascules()}>
          {(b) => (
            <BasculeFiltre
              libelle={b.libelle}
              icone={b.icone}
              actif={Boolean(props.criteres[b.cle])}
              surBasculer={() =>
                props.surCriteres({ ...props.criteres, [b.cle]: !props.criteres[b.cle] })
              }
            />
          )}
        </For>
      </div>

      <Show when={pastilles().length > 0}>
        <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'align-items': 'center' }}>
          <For each={pastilles()}>
            {(p) => <PastilleFiltre libelle={p.libelle} surRetirer={p.retirer} />}
          </For>
          <button
            onClick={props.surEffacerTout}
            style={{
              padding: '0 6px',
              'font-size': '12px',
              'font-weight': 'var(--w-strong)',
              color: 'var(--acc-fg)',
            }}
          >
            Tout effacer
          </button>
        </div>
      </Show>
    </div>
    </Show>
  )
}
