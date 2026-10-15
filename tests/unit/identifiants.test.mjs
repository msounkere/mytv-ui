import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cheminContenu, estIdentifiantEpisode, estIdentifiantValide, serieDeCle,
} from '../../src/lib/identifiants.ts'

test('identifiants du contrat', () => {
  for (const ok of ['iptva:845410', 'iptva:77123.mkv', 'a_b-c:1.2-3_x'])
    assert.ok(estIdentifiantValide(ok), ok)
  for (const ko of ['845410', 'iptva:', ':12', 'a:b:c', 'iptva:12/../x', 'iptva:12 ', 'iptva:1?x=1', 'ip tva:1', ''])
    assert.ok(!estIdentifiantValide(ko), ko)
})

test('un identifiant hors motif ne peut pas finir dans une URL', () => {
  assert.equal(cheminContenu('iptva:845410'), 'iptva:845410')
  assert.throws(() => cheminContenu('iptva:1/../../compte'))
  assert.throws(() => cheminContenu('iptva:1?x=2'))
})

test('un episode se reconnait a son extension', () => {
  assert.ok(estIdentifiantEpisode('iptva:77123.mkv'))
  assert.ok(!estIdentifiantEpisode('iptva:845410'))
})

test('serie : requise pour un episode, interdite sinon', () => {
  assert.equal(serieDeCle('iptva:77123.mkv', 'iptva:77'), 'iptva:77')
  assert.equal(serieDeCle('iptva:77123.mkv', undefined), 'requise')
  assert.equal(serieDeCle('iptva:77123.mkv', 'pas un id'), 'requise')
  assert.equal(serieDeCle('iptva:845410', 'iptva:77'), undefined)
})

import { cleDe, clesCandidates, idServeurDeCle, numeroDeCle } from '../../src/lib/identifiants.ts'

test('cle locale <-> identifiant serveur', () => {
  assert.equal(cleDe('vod', 'iptva:5521'), 'vod:iptva:5521')
  assert.equal(idServeurDeCle('vod:iptva:5521'), 'iptva:5521')
  assert.equal(idServeurDeCle('series:iptva:77123.mkv'), 'iptva:77123.mkv')
  // Sans prefixe de type connu : rendue telle quelle (jamais de troncature surprise).
  assert.equal(idServeurDeCle('iptva:5521'), 'iptva:5521')
  assert.equal(numeroDeCle('live:iptva:845410'), 845410)
})

test('le type d\'un identifiant serveur est cherche au catalogue, sauf pour un episode', () => {
  assert.deepEqual(clesCandidates('iptva:5521'), ['live:iptva:5521', 'vod:iptva:5521', 'series:iptva:5521'])
  assert.deepEqual(clesCandidates('iptva:77123.mkv'), ['series:iptva:77123.mkv'])
})
