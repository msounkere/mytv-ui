import { Show } from 'solid-js'
import { avancementCatalogue, erreurCatalogue, etatCatalogue, mettreAJourCatalogue } from '../lib/catalogue'
import { horsLigne } from '../lib/reseau'

// Barre d'avancement de l'import du catalogue, visible de TOUS les ecrans.
//
// POURQUOI ici et plus seulement dans les Reglages : l'import est maintenant
// automatique (ouverture de session, catalogue renouvele cote serveur). Sans
// ce bandeau, un premier lancement montrerait des ecrans vides sans dire
// pourquoi -- exactement l'ecran muet que le brief interdit. Il ne s'affiche
// que pendant l'import ou apres un echec ; un catalogue a jour n'occupe aucune place.

export default function BandeauImport() {
  // Hors ligne, l'import echoue forcement : le bandeau « Hors ligne » de la
  // coque le dit deja, inutile d'accuser le catalogue (US-47 CA4).
  const visible = () =>
    etatCatalogue() === 'import' ||
    (etatCatalogue() === 'erreur' && !(horsLigne() && erreurCatalogue()?.couche === 'reseau'))
  const pourcent = () => Math.round((avancementCatalogue()?.part ?? 0) * 100)
  return (
    <Show when={visible()}>
      <div
        role="status"
        aria-live="polite"
        data-testid="bandeau-import"
        style={{
          padding: '6px 16px', background: 'var(--elev)', 'border-bottom': '1px solid var(--line)',
          'font-size': '12px', display: 'grid', gap: '4px',
        }}
      >
        <Show
          when={erreurCatalogue()}
          fallback={
            <>
              <span class="secondaire">
                {avancementCatalogue()?.etape ?? 'Catalogue'}… {pourcent()} %
              </span>
              <div style={{ height: '3px', background: 'var(--line)', 'border-radius': '2px', overflow: 'hidden' }}>
                <div
                  data-testid="bandeau-import-barre"
                  style={{
                    height: '100%', background: 'var(--acc)', width: `${pourcent()}%`,
                    transition: 'width var(--dur) var(--ease)',
                  }}
                />
              </div>
            </>
          }
        >
          {(e) => (
            <span style={{ display: 'flex', gap: '10px', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
              <span style={{ color: 'var(--err)' }} data-role="erreur-import">
                Catalogue non mis à jour : {e().message}
                <Show when={e().action}>{' '}<span class="secondaire">{e().action}</span></Show>
              </span>
              <button
                onClick={() => void mettreAJourCatalogue()}
                style={{ border: '1px solid var(--line2)', padding: '2px 10px' }}
              >
                Réessayer
              </button>
            </span>
          )}
        </Show>
      </div>
    </Show>
  )
}
