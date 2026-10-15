import { Show, createSignal, onCleanup, onMount } from 'solid-js'
import Icone from './Icone'
import PanneauLecteur from './PanneauLecteur'
import MenuProfil from './MenuProfil'
import { lectureEnCours } from '../etat'
import { gabarit } from '../lib/gabarit'
import { libelleReseau, sonde } from '../sonde-debit'

// En-tête de 52 px, allégé en V2. Il ne garde que ce qu'on consulte en
// permanence : où l'on est, ce qu'on cherche, ce qui joue, combien de flux le
// compte autorise encore. Le débit, le mode réseau, le codec et la qualité sont
// descendus dans le panneau « Lecteur » : ce sont des informations d'arbitrage,
// et elles occupaient la largeur de la recherche.

/**
 * Connexions ouvertes / autorisees. L'API v1 n'expose plus le compteur du
 * fournisseur (`active_cons` mentait de toute facon : toujours 0) : l'indicateur
 * dit ce que NOUS savons, a savoir si ce navigateur tient un flux. Le fournisseur
 * n'autorise qu'une connexion, d'ou `max: 1` -- la saturation reelle, elle,
 * arrive par le `503 Retry-After` du direct (US-20).
 */
function fluxDuCompte(): { actifs: number; max: number } {
  return { actifs: lectureEnCours() ? 1 : 0, max: 1 }
}

type Calque = 'lecteur' | 'profil' | null

export default function EnTete(props: {
  titre: string
  /** L'Accueil porte déjà un champ dominant : le doubler serait du bruit. */
  afficherRecherche: boolean
  surRechercher: (requete: string) => void
  surRetourLecteur: () => void
  /** Flèche de retour, tablette et mobile : le titre de l'écran n'y suffit plus. */
  surQuitterLecteur: () => void
  /** Le raccourci vers le lecteur n'a rien à faire dans le lecteur lui-même. */
  auLecteur: boolean
  surReglages: () => void
  profil: { nom: string; initiale: string; teinte: number }
  /** Ouvert depuis la barre latérale, qui partage le même menu. */
  calqueForce: Calque
  surCalque: (c: Calque) => void
}) {
  const [requete, poserRequete] = createSignal('')
  const flux = fluxDuCompte
  let champ: HTMLInputElement | undefined

  const calque = () => props.calqueForce
  const basculer = (c: Exclude<Calque, null>) => props.surCalque(calque() === c ? null : c)

  // Le badge « / » de la maquette n'est pas décoratif : il annonce ce raccourci.
  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape' && calque() !== null) {
      props.surCalque(null)
      return
    }
    const c = e.target as HTMLElement | null
    if (e.key !== '/' || !props.afficherRecherche) return
    if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.isContentEditable)) return
    e.preventDefault()
    champ?.focus()
  }
  onMount(() => window.addEventListener('keydown', auClavier))
  onCleanup(() => window.removeEventListener('keydown', auClavier))

  const ouvert = () => (flux()?.actifs ?? 0) > 0
  // Saturé ne veut dire « limite atteinte » que si le flux n'est pas le nôtre :
  // lire soi-même sur un abonnement à une connexion affiche toujours 1/1, et
  // peindre cet état en orange reviendrait à signaler une erreur permanente.
  const bloque = () =>
    (flux()?.actifs ?? 0) >= (flux()?.max ?? 1) && lectureEnCours() === null && ouvert()

  // Le libellé réseau quitte la barre mais doit rester lisible : le dossier le
  // laisse dans le panneau technique ET dans cette infobulle.
  const infobulleFlux = () => {
    const l = lectureEnCours()
    const etat = bloque()
      ? 'Limite de connexions atteinte : un autre appareil utilise le flux'
      : ouvert()
        ? `${flux()?.actifs} flux actif sur ${flux()?.max} autorisé`
        : `Aucun flux actif · ${flux()?.max ?? 1} autorisé par l’abonnement`
    return `${etat}${l ? ` — ${l.titre}` : ''} · ${libelleReseau()}`
  }

  return (
    <header class="entete">
      <Show when={props.auLecteur}>
        {/* Masquée au bureau par la feuille de style : la maquette bureau la
            porte aussi, mais l'application n'y a jamais eu cette flèche. */}
        <button class="entete-retour" aria-label="Quitter le lecteur" onClick={props.surQuitterLecteur}>
          <Icone nom="arrow_back" taille={20} />
        </button>
      </Show>
      <h1 class="entete-titre">{props.titre}</h1>

      <div style={{ flex: 1, display: 'flex', 'justify-content': 'center', 'min-width': 0 }}>
        <Show when={props.afficherRecherche}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              props.surRechercher(requete().trim())
            }}
            class="entete-recherche"
          >
            <span class="entete-recherche-icone">
              <Icone nom="search" taille={18} />
            </span>
            <input
              ref={champ}
              value={requete()}
              onInput={(e) => poserRequete(e.currentTarget.value)}
              placeholder={gabarit() === 'mobile' ? 'Rechercher' : 'Rechercher une chaîne, un film, une série'}
              aria-label="Recherche universelle"
            />
            <span aria-hidden="true" class="entete-raccourci">/</span>
          </form>
        </Show>
      </div>

      <div class="entete-actions">
        <Show when={!props.auLecteur && lectureEnCours()}>
          {(l) => (
            <button
              class="entete-reprise"
              title={`En lecture : ${l().titre} — revenir au lecteur`}
              onClick={props.surRetourLecteur}
            >
              <span class="entete-reprise-onde">
                <Icone nom="graphic_eq" taille={16} />
              </span>
              <span class="entete-reprise-titre">{l().titre}</span>
            </button>
          )}
        </Show>

        <div
          class="entete-flux num"
          title={infobulleFlux()}
          aria-label={infobulleFlux()}
          data-etat={bloque() ? 'limite' : ouvert() ? 'actif' : 'repos'}
        >
          <span class="entete-flux-point" />
          {flux()?.actifs ?? 0}/{flux()?.max ?? 1}
        </div>

        <button
          class="entete-bouton-icone"
          aria-label="Lecteur : qualité et informations techniques"
          title="Lecteur : qualité et informations techniques"
          aria-expanded={calque() === 'lecteur'}
          data-ouvert={calque() === 'lecteur' ? '1' : '0'}
          onClick={() => basculer('lecteur')}
        >
          <Icone nom="tune" taille={20} plein={sonde().etat === 'mesure'} />
        </button>

        <button
          class="entete-bouton-profil"
          aria-label={`Profil : ${props.profil.nom}`}
          title={`Profil : ${props.profil.nom}`}
          aria-expanded={calque() === 'profil'}
          onClick={() => basculer('profil')}
        >
          <span class="avatar" style={{ '--teinte': `${props.profil.teinte}` }}>
            {props.profil.initiale}
          </span>
        </button>
      </div>

      <Show when={calque() !== null}>
        <div class="calque-fond" onClick={() => props.surCalque(null)} />
        <Show when={calque() === 'lecteur'}>
          <PanneauLecteur
            flux={flux() ?? { actifs: 0, max: 1 }}
            surFermer={() => props.surCalque(null)}
          />
        </Show>
        <Show when={calque() === 'profil'}>
          <MenuProfil
            profil={props.profil}
            surReglages={props.surReglages}
            surFermer={() => props.surCalque(null)}
          />
        </Show>
      </Show>
    </header>
  )
}
