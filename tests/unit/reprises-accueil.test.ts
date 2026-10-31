import test from 'node:test'
import assert from 'node:assert/strict'
import { joindreReprises, clesAJoindre } from '../../src/lib/reprises-accueil'
import type { EntreeCatalogue, Reprise } from '../../src/lib/db'

const film = { cle: 'vod:iptva:1426783', type: 'vod', nom: 'Un film (2024)' } as EntreeCatalogue
const serie = { cle: 'series:iptva:s6831', type: 'series', nom: 'FR - Industry (2020) (US)' } as EntreeCatalogue
const catalogue = new Map([[film.cle, film], [serie.cle, serie]])
const ep = (n: number, vuLe: number, position = 600): Reprise =>
  ({ cle: `series:iptva:${n}.mkv`, serie: serie.cle, position, duree: 3000, vuLe })

// Regression (reel, 31/10) : les episodes en cours n'apparaissaient jamais dans
// « Continuer a regarder », seuls les films.
test('un episode en cours est represente par sa serie', () => {
  const r = joindreReprises([ep(768606, 20), { cle: film.cle, position: 98, duree: 6162, vuLe: 10 }], catalogue, 12)
  assert.deepEqual(r.map((x) => [x.entree.cle, x.episode]), [[serie.cle, true], [film.cle, false]])
})

test('une serie n apparait qu une fois, pour son episode le plus recent', () => {
  const r = joindreReprises([ep(768606, 30), ep(1379973, 20), ep(766455, 10)], catalogue, 12)
  assert.equal(r.length, 1)
  assert.equal(r[0].ligne.cle, 'series:iptva:768606.mkv')
})

test('les contenus termines (> 95 %) et les cles inconnues sont ecartes, la limite est respectee', () => {
  const r = joindreReprises(
    [ep(1, 40, 2990), { cle: 'vod:iptva:inconnu', position: 1, duree: 10, vuLe: 35 }, ep(2, 30), { cle: film.cle, position: 1, duree: 10, vuLe: 20 }],
    catalogue, 1,
  )
  assert.deepEqual(r.map((x) => x.entree.cle), [serie.cle])
})

test('les cles a charger comprennent la serie des episodes, sans doublon', () => {
  assert.deepEqual(clesAJoindre([ep(1, 1), ep(2, 2), { cle: film.cle, position: 0, duree: 1, vuLe: 0 }]).sort(),
    ['series:iptva:1.mkv', 'series:iptva:2.mkv', serie.cle, film.cle].sort())
})
