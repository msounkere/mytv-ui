import { estBureau, estMobile } from '../../lib/gabarit'
import { ErrorBoundary, For, Show, type JSX } from 'solid-js'
import Diagnostic from '../../components/Diagnostic'
import Icone from '../../components/Icone'
import ListeVirtuelle from '../../components/ListeVirtuelle'
import LigneCategorie, { EtiquetteSection } from '../../components/LigneCategorie'
import { LIBELLE_ONGLET, onglet } from '../../etat'
import type { TypeContenu } from '../../lib/db'
import type { ColonneCategories as Etat } from './categories'
import { FORMAT } from './format'
import { Vide } from './Vide'

// Mesurée au getComputedStyle sur « Lecteur IPTV.dc.html » : colonne 276 px,
// champ de recherche 32 px, ligne de catégorie 34 px.
const PAS_CATEGORIE_BUREAU = 34
// 44 px au doigt (cahier des charges, mobile) : le pas de la liste virtualisée
// et la hauteur de `LigneCategorie` doivent changer ENSEMBLE.
const PAS_CATEGORIE_MOBILE = 44

export default function ColonneCategories(props: {
  etat: Etat
  surOnglet: (t: TypeContenu) => void
  surCategorie: (id: string) => void
}): JSX.Element {
  const etat = props.etat

  return (
    <aside
      aria-label="Catégories"
      style={{
        display: 'flex',
        'flex-direction': 'column',
        'min-height': '0',
        // Dans le panneau mobile, la colonne remplit la hauteur restante.
        flex: '1',
        'border-right': '1px solid var(--line)',
        background: 'var(--panel)',
      }}
    >
      {/* Mobile : la barre d'onglets du bas porte déjà Direct / Films / Séries ;
          les redoubler dans le panneau ne ferait que lui manger de la hauteur. */}
      <Show when={!estMobile()}>
      <div
        style={{
          display: 'flex',
          gap: '2px',
          padding: '10px 10px 8px',
          'border-bottom': '1px solid var(--line)',
          'flex': 'none',
        }}
      >
        <For each={['live', 'vod', 'series'] as const}>
          {(t) => (
            <button
              onClick={() => props.surOnglet(t)}
              aria-current={onglet() === t ? 'page' : undefined}
              style={{
                flex: '1',
                // 44 px au doigt : tablette et telephone (D21).
                height: estBureau() ? '30px' : '44px',
                'border-radius': 'var(--r-btn-sm)',
                'font-size': '12px',
                'font-weight': 'var(--w-strong)',
                background: onglet() === t ? 'var(--elev)' : undefined,
                color: onglet() === t ? 'var(--fg)' : 'var(--fg3)',
              }}
            >
              {LIBELLE_ONGLET[t]}
            </button>
          )}
        </For>
      </div>
      </Show>

      <div style={{ position: 'relative', padding: '12px 12px 6px', 'flex': 'none' }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: '22px', top: estBureau() ? '20px' : '26px',
            display: 'flex', color: 'var(--fg3)', 'pointer-events': 'none',
          }}
        >
          <Icone nom="search" taille={16} />
        </span>
        <input
          value={etat.recherche()}
          onInput={(e) => etat.poserRecherche(e.currentTarget.value)}
          placeholder="Rechercher une catégorie"
          aria-label="Rechercher une catégorie"
          style={{
            width: '100%',
            height: estBureau() ? '32px' : '44px',
            padding: '0 30px 0 32px',
            'border-radius': 'var(--r-sm)',
            border: '1px solid var(--line2)',
            'border-bottom-color': 'var(--fg3)',
            background: 'var(--elev)',
            'font-size': '13px',
          }}
        />
        <Show when={etat.recherche()}>
          <button
            aria-label="Effacer la recherche"
            onClick={() => etat.poserRecherche('')}
            style={{
              position: 'absolute', right: estBureau() ? '18px' : '12px', top: estBureau() ? '17px' : '12px',
              width: estBureau() ? '22px' : '44px', height: estBureau() ? '22px' : '44px', padding: '0',
              'border-radius': 'var(--r-btn-sm)',
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              color: 'var(--fg3)',
            }}
          >
            <Icone nom="close" taille={14} />
          </button>
        </Show>
      </div>

      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          gap: '8px',
          padding: '2px 16px 6px',
          'font-size': '11px',
          'line-height': '14px',
          color: 'var(--fg3)',
          'flex': 'none',
        }}
      >
        <span class="num tronque">{FORMAT.format(etat.correspondantes().length)} catégories</span>
        <Show when={etat.masquees() > 0 || etat.afficherMasquees()}>
          <button
            onClick={() => etat.poserAfficherMasquees((v) => !v)}
            style={{
              padding: '0',
              'font-size': '11px',
              color: 'var(--acc-fg)',
              'flex': 'none',
              'white-space': 'nowrap',
            }}
          >
            {etat.afficherMasquees()
              ? 'Cacher les masquées'
              : etat.masquees() > 1
                ? `Afficher les ${FORMAT.format(etat.masquees())} masquées`
                : 'Afficher la masquée'}
          </button>
        </Show>
      </div>

      <ErrorBoundary
        fallback={(e) => (
          <Diagnostic titre="Lecture des catégories" erreur={e} surReessayer={etat.recharger} />
        )}
      >
        <div style={{ flex: '1', 'min-height': '0' }}>
          <Show
            when={!etat.categories.loading}
            fallback={<p class="tertiaire" style={{ padding: '12px 16px' }}>Chargement…</p>}
          >
            <ListeVirtuelle
              elements={etat.lignes()}
              hauteurLigne={estMobile() ? PAS_CATEGORIE_MOBILE : PAS_CATEGORIE_BUREAU}
              marge={6}
              vide={
                <Vide
                  titre="Aucune catégorie"
                  texte={
                    etat.recherche()
                      ? `Rien ne correspond à « ${etat.recherche()} ».`
                      : 'Importez le catalogue depuis les Réglages pour parcourir les chaînes, les films et les séries.'
                  }
                />
              }
              ligne={(l) =>
                l.genre === 'section' ? (
                  <EtiquetteSection libelle={l.libelle} />
                ) : l.genre === 'groupe' ? (
                  <LigneCategorie
                    libelle={l.libelle}
                    compte={l.compte}
                    pays={l.code || undefined}
                    groupe
                    deplie={l.deplie}
                    retrait={10}
                    surClic={() => etat.basculerGroupe(l.cle.slice(2), l.deplie)}
                  />
                ) : (
                  <LigneCategorie
                    libelle={l.fiche.libelle}
                    compte={l.fiche.cat.compte}
                    pays={l.pastille ? l.fiche.pays : undefined}
                    retrait={l.retrait}
                    active={etat.categorieActive() === l.fiche.cat.id}
                    masquee={l.fiche.cat.masquee === 1}
                    epinglee={l.epinglee}
                    surEpingler={() => void etat.basculerEpingle(l.fiche.cat.id)}
                    surClic={() => props.surCategorie(l.fiche.cat.id)}
                  />
                )
              }
            />
          </Show>
        </div>
      </ErrorBoundary>
    </aside>
  )
}
