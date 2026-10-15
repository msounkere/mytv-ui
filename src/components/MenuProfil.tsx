import { For, Show, createSignal } from 'solid-js'
import Icone from './Icone'
import { choisirProfil, deconnexion, profilActifId, profils } from '../lib/auth'

// Menu du profil : changer de profil actif (CA5), reglages, deconnexion.
//
// Changer de profil change TOUT l'etat personnel (favoris, historique,
// reglages) : `choisirProfil` previent le service puis la synchronisation
// recharge l'etat du nouveau profil -- le menu n'a rien d'autre a faire que
// dire si ca a echoue.

export default function MenuProfil(props: {
  profil: { nom: string; initiale: string; teinte: number }
  surReglages: () => void
  surFermer: () => void
}) {
  const [erreur, poserErreur] = createSignal('')

  async function changer(id: string) {
    if (id === profilActifId()) return
    poserErreur('')
    try {
      await choisirProfil(id)
      props.surFermer()
    } catch {
      // Le profil actif n'a pas change (service muet ou profil supprime ailleurs).
      poserErreur('Le changement de profil a échoué. Réessayer.')
    }
  }

  return (
    <div class="panneau panneau--profil" role="menu" aria-label="Profil">
      <div class="profil-entete">
        <span class="avatar avatar--lg" style={{ '--teinte': `${props.profil.teinte}` }}>
          {props.profil.initiale}
        </span>
        <span class="profil-identite">
          <span class="profil-nom">{props.profil.nom}</span>
          <span class="profil-sous">
            {profils().length > 1 ? `${profils().length} profils` : 'Profil unique'}
          </span>
        </span>
      </div>

      <Show when={profils().length > 1}>
        <div class="panneau-trait" />
        <For each={profils()}>
          {(p) => (
            <button
              class="panneau-option"
              role="menuitemradio"
              aria-checked={p.id === profilActifId()}
              onClick={() => void changer(p.id)}
            >
              <Icone
                nom={p.id === profilActifId() ? 'radio_button_checked' : 'radio_button_unchecked'}
                taille={18}
              />
              <span style={{ flex: 1 }}>{p.nom}</span>
            </button>
          )}
        </For>
      </Show>

      <div class="panneau-trait" />

      <button
        class="panneau-option"
        role="menuitem"
        onClick={() => {
          props.surReglages()
          props.surFermer()
        }}
      >
        <Icone nom="settings" taille={18} />
        <span style={{ flex: 1 }}>Préférences et profils</span>
      </button>
      <button class="panneau-option" role="menuitem" onClick={() => void deconnexion()}>
        <Icone nom="link_off" taille={18} />
        <span style={{ flex: 1 }}>Se déconnecter</span>
      </button>

      <Show when={erreur()}>
        <p role="alert" style={{ color: 'var(--err)', margin: '6px 12px', 'font-size': '12px' }}>{erreur()}</p>
      </Show>
    </div>
  )
}
