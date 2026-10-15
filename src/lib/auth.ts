import { createSignal } from 'solid-js'
import { oublierRelais, poserRelais } from '../config'

/**
 * Session de l'application.
 *
 * POURQUOI un compte propre a l'application alors que le relais en a deja un :
 * jusqu'ici l'URL publique n'etait « protegee » que parce qu'une interface sans
 * identifiants de relais ne sert a rien. Il etait donc impossible de servir ces
 * identifiants depuis le serveur -- la porte serait tombee avec -- et il fallait
 * les ressaisir sur chaque machine. Avec une session, c'est elle qui garde la
 * porte : le serveur garde le relais et le navigateur ne connait plus qu'un mot
 * de passe, le sien.
 *
 * CE QUE CE MODULE NE FAIT PAS : il ne touche jamais au jeton de session. Il
 * vit dans un cookie `HttpOnly`, donc hors de portee de tout JavaScript, le
 * notre comme celui d'une injection. On n'envoie que `credentials:
 * 'same-origin'` et le navigateur fait le reste.
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
  identifiant: string
  /** Secondes Unix. Informatif : c'est le serveur qui tranche. */
  expire?: number
}

interface Relais {
  base: string
  username: string
  password: string
  hoteLocal?: string
}

interface ReponseSession extends Session {
  relais: Relais
}

const [session, poserSessionInterne] = createSignal<Session | undefined>()
const [etatAuth, poserEtatAuth] = createSignal<EtatAuth>('inconnu')
/** Vrai tant que le service attend son premier compte : la page de connexion
 *  propose alors l'amorcage au lieu d'un formulaire sans issue. */
const [amorcageOuvert, poserAmorcageOuvert] = createSignal(false)

export { session, etatAuth, amorcageOuvert }

const BASE = '/flux/auth'

/** Identifiant de la derniere session ouverte sur CETTE machine. Il sert a ne
 *  pas melanger l'etat personnel de deux comptes dans le meme navigateur. */
const CLE_COMPTE = 'mytv.compte'

export interface Echec {
  message: string
  /** Secondes a attendre avant un nouvel essai, quand le service temporise. */
  retardSecondes?: number
}

async function poster(chemin: string, corps: unknown): Promise<Response> {
  return fetch(`${BASE}/${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
    // Le cookie de session est pose et renvoye par le navigateur ; il n'y a
    // rien a lire ni a stocker ici.
    credentials: 'same-origin',
  })
}

function messageDe(corps: unknown, repli: string): string {
  const e = (corps as { erreur?: unknown } | null)?.erreur
  return typeof e === 'string' && e ? e : repli
}

async function corpsJson(r: Response): Promise<unknown> {
  try {
    return await r.json()
  } catch {
    return null
  }
}

async function accepter(rep: ReponseSession): Promise<void> {
  // Les identifiants du relais vivent en memoire, jamais sur le disque du
  // navigateur : fermer l'onglet les efface, et une sauvegarde du profil
  // Chrome ne les emporte pas.
  poserRelais(rep.relais)
  await cloisonner(rep.identifiant)
  poserSessionInterne({ identifiant: rep.identifiant, expire: rep.expire })
  poserEtatAuth('connecte')
  // La reprise de l'etat personnel n'a de sens qu'une fois la session ouverte.
  // Import differe : `synchro` depend de la configuration que l'on vient de
  // poser, et la page de connexion n'a pas a le charger.
  void import('./synchro').then((m) => m.synchroniser())
  // Purge des identifiants du relais laisses dans les URL d'images par les
  // imports precedents. En fond et sans attente : elle reecrit 152 574 lignes,
  // soit une trentaine de secondes, et aucun ecran ne doit en dependre.
  void import('./db').then((m) => m.purgerUrlsRelais())
}

/**
 * Un autre compte se connecte sur cette machine : son etat personnel ne doit
 * pas heriter des favoris, de l'historique et des reprises du precedent. Sans
 * ce menage, la premiere synchronisation les POUSSERAIT dans l'espace du nouvel
 * arrivant -- l'amorcage de `synchro.ts` envoie tout ce qu'il trouve en local.
 *
 * Premiere connexion sur une machine deja utilisee : on ne touche a rien, cet
 * etat est justement celui que l'on veut faire remonter.
 */
async function cloisonner(identifiant: string): Promise<void> {
  let vu: string | null = null
  try {
    vu = localStorage.getItem(CLE_COMPTE)
    localStorage.setItem(CLE_COMPTE, identifiant)
  } catch {
    return
  }
  if (!vu || vu === identifiant) return
  const { db } = await import('./db')
  await db.favoris.clear()
  await db.historique.clear()
  await db.reprises.clear()
  await db.journal.clear()
  await db.reglages.delete('epingles.live')
  for (const r of await db.reglages.toArray())
    if (String(r.cle).startsWith('synchro.')) await db.reglages.delete(r.cle)
  // Le catalogue et le guide restent : ils ne sont pas personnels, et les
  // reimporter couterait 78 Mo pour rien.
}

/** Etat du service et de la session, au demarrage de l'application. */
export async function verifierSession(): Promise<EtatAuth> {
  try {
    const r = await fetch(`${BASE}/session`, { credentials: 'same-origin' })
    if (r.ok) {
      await accepter((await r.json()) as ReponseSession)
      return 'connecte'
    }
    // 401 attendu : le service va bien, c'est nous qui ne sommes pas connectes.
    oublierRelais()
    poserSessionInterne(undefined)
    poserEtatAuth('anonyme')
    void verifierAmorcage()
    return 'anonyme'
  } catch {
    poserEtatAuth('injoignable')
    return 'injoignable'
  }
}

async function verifierAmorcage(): Promise<void> {
  try {
    const r = await fetch(`${BASE}/etat`, { credentials: 'same-origin' })
    if (!r.ok) return
    const d = (await r.json()) as { amorcage?: boolean }
    poserAmorcageOuvert(!!d.amorcage)
  } catch {
    // L'amorcage n'est qu'une proposition : son absence ne change rien.
  }
}

export async function connexion(
  identifiant: string,
  motDePasse: string,
): Promise<Echec | undefined> {
  let r: Response
  try {
    r = await poster('connexion', { identifiant, motDePasse })
  } catch {
    poserEtatAuth('injoignable')
    return { message: "Le service d'authentification est injoignable." }
  }
  const corps = await corpsJson(r)
  if (r.status === 429) {
    const d = corps as { retardSecondes?: number } | null
    return {
      message: 'Trop de tentatives.',
      retardSecondes: typeof d?.retardSecondes === 'number' ? d.retardSecondes : 1,
    }
  }
  if (!r.ok)
    return { message: messageDe(corps, 'Identifiant ou mot de passe incorrect.') }
  await accepter(corps as ReponseSession)
  return undefined
}

/** Creation du premier compte, avec le code d'installation du serveur. Le
 *  service refuse cette route des qu'un compte existe. */
export async function amorcer(
  code: string,
  identifiant: string,
  motDePasse: string,
): Promise<Echec | undefined> {
  let r: Response
  try {
    r = await poster('amorcage', { code, identifiant, motDePasse })
  } catch {
    poserEtatAuth('injoignable')
    return { message: 'Le service est injoignable.' }
  }
  const corps = await corpsJson(r)
  if (!r.ok) {
    // 409 : un compte existe deja, la porte est fermee pour de bon. Un code
    // simplement faux (403) laisse le formulaire ouvert pour un nouvel essai.
    if (r.status === 409) poserAmorcageOuvert(false)
    return { message: messageDe(corps, 'La création du compte a échoué.') }
  }
  poserAmorcageOuvert(false)
  await accepter(corps as ReponseSession)
  return undefined
}

export async function deconnexion(): Promise<void> {
  try {
    await poster('deconnexion', {})
  } catch {
    // Le cookie peut rester si le service ne repond pas ; l'interface se
    // referme malgre tout, et la session expirera d'elle-meme.
  }
  oublierRelais()
  poserSessionInterne(undefined)
  poserEtatAuth('anonyme')
  void verifierAmorcage()
}

export function estConnecte(): boolean {
  return etatAuth() === 'connecte'
}
