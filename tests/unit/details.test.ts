import test from 'node:test'
import assert from 'node:assert/strict'
import { aDuContenu, cibleDe, dureeLongue, versDetails } from '../../src/lib/details-donnees'
import type { EntreeCatalogue } from '../../src/lib/db'

// US-28 : la mise en forme des details rendus par le service.

test('details complets : tous les champs sont lus, l annee tiree de la date', () => {
  const d = versDetails('ok', {
    synopsis: '  Un   voleur\nentre dans les reves. ', genre: 'SF, Thriller', casting: 'A, B', realisateur: 'R', pays: 'USA',
    sortie: '2010-07-16', bande_annonce: 'https://www.youtube.com/watch?v=YoExt-gQ3dE', image_fond: 'https://i.test/f.jpg',
    affiche: '/api/v1/image/abcdef', note: 8.8, age: '12', duree: 8880,
  })
  assert.equal(d.statut, 'ok')
  assert.equal(d.synopsis, 'Un voleur entre dans les reves.')
  assert.equal(d.annee, '2010')
  assert.equal(d.bandeAnnonce, 'https://www.youtube.com/watch?v=YoExt-gQ3dE')
  assert.equal(d.fond, 'https://i.test/f.jpg')
  assert.equal(d.affiche, '/api/v1/image/abcdef')
  assert.equal(d.dureeSecondes, 8880)
  assert.equal(aDuContenu(d), true)
})

test('champs absents, vides ou de mauvais type : masques, jamais d exception', () => {
  const d = versDetails('absent', { synopsis: '   ', genre: undefined, note: 0, duree: -4, casting: 12 as unknown as string })
  assert.equal(d.synopsis, undefined)
  assert.equal(d.genre, undefined)
  assert.equal(d.note, undefined)
  assert.equal(d.dureeSecondes, undefined)
  assert.equal(d.casting, undefined)
  assert.equal(aDuContenu(d), false)
  assert.equal(aDuContenu(versDetails(undefined, undefined)), false)
  assert.equal(versDetails(undefined, undefined).statut, 'absent')
})

test('liens et images : seuls les schemas sûrs deviennent des liens ou des images', () => {
  const d = versDetails('ok', {
    bande_annonce: 'javascript:alert(1)', image_fond: 'javascript:alert(1)', affiche: 'data:text/html,x',
  })
  assert.equal(d.bandeAnnonce, undefined)
  assert.equal(d.fond, undefined)
  assert.equal(d.affiche, undefined)
  for (const mauvais of ['https://evil.test/watch?v=YoExt-gQ3dE', 'https://www.youtube.com/watch?v=court', 'http://www.youtube.com/watch?v=YoExt-gQ3dE', 'https://www.youtube.com/watch?v=YoExt-gQ3dE&x=1'])
    assert.equal(versDetails('ok', { bande_annonce: mauvais }).bandeAnnonce, undefined, mauvais)
})

test('duree d un episode moyen reprise quand la duree du film manque', () => {
  assert.equal(versDetails('ok', { duree_episode: 2400 }).dureeSecondes, 2400)
  assert.equal(versDetails('ok', { duree: 6000, duree_episode: 2400 }).dureeSecondes, 6000)
})

test('duree lisible', () => {
  assert.equal(dureeLongue(undefined), undefined)
  assert.equal(dureeLongue(0), undefined)
  assert.equal(dureeLongue(30), '1 min')
  assert.equal(dureeLongue(52 * 60), '52 min')
  assert.equal(dureeLongue(6000), '1 h 40')
  assert.equal(dureeLongue(7200), '2 h')
  assert.equal(dureeLongue(3600 + 5 * 60), '1 h 05')
})

test('cible des details : films et series, jamais une chaine ni un episode', () => {
  const e = (type: EntreeCatalogue['type'], idServeur: string) => ({ cle: `${type}:${idServeur}`, type, idServeur, id: 0, nom: 'x', recherche: 'x' }) as EntreeCatalogue
  assert.deepEqual(cibleDe(e('vod', 'iptva:5521')), { type: 'vod', idServeur: 'iptva:5521' })
  assert.deepEqual(cibleDe(e('series', 'iptva:s77')), { type: 'series', idServeur: 'iptva:s77' })
  assert.equal(cibleDe(e('live', 'iptva:845410')), undefined)
  assert.equal(cibleDe(e('series', 'iptva:77123.mkv')), undefined, 'un episode n a pas de details propres')
  assert.equal(cibleDe(null), undefined)
})
