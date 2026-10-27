import { createEffect, createSignal, onCleanup } from 'solid-js'
import { capacitesAnnoncees } from '../../lib/capacites'
import { noter } from '../../lib/diagnostic'
import type { EntreeCatalogue } from '../../lib/db'
import {
  choisirVariante, choixMemorise, classeDebit, expliquerChoix, memoriserChoix, preparerVariantes, scoresPour,
  variantesDuGroupe, type Choix, type ContexteChoix, type VarianteNotee,
} from '../../lib/fluidite'
import { ecrireResultat, lireResultat, testerVariantes, type ResultatTest } from '../../lib/test-chaine'
import { RANG_QUALITE, cleGroupeEntree } from '../../lib/variantes'
import { lectureDe } from '../../lib/source-lecture'

// Les variantes de la chaine ouverte, cote lecteur (US-39 CA3, CA4, CA5) : la
// recommandation, le choix explicite (retenu pour le groupe), le test actif.
// Les decisions sont dans lib/fluidite (pures) ; ici, l'etat reactif et les
// lectures de la base.

export function creerVariantesLecteur(opts: {
  entree: () => EntreeCatalogue
  direct: () => boolean
  /** Debit courant (Mbit/s) : lecteur, sinon sonde, sinon rien. */
  debitMbps: () => number | undefined
  /** Adresse de playlist telle que le lecteur l'ouvrirait (capacites, qualite). */
  urlLecture: (lecture: string) => string
  /** En-tetes que le lecteur joint a ses requetes. */
  entetes: () => Record<string, string>
  surChanger: (e: EntreeCatalogue) => void
}) {
  const [ouvert, poserOuvert] = createSignal(false)
  const [variantes, poserVariantes] = createSignal<VarianteNotee[]>([])
  const [choix, poserChoix] = createSignal<Choix | null>(null)
  const [contexte, poserContexte] = createSignal<ContexteChoix>({ capHevc: false })
  const [resultat, poserResultat] = createSignal<ResultatTest | undefined>(undefined)
  const [testEnCours, poserTestEnCours] = createSignal(false)
  let annulation: AbortController | undefined

  const groupe = () => {
    const e = opts.entree()
    return e.groupe ?? cleGroupeEntree(e)
  }

  // Le groupe se relit a chaque changement de chaine : variantes par l'index,
  // notes depuis les lectures passees dans la classe de debit courante.
  createEffect(() => {
    const entree = opts.entree()
    const estDirect = opts.direct()
    let annule = false
    onCleanup(() => {
      annule = true
    })
    poserVariantes([])
    poserChoix(null)
    poserOuvert(false)
    if (!estDirect) return
    const g = groupe()
    poserResultat(lireResultat(g))
    void (async () => {
      let entrees = await variantesDuGroupe(g)
      if (annule) return
      // La chaine ouverte en fait toujours partie, meme hors catalogue (harnais, entree reconstruite).
      if (!entrees.some((x) => x.cle === entree.cle)) entrees = [entree, ...entrees]
      const debit = opts.debitMbps()
      const scores = await scoresPour(entrees, { classe: classeDebit(debit) })
      if (annule) return
      // De la plus haute definition a la plus basse : l'ordre du menu et du test actif.
      const vs = preparerVariantes(entrees, scores).sort((a, b) => RANG_QUALITE[b.qualite] - RANG_QUALITE[a.qualite] || a.entree.nom.localeCompare(b.entree.nom, 'fr'))
      const ctx: ContexteChoix = { capHevc: capacitesAnnoncees().includes('hevc'), debitMbps: debit, choixExplicite: choixMemorise(g) }
      const c = choisirVariante(vs, ctx)
      poserContexte(ctx)
      poserVariantes(vs)
      poserChoix(c)
      // CA5 : ce qui a ete recommande et ce qui est lu, avec la raison. Un
      // groupe d'une seule variante n'a rien a dire.
      if (vs.length > 1)
        noter('recommandation:choix', {
          groupe: g, recommandee: c.recommandee.entree.cle, choisie: entree.cle,
          raison: entree.cle === c.recommandee.entree.cle ? c.raison : ctx.choixExplicite === entree.cle ? 'explicite' : 'autre',
          debit: debit === undefined ? undefined : Math.round(debit * 10) / 10, note: c.recommandee.score,
        })
    })()
  })

  const explication = () => {
    const c = choix()
    return c ? expliquerChoix(c, contexte()) : ''
  }

  /** Choix explicite : retenu pour le groupe, et la chaine change si besoin. */
  function choisir(v: VarianteNotee): void {
    const g = groupe()
    memoriserChoix(g, v.entree.cle)
    const c = choix()
    noter('recommandation:choix', { groupe: g, recommandee: c?.recommandee.entree.cle, choisie: v.entree.cle, raison: 'explicite' })
    if (v.entree.cle !== opts.entree().cle) opts.surChanger(v.entree)
  }

  /**
   * Test actif : le lecteur a deja ferme son flux (il lit `testEnCours`), puis
   * les variantes sont testees une par une. A la fin, le flux rouvre.
   */
  async function tester(): Promise<void> {
    if (testEnCours()) return
    const g = groupe()
    const vs = variantes()
    if (vs.length === 0) return
    annulation = new AbortController()
    poserTestEnCours(true)
    noter('recommandation:test', { groupe: g, variantes: vs.length })
    try {
      // Le flux vient d'etre ferme : on laisse la requete annulee se terminer.
      await new Promise((r) => setTimeout(r, 300))
      const r = await testerVariantes(
        vs.map((v) => ({ cle: v.entree.cle, nom: v.entree.nom, qualite: v.qualite, url: opts.urlLecture(lectureDe(v.entree)) })),
        {
          signal: annulation.signal, entetes: opts.entetes(),
          surProgres: (resultats) => poserResultat({ a: Date.now(), resultats }),
        },
      )
      poserResultat(r)
      if (!r.refus) ecrireResultat(g, r)
      noter('recommandation:test-fin', { groupe: g, refus: r.refus, testees: r.resultats.length })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) noter('recommandation:test-fin', { groupe: g, erreur: String(e) })
    } finally {
      annulation = undefined
      poserTestEnCours(false)
    }
  }

  function annulerTest(): void {
    annulation?.abort()
  }

  return {
    ouvert, poserOuvert,
    variantes, choix, explication, resultat, testEnCours,
    choisir, tester, annulerTest,
    groupe,
  }
}
