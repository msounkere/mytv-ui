import { For, Show, createSignal } from 'solid-js'
import Icone from './Icone'
import { ENTREES_PROFIL_MOBILE, type ClefNav } from './BarreLaterale'
import { choisirProfil, deconnexion, profilActifId, profils } from '../lib/auth'
import { estMobile } from '../lib/gabarit'

// Menu du profil : changer de profil actif (CA5), reglages, deconnexion.
//
// Changer de profil change TOUT l'etat personnel (favoris, historique,
// reglages) : `choisirProfil` previent le service puis la synchronisation
// recharge l'etat du nouveau profil -- le menu n'a rien d'autre a faire que
// dire si ca a echoue.
//
// Telephone (US-47 CA3/CA5) : la barre basse n'a que cinq onglets ; cette
// feuille porte donc Réglages EN PREMIER, puis Films, Séries et Guide.

export default function MenuProfil(props: {
  profil: { nom: string; initiale: string; teinte: number }
  surReglages: () => void
  /** Entrees de navigation reportees ici sur telephone (Films, Séries, Guide). */
  surNaviguer?: (cle: ClefNav) => void
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

  const naviguer = (cle: ClefNav) => {
    props.surNaviguer?.(cle)
    props.surFermer()
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

      <Show when={estMobile()}>
        <div class="panneau-trait" />
        <button
          class="panneau-option"
          role="menuitem"
          data-role="menu-reglages"
          onClick={() => {
            props.surReglages()
            props.surFermer()
          }}
        >
          <Icone nom="settings" taille={18} />
          <span style={{ flex: 1 }}>Réglages</span>
        </button>
        <For each={ENTREES_PROFIL_MOBILE}>
          {(e) => (
            <button class="panneau-option" role="menuitem" onClick={() => naviguer(e.cle)}>
              <Icone nom={e.icone} taille={18} />
              <span style={{ flex: 1 }}>{e.libelle}</span>
            </button>
          )}
        </For>
      </Show>

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

      <Show when={!estMobile()}>
        <button
          class="panneau-option"
          role="menuitem"
          data-role="menu-reglages"
          onClick={() => {
            props.surReglages()
            props.surFermer()
          }}
        >
          <Icone nom="settings" taille={18} />
          <span style={{ flex: 1 }}>Préférences et profils</span>
        </button>
      </Show>
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
