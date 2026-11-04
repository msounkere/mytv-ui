import { createMemo } from 'solid-js'
import type { ProgrammeCourant } from '../../components/PlaqueChaine'
import { entreesDeCategorie } from '../../lib/catalogue'
import { programmesEnCours } from '../../lib/chaines-guide'
import { FRAICHEUR, cles, requete, requeteClefee } from '../../lib/requetes'
import { est4K } from '../../lib/modes-direct'
import { db, normaliser, type EntreeCatalogue } from '../../lib/db'
import { grouperVariantes, type Groupe } from '../../lib/variantes'
import { trierChaines } from '../../lib/direct-tri'

// Les chaînes d'une catégorie et ce qui y passe en ce moment : deux lectures
// qui n'ont de sens qu'ensemble, et qui sont faites EN UNE requête indexée pour
// toute la catégorie — suivre les lignes visibles au défilement multiplierait
// les transactions pour exactement le même résultat.

/**
 * Au-delà, interroger le guide pour toute la catégorie coûterait plus que ce
 * que le spectateur verra jamais : les cartes s'affichent sans programme. Le
 * plafond vaut deux appels de grille (le serveur en accepte 200 chaînes par
 * appel) : le guide n'est plus dans une base locale, chaque chaîne coûte.
 */
const PLAFOND_EPG = 400

export function creerListeChaines(opts: {
  categorieActive: () => string | null
  filtre: () => string
  /** Option du Direct : cacher les chaines dont le nom porte « 4K ». */
  masquer4K?: () => boolean
  /** `/direct?favoris=1` : ne garder que les chaines favorites de la categorie (US-46 CA8). */
  seulementFavorites?: () => boolean
}) {
  // Cles des favoris, perimees a chaque geste : la vue des favorites suit l'etoile.
  const [favoris] = requete(
    cles.favorisCles,
    async () => new Set((await db.favoris.toArray()).map((f) => f.cle)),
    { fraicheur: FRAICHEUR.geste },
  )
  const [chaines] = requeteClefee(
    (id: string) => cles.categorie('live', id),
    opts.categorieActive,
    async (id) => {
      // Ordre du bouquet (numero du fournisseur), sinon nom naturel (A UX13).
      return trierChaines(await entreesDeCategorie('live', id))
    },
  )

  // Clefé sur la CATÉGORIE et non sur la liste de chaînes : une liste est un
  // objet, donc une clé illisible et jamais réutilisable, alors que c'est bien
  // « les programmes de cette catégorie » qu'on remet dans le cache.
  const [programmes] = requeteClefee(
    (s: { id: string; liste: EntreeCatalogue[] }) => cles.epgEnCours('live', s.id),
    () => {
      const liste = chaines()
      const id = opts.categorieActive()
      return liste && id ? { id, liste } : undefined
    },
    async ({ liste }) => {
      const vide = new Map<string, ProgrammeCourant>()
      if (liste.length === 0 || liste.length > PLAFOND_EPG) return vide
      // Une requête de grille pour le lot, jamais une par carte ; les chaînes
      // sans `epg_id` n'en font pas partie.
      return programmesEnCours(liste)
    },
    { fraicheur: FRAICHEUR.horloge },
  )

  const filtrees = createMemo(() => {
    const f = normaliser(opts.filtre().trim())
    let liste = chaines() ?? []
    if (opts.masquer4K?.()) liste = liste.filter((e) => !est4K(e.nom))
    if (opts.seulementFavorites?.()) {
      const f = favoris() ?? new Set<string>()
      liste = liste.filter((e) => f.has(e.cle))
    }
    return f ? liste.filter((e) => e.recherche.includes(f)) : liste
  })

  // US-39 CA1 : les variantes d'une chaîne vivent souvent dans d'AUTRES
  // catégories (« FRANCE 4K », « FRANCE HEVC ») : une requête sur l'index
  // `groupe` pour toute la catégorie les ramène, et non une par ligne.
  const [variantesAilleurs] = requeteClefee(
    (id: string) => [...cles.categorie('live', id), 'variantes'] as const,
    () => (chaines() && opts.categorieActive()) || undefined,
    async (id) => {
      const liste = (await entreesDeCategorie('live', id)) as EntreeCatalogue[]
      const groupes = [...new Set(liste.map((e) => e.groupe).filter((g): g is string => !!g))]
      if (groupes.length === 0) return [] as EntreeCatalogue[]
      return db.catalogue.where('groupe').anyOf(groupes).toArray()
    },
  )

  /** Une ligne par groupe : la liste filtrée, chaque chaîne portant ses variantes d'où qu'elles viennent. */
  const groupes = createMemo<Groupe<EntreeCatalogue>[]>(() => {
    const liste = filtrees()
    const ailleurs = variantesAilleurs() ?? []
    if (ailleurs.length === 0) return grouperVariantes(liste)
    const dansListe = new Set(liste.map((e) => e.cle))
    const parGroupe = new Map<string, EntreeCatalogue[]>()
    for (const e of ailleurs) if (e.groupe && !dansListe.has(e.cle)) parGroupe.set(e.groupe, [...(parGroupe.get(e.groupe) ?? []), e])
    // La liste d'abord (son ordre et ses représentants), les variantes d'ailleurs ensuite.
    const tout: EntreeCatalogue[] = [...liste]
    for (const g of new Set(liste.map((e) => e.groupe))) if (g) tout.push(...(parGroupe.get(g) ?? []))
    // Un groupe n'est affiché que s'il a une variante dans la liste : le reste est hors catégorie.
    const presents = new Set(liste.map((e) => e.groupe))
    return grouperVariantes(tout).filter((g) => g.variantes.some((v) => dansListe.has(v.cle)) || !presents.has(g.cle))
  })

  const programmeDe = (e: EntreeCatalogue) => programmes()?.get(e.cle)
  /** Programme du groupe : celui de la première variante qui en a un. */
  const programmeDuGroupe = (g: Groupe<EntreeCatalogue>) => {
    for (const v of g.variantes) {
      const p = programmes()?.get(v.cle)
      if (p) return p
    }
    return undefined
  }

  return { chaines, filtrees, groupes, programmeDe, programmeDuGroupe }
}
