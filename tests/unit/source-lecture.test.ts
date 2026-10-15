import test from 'node:test'
import assert from 'node:assert/strict'
import { chaineDeLecture, estDirect, idServeurDe, lectureDe, numeroDe, epgIdDe } from '../../src/lib/source-lecture'

test("l'adresse du serveur prime, puis celle imposee d'un episode", () => {
  const chaine = { type: 'live' as const, idServeur: 'iptva:845410', lecture: '/api/v1/live/845410.m3u8' }
  assert.equal(lectureDe(chaine), '/api/v1/live/845410.m3u8')
  const film = { type: 'vod' as const, idServeur: 'iptva:5521', lecture: '/api/v1/vod/iptva:5521' }
  assert.equal(lectureDe(film), '/api/v1/vod/iptva:5521')
  assert.equal(lectureDe(film, '/api/v1/vod/iptva:77123.mkv'), '/api/v1/vod/iptva:77123.mkv')
})

test("repli sans champ de l'API : adresses du contrat, jamais d'identifiants", () => {
  assert.equal(lectureDe({ type: 'live', idServeur: 'iptva:12' }), '/api/v1/live/12.m3u8')
  assert.equal(lectureDe({ type: 'vod', idServeur: 'iptva:9' }), '/api/v1/vod/iptva:9')
})

test('identifiant et numero', () => {
  assert.equal(idServeurDe({ type: 'live', idServeur: 'iptva:7' }), 'iptva:7')
  assert.equal(numeroDe('iptva:845410'), '845410')
  assert.equal(numeroDe('845410'), '845410')
})

test('numero de chaine pour /live/{chaine}/fin', () => {
  assert.equal(chaineDeLecture('/api/v1/live/845410.m3u8'), '845410')
  assert.equal(chaineDeLecture('/api/v1/live/ab_c-1.m3u8?x=1'), 'ab_c-1')
  assert.equal(chaineDeLecture('/api/v1/vod/iptva:5521'), undefined)
  assert.equal(estDirect('/api/v1/live/1.m3u8'), true)
  assert.equal(estDirect('/api/v1/vod/iptva:1'), false)
})

test('epgId vide = pas de guide', () => {
  assert.equal(epgIdDe({ type: 'live', idServeur: 'iptva:1', epgId: '' }), undefined)
  assert.equal(epgIdDe({ type: 'live', idServeur: 'iptva:1', epgId: 'tf1.fr' }), 'tf1.fr')
})
