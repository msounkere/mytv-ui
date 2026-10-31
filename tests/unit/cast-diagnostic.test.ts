import test from 'node:test'
import assert from 'node:assert/strict'
import { diffusionResoutLeCodec } from '../../src/lib/cast'
import { construireEnvoi, masquerUrl } from '../../src/lib/diagnostic'
import { traduireHls } from '../../src/lib/lecteur'

// La diffusion elle-meme (lien signe, capacites du televiseur, telemetrie) est
// dans cast.test.ts (US-41) ; « reseau local » n'existe plus cote interface.

test('Cast : EAC3/AC3/DTS se diffusent', () => {
  assert.equal(diffusionResoutLeCodec('eac3'), true)
  assert.equal(diffusionResoutLeCodec('aac'), false)
  assert.equal(diffusionResoutLeCodec(undefined), false)
})

test("telemetrie : jetons de segment, requetes et fragments n'en sortent pas", () => {
  assert.equal(masquerUrl('/api/v1/live/845410/seg/AbCdEf123_-xyz?x=1#f'), '/api/v1/live/845410/seg/…')
  assert.equal(masquerUrl('/api/v1/live/845410.m3u8?jeton=secret'), '/api/v1/live/845410.m3u8')
  assert.equal(masquerUrl(undefined), undefined)
})

test('telemetrie : un lot est conforme au contrat EnvoiEvenements', () => {
  const e = construireEnvoi(
    [{ type: 'hls:erreur', http: 503 }, { type: 'x'.repeat(60) }, { t: 3 }],
    'a'.repeat(100), 'u'.repeat(500),
  )
  assert.equal(e.appareil.length, 80)
  assert.equal(e.agent.length, 300)
  assert.equal(e.evenements.length, 3)
  for (const ev of e.evenements) assert.ok(typeof ev.type === 'string' && ev.type.length <= 40 && ev.type.length > 0)
  assert.equal(e.evenements[0]!.http, 503)
})

const Ctor = { ErrorTypes: { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' } } as never

test('hls 503 + Retry-After (XHR) : place occupee avec son delai', () => {
  const e = traduireHls(Ctor, {
    type: 'networkError', details: 'manifestLoadError', response: { code: 503 },
    networkDetails: { getResponseHeader: (n: string) => (n === 'Retry-After' ? '6' : null) },
  })
  assert.equal(e.couche, 'limite')
  assert.equal(e.attenteSecondes, 6)
  assert.match(e.message, /Place occupée/)
})

test('hls 503 (Response fetch) et 401', () => {
  const e = traduireHls(Ctor, { type: 'networkError', details: 'fragLoadError', response: { code: 503 }, networkDetails: { headers: new Headers({ 'Retry-After': '2' }) } })
  assert.equal(e.attenteSecondes, 2)
  assert.equal(traduireHls(Ctor, { type: 'networkError', details: 'x', response: { code: 401 } }).couche, 'auth')
})

test('hls sans statut : reseau / media / relais', () => {
  assert.equal(traduireHls(Ctor, { type: 'networkError', details: 'x' }).couche, 'reseau')
  assert.equal(traduireHls(Ctor, { type: 'mediaError', details: 'x' }).couche, 'codec')
  assert.equal(traduireHls(Ctor, { type: 'otherError', details: 'x' }).couche, 'relais')
})
