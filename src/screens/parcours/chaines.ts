import { createMemo } from 'solid-js'
import type { ProgrammeCourant } from '../../components/PlaqueChaine'
import { entreesDeCategorie } from '../../lib/catalogue'
import { programmesEnCours } from '../../lib/chaines-guide'
import { FRAICHEUR, cles, requeteClefee } from '../../lib/requetes'
import { normaliser, type EntreeCatalogue } from '../../lib/db'

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
}) {
  const [chaines] = requeteClefee(
    (id: string) => cles.categorie('live', id),
    opts.categorieActive,
    async (id) => {
      const liste = await entreesDeCategorie('live', id)
      return liste.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
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
    const liste = chaines() ?? []
    return f ? liste.filter((e) => e.recherche.includes(f)) : liste
  })

  const programmeDe = (e: EntreeCatalogue) => programmes()?.get(e.cle)

  return { chaines, filtrees, programmeDe }
}
