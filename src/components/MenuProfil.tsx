import { For } from 'solid-js'
import Icone from './Icone'

// Le profil n'existe pas encore côté données : le dossier de conception en fait
// une évolution à part entière (favoris, historique et progression par profil).
// La coque en pose la place exacte et les actions, sans simuler des profils qui
// n'existeraient que dans ce menu — proposer « Marie » et « Enfants » ici
// donnerait une promesse que le reste de l'application ne tient pas.

export default function MenuProfil(props: {
  profil: { nom: string; initiale: string; teinte: number }
  surReglages: () => void
  surFermer: () => void
}) {
  const actions: Array<{ icone: string; libelle: string; indice?: string; surAction?: () => void }> = [
    {
      icone: 'settings',
      libelle: 'Préférences et réglages',
      surAction: () => {
        props.surReglages()
        props.surFermer()
      },
    },
    { icone: 'groups', libelle: 'Changer de profil', indice: 'Bientôt' },
    { icone: 'edit', libelle: 'Gérer les profils', indice: 'Bientôt' },
  ]

  return (
    <div class="panneau panneau--profil" role="menu" aria-label="Profil">
      <div class="profil-entete">
        <span class="avatar avatar--lg" style={{ '--teinte': `${props.profil.teinte}` }}>
          {props.profil.initiale}
        </span>
        <span class="profil-identite">
          <span class="profil-nom">{props.profil.nom}</span>
          <span class="profil-sous">Profil unique</span>
        </span>
      </div>

      <div class="panneau-trait" />

      <For each={actions}>
        {(a) => (
          <button
            class="panneau-option"
            role="menuitem"
            disabled={a.surAction === undefined}
            onClick={() => a.surAction?.()}
          >
            <Icone nom={a.icone} taille={18} />
            <span style={{ flex: 1 }}>{a.libelle}</span>
            <span class="panneau-appoint">{a.indice}</span>
          </button>
        )}
      </For>
    </div>
  )
}
