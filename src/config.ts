import { createSignal } from 'solid-js'
import type { Identifiants } from './lib/xtream'

// La configuration locale ne garde plus que des preferences d'affichage.
//
// POURQUOI plus aucun identifiant de relais : l'API v1 n'en expose JAMAIS au
// navigateur (cookie de session HttpOnly, contenus designes par
// `fournisseur:numero`, adresses de lecture relatives). Les champs `base`,
// `username` et `password` ne subsistent, toujours VIDES, que pour que les
// fichiers de lecture/EPG (US-20/21) compilent tant qu'ils n'ont pas migre ;
// rien ne les renseigne.

const CLE = 'mytv.config'

export interface Config extends Identifiants {
  /** Hote local du relais, pour que la diffusion reste sur le reseau local. */
  hoteLocal?: string
  theme: 'dark' | 'light'
}

// Sans session, l'application n'a aucun relais : elle affiche la page de
// connexion, et n'appelle donc personne.
const DEFAUT: Config = {
  base: '',
  username: '',
  password: '',
  hoteLocal: undefined,
  theme: 'dark',
}

/** Ce qui a le droit de survivre a la fermeture de l'onglet. Liste fermee : y
 *  ajouter un champ, c'est accepter de le voir sur le disque. */
function aEcrire(c: Config): Partial<Config> {
  return { theme: c.theme }
}

function lire(): Config {
  try {
    const brut = localStorage.getItem(CLE)
    if (!brut) return DEFAUT
    const vu = JSON.parse(brut) as Partial<Config>
    const propre: Config = { ...DEFAUT, theme: vu.theme === 'light' ? 'light' : 'dark' }
    // PURGE. Les versions precedentes ecrivaient ici les identifiants du relais,
    // saisis dans les Reglages. Ils dorment donc encore dans le localStorage de
    // chaque machine deja utilisee, et un localStorage ne s'oublie pas tout
    // seul. On reecrit l'entree des la premiere lecture -- `aEcrire` ne laisse
    // passer que le theme, donc la reecriture EST la suppression -- plutot que
    // d'attendre un hypothetique changement de preference.
    if (vu.username || vu.password || vu.base) ecrire(propre)
    return propre
  } catch {
    return DEFAUT
  }
}

function ecrire(c: Config): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(aEcrire(c)))
  } catch {
    // Mode prive : la preference vaut pour la session, ce qui suffit.
  }
}

const [config, poserConfigInterne] = createSignal<Config>(lire())

// Le theme choisi doit valoir DES le premier rendu : la page de connexion est
// maintenant le premier ecran et ne passe par aucun `poserConfig`, qui etait
// jusqu'ici le seul endroit a poser l'attribut.
if (typeof document !== 'undefined')
  document.documentElement.dataset.theme = config().theme

export { config }

export function poserConfig(maj: Partial<Config>): void {
  const suivant = { ...config(), ...maj }
  poserConfigInterne(suivant)
  ecrire(suivant)
  document.documentElement.dataset.theme = suivant.theme
}
