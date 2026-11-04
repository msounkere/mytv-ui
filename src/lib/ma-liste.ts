import { db, type AVoir, type EntreeCatalogue } from './db'
import { journaliser, planifierGeste, tirerAVoir } from './synchro'
import { invaliderAVoir } from './requetes'
import { noter } from './diagnostic'
import { ErreurApi, ErreurReseau, envoyer } from './api'
import { cheminAVoir, idAVoirDeCle } from './identifiants'
import { CLE_ORDRE, prochainApres, trierPretsDabord, type Preparation } from './ma-liste-regles'
import { TEXTES_TOAST, emettreToast } from './toasts'
import { titreCourt } from '../components/titres'

// Gestes sur « Ma liste » (US-43 CA1, lot 10 US-46) : meme discipline que les
// favoris dans preferences.ts -- IndexedDB d'abord, journal ensuite, cache
// perime au geste. Le service est un confort : hors ligne, l'ajout a deja eu
// lieu et il partira au prochain reseau (synchro.ts, classe de route `a_voir`).
//
// Une serie est UN element (jamais ses episodes) ; un episode ajoute sa serie
// avec `depuis` = cet episode -- c'est la fiche qui traduit, ici on ne recoit
// que des cles de film ou de serie (idAVoirDeCle refuse le reste).
//
// Lot 10 (CA4) : chaque geste emet son toast, et « Annuler » refait le geste
// inverse -- avec `silencieux` pour que l'inverse ne fasse pas de toast a son tour.

export interface OptionsAVoir {
  episodesAvance?: number
  depuis?: { saison: number; episode: number }
}
export type OptionsMaListe = OptionsAVoir

export interface OptionsGeste {
  /** Pas de toast (geste inverse d'un « Annuler », reprise apres synchro). */
  silencieux?: boolean
  /** Rang a restituer (annulation d'un retrait) ; sinon en fin de liste. */
  rang?: number
}

export async function listeMaListe(): Promise<AVoir[]> {
  return db.a_voir.orderBy('rang').toArray()
}
export const listeAVoir = listeMaListe

export async function estDansMaListe(cle: string): Promise<boolean> {
  return (await db.a_voir.get(cle)) !== undefined
}
export const estAVoir = estDansMaListe

/** Nom affichable pour les toasts ; la cle a defaut. */
async function titreDe(cle: string): Promise<string> {
  const e = await db.catalogue.get(cle).catch(() => undefined)
  return e ? titreCourt(e.nom) : cle
}

/** Ajoute en fin de liste, ou met a jour les options d'un element deja present. Idempotent. */
export async function ajouterMaListe(cle: string, options: OptionsMaListe = {}, geste: OptionsGeste = {}): Promise<void> {
  const id = idAVoirDeCle(cle)
  // Lecture, ecriture ET journal dans UNE transaction : la relecture du serveur
  // (toutes les 10 s) ne doit pas s'intercaler et perdre le geste.
  const nouveau = await db.transaction('rw', db.a_voir, db.journal, async () => {
    const existant = await db.a_voir.get(cle)
    let cree = false
    if (existant) await db.a_voir.put({ ...existant, ...nettoyer(options) })
    else {
      const dernier = await db.a_voir.orderBy('rang').last()
      const rang = geste.rang ?? (dernier?.rang ?? 0) + 1
      if (geste.rang !== undefined) {
        // Restituer un rang : ce qui etait derriere recule d'un cran.
        const suivants = await db.a_voir.where('rang').aboveOrEqual(geste.rang).toArray()
        for (const s of suivants) await db.a_voir.put({ ...s, rang: s.rang + 1 })
      }
      await db.a_voir.put({ cle, rang, ajouteLe: Date.now(), ...nettoyer(options) })
      cree = true
    }
    await journaliser({ genre: 'a_voir', cle })
    if (geste.rang !== undefined && cree) await journaliser({ genre: 'a_voir', cle: CLE_ORDRE })
    return cree
  })
  if (nouveau) noter('a_voir:ajout', { id })
  planifierGeste()
  await invaliderAVoir()
  if (nouveau && !geste.silencieux) {
    const titre = await titreDe(cle)
    emettreToast({
      message: TEXTES_TOAST.ajoutMaListe(titre),
      ton: 'ok',
      action: () => retirerMaListe(cle, { silencieux: true }),
    })
  }
}
export const ajouterAVoir = ajouterMaListe

export async function retirerMaListe(cle: string, geste: OptionsGeste = {}): Promise<void> {
  const id = idAVoirDeCle(cle)
  const ancien = await db.transaction('rw', db.a_voir, db.journal, async () => {
    const l = await db.a_voir.get(cle)
    if (l === undefined) return undefined
    await db.a_voir.delete(cle)
    await journaliser({ genre: 'a_voir', cle, supprime: true })
    return l
  })
  if (!ancien) return
  noter('a_voir:retrait', { id })
  planifierGeste()
  await invaliderAVoir()
  if (!geste.silencieux) {
    const titre = await titreDe(cle)
    emettreToast({
      message: TEXTES_TOAST.retraitMaListe(titre),
      ton: 'info',
      action: () => ajouterMaListe(cle, { episodesAvance: ancien.episodesAvance, depuis: ancien.depuis }, { silencieux: true, rang: ancien.rang }),
    })
  }
}
export const retirerAVoir = retirerMaListe

/** Le bouton des fiches et des cartes : renvoie l'etat APRES le geste. */
export async function basculerMaListe(cle: string, options: OptionsMaListe = {}): Promise<boolean> {
  if (await estDansMaListe(cle)) {
    await retirerMaListe(cle)
    return false
  }
  await ajouterMaListe(cle, options)
  return true
}
export const basculerAVoir = basculerMaListe

/** Serie : episodes d'avance et « a partir de » (CA2). */
export async function modifierOptionsMaListe(cle: string, options: OptionsMaListe): Promise<void> {
  const trouve = await db.transaction('rw', db.a_voir, db.journal, async () => {
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
    await journaliser({ genre: 'a_voir', cle })
    return true
  })
  if (!trouve) return
  planifierGeste()
  await invaliderAVoir()
}
export const modifierOptionsAVoir = modifierOptionsMaListe

/** Nouvel ordre complet (glisser, monter, descendre). */
export async function reordonnerMaListe(cles: string[]): Promise<void> {
  await db.transaction('rw', db.a_voir, db.journal, async () => {
    const lignes = await db.a_voir.bulkGet(cles)
    const misesAJour: AVoir[] = []
    lignes.forEach((l, i) => {
      if (l) misesAJour.push({ ...l, rang: i + 1 })
    })
    await db.a_voir.bulkPut(misesAJour)
    await journaliser({ genre: 'a_voir', cle: CLE_ORDRE })
  })
  planifierGeste()
  await invaliderAVoir()
}
export const reordonnerAVoir = reordonnerMaListe

/**
 * « Réessayer » (US-44 CA3) : `POST /profil/a_voir/{id}/reessayer` remet les
 * fichiers en echec en attente. Pas de journal : le geste n'a de sens qu'en
 * ligne, et l'etat suivant revient par la relecture. Localement, les echecs
 * passent tout de suite en attente pour que le chip reponde au clic.
 */
export async function reessayerMaListe(cle: string): Promise<boolean> {
  const id = idAVoirDeCle(cle)
  const l = await db.a_voir.get(cle)
  if (l?.preparation) {
    const p: Preparation = { ...l.preparation }
    if (p.etat === 'echec') { p.etat = 'attente'; delete p.cause; delete p.reessai }
    if (p.episodes) p.episodes = p.episodes.map((e) => (e.etat === 'echec' ? { ...e, etat: 'attente', cause: undefined, reessai: undefined } : e))
    await db.a_voir.put({ ...l, preparation: p })
    await invaliderAVoir()
  }
  try {
    await envoyer(`/profil/a_voir/${cheminAVoir(id)}/reessayer`, { methode: 'POST' })
  } catch (e) {
    if (e instanceof ErreurReseau) {
      emettreToast({ message: 'Hors ligne · impossible de relancer la préparation pour l’instant', ton: 'erreur' })
      return false
    }
    if (e instanceof ErreurApi && e.statut === 404) return false
    throw e
  }
  noter('a_voir:reessai', { id })
  void tirerAVoir().catch(() => undefined)
  return true
}

function nettoyer(o: OptionsMaListe): OptionsMaListe {
  const r: OptionsMaListe = {}
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
export type MaListeJoint = AVoirJoint

/** La liste dans son ordre, jointe au catalogue (un element inconnu du catalogue n'est pas affichable). */
export async function listeMaListeJointe(): Promise<AVoirJoint[]> {
  const lignes = await listeMaListe()
  const entrees = await db.catalogue.bulkGet(lignes.map((l) => l.cle))
  const sortie: AVoirJoint[] = []
  lignes.forEach((element, i) => {
    const entree = entrees[i]
    if (entree) sortie.push({ element, entree })
  })
  return sortie
}
export const listeAVoirJointe = listeMaListeJointe

/** Rangee de l'Accueil (lot 10, C UX23) : l'ORDRE de la liste, le badge « Prêt » suffit a distinguer. */
export async function listeMaListeAccueil(): Promise<AVoirJoint[]> {
  return listeMaListeJointe()
}

/** Compat lot 9 : les prets d'abord, puis l'ordre de la liste. */
export async function listeAVoirAccueil(): Promise<AVoirJoint[]> {
  const jointe = await listeMaListeJointe()
  const parCle = new Map(jointe.map((j) => [j.element.cle, j]))
  return trierPretsDabord(jointe.map((j) => j.element)).map((e) => parCle.get(e.cle)!)
}

/**
 * Fin de lecture : le prochain element de la liste, sans demarrage automatique
 * (jamais le contenu courant) et si le contenu courant etait DANS la liste --
 * hors liste, le calque dit « Prochain dans Ma liste » sans « suivant » (C19).
 */
export async function prochainMaListeApres(cle: string): Promise<{ suivant: AVoirJoint | undefined; enListe: boolean }> {
  const jointe = await listeMaListeJointe()
  const { suivant, enListe } = prochainApres(jointe.map((j) => j.element), cle)
  return { suivant: suivant ? jointe.find((j) => j.element.cle === suivant.cle) : undefined, enListe }
}

/** Compat lot 9. */
export async function prochainAVoirApres(cle: string): Promise<AVoirJoint | undefined> {
  return (await prochainMaListeApres(cle)).suivant
}
