import { createSignal } from 'solid-js'
import type { Identifiants } from './lib/xtream'

// La configuration locale ne garde plus que des preferences d'affichage.
//
// POURQUOI les identifiants du relais n'y sont plus ecrits : ils viennent du
// serveur, a l'ouverture d'une session (voir lib/auth.ts), et ne vivent que le
// temps de l'onglet. L'utilisateur ne les saisit plus -- c'etait la seule raison
// de les conserver -- et rien ne les pose plus sur le disque du navigateur, ou
// une sauvegarde de profil ou une extension les lirait.
//
// CE A QUOI ILS SERVENT ENCORE, et a rien d'autre : le chemin des URL de
// lecture (`/live/<u>/<p>/<id>.m3u8` et ses deux cousines), que le relais
// n'accepte pas autrement. Le catalogue, le guide et les images passent
// desormais par le service, qui les injecte lui-meme.

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

/**
 * Identifiants du relais tels que le serveur les sert a une session valide.
 * EN MEMOIRE SEULEMENT : on passe deliberement a cote de `ecrire`.
 */
export function poserRelais(r: {
  base: string
  username: string
  password: string
  hoteLocal?: string
}): void {
  poserConfigInterne({
    ...config(),
    base: r.base ?? '',
    username: r.username ?? '',
    password: r.password ?? '',
    hoteLocal: r.hoteLocal || undefined,
  })
}

/** Deconnexion : plus rien ne doit pouvoir appeler le relais. */
export function oublierRelais(): void {
  poserConfigInterne({ ...config(), base: '', username: '', password: '' })
}

export function configComplete(): boolean {
  const c = config()
  return c.username.length > 0 && c.password.length > 0
}
