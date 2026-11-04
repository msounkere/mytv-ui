import test from 'node:test'
import assert from 'node:assert/strict'
import { actionFilm, actionSerie, etatLecture, resteLisible, SEUIL_REPRISE_S } from '../../src/lib/fiche-regles'

// US-45 CA3 : l'action principale des fiches dit ou l'on en est (modele cible C §5.5).
const SEUIL = 0.9

test('CA3 film : Regarder / Reprendre · reste / Regarder a nouveau', () => {
  assert.deepEqual(actionFilm(undefined, SEUIL), { libelle: 'Regarder', icone: 'play_arrow' })
  assert.deepEqual(actionFilm({ position: 2520, duree: 6000 }, SEUIL), { libelle: 'Reprendre · 58 min', icone: 'play_arrow', secondaire: 'Recommencer' })
  assert.deepEqual(actionFilm({ position: 5500, duree: 6000 }, SEUIL), { libelle: 'Regarder à nouveau', icone: 'refresh' })
  assert.deepEqual(actionFilm({ position: 6000, duree: 6000 }, SEUIL), { libelle: 'Regarder à nouveau', icone: 'refresh' })
})

test('CA3 sous 60 s, la fiche dit « Regarder » (coherence avec la carte sans barre)', () => {
  assert.equal(etatLecture({ position: SEUIL_REPRISE_S - 1, duree: 6000 }, SEUIL), 'jamais')
  assert.equal(etatLecture({ position: SEUIL_REPRISE_S, duree: 6000 }, SEUIL), 'entame')
  assert.equal(actionFilm({ position: 45, duree: 100 }, SEUIL).libelle, 'Regarder')
})

test('CA3 seuil « vu » unique : 0,9 et non 0,95', () => {
  assert.equal(etatLecture({ position: 92, duree: 100 }, SEUIL), 'vu')
  assert.equal(etatLecture({ position: 89, duree: 100 }, SEUIL), 'entame')
})

test('CA3 reste lisible : jamais « 0 min »', () => {
  assert.equal(resteLisible(20), '1 min')
  assert.equal(resteLisible(0), '1 min')
  assert.equal(resteLisible(25 * 60), '25 min')
  assert.equal(resteLisible(3900), '1 h 05')
  assert.equal(resteLisible(7200), '2 h')
})

const eps = [
  { cle: 'e11', saison: 1, numero: 1 }, { cle: 'e12', saison: 1, numero: 2 }, { cle: 'e13', saison: 1, numero: 3 },
  { cle: 'e21', saison: 2, numero: 1 },
]
const m = (o: Record<string, { position: number; duree: number; vuLe?: number }>) => new Map(Object.entries(o))

test('CA3 serie jamais ouverte : Lire S01E01', () => {
  assert.deepEqual(actionSerie(eps, m({}), SEUIL), { libelle: 'Lire S01E01', icone: 'play_arrow', cle: 'e11', motif: 'premier' })
})

test('CA3 serie avec un episode entame : Reprendre S01E02 · 23 min, barre sous le titre', () => {
  const a = actionSerie(eps, m({ e11: { position: 2400, duree: 2400 }, e12: { position: 1020, duree: 2400 } }), SEUIL)
  assert.equal(a?.libelle, 'Reprendre S01E02 · 23 min')
  assert.equal(a?.cle, 'e12')
  assert.equal(a?.motif, 'reprendre')
  assert.ok(a?.part && Math.abs(a.part - 0.425) < 0.01)
})

test('CA3 l episode entame le plus RECENT gagne', () => {
  const a = actionSerie(eps, m({ e11: { position: 600, duree: 2400, vuLe: 2 }, e13: { position: 900, duree: 2400, vuLe: 1 } }), SEUIL)
  assert.equal(a?.cle, 'e11')
})

test('CA3 apres un episode vu, sans entame : Episode suivant S01E03 (toutes saisons)', () => {
  assert.equal(actionSerie(eps, m({ e11: { position: 2400, duree: 2400 }, e12: { position: 2300, duree: 2400 } }), SEUIL)?.libelle, 'Épisode suivant S01E03')
  assert.equal(actionSerie(eps, m({ e11: { position: 2400, duree: 2400 }, e12: { position: 2400, duree: 2400 }, e13: { position: 2400, duree: 2400 } }), SEUIL)?.libelle, 'Épisode suivant S02E01')
})

test('CA4 point de depart (Ma liste « des S01E03 ») : le prochain non vu part de la', () => {
  const a = actionSerie(eps, m({}), SEUIL, { saison: 1, episode: 3 })
  assert.equal(a?.cle, 'e13')
  assert.equal(a?.libelle, 'Lire S01E03')
})

test('CA3 tout vu : Regarder a nouveau S01E01', () => {
  const tout = m({ e11: { position: 1, duree: 1 }, e12: { position: 1, duree: 1 }, e13: { position: 1, duree: 1 }, e21: { position: 1, duree: 1 } })
  assert.deepEqual(actionSerie(eps, tout, SEUIL), { libelle: 'Regarder à nouveau S01E01', icone: 'refresh', cle: 'e11', motif: 'revoir' })
  assert.equal(actionSerie([], tout, SEUIL), undefined)
})
