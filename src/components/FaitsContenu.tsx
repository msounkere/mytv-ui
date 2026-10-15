import { For, Show } from 'solid-js'
import type { Details } from '../lib/details'

// Les faits secondaires d'un film ou d'une serie (realisateur, casting, pays,
// sortie), en liste de definitions : seuls ceux que le fournisseur donne sont
// montres, jamais une ligne vide.
export default function FaitsContenu(props: { details: Details | undefined }) {
  const lignes = () => {
    const d = props.details
    if (!d) return []
    return [
      ['Réalisateur', d.realisateur],
      ['Avec', d.casting],
      ['Pays', d.pays],
      ['Sortie', d.sortie],
    ].filter((l): l is [string, string] => !!l[1])
  }
  return (
    <Show when={lignes().length > 0}>
      <dl
        data-role="faits"
        style={{ display: 'grid', 'grid-template-columns': 'auto 1fr', gap: '4px 12px', margin: 0, 'font-size': '13px' }}
      >
        <For each={lignes()}>
          {([nom, valeur]) => (
            <>
              <dt class="tertiaire">{nom}</dt>
              <dd style={{ margin: 0 }}>{valeur}</dd>
            </>
          )}
        </For>
      </dl>
    </Show>
  )
}
