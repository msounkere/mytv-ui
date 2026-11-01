import { createSignal } from 'solid-js'
import {
  ErreurApi, ErreurReseau, abonnerSessionPerdue, envoyer, json,
  type CompteApi, type LimitesApi, type ProfilApi, type SessionApi,
} from './api'

/**
 * Session de l'application, par cookie.
 *
 * CE QUE CE MODULE NE FAIT PAS : il ne touche jamais au jeton de session. Il
 * vit dans un cookie `HttpOnly` (contrat de `POST /connexion` : « le jeton n'est
 * JAMAIS dans le corps »), donc hors de portee de tout JavaScript, le notre
 * comme celui d'une injection. `api.ts` n'envoie que `credentials:
 * 'same-origin'` et le navigateur fait le reste. Plus aucun identifiant de
 * fournisseur n'existe cote navigateur : le serveur les garde.
 */

export type EtatAuth =
  /** Au demarrage, avant la premiere reponse du service. */
  | 'inconnu'
  /** Le service repond et ne nous connait pas : page de connexion. */
  | 'anonyme'
  | 'connecte'
  /** Le service ne repond pas : on le DIT, on ne laisse pas un ecran muet. */
  | 'injoignable'

export interface Session {
  /** Identifiant stable de la session -- ce n'est PAS le jeton. */
  id: string
  admin: boolean
  profilId?: string
  /** Millisecondes. Informatif : c'est le serveur qui tranche. */
  expire: number
  /** Nom saisi a la connexion, retenu pour l'affichage (le contrat ne le rend pas). */
  identifiant: string
}

const [session, poserSessionInterne] = createSignal<Session | undefined>()
const [etatAuth, poserEtatAuth] = createSignal<EtatAuth>('inconnu')
const [profils, poserProfils] = createSignal<ProfilApi[]>([])
/** Bornes de la configuration du serveur (`GET /compte`) : taille de page, plage de la grille... */
const [limites, poserLimites] = createSignal<LimitesApi | undefined>()

export { session, etatAuth, profils, limites }

/** Nom du compte saisi a la derniere connexion sur CETTE machine : non secret,
 *  il sert a l'affichage et a ne pas melanger l'etat de deux comptes. */
const CLE_COMPTE = 'mytv.compte'
/** Identite (`compte/profil`) dont l'etat personnel est actuellement en base locale. */
const CLE_IDENTITE_LOCALE = 'mytv.identite-locale'

function lireLocal(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}

function ecrireLocal(cle: string, valeur: string | null): void {
  try {
    if (valeur === null) localStorage.removeItem(cle)
    else localStorage.setItem(cle, valeur)
  } catch {
    // Mode prive : l'identite vaut pour la session, ce qui suffit.
  }
}

export interface Echec {
  message: string
  /** Secondes a attendre avant un nouvel essai, quand le service temporise. */
  retardSecondes?: number
}

function versSession(s: SessionApi): Session {
  // Le serveur est la source du nom quand il le donne ; sinon on retombe sur celui
  // saisi a la connexion (voir CLE_COMPTE). Le garder en local rend le nom
  // disponible aussi apres un rechargement sans nouvelle saisie.
  if (s.nom) ecrireLocal(CLE_COMPTE, s.nom)
  return {
    id: s.id,
    admin: s.admin,
    profilId: s.profil_id || undefined,
    expire: Date.parse(s.expire) || 0,
    identifiant: lireLocal(CLE_COMPTE) ?? '',
  }
}

/**
 * Un autre compte -- ou un autre profil -- prend la machine : son etat
 * personnel ne doit pas heriter des favoris, de l'historique et des reprises du
 * precedent. L'etat personnel est maintenant une COPIE du service (il se
 * retelecharge), donc le vider est sans perte ; le garder serait au contraire
 * un melange que la synchronisation pousserait dans le mauvais profil.
 *
 * Le catalogue reste : il n'est pas personnel, et le reimporter coute des Mo.
 */
async function cloisonner(identite: string): Promise<void> {
  const vue = lireLocal(CLE_IDENTITE_LOCALE)
  if (vue === identite) return
  ecrireLocal(CLE_IDENTITE_LOCALE, identite)
  const { db } = await import('./db')
  await db.transaction('rw', [db.favoris, db.historique, db.reprises, db.journal, db.reglages, db.a_voir], async () => {
    await db.favoris.clear()
    await db.a_voir.clear()
    await db.historique.clear()
    await db.reprises.clear()
    await db.journal.clear()
    for (const r of await db.reglages.toArray())
      if (/^(synchro\.|epingles\.)/.test(String(r.cle))) await db.reglages.delete(r.cle)
  })
  // Les categories masquees sont un reglage de profil, lui aussi.
  for (const t of ['live', 'vod', 'series'])
    await db.categories.where('[type+masquee]').equals([t, 1]).modify({ masquee: 0 })
  const { invaliderTout } = await import('./requetes')
  await invaliderTout()
}

/** Identite locale d'une session : compte (saisi) et profil actif. */
function identiteDe(s: Session): string {
  return `${s.identifiant}/${s.profilId ?? ''}`
}

async function accepter(compte: CompteApi): Promise<void> {
  poserProfils(compte.profils)
  poserLimites(compte.limites)
  let s = versSession(compte.session)
  // Un seul profil et aucun actif : le choisir est la seule action possible, la
  // demander a l'utilisateur serait un clic pour rien.
  if (!s.profilId && compte.profils.length === 1) {
    try {
      await envoyer('/compte/profil-actif', { methode: 'PUT', corps: { profil_id: compte.profils[0]!.id } })
      s = { ...s, profilId: compte.profils[0]!.id }
    } catch {
      // Echec reseau ou 404 : l'ecran de choix du profil prendra le relais.
    }
  }
  poserSessionInterne(s)
  poserEtatAuth('connecte')
  // Le catalogue ne depend d'aucun profil : on le met a jour des l'ouverture.
  void import('./catalogue').then((m) => m.demarrerSuiviCatalogue())
  if (s.profilId) await activerProfil(s)
}

/** Le profil est connu : l'etat personnel peut etre cloisonne puis synchronise. */
async function activerProfil(s: Session): Promise<void> {
  await cloisonner(identiteDe(s))
  void import('./synchro').then((m) => m.synchroniser())
}

/** Etat du service et de la session, au demarrage de l'application. */
export async function verifierSession(): Promise<EtatAuth> {
  try {
    const compte = await json<CompteApi>('/compte', { sansDetectionSession: true })
    await accepter(compte)
    return 'connecte'
  } catch (e) {
    if (e instanceof ErreurApi && e.statut === 401) {
      // 401 attendu : le service va bien, c'est nous qui ne sommes pas connectes.
      poserSessionInterne(undefined)
      poserProfils([])
      poserEtatAuth('anonyme')
      return 'anonyme'
    }
    // Reseau coupe ou service en erreur : si une session etait ouverte, on la
    // GARDE (l'etat local reste utilisable hors ligne) ; sinon on le dit.
    if (etatAuth() !== 'connecte') poserEtatAuth('injoignable')
    return etatAuth()
  }
}

// Un 401 n'importe ou = cookie expire ou revoque : retour a la connexion, l'etat
// local n'a rien perdu.
abonnerSessionPerdue(() => {
  if (etatAuth() === 'connecte') void verifierSession()
})

// Les modules de lecture, d'EPG et de diagnostic (qui ne passent pas par
// `api.ts`) annoncent un 401 par cet evenement de fenetre : meme traitement.
if (typeof window !== 'undefined')
  window.addEventListener('mytv:session-expiree', () => {
    if (etatAuth() === 'connecte') void verifierSession()
  })

export async function connexion(identifiant: string, motDePasse: string): Promise<Echec | undefined> {
  try {
    await envoyer('/connexion', {
      methode: 'POST',
      corps: { nom: identifiant, mot_de_passe: motDePasse },
      sansDetectionSession: true,
    })
  } catch (e) {
    if (e instanceof ErreurReseau) {
      poserEtatAuth('injoignable')
      return { message: 'Le service est injoignable.' }
    }
    if (e instanceof ErreurApi) {
      if (e.statut === 429)
        return { message: 'Trop de tentatives.', retardSecondes: e.retryApres ?? 1 }
      if (e.statut === 401) return { message: 'Identifiant ou mot de passe incorrect.' }
      return { message: e.message }
    }
    return { message: 'La connexion a echoue.' }
  }
  ecrireLocal(CLE_COMPTE, identifiant)
  // Le contrat ne rend aucun corps exploitable pour decider du profil : on
  // relit le compte, qui est de toute facon la source de verite de la session.
  const etat = await verifierSession()
  if (etat !== 'connecte') return { message: 'Session ouverte mais illisible : reessayer.' }
  return undefined
}

export async function deconnexion(): Promise<void> {
  try {
    await envoyer('/deconnexion', { methode: 'POST', sansDetectionSession: true })
  } catch {
    // Le cookie peut rester si le service ne repond pas ; l'interface se
    // referme malgre tout, et la session expirera d'elle-meme.
  }
  poserSessionInterne(undefined)
  poserProfils([])
  poserEtatAuth('anonyme')
  void import('./synchro').then((m) => m.arreterSynchro())
}

export function estConnecte(): boolean {
  return etatAuth() === 'connecte'
}

/** Le service dit « profil_requis » (409) : la session n'a plus de profil actif. */
export function signalerProfilRequis(): void {
  const s = session()
  if (s?.profilId) poserSessionInterne({ ...s, profilId: undefined })
}

// --- Profils (CA5) -----------------------------------------------------------

/** Profil actif de la session, ou `undefined` tant qu'aucun n'est choisi. */
export const profilActifId = (): string | undefined => session()?.profilId

export function profilActif(): ProfilApi | undefined {
  const id = profilActifId()
  return id ? profils().find((p) => p.id === id) : undefined
}

export async function rechargerProfils(): Promise<void> {
  const r = await json<{ elements: ProfilApi[] }>('/compte/profils')
  poserProfils(r.elements)
}

export async function creerProfil(nom: string): Promise<ProfilApi> {
  const p = await json<ProfilApi>('/compte/profils', { methode: 'POST', corps: { nom } })
  poserProfils([...profils(), p])
  return p
}

export async function supprimerProfil(id: string): Promise<void> {
  await envoyer(`/compte/profils/${encodeURIComponent(id)}`, { methode: 'DELETE' })
  poserProfils(profils().filter((p) => p.id !== id))
  // Supprimer le profil actif le rend inexistant cote serveur : la session
  // n'en a plus, l'utilisateur doit en choisir un autre.
  const s = session()
  if (s && s.profilId === id) poserSessionInterne({ ...s, profilId: undefined })
}

/** Change le profil actif de la session. Echoue sans rien changer si le service refuse. */
export async function choisirProfil(id: string): Promise<void> {
  const s = session()
  if (!s) return
  // Les gestes du profil quitte qui attendent d'etre envoyes (hors ligne, delai
  // de 2,5 s) partiraient sinon dans le vide : l'etat local est vide au
  // changement de profil. Au mieux : si le service est muet, le changement
  // lui-meme echouera juste apres et rien ne sera perdu.
  await import('./synchro').then((m) => m.synchroniser())
  await envoyer('/compte/profil-actif', { methode: 'PUT', corps: { profil_id: id } })
  const suivant = { ...s, profilId: id }
  poserSessionInterne(suivant)
  await activerProfil(suivant)
}
