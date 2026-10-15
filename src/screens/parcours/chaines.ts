import { createMemo } from 'solid-js'
import type { ProgrammeCourant } from '../../components/PlaqueChaine'
import { entreesDeCategorie } from '../../lib/catalogue'
import { chainesGuidePartagees, grillesFenetre, programmeEnCours } from '../../lib/epg'
import { FRAICHEUR, cles, donneePartagee, requeteClefee } from '../../lib/requetes'
import { normaliser, type EntreeCatalogue } from '../../lib/db'

// Les chaînes d'une catégorie et ce qui y passe en ce moment : deux lectures
// qui n'ont de sens qu'ensemble, et qui sont faites EN UNE requête indexée pour
// toute la catégorie — suivre les lignes visibles au défilement multiplierait
// les transactions pour exactement le même résultat.

/** Au-delà, interroger le guide pour toute la catégorie coûterait plus que ce
 *  que le spectateur verra jamais : les cartes s'affichent sans programme. */
const PLAFOND_EPG = 1200

/** Fenêtre demandée au guide : une heure suffit à « ce qui passe en ce moment ». */
const FENETRE_EPG = 3_600_000

/**
 * Index `stream_id → identifiant XMLTV`. La table de jointure compte 4 048
 * lignes et ne change QU'AU rechargement du guide — mais la promesse mémorisée
 * ici auparavant ne le savait pas : recharger le guide laissait Direct sur
 * l'ancienne jointure jusqu'au prochain rechargement de page. La clé partagée,
 * elle, est périmée par `invaliderGuide`.
 */
function indexGuide(): Promise<Map<number, string>> {
  return donneePartagee(
    cles.epgJointure,
    () => chainesGuidePartagees().then((l) => new Map(l.map((c) => [c.streamId, c.epg]))),
    FRAICHEUR.guide,
  )
}

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
      const par = new Map<string, ProgrammeCourant>()
      if (liste.length === 0 || liste.length > PLAFOND_EPG) return par
      const jointure = await indexGuide()
      const epgs = [...new Set(liste.map((e) => jointure.get(e.id)).filter(Boolean))] as string[]
      if (epgs.length === 0) return par
      const t0 = Date.now()
      const grilles = await grillesFenetre(epgs, t0, t0 + FENETRE_EPG)
      for (const e of liste) {
        const cle = jointure.get(e.id)
        const p = cle ? programmeEnCours(grilles.get(cle) ?? [], t0) : undefined
        if (p) par.set(e.cle, { titre: p.titre, debut: p.debut, fin: p.fin })
      }
      return par
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
