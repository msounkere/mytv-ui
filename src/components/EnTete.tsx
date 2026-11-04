import { Show, createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import Icone from './Icone'
import PanneauLecteur from './PanneauLecteur'
import MenuProfil from './MenuProfil'
import type { ClefNav } from './BarreLaterale'
import { lectureEnCours } from '../etat'
import { gabarit } from '../lib/gabarit'
import { sonde } from '../sonde-debit'

// En-tête de 52 px, allégé en V2. Il ne garde que ce qu'on consulte en
// permanence : où l'on est, ce qu'on cherche, ce qui joue. Le débit, le mode
// réseau et le codec sont descendus dans le panneau « Lecteur » : ce sont des
// informations d'arbitrage, et elles occupaient la largeur de la recherche.
//
// Lot 10 (US-47 CA5) : le compteur « 0/1 » a disparu. Il comptait des flux
// que le fournisseur ne sait pas compter (`active_cons` ment) et personne ne le
// lisait sans son infobulle. Ce qui joue est dit en clair — « Lecture en cours
// · Titre » — et seulement quand quelque chose joue hors de son écran.

type Calque = 'lecteur' | 'profil' | null

/** Premier element focalisable d'un panneau : le focus y entre (CA7). */
function premierFocalisable(racine: Element | null): HTMLElement | null {
  return (
    racine?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])',
    ) ?? null
  )
}

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
  /** Navigation reportee dans la feuille du profil sur telephone. */
  surNaviguer?: (cle: ClefNav) => void
  profil: { nom: string; initiale: string; teinte: number }
  /** Ouvert depuis la barre latérale, qui partage le même menu. */
  calqueForce: Calque
  surCalque: (c: Calque) => void
}) {
  const [requete, poserRequete] = createSignal('')
  let champ: HTMLInputElement | undefined
  let boutonLecteur: HTMLButtonElement | undefined
  let boutonProfil: HTMLButtonElement | undefined
  let zonePanneau: HTMLDivElement | undefined

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

  // Gestion du focus des panneaux (US-47 CA7) : a l'ouverture, le focus entre
  // dans le panneau ; a la fermeture, il revient a l'ancre qui l'a ouvert — le
  // bouton de l'en-tete, ou celui du rail (profil), quel qu'il soit.
  let ancre: HTMLElement | null = null
  createEffect(
    on(calque, (c, precedent) => {
      if (c) {
        const actif = document.activeElement
        ancre =
          c === 'profil'
            ? actif instanceof HTMLElement && actif.closest('.rail') ? actif : (boutonProfil ?? null)
            : (boutonLecteur ?? null)
        // Le panneau est rendu dans le meme tour : on attend qu'il soit la.
        requestAnimationFrame(() => premierFocalisable(zonePanneau ?? null)?.focus())
      } else if (precedent) {
        const vers = ancre
        ancre = null
        // Un calque ferme par un changement d'ecran rend le focus a l'ancre
        // seulement si elle est encore visible (le rail l'est toujours).
        if (vers && vers.isConnected && vers.getBoundingClientRect().width > 0) vers.focus()
      }
    }),
  )

  // Fleches ↑ ↓ dans un panneau : d'un element a l'autre, sans sortir.
  function clavierPanneau(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const cible = e.target as HTMLElement
    if (cible.tagName === 'INPUT' || cible.tagName === 'SELECT') return
    const liste = [...(zonePanneau?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') ?? [])]
    const i = liste.indexOf(document.activeElement as HTMLElement)
    if (i < 0 || liste.length === 0) return
    e.preventDefault()
    liste[(i + (e.key === 'ArrowDown' ? 1 : liste.length - 1)) % liste.length]?.focus()
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
              enterkeyhint="search"
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
              data-role="lecture-en-cours"
              title={`Lecture en cours · ${l().titre} — revenir au lecteur`}
              aria-label={`Lecture en cours · ${l().titre} — revenir au lecteur`}
              onClick={props.surRetourLecteur}
            >
              <span class="entete-reprise-onde">
                <Icone nom="graphic_eq" taille={16} />
              </span>
              <span class="entete-reprise-titre">Lecture en cours · {l().titre}</span>
            </button>
          )}
        </Show>

        <button
          ref={boutonLecteur}
          class="entete-bouton-icone"
          aria-label="Lecteur : qualité et informations techniques"
          title="Lecteur : qualité et informations techniques"
          aria-expanded={calque() === 'lecteur'}
          aria-haspopup="dialog"
          data-ouvert={calque() === 'lecteur' ? '1' : '0'}
          onClick={() => basculer('lecteur')}
        >
          <Icone nom="tune" taille={20} plein={sonde().etat === 'mesure'} />
        </button>

        <button
          ref={boutonProfil}
          class="entete-bouton-profil"
          aria-label={`Profil : ${props.profil.nom}`}
          title={`Profil : ${props.profil.nom}`}
          aria-expanded={calque() === 'profil'}
          aria-haspopup="menu"
          onClick={() => basculer('profil')}
        >
          <span class="avatar" style={{ '--teinte': `${props.profil.teinte}` }}>
            {props.profil.initiale}
          </span>
        </button>
      </div>

      <Show when={calque() !== null}>
        <div class="calque-fond" onClick={() => props.surCalque(null)} />
        <div ref={zonePanneau} style={{ display: 'contents' }} onKeyDown={clavierPanneau}>
          <Show when={calque() === 'lecteur'}>
            <PanneauLecteur surFermer={() => props.surCalque(null)} />
          </Show>
          <Show when={calque() === 'profil'}>
            <MenuProfil
              profil={props.profil}
              surReglages={props.surReglages}
              surNaviguer={props.surNaviguer}
              surFermer={() => props.surCalque(null)}
            />
          </Show>
        </div>
      </Show>
    </header>
  )
}
