import test from 'node:test'
import assert from 'node:assert/strict'
import { diffusionPossible, origineLocale, urlPourDiffusion, diffusionResoutLeCodec } from '../../src/lib/cast'
import { construireEnvoi, masquerUrl } from '../../src/lib/diagnostic'
import { traduireHls } from '../../src/lib/lecteur'

test('Cast : possible seulement depuis le reseau local', () => {
  for (const h of ['192.168.50.3', '10.0.0.4', '172.16.5.5', '172.31.255.1', '127.0.0.1', 'localhost', 'mytv.local', 'mediaserver', '[fd12::1]'])
    assert.equal(origineLocale(h), true, h)
  for (const h of ['mytv.msocasa.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', 'example.org'])
    assert.equal(origineLocale(h), false, h)
  assert.equal(diffusionPossible('192.168.50.3'), true)
  assert.equal(diffusionPossible('mytv.msocasa.com'), false)
})

test("Cast : l'URL est la lecture du serveur, absolue, sans secret ni jeton", () => {
  const u = urlPourDiffusion('/api/v1/live/845410.m3u8', 'http://192.168.50.3:8096')
  assert.equal(u, 'http://192.168.50.3:8096/api/v1/live/845410.m3u8')
  assert.doesNotMatch(u, /@|token|jeton|password/i)
  assert.equal(urlPourDiffusion('/api/v1/vod/iptva:5521', 'http://mytv.local'), 'http://mytv.local/api/v1/vod/iptva:5521')
})

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
