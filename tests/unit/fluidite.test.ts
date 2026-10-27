import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agregerLectures, choisirVariante, classeDebit, creerCollecteur, expliquerChoix, mediane, preparerVariantes,
  scoreFluidite, DEBIT_SUPPOSE_MBPS, FENETRE_MS, type LectureMesuree, type VarianteNotee,
} from '../../src/lib/fluidite'
import type { EntreeCatalogue } from '../../src/lib/db'

// US-39 CA2 (score) et CA3 (choix) : logique pure, sans base ni navigateur.

const J = 24 * 3_600_000
const lecture = (p: Partial<LectureMesuree> & { chaine: string }): LectureMesuree => ({
  appareil: 'a', debut: 0, dureeS: 3600, segments: 360, debitKbps: 8000, blocages: 0, erreurs: 0, redemarrages: 0, ...p,
})
const entree = (cle: string, nom: string): EntreeCatalogue => ({
  cle, type: 'live', id: 0, idServeur: `iptva:${cle}`, nom, recherche: nom.toLowerCase(), lecture: `/api/v1/live/${cle}.m3u8`,
})

test('CA2 : classe de debit < 5, 5-15, > 15 Mbit/s', () => {
  assert.equal(classeDebit(3), 'faible')
  assert.equal(classeDebit(5), 'moyen')
  assert.equal(classeDebit(15), 'moyen')
  assert.equal(classeDebit(28), 'eleve')
  assert.equal(classeDebit(undefined), undefined)
  assert.equal(classeDebit(NaN), undefined)
  assert.equal(mediane([5, 1, 3]), 3)
  assert.equal(mediane([4, 1, 3, 2]), 2.5)
})

test('CA2 : une variante qui bloque 3 fois par heure est notee bien sous celle qui ne bloque jamais', () => {
  const bloque = scoreFluidite(agregerLectures([lecture({ chaine: 'a', blocages: 3 })], { maintenant: 1000 }))
  const fluide = scoreFluidite(agregerLectures([lecture({ chaine: 'b', blocages: 0 })], { maintenant: 1000 }))
  assert.equal(fluide, 100)
  assert.equal(bloque, 55)
  assert.ok(bloque! < fluide!)
  // Les erreurs et les reprises pesent aussi ; jamais sous 0.
  assert.equal(scoreFluidite({ lectures: 1, dureeS: 3600, blocages: 0, erreurs: 2, redemarrages: 1 }), 40)
  assert.equal(scoreFluidite({ lectures: 1, dureeS: 1800, blocages: 20, erreurs: 0, redemarrages: 0 }), 0)
  // Le taux est PAR HEURE : 3 blocages en 20 min valent 9 par heure.
  assert.equal(scoreFluidite({ lectures: 1, dureeS: 1200, blocages: 3, erreurs: 0, redemarrages: 0 }), 0)
})

test('CA2 : pas de note sous une minute cumulee ; fenetre glissante de 14 jours ; classe de debit', () => {
  assert.equal(scoreFluidite(agregerLectures([lecture({ chaine: 'a', dureeS: 30 })], { maintenant: 0 })), undefined)
  const maintenant = 20 * J
  const lectures = [
    lecture({ chaine: 'a', debut: maintenant - 15 * J, blocages: 50 }), // hors fenetre : ignoree
    lecture({ chaine: 'a', debut: maintenant - 2 * J, blocages: 0, classe: 'eleve' }),
    lecture({ chaine: 'a', debut: maintenant - 1 * J, blocages: 6, classe: 'faible' }),
  ]
  assert.equal(FENETRE_MS, 14 * J)
  const toutes = agregerLectures(lectures, { maintenant })
  assert.equal(toutes.lectures, 2)
  assert.equal(toutes.blocages, 6)
  assert.equal(scoreFluidite(agregerLectures(lectures, { maintenant, classe: 'eleve' })), 100, 'a 30 Mbit/s elle est fluide')
  assert.equal(scoreFluidite(agregerLectures(lectures, { maintenant, classe: 'faible' })), 10, 'a 3 Mbit/s elle bloque')
  // Une lecture sans classe compte dans toutes les classes.
  const sansClasse = agregerLectures([lecture({ chaine: 'a', debut: maintenant, classe: undefined })], { maintenant, classe: 'moyen' })
  assert.equal(sansClasse.lectures, 1)
  assert.equal(agregerLectures([lecture({ chaine: 'a', debut: maintenant })], { maintenant }).debitKbps, 8000)
})

test('CA2 : le collecteur agrege une lecture de bout en bout (blocages apres les premieres images seulement)', () => {
  const ecrites: LectureMesuree[] = []
  let t = 1_000_000
  const c = creerCollecteur({ appareil: 'x', maintenant: () => t, ecrire: (l) => ecrites.push(l) })
  c.recevoir('lecture:debut', { chaine: '845410', mode: 'hls' })
  c.recevoir('video:waiting', {}) // mise en tampon initiale : pas un blocage
  c.recevoir('hls:segment', { debitKbps: 12_000 })
  c.recevoir('video:playing', {})
  c.recevoir('hls:segment', { debitKbps: 9_000 })
  c.recevoir('hls:segment', { debitKbps: 10_000 })
  c.recevoir('video:waiting', {})
  c.recevoir('hls:erreur', { fatale: false })
  c.recevoir('hls:erreur', { fatale: true })
  c.recevoir('hls:recuperation', { action: 'recuperer' })
  c.recevoir('lecture:reessai', { essai: 1 })
  t += 120_000
  c.recevoir('lecture:fin', { chaine: '845410' })
  assert.equal(ecrites.length, 1)
  const l = ecrites[0]!
  assert.equal(l.chaine, '845410')
  assert.equal(l.dureeS, 120)
  assert.equal(l.segments, 3)
  assert.equal(l.debitKbps, 10_000)
  assert.equal(l.classe, 'moyen')
  assert.equal(l.blocages, 1)
  assert.equal(l.erreurs, 1)
  assert.equal(l.redemarrages, 2)
  assert.equal(c.enCours(), undefined)
})

test('CA2 : un zapping de 2 s n est pas une mesure ; un film (sans chaine) n est pas collecte ; un debut clot le precedent', () => {
  const ecrites: LectureMesuree[] = []
  let t = 0
  const c = creerCollecteur({ appareil: 'x', maintenant: () => t, ecrire: (l) => ecrites.push(l) })
  c.recevoir('lecture:debut', { chaine: '1' })
  t += 2000
  c.recevoir('lecture:fin', {})
  assert.equal(ecrites.length, 0)
  c.recevoir('lecture:debut', { mode: 'fichier' })
  t += 60_000
  c.recevoir('hls:segment', { debitKbps: 5000 })
  c.recevoir('lecture:fin', {})
  assert.equal(ecrites.length, 0)
  c.recevoir('lecture:debut', { chaine: '2' })
  t += 10_000
  c.recevoir('lecture:debut', { chaine: '3' })
  assert.equal(ecrites.length, 1)
  assert.equal(ecrites[0]!.chaine, '2')
  assert.equal(c.enCours(), '3')
})

// --- CA3 : choix -----------------------------------------------------------------

const variantes = (scores?: Map<string, number>) =>
  preparerVariantes([entree('4k', 'TF1 4K'), entree('fhd', 'TF1 FHD ◉'), entree('hd', 'TF1 HD'), entree('sd', 'TF1 SD')], scores)

test('CA3 : sans historique, la plus haute definition tenable au debit mesure (4K >= 20, FHD >= 8, HD >= 4, sinon SD)', () => {
  const avec = (debit: number | undefined, capHevc = true) => choisirVariante(variantes(), { capHevc, debitMbps: debit })
  assert.equal(avec(30).recommandee.qualite, '4K')
  assert.equal(avec(20).recommandee.qualite, '4K')
  assert.equal(avec(19.9).recommandee.qualite, 'FHD')
  assert.equal(avec(8).recommandee.qualite, 'FHD')
  assert.equal(avec(7).recommandee.qualite, 'HD')
  assert.equal(avec(4).recommandee.qualite, 'HD')
  assert.equal(avec(3).recommandee.qualite, 'SD')
  assert.equal(avec(3).raison, 'debit')
  assert.equal(DEBIT_SUPPOSE_MBPS, 10)
  assert.equal(avec(undefined).recommandee.qualite, 'FHD', 'sans mesure : liaison supposee moyenne')
  const c = avec(10)
  assert.ok(c.deconseillees.some((d) => d.variante.qualite === '4K' && /liaison à 10 Mbit\/s/.test(d.motif)), JSON.stringify(c.deconseillees))
  assert.equal(expliquerChoix(c, { capHevc: true, debitMbps: 10 }), 'Recommandé : FHD — la plus haute définition pour 10 Mbit/s. 4K déconseillée : liaison à 10 Mbit/s')
})

test('CA3 : la 4K/HEVC est refusee sans la capacite hevc', () => {
  const c = choisirVariante(variantes(), { capHevc: false, debitMbps: 50 })
  assert.equal(c.recommandee.qualite, 'FHD')
  assert.ok(c.deconseillees.some((d) => d.variante.qualite === '4K' && /HEVC non lisible/.test(d.motif)))
  const hevc = preparerVariantes([entree('h', 'TF1 HEVC'), entree('hd', 'TF1 HD')])
  assert.equal(choisirVariante(hevc, { capHevc: false, debitMbps: 50 }).recommandee.entree.cle, 'hd')
  assert.equal(choisirVariante(hevc, { capHevc: true, debitMbps: 50 }).recommandee.entree.cle, 'hd', 'a definition egale (inconnue vs HD), HD prime')
  // Rien de lisible : on choisit quand meme (le serveur convertira ou refusera proprement).
  const seuleHevc = preparerVariantes([entree('h', 'TF1 HEVC')])
  assert.equal(choisirVariante(seuleHevc, { capHevc: false }).recommandee.entree.cle, 'h')
})

test('CA3 : avec historique, la meilleure note parmi les tenables ; egalite -> plus haute definition', () => {
  const scores = new Map([['4k', 90], ['fhd', 40], ['hd', 95]])
  const c = choisirVariante(variantes(scores), { capHevc: true, debitMbps: 12 })
  assert.equal(c.recommandee.entree.cle, 'hd', '4K pas tenable a 12 Mbit/s, FHD bloque, HD fluide')
  assert.equal(c.raison, 'score')
  assert.match(expliquerChoix(c, { capHevc: true, debitMbps: 12 }), /^Recommandé : HD — fluide sur cette liaison \(note 95\/100\)\. 4K déconseillée : liaison à 12 Mbit\/s FHD bloque souvent ici \(note 40\/100\)$/)
  const egal = choisirVariante(variantes(new Map([['fhd', 80], ['hd', 80]])), { capHevc: true, debitMbps: 12 })
  assert.equal(egal.recommandee.entree.cle, 'fhd')
  // Une variante notee mais pas tenable n'est pas recommandee, meme excellente.
  const haut = choisirVariante(variantes(new Map([['4k', 100]])), { capHevc: true, debitMbps: 10 })
  assert.equal(haut.recommandee.entree.cle, 'fhd')
  assert.equal(haut.raison, 'debit')
})

test('CA3 : le choix explicite de l utilisateur prime et est nomme comme tel ; une seule variante', () => {
  const c = choisirVariante(variantes(), { capHevc: true, debitMbps: 30, choixExplicite: 'hd' })
  assert.equal(c.recommandee.entree.cle, '4k')
  assert.equal(c.choisie.entree.cle, 'hd')
  assert.equal(c.raison, 'explicite')
  const inconnu = choisirVariante(variantes(), { capHevc: true, debitMbps: 30, choixExplicite: 'zzz' })
  assert.equal(inconnu.choisie.entree.cle, '4k')
  const seule = choisirVariante(preparerVariantes([entree('x', 'ARTE')]), { capHevc: false })
  assert.equal(seule.raison, 'seule')
  assert.equal(expliquerChoix(seule, { capHevc: false }), 'Une seule variante de cette chaîne.')
  assert.throws(() => choisirVariante([] as VarianteNotee[], { capHevc: true }))
})
