import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ETAT_ECO_INITIAL, DUREE_ECO_MS, FACTEUR_ECO, TAILLE_FENETRE_ECO, entetesQualite, evaluerEco, fluxKbpsDe,
  lireQualiteMemorisee, urlAvecQualite, type EtatEco,
} from '../../src/lib/qualite'

// US-38 CA4 : le mode Eco et la regle « Passer en Eco ? », sans navigateur.

test('CA4 : qualite memorisee -> auto par defaut, eco seulement si ecrit tel quel', () => {
  assert.equal(lireQualiteMemorisee(null), 'auto')
  assert.equal(lireQualiteMemorisee('eco'), 'eco')
  assert.equal(lireQualiteMemorisee('ECO'), 'auto')
  assert.equal(lireQualiteMemorisee('480'), 'auto')
})

test('CA4 : Eco ajoute qualite=eco a toute adresse (requete existante conservee, sans doublon) et l en-tete X-Mytv-Qualite', () => {
  assert.equal(urlAvecQualite('/api/v1/live/1.m3u8', 'eco'), '/api/v1/live/1.m3u8?qualite=eco')
  assert.equal(urlAvecQualite('/api/v1/live/1.m3u8?cap=hevc', 'eco'), '/api/v1/live/1.m3u8?cap=hevc&qualite=eco')
  assert.equal(urlAvecQualite('/api/v1/vod/iptva:5?qualite=eco&t=10', 'eco'), '/api/v1/vod/iptva:5?t=10&qualite=eco')
  assert.equal(urlAvecQualite('/api/v1/live/1.m3u8', 'auto'), '/api/v1/live/1.m3u8')
  assert.equal(urlAvecQualite('/api/v1/live/1.m3u8?qualite=eco', 'auto'), '/api/v1/live/1.m3u8', 'Auto retire le parametre')
  assert.deepEqual(entetesQualite('eco'), { 'X-Mytv-Qualite': 'eco' })
  assert.deepEqual(entetesQualite('auto'), {})
})

test('CA4 : debit propre du flux depuis un segment', () => {
  assert.equal(fluxKbpsDe(6_750_000, 10), 5400)
  assert.equal(fluxKbpsDe(0, 10), undefined)
  assert.equal(fluxKbpsDe(100, 0), undefined)
})

/** Joue des segments de 10 s : debit mesure `mesure`, flux `flux`, a partir de t0. */
function jouer(etat: EtatEco, n: number, mesure: number, flux: number, t0: number): { etat: EtatEco; rappels: number[] } {
  const rappels: number[] = []
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 10_000
    const r = evaluerEco(etat, { t, debitKbps: mesure, fluxKbps: flux })
    etat = r.etat
    if (r.recommander) rappels.push(t)
  }
  return { etat, rappels }
}

test('CA4 : recommandation quand la mediane sur 5 segments reste sous 1,5 x le debit du flux pendant 30 s, une seule fois par lecture', () => {
  assert.equal(FACTEUR_ECO, 1.5)
  assert.equal(DUREE_ECO_MS, 30_000)
  assert.equal(TAILLE_FENETRE_ECO, 5)
  // Flux 5 400 kbit/s, liaison a 5 000 : sous 8 100, donc trop juste.
  const r = jouer(ETAT_ECO_INITIAL, 12, 5000, 5400, 0)
  assert.equal(r.rappels.length, 1, 'un seul rappel')
  // 5 segments pour une mediane (t = 40 s), puis 30 s sous le seuil : rappel a 70 s.
  assert.equal(r.rappels[0], 70_000)
  assert.equal(r.etat.rappele, true)
})

test('CA4 : pas de recommandation quand la liaison tient (>= 1,5 x), ni avant 5 segments, ni avant 30 s', () => {
  const large = jouer(ETAT_ECO_INITIAL, 20, 9000, 5400, 0)
  assert.equal(large.rappels.length, 0, '9 000 >= 8 100 : la liaison tient')
  const limite = jouer(ETAT_ECO_INITIAL, 20, 8100, 5400, 0)
  assert.equal(limite.rappels.length, 0, 'exactement 1,5 x n est pas « inferieur »')
  const court = jouer(ETAT_ECO_INITIAL, 4, 1000, 5400, 0)
  assert.equal(court.rappels.length, 0)
  assert.equal(court.etat.fenetre.length, 4)
  const pasEncore = jouer(ETAT_ECO_INITIAL, 7, 1000, 5400, 0) // mediane a 40 s, 20 s sous le seuil a 60 s
  assert.equal(pasEncore.rappels.length, 0)
})

test('CA4 : un retour au-dessus du seuil remet le chronometre a zero ; la mediane ignore un segment isole', () => {
  let etat = ETAT_ECO_INITIAL
  let r = jouer(etat, 5, 1000, 5400, 0) // mediane disponible a 40 s : juste
  etat = r.etat
  assert.equal(etat.depuis, 40_000)
  // Ca va mieux : la mediane bascule quand 3 segments sur 5 sont rapides (70 s).
  r = jouer(etat, 5, 20_000, 5400, 50_000)
  etat = r.etat
  assert.equal(etat.depuis, undefined)
  assert.equal(r.rappels.length, 0, 'jamais 30 s sous le seuil')
  r = jouer(etat, 10, 1000, 5400, 100_000) // de nouveau juste a 120 s -> rappel a 150 s
  assert.deepEqual(r.rappels, [150_000])
  // Un seul segment lent au milieu de segments rapides ne declenche rien (mediane).
  const isole = [9000, 9000, 500, 9000, 9000, 9000, 9000, 9000].reduce<{ etat: EtatEco; n: number }>(
    (acc, mesure, i) => {
      const x = evaluerEco(acc.etat, { t: i * 10_000, debitKbps: mesure, fluxKbps: 5400 })
      return { etat: x.etat, n: acc.n + (x.recommander ? 1 : 0) }
    },
    { etat: ETAT_ECO_INITIAL, n: 0 },
  )
  assert.equal(isole.n, 0)
})
