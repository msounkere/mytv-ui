import test from 'node:test'
import assert from 'node:assert/strict'
import { politiquesChargement, DELAI_PREMIER_OCTET_MS, statutPlacePrise } from '../../src/lib/lecteur'
import { DELAI_CONVERSION_MS, DELAI_PLAYLIST_DIRECT_MS } from '../../src/lib/modes-direct'

// Les reglages de hls.js, sans hls.js : la politique est un objet pur.

test('segments : le premier octet peut attendre au moins 15 s (le serveur patiente 8 s sur un 407 avant le 503)', () => {
  const p = politiquesChargement(null).fragLoadPolicy.default
  assert.ok(p.maxTimeToFirstByteMs >= 15_000, `maxTimeToFirstByteMs = ${p.maxTimeToFirstByteMs}`)
  assert.equal(p.maxTimeToFirstByteMs, DELAI_PREMIER_OCTET_MS)
  assert.ok(p.maxLoadTimeMs >= p.maxTimeToFirstByteMs, 'le chargement complet ne peut pas etre plus court que le premier octet')
})

test('sous conversion imposee, le chargement d un segment tolere le demarrage d ffmpeg', () => {
  for (const forcer of ['audio', 'video'] as const) {
    const p = politiquesChargement(forcer).fragLoadPolicy.default
    assert.equal(p.maxLoadTimeMs, DELAI_CONVERSION_MS, forcer)
    assert.ok(p.maxTimeToFirstByteMs <= p.maxLoadTimeMs)
  }
  assert.ok(politiquesChargement(null).fragLoadPolicy.default.maxLoadTimeMs < DELAI_CONVERSION_MS, 'hors conversion, un segment qui traine est une panne')
})

test('playlists : un seul reessai interne, 45 s de patience (ffmpeg demarre peut-etre)', () => {
  for (const [nom, pol] of [['manifest', politiquesChargement(null).manifestLoadPolicy], ['playlist', politiquesChargement(null).playlistLoadPolicy]] as const) {
    assert.equal(pol.default.errorRetry?.maxNumRetry, 1, nom)
    assert.equal(pol.default.maxTimeToFirstByteMs, DELAI_PLAYLIST_DIRECT_MS, nom)
    assert.equal(pol.default.maxLoadTimeMs, DELAI_PLAYLIST_DIRECT_MS, nom)
  }
})

test('aucune cle heritee (fragLoadingTimeOut...) : hls.js 1.7 les mappe en avertissant, et pose le meme delai partout', () => {
  const cles = Object.keys(politiquesChargement(null))
  assert.ok(cles.every((c) => !/Loading(TimeOut|MaxRetry|RetryDelay|MaxRetryTimeout)$/.test(c)), cles.join(','))
  assert.deepEqual(cles.sort(), ['fragLoadPolicy', 'manifestLoadPolicy', 'playlistLoadPolicy'])
})

test('deux appels rendent des objets distincts : hls.js pose `shouldRetry` dessus, une attache ne doit pas en polluer une autre', () => {
  const a = politiquesChargement(null)
  const b = politiquesChargement(null)
  assert.notEqual(a.fragLoadPolicy.default.errorRetry, b.fragLoadPolicy.default.errorRetry)
  assert.notEqual(a.manifestLoadPolicy.default.errorRetry, b.playlistLoadPolicy.default.errorRetry)
})

test('les statuts de place prise ne sont jamais reessayes en silence', () => {
  for (const s of [403, 407, 429, 503]) assert.ok(statutPlacePrise(s), String(s))
  for (const s of [401, 404, 500, 502]) assert.ok(!statutPlacePrise(s), String(s))
})
