import { For, Show } from 'solid-js'
import Icone from './Icone'
import { barreDeployee, basculerBarre, lectureEnCours } from '../etat'
import type { TypeContenu } from '../lib/db'
import { estMobile, gabarit } from '../lib/gabarit'

// Deux états, mesurés sur la maquette V2 : 220 px avec les libellés à droite de
// l'icône, 72 px avec le libellé dessous et une infobulle au survol. Replier
// rend 148 px au catalogue — c'est une ligne d'affiches de plus — mais coûte la
// lecture immédiate des rubriques, donc c'est un choix, pas un défaut.
//
// Telephone (US-47 CA3) : CINQ onglets, comme Apple TV et Disney+ —
// Accueil, Direct, Ma liste, Recherche, Profil. Films, Séries et Guide vivent
// dans la feuille du profil (voir MenuProfil), avec Réglages en premier. Sept
// onglets de 44 px ne tenaient pas a 320 px ni au zoom 125 % (audit D10).

export type ClefNav = 'accueil' | 'live' | 'vod' | 'series' | 'guide' | 'a_voir' | 'reglages' | 'recherche'

interface Entree {
  cle: ClefNav
  icone: string
  libelle: string
}

export const ENTREES: Entree[] = [
  { cle: 'accueil', icone: 'home', libelle: 'Accueil' },
  { cle: 'live', icone: 'live_tv', libelle: 'Direct' },
  { cle: 'vod', icone: 'movie', libelle: 'Films' },
  { cle: 'series', icone: 'video_library', libelle: 'Séries' },
  { cle: 'guide', icone: 'tv_guide', libelle: 'Guide' },
  // Lot 10 : la liste que le serveur prepare d'avance s'appelle « Ma liste ».
  { cle: 'a_voir', icone: 'view_list', libelle: 'Ma liste' },
]

/** Barre basse du telephone : cinq cibles, le profil compris (rendu a part). */
export const ENTREES_MOBILE: Entree[] = [
  { cle: 'accueil', icone: 'home', libelle: 'Accueil' },
  { cle: 'live', icone: 'live_tv', libelle: 'Direct' },
  { cle: 'a_voir', icone: 'view_list', libelle: 'Ma liste' },
  { cle: 'recherche', icone: 'search', libelle: 'Recherche' },
]

/** Entrees du rail reportees dans la feuille du profil sur telephone. */
export const ENTREES_PROFIL_MOBILE: Entree[] = ENTREES.filter((e) => !ENTREES_MOBILE.some((m) => m.cle === e.cle))

/** Rubrique que le flux en cours fait vivre, pour y poser le point bleu. */
const RUBRIQUE: Record<TypeContenu, ClefNav> = { live: 'live', vod: 'vod', series: 'series' }

export default function BarreLaterale(props: {
  actif: ClefNav
  surNaviguer: (cle: ClefNav) => void
  profil: { nom: string; initiale: string; teinte: number }
  surProfil: (ancre: HTMLElement) => void
}) {
  const enLecture = () => {
    const l = lectureEnCours()
    return l ? RUBRIQUE[l.type] : undefined
  }

  // Seul le bureau a la place de déployer la barre. En tablette elle reste à
  // 72 px (cahier des charges §6) et en mobile elle devient une barre d'onglets
  // : le choix mémorisé n'est pas perdu, il redevient valable au retour au bureau.
  const deployee = () => barreDeployee() && gabarit() === 'bureau'
  const entrees = () => (estMobile() ? ENTREES_MOBILE : ENTREES)

  // Sur telephone, Films / Séries / Guide / Réglages passent par l'onglet
  // Profil : il est « actif » quand l'un d'eux l'est, pour que la barre dise
  // toujours ou l'on est.
  const profilActif = () => estMobile() && !ENTREES_MOBILE.some((e) => e.cle === props.actif)

  return (
    <nav
      aria-label="Navigation principale"
      class="rail"
      data-deployee={deployee() ? '1' : '0'}
    >
      <div class="rail-entete">
        <button
          class="rail-menu"
          aria-label={deployee() ? 'Replier la navigation' : 'Déployer la navigation'}
          aria-expanded={deployee()}
          data-infobulle={deployee() ? '' : 'Déployer la navigation'}
          onClick={basculerBarre}
        >
          <Icone nom="menu" taille={20} />
        </button>
        <Show when={deployee()}>
          <div class="rail-marque">
            <span class="rail-marque-pastille">
              <Icone nom="connected_tv" taille={16} />
            </span>
            <span class="rail-marque-nom">Lecteur IPTV</span>
          </div>
        </Show>
      </div>

      <For each={entrees()}>
        {(e) => (
          <Entree
            icone={e.icone}
            libelle={e.libelle}
            actif={props.actif === e.cle}
            enLecture={enLecture() === e.cle}
            surAction={() => props.surNaviguer(e.cle)}
          />
        )}
      </For>

      <div class="rail-espace" style={{ flex: 1 }} />

      <Entree
        icone="settings"
        libelle="Réglages"
        classe="rail-item--reglages"
        actif={props.actif === 'reglages'}
        surAction={() => props.surNaviguer('reglages')}
      />

      <button
        class="rail-item rail-item--profil"
        aria-label={`Profil : ${props.profil.nom}`}
        aria-haspopup="menu"
        aria-current={profilActif() ? 'page' : undefined}
        data-infobulle={deployee() ? '' : `Profil : ${props.profil.nom}`}
        onClick={(e) => props.surProfil(e.currentTarget)}
      >
        <span class="avatar" style={{ '--teinte': `${props.profil.teinte}` }}>
          {props.profil.initiale}
        </span>
        <span class="rail-libelle">{estMobile() ? 'Profil' : props.profil.nom}</span>
      </button>
    </nav>
  )
}

function Entree(props: {
  icone: string
  libelle: string
  actif: boolean
  enLecture?: boolean
  classe?: string
  surAction: () => void
}) {
  return (
    <button
      class={`rail-item ${props.classe ?? ''}`}
      aria-current={props.actif ? 'page' : undefined}
      // L'infobulle ne sert qu'en mode compact ; déployée, le libellé est déjà là.
      data-infobulle={gabarit() === 'bureau' && barreDeployee() ? '' : props.libelle}
      onClick={props.surAction}
    >
      <span class="rail-icone">
        <Icone nom={props.icone} taille={22} plein={props.actif} />
        <Show when={props.enLecture}>
          <span class="rail-point" title="Lecture en cours" />
        </Show>
      </span>
      <span class="rail-libelle">{props.libelle}</span>
    </button>
  )
}
