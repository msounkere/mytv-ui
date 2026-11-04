import test from 'node:test'
import assert from 'node:assert/strict'
import { clesAJoindre, episodeAReprendre, joindreReprises, resteLisible } from '../../src/lib/reprises-accueil'
import type { EpisodeLisible } from '../../src/lib/episodes-suivants'
import type { EntreeCatalogue, Reprise } from '../../src/lib/db'

// Lot 10, US-46 CA3 : rangee « Reprendre » -- l'episode a lire d'une serie, le seuil 0,9.

const film = { cle: 'vod:iptva:1426783', type: 'vod', nom: 'Un film (2024)' } as EntreeCatalogue
const serie = { cle: 'series:iptva:s6831', type: 'series', nom: 'FR - Industry (2020) (US)' } as EntreeCatalogue
const catalogue = new Map([[film.cle, film], [serie.cle, serie]])
const ep = (n: number, vuLe: number, position = 600): Reprise =>
  ({ cle: `series:iptva:${n}.mkv`, serie: serie.cle, position, duree: 3000, vuLe })

// Regression (reel, 31/10) : les episodes en cours n'apparaissaient jamais dans
// « Continuer a regarder », seuls les films.
test('CA3 un episode en cours est represente par sa serie', () => {
  const r = joindreReprises([ep(768606, 20), { cle: film.cle, position: 98, duree: 6162, vuLe: 10 }], catalogue, 12)
  assert.deepEqual(r.map((x) => [x.entree.cle, x.episode]), [[serie.cle, true], [film.cle, false]])
})

test('CA3 une serie n apparait qu une fois, pour son episode le plus recent', () => {
  const r = joindreReprises([ep(768606, 30), ep(1379973, 20), ep(766455, 10)], catalogue, 12)
  assert.equal(r.length, 1)
  assert.equal(r[0]!.ligne.cle, 'series:iptva:768606.mkv')
})

// C7 : une serie dont l'episode entame est fini RESTE (c'est l'episode suivant qui sera propose) ;
// un film vu sort ; les cles inconnues sont ecartees ; la limite est respectee.
test('CA3 un film vu (>= 0,9) sort, une serie a l episode vu reste, inconnus ecartes, limite', () => {
  const r = joindreReprises(
    [ep(1, 40, 2990), { cle: 'vod:iptva:inconnu', position: 1, duree: 10, vuLe: 35 }, { cle: film.cle, position: 9, duree: 10, vuLe: 30 }],
    catalogue, 5,
  )
  assert.deepEqual(r.map((x) => x.entree.cle), [serie.cle], 'le film a 90 % est vu : il sort ; la serie reste')
  // Seuil UNIQUE 0,9 : a 89 % le film est encore « a reprendre » (mutation 0,95 -> ce test et le suivant rougissent).
  assert.deepEqual(joindreReprises([{ cle: film.cle, position: 8.9, duree: 10, vuLe: 1 }], catalogue, 5).map((x) => x.entree.cle), [film.cle])
  assert.deepEqual(joindreReprises([{ cle: film.cle, position: 9.2, duree: 10, vuLe: 1 }], catalogue, 5), [], '92 % : vu')
  assert.equal(joindreReprises([ep(1, 3), ep(2, 2), { cle: film.cle, position: 1, duree: 10, vuLe: 1 }], catalogue, 1).length, 1)
})

test('CA3 « Retirer de Reprendre » cache l entree sans toucher aux lignes', () => {
  const lignes = [ep(1, 3), { cle: film.cle, position: 1, duree: 10, vuLe: 1 }]
  const r = joindreReprises(lignes, catalogue, 12, new Set([serie.cle]))
  assert.deepEqual(r.map((x) => x.entree.cle), [film.cle])
  assert.equal(lignes.length, 2)
})

test('les cles a charger comprennent la serie des episodes, sans doublon', () => {
  assert.deepEqual(clesAJoindre([ep(1, 1), ep(2, 2), { cle: film.cle, position: 0, duree: 1, vuLe: 0 }]).sort(),
    ['series:iptva:1.mkv', 'series:iptva:2.mkv', serie.cle, film.cle].sort())
})

const E = (saison: number, numero: number): EpisodeLisible =>
  ({ cle: `series:iptva:${saison}${numero}.mkv`, nom: `S — S0${saison}E0${numero}`, url: '', extension: 'mkv', saison, numero })
const episodes = [E(1, 1), E(1, 2), E(1, 3), E(2, 1)]
const L = (saison: number, numero: number, position: number, vuLe: number): [string, Reprise] =>
  [`series:iptva:${saison}${numero}.mkv`, { cle: `series:iptva:${saison}${numero}.mkv`, serie: serie.cle, position, duree: 1000, vuLe }]

// C7 / B15 : la carte pointe l'episode ENTAME, sinon le prochain non vu apres le dernier vu.
test('CA3 episode a reprendre : entame -> lui, avec reste ; vu -> le suivant non vu, saisons dans l ordre', () => {
  const entame = episodeAReprendre(episodes, new Map([L(1, 1, 1000, 1), L(1, 2, 400, 2)]))
  assert.equal(entame?.episode.cle, 'series:iptva:12.mkv')
  assert.equal(entame?.suivant, false)
  assert.equal(entame?.resteS, 600)
  assert.equal(entame?.progression, 0.4)

  const suivant = episodeAReprendre(episodes, new Map([L(1, 1, 1000, 1), L(1, 2, 950, 2)]))
  assert.equal(suivant?.episode.cle, 'series:iptva:13.mkv', 'S01E02 vu a 95 % : S01E03 est l episode suivant')
  assert.equal(suivant?.suivant, true)
  assert.equal(suivant?.progression, 0)

  // Seuil 0,9 : a 92 % l'episode est vu (mutation 0,95 -> rouge).
  assert.equal(episodeAReprendre(episodes, new Map([L(1, 1, 920, 1)]))?.episode.cle, 'series:iptva:12.mkv')
  assert.equal(episodeAReprendre(episodes, new Map([L(1, 1, 890, 1)]))?.episode.cle, 'series:iptva:11.mkv')

  // Passage de saison, et saut des episodes deja vus plus loin.
  assert.equal(episodeAReprendre(episodes, new Map([L(1, 3, 1000, 5), L(1, 1, 100, 1)]))?.episode.cle, 'series:iptva:21.mkv', 'la ligne la plus recente (S01E03 vue) decide : S02E01')
  assert.equal(episodeAReprendre(episodes, new Map([L(1, 1, 1000, 9), L(1, 2, 1000, 3)]))?.episode.cle, 'series:iptva:13.mkv', 'S01E02 deja vu est saute')
  // Fin de serie : plus rien.
  assert.equal(episodeAReprendre(episodes, new Map([L(2, 1, 1000, 9)])), undefined)
  assert.equal(episodeAReprendre(episodes, new Map()), undefined)
})

test('CA3 « reste 1 min » sous la minute, jamais « 0 min »', () => {
  assert.equal(resteLisible(20), 'reste 1 min')
  assert.equal(resteLisible(0), 'reste 1 min')
  assert.equal(resteLisible(23 * 60), 'reste 23 min')
  assert.equal(resteLisible(3600 + 5 * 60), 'reste 1 h 05')
})
