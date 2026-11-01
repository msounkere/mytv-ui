import { createSignal } from 'solid-js'
import { db, type AVoir } from './db'
import { cleDe, cleDeIdAVoir } from './identifiants'
import { CLE_ORDRE, type EtatPreparation, type Preparation, type PreparationEpisode } from './a-voir-regles'

// Reception de `GET /profil/a_voir` (US-43 CA1 : le serveur fait foi au
// demarrage ; CA2 : l'etat se relit toutes les 10 s sur l'ecran). Module a part
// pour que `synchro.ts` (qui recoit) et `a-voir.ts` (qui ecrit les gestes) le
// partagent sans s'importer l'un l'autre.

/** Element tel que le contrat (demande ui-5.contrat.demande) le rend. */
export interface AVoirElementApi {
  contenu: string
  rang: number
  ajoute: string
  episodes_avance?: number
  depuis?: { saison: number; episode: number }
  etat: EtatPreparation
  octets?: number
  total?: number
  debit_kbps?: number
  cause?: string
  episodes?: Array<{
    contenu: string
    saison: number
    episode: number
    etat: EtatPreparation
    octets?: number
    total?: number
    debit_kbps?: number
    cause?: string
  }>
}

const ETATS: readonly EtatPreparation[] = ['attente', 'en_cours', 'pret', 'echec']
const etatSur = (e: unknown): EtatPreparation => (ETATS.includes(e as EtatPreparation) ? (e as EtatPreparation) : 'attente')
const nombre = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) ? n : undefined)
/** La cause vient du serveur deja assainie ; on la borne quand meme pour l'affichage. */
const texte = (t: unknown): string | undefined => (typeof t === 'string' && t ? t.slice(0, 200) : undefined)

export function versPreparation(e: AVoirElementApi): Preparation {
  const episodes: PreparationEpisode[] | undefined = e.episodes?.map((ep) => ({
    contenu: ep.contenu, saison: ep.saison, episode: ep.episode, etat: etatSur(ep.etat),
    octets: nombre(ep.octets), total: nombre(ep.total), debitKbps: nombre(ep.debit_kbps), cause: texte(ep.cause),
  }))
  return {
    etat: etatSur(e.etat),
    octets: nombre(e.octets), total: nombre(e.total), debitKbps: nombre(e.debit_kbps), cause: texte(e.cause),
    ...(episodes?.length ? { episodes } : {}),
  }
}

// --- Ce qui est pret, lisible par tous les ecrans ------------------------------
// Les cartes et les fiches (CA3) et le decompte du lecteur (CA4) demandent « ce
// contenu est-il pret ? » : un signal, recalcule a chaque reception, repond sans
// relire la table. Cles locales : celle du film, et celle de CHAQUE episode pret
// d'une serie (`series:iptva:77123.mkv`).

const [clesPretes, poserClesPretes] = createSignal<ReadonlySet<string>>(new Set())
export { clesPretes }

export function estPret(cle: string): boolean {
  return clesPretes().has(cle)
}

export function recalculerPrets(lignes: AVoir[]): void {
  const prets = new Set<string>()
  for (const l of lignes) {
    const p = l.preparation
    if (!p) continue
    if (p.etat === 'pret' && !p.episodes) prets.add(l.cle)
    for (const ep of p.episodes ?? []) if (ep.etat === 'pret') prets.add(cleDe('series', ep.contenu))
  }
  poserClesPretes(prets)
}

// Au chargement : ce que la derniere reception a laisse en base, pour que les
// badges ne clignotent pas en attendant le serveur.
if (typeof indexedDB !== 'undefined') void db.a_voir.toArray().then(recalculerPrets).catch(() => undefined)

const meme = (a: AVoir | undefined, b: AVoir): boolean => a !== undefined && JSON.stringify(a) === JSON.stringify(b)

/**
 * Applique la liste du serveur a la table locale. `gardes` : cles qui ont un
 * geste local pas encore parti -- elles gagnent sur le serveur (un element ajoute
 * hors ligne ne doit pas disparaitre sous les doigts), mais prennent quand
 * meme l'etat de preparation recu. Renvoie vrai si quelque chose a change.
 */
export async function appliquerListeServeur(elements: AVoirElementApi[], gardes: ReadonlySet<string>): Promise<boolean> {
  const locaux = await db.a_voir.toArray()
  const connus = new Map(locaux.map((l) => [l.cle, l]))
  const recus = new Map<string, AVoirElementApi>()
  for (const e of elements) {
    const cle = cleDeIdAVoir(e.contenu)
    if (cle) recus.set(cle, e)
  }
  // Un ordre local pas encore parti gagne sur les rangs du serveur : sinon la
  // relecture periodique de l'etat (toutes les 10 s) defait un « Descendre »
  // avant que le PUT de l'ordre ne parte.
  const ordreLocal = gardes.has(CLE_ORDRE)
  let change = false
  for (const l of locaux)
    if (!recus.has(l.cle) && !gardes.has(l.cle)) {
      await db.a_voir.delete(l.cle)
      change = true
    }
  let i = 0
  for (const [cle, e] of recus) {
    i++
    const local = connus.get(cle)
    const preparation = versPreparation(e)
    let ligne: AVoir
    if (gardes.has(cle)) {
      // Geste local en attente : l'element reste tel que l'utilisateur l'a voulu
      // (present ou retire, ses options), seul l'etat du serveur s'y ajoute.
      if (!local) continue
      ligne = { ...local, preparation }
    } else {
      ligne = {
        cle,
        rang: ordreLocal && local ? local.rang : typeof e.rang === 'number' ? e.rang : i,
        ajouteLe: local?.ajouteLe ?? (Date.parse(e.ajoute) || Date.now()),
        ...(e.episodes_avance !== undefined ? { episodesAvance: e.episodes_avance } : {}),
        ...(e.depuis ? { depuis: { saison: e.depuis.saison, episode: e.depuis.episode } } : {}),
        preparation,
      }
    }
    if (meme(local, ligne)) continue
    await db.a_voir.put(ligne)
    change = true
  }
  recalculerPrets(await db.a_voir.toArray())
  return change
}
