import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUCUNE_TENTATIVE, FORCAGES, suiteApresErreur, urlForcee, est4K, lireModeDirect, enConversion,
  estErreurParsing, type EtatTentatives,
} from '../../src/lib/modes-direct'
import { erreurDeStatut } from '../../src/lib/errors'

const parsing = { couche: 'codec', detail: 'fragParsingError' }

test('fragParsingError : audio, puis video, puis abandon -- dans cet ordre', () => {
  let etat: EtatTentatives = AUCUNE_TENTATIVE
  const a = suiteApresErreur(etat, parsing)
  assert.ok(a.action === 'forcer' && a.mode === 'audio' && a.tentative === 1 && a.total === 2)
  etat = a.etat
  const v = suiteApresErreur(etat, parsing)
  assert.ok(v.action === 'forcer' && v.mode === 'video' && v.tentative === 2)
  etat = v.etat
  assert.equal(suiteApresErreur(etat, parsing).action, 'abandonner')
})

test('jamais de boucle : borne a deux forcages quel que soit le nombre d erreurs', () => {
  let etat: EtatTentatives = AUCUNE_TENTATIVE
  let forces = 0
  for (let i = 0; i < 1000; i++) {
    const s = suiteApresErreur(etat, parsing)
    etat = s.etat
    if (s.action === 'forcer') forces++
  }
  assert.equal(forces, FORCAGES.length)
  assert.equal(forces, 2)
})

test('autres erreurs : ignorees (la politique de reprise decide), aucun forcage consomme', () => {
  for (const e of [
    { couche: 'reseau', detail: 'manifestLoadError' },
    { couche: 'codec', detail: 'bufferAppendError' },
    { couche: 'limite', detail: 'HTTP 503' },
    { couche: 'auth' },
  ]) {
    const s = suiteApresErreur(AUCUNE_TENTATIVE, e)
    assert.equal(s.action, 'ignorer')
    assert.deepEqual(s.etat, AUCUNE_TENTATIVE)
  }
  assert.ok(!estErreurParsing({ couche: 'reseau', detail: 'fragParsingError' }))
})

test('l etat est immuable : l ancien etat n est pas modifie', () => {
  const s = suiteApresErreur(AUCUNE_TENTATIVE, parsing)
  assert.equal(AUCUNE_TENTATIVE.faits.length, 0)
  assert.equal(s.etat.faits.length, 1)
})

test('urlForcee ajoute ?forcer= sans toucher au reste', () => {
  assert.equal(urlForcee('/api/v1/live/12.m3u8', null), '/api/v1/live/12.m3u8')
  assert.equal(urlForcee('/api/v1/live/12.m3u8', 'audio'), '/api/v1/live/12.m3u8?forcer=audio')
  assert.equal(urlForcee('/api/v1/live/12.m3u8?forcer=audio', 'video'), '/api/v1/live/12.m3u8?forcer=video')
  assert.equal(urlForcee('/api/v1/live/12.m3u8?a=1', 'video'), '/api/v1/live/12.m3u8?a=1&forcer=video')
})

test('4K : le mot isole seulement', () => {
  assert.ok(est4K('FR - CANAL+ 4K'))
  assert.ok(est4K('|4K| TF1'))
  assert.ok(est4K('TF1 (4k)'))
  assert.ok(!est4K('4KIDS'))
  assert.ok(!est4K('TF1 HD'))
  assert.ok(!est4K(undefined))
})

test('en-tete de mode et conversion', () => {
  assert.equal(lireModeDirect(' Audio '), 'audio')
  assert.equal(lireModeDirect('refus'), 'refus')
  assert.equal(lireModeDirect('x'), undefined)
  assert.equal(lireModeDirect(null), undefined)
  assert.ok(enConversion('audio') && enConversion('video'))
  assert.ok(!enConversion('direct') && !enConversion(null))
})

test('415 format_hevc_non_lisible : message 4K/HEVC, couche codec (jamais reessaye)', () => {
  const e = erreurDeStatut(415, { code: 'format_hevc_non_lisible', contexte: 'manifestLoadError' })
  assert.equal(e.couche, 'codec')
  assert.match(e.message, /4K\/HEVC/)
  assert.match(e.message, /autre cha/)
})
