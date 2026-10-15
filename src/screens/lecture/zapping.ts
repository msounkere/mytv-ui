import { createMemo, createSignal } from 'solid-js'
import { fenetreAutour } from '../../components/MiniGuide'
import type { NotificationLecteur } from '../../components/Notification'
import { ClientXtream } from '../../lib/xtream'
import { config } from '../../config'
import { entreesDeCategorie } from '../../lib/catalogue'
import { epgChaine, programmeEnCours, type Programme } from '../../lib/epg'
import { FRAICHEUR, cles, donneePartagee } from '../../lib/requetes'
import { db, type EntreeCatalogue } from '../../lib/db'
import { donnee } from './donnee'

// Tout ce qui dépend des chaînes VOISINES de celle qu'on regarde : la colonne
// de zapping, le mini-guide, le bandeau de changement de chaîne et la touche
// « R » lisent les mêmes voisines et les mêmes grilles EPG. Les tenir ensemble
// est ce qui garantit qu'une seule lecture du catalogue les sert toutes.
//
// Rien ici ne passe par une requête lue pendant le rendu : voir `donnee`.

/**
 * Grille courte d'une chaîne, mise en cache sous `['epg', <stream_id>]`.
 *
 * UNE SEULE LIMITE pour tous les appelants : la colonne du lecteur en
 * demandait six et le mini-guide quatre, ce qui ferait deux caches pour la même
 * chaîne. L'échec n'est pas mis en cache — il est rattrapé ici, après la clé,
 * pour qu'un relais momentanément muet ne fige pas une grille vide.
 */
function grilleCourte(c: ClientXtream, id: number): Promise<Programme[]> {
  return donneePartagee(cles.epgChaine(id), () => epgChaine(c, id, 6), FRAICHEUR.horloge, 600_000)
    .catch(() => [] as Programme[])
}

export function creerZapping(opts: {
  entree: () => EntreeCatalogue
  direct: () => boolean
  /** Le mini-guide ne demande ses huit grilles que lorsqu'il est ouvert. */
  guideOuvert: () => boolean
  surChanger: (e: EntreeCatalogue) => void
  notifier: (message: string, ton?: NotificationLecteur['ton']) => void
}) {
  const client = () => new ClientXtream(config())

  const [filtre, poserFiltre] = createSignal('')
  const [derniereChaine, poserDerniereChaine] = createSignal<EntreeCatalogue | null>(null)

  // Voisines de la même catégorie : la liste de zapping.
  // Même clé que la colonne de Direct : la liste de zapping d'une catégorie
  // déjà parcourue est servie par le cache, sans relire 154 106 entrées.
  const voisines = donnee(
    () => [opts.entree().type, opts.entree().categorie] as const,
    ([type, cat]) =>
      cat
        ? donneePartagee(cles.categorie(type, cat), () => entreesDeCategorie(type, cat))
        : Promise.resolve([]),
    [] as EntreeCatalogue[],
  )

  const liste = createMemo(() => {
    const toutes = voisines()
    const q = filtre().trim().toLowerCase()
    if (!q) return toutes
    return toutes.filter((v) => v.nom.toLowerCase().includes(q))
  })

  // `categorie` porte l'identifiant Xtream, pas un libellé : affiché tel quel,
  // l'en-tête de la colonne annoncerait « 1 » au lieu de « FR · Généraliste ».
  const nomCategorie = donnee(
    () => (opts.entree().categorie ? `${opts.entree().type}:${opts.entree().categorie}` : undefined),
    (cle) => (cle ? db.categories.get(cle).then((c) => c?.nom) : Promise.resolve(undefined)),
    undefined as string | undefined,
  )

  // Programme en cours, uniquement en direct et seulement si la chaîne est
  // rattachée à l'EPG — 5 503 chaînes sur 21 791 le sont.
  const grille = donnee(
    () => (opts.direct() ? opts.entree().id : undefined),
    (id) => (id === undefined ? Promise.resolve([]) : grilleCourte(client(), id)),
    [] as Programme[],
  )

  const enCours = () => programmeEnCours(grille(), Date.now())
  const ensuite = (): Programme | undefined => {
    const p = enCours()
    return p ? grille().find((x) => x.debut >= p.fin) : undefined
  }

  // Le dossier est explicite : ↑ ↓ parcourent la LISTE D'ORIGINE, pas la
  // colonne filtrée. Filtrer sert à retrouver une chaîne, pas à restreindre le
  // zapping à trois entrées sans s'en apercevoir.
  function zapper(pas: number) {
    const l = voisines()
    if (l.length === 0) return
    const i = l.findIndex((v) => v.cle === opts.entree().cle)
    if (i < 0) return
    opts.surChanger(l[(i + pas + l.length) % l.length]!)
  }

  function revenirDerniereChaine() {
    const c = derniereChaine()
    if (!c) return opts.notifier('Aucune chaîne précédente', 'limite')
    opts.surChanger(c)
  }

  // --- Mini-guide : grilles des chaînes voisines -------------------------
  const chainesGuide = createMemo(() =>
    opts.guideOuvert()
      ? fenetreAutour(voisines(), voisines().findIndex((v) => v.cle === opts.entree().cle))
      : [],
  )

  // Une grille par chaîne montrée, demandée seulement quand le mini-guide est
  // ouvert : huit appels à la demande, zéro au repos. Volontairement un signal
  // et non une ressource — une ressource en attente, lue pendant le rendu,
  // suspendrait la coque entière et décrocherait le lecteur de la page.
  const grillesGuide = donnee(
    () => chainesGuide().map((c) => c.id),
    async (ids) => {
      if (ids.length === 0) return new Map<number, Programme[]>()
      const c = client()
      const grilles = await Promise.all(ids.map((id) => grilleCourte(c, id)))
      return new Map(ids.map((id, i) => [id, grilles[i]!]))
    },
    new Map<number, Programme[]>(),
  )

  const programmeDe = (e: EntreeCatalogue): Programme | undefined => {
    if (e.cle === opts.entree().cle) return enCours()
    const g = grillesGuide().get(e.id)
    return g ? programmeEnCours(g, Date.now()) : undefined
  }
  const ensuiteDe = (e: EntreeCatalogue): Programme | undefined => {
    const g = e.cle === opts.entree().cle ? grille() : grillesGuide().get(e.id)
    const p = programmeDe(e)
    return g && p ? g.find((x) => x.debut >= p.fin) : undefined
  }

  return {
    filtre, poserFiltre,
    voisines, liste, nomCategorie,
    enCours, ensuite,
    zapper,
    derniereChaine, poserDerniereChaine, revenirDerniereChaine,
    chainesGuide, programmeDe, ensuiteDe,
  }
}
