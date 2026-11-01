import { db, type AVoir, type EntreeCatalogue } from './db'
import { noterChangement } from './synchro'
import { invaliderAVoir } from './requetes'
import { noter } from './diagnostic'
import { idAVoirDeCle } from './identifiants'
import { CLE_ORDRE, prochainDansListe, trierPretsDabord } from './a-voir-regles'

// Gestes sur la liste « À voir » (US-43 CA1) : meme discipline que les favoris
// dans preferences.ts -- IndexedDB d'abord, journal ensuite, cache perime au
// geste. Le service est un confort : hors ligne, l'ajout a deja eu lieu et il
// partira au prochain reseau (synchro.ts, classe de route `a_voir`).
//
// Une serie est UN element (jamais ses episodes) ; un episode ajoute sa serie
// avec `depuis` = cet episode -- c'est la fiche qui traduit, ici on ne recoit
// que des cles de film ou de serie (idAVoirDeCle refuse le reste).

export interface OptionsAVoir {
  episodesAvance?: number
  depuis?: { saison: number; episode: number }
}

export async function listeAVoir(): Promise<AVoir[]> {
  return db.a_voir.orderBy('rang').toArray()
}

export async function estAVoir(cle: string): Promise<boolean> {
  return (await db.a_voir.get(cle)) !== undefined
}

/** Ajoute en fin de liste, ou met a jour les options d'un element deja present. Idempotent. */
export async function ajouterAVoir(cle: string, options: OptionsAVoir = {}): Promise<void> {
  const id = idAVoirDeCle(cle)
  // Lecture et ecriture dans UNE transaction : la relecture du serveur (toutes
  // les 10 s) ne doit pas s'intercaler entre les deux et perdre le geste.
  const nouveau = await db.transaction('rw', db.a_voir, async () => {
    const existant = await db.a_voir.get(cle)
    if (existant) {
      await db.a_voir.put({ ...existant, ...nettoyer(options) })
      return false
    }
    const dernier = await db.a_voir.orderBy('rang').last()
    await db.a_voir.put({ cle, rang: (dernier?.rang ?? 0) + 1, ajouteLe: Date.now(), ...nettoyer(options) })
    return true
  })
  if (nouveau) noter('a_voir:ajout', { id })
  noterChangement({ genre: 'a_voir', cle })
  await invaliderAVoir()
}

export async function retirerAVoir(cle: string): Promise<void> {
  const id = idAVoirDeCle(cle)
  if ((await db.a_voir.get(cle)) === undefined) return
  await db.a_voir.delete(cle)
  noter('a_voir:retrait', { id })
  noterChangement({ genre: 'a_voir', cle, supprime: true })
  await invaliderAVoir()
}

/** Le bouton des fiches et des cartes : renvoie l'etat APRES le geste. */
export async function basculerAVoir(cle: string, options: OptionsAVoir = {}): Promise<boolean> {
  if (await estAVoir(cle)) {
    await retirerAVoir(cle)
    return false
  }
  await ajouterAVoir(cle, options)
  return true
}

/** Serie : episodes d'avance et « a partir de » (CA2). */
export async function modifierOptionsAVoir(cle: string, options: OptionsAVoir): Promise<void> {
  const trouve = await db.transaction('rw', db.a_voir, async () => {
    const existant = await db.a_voir.get(cle)
    if (!existant) return false
    const ligne = { ...existant }
    if ('episodesAvance' in options) {
      if (options.episodesAvance === undefined) delete ligne.episodesAvance
      else ligne.episodesAvance = options.episodesAvance
    }
    if ('depuis' in options) {
      if (options.depuis === undefined) delete ligne.depuis
      else ligne.depuis = options.depuis
    }
    await db.a_voir.put(ligne)
    return true
  })
  if (!trouve) return
  noterChangement({ genre: 'a_voir', cle })
  await invaliderAVoir()
}

/** Nouvel ordre complet (glisser, monter, descendre). */
export async function reordonnerAVoir(cles: string[]): Promise<void> {
  await db.transaction('rw', db.a_voir, async () => {
    const lignes = await db.a_voir.bulkGet(cles)
    const misesAJour: AVoir[] = []
    lignes.forEach((l, i) => {
      if (l) misesAJour.push({ ...l, rang: i + 1 })
    })
    await db.a_voir.bulkPut(misesAJour)
  })
  noterChangement({ genre: 'a_voir', cle: CLE_ORDRE })
  await invaliderAVoir()
}

function nettoyer(o: OptionsAVoir): OptionsAVoir {
  const r: OptionsAVoir = {}
  if (o.episodesAvance !== undefined && Number.isFinite(o.episodesAvance) && o.episodesAvance > 0)
    r.episodesAvance = Math.floor(o.episodesAvance)
  if (o.depuis) r.depuis = { saison: o.depuis.saison, episode: o.depuis.episode }
  return r
}

// --- Lectures jointes au catalogue ---------------------------------------------

export interface AVoirJoint {
  element: AVoir
  entree: EntreeCatalogue
}

/** La liste dans son ordre, jointe au catalogue (un element inconnu du catalogue n'est pas affichable). */
export async function listeAVoirJointe(): Promise<AVoirJoint[]> {
  const lignes = await listeAVoir()
  const entrees = await db.catalogue.bulkGet(lignes.map((l) => l.cle))
  const sortie: AVoirJoint[] = []
  lignes.forEach((element, i) => {
    const entree = entrees[i]
    if (entree) sortie.push({ element, entree })
  })
  return sortie
}

/** Rangee de l'Accueil (CA3) : les prets d'abord, puis l'ordre de la liste. */
export async function listeAVoirAccueil(): Promise<AVoirJoint[]> {
  const jointe = await listeAVoirJointe()
  const parCle = new Map(jointe.map((j) => [j.element.cle, j]))
  return trierPretsDabord(jointe.map((j) => j.element)).map((e) => parCle.get(e.cle)!)
}

/** Film termine (CA4) : le prochain element de la liste, sans demarrage automatique. */
export async function prochainAVoirApres(cle: string): Promise<AVoirJoint | undefined> {
  const jointe = await listeAVoirJointe()
  const suivant = prochainDansListe(jointe.map((j) => j.element), cle)
  return suivant ? jointe.find((j) => j.element.cle === suivant.cle) : undefined
}
