import test from 'node:test'
import assert from 'node:assert/strict'
import { erreurDeStatut, lireRetryAfter } from '../../src/lib/errors'

test('Retry-After : secondes, date HTTP, ou rien', () => {
  assert.equal(lireRetryAfter('7'), 7)
  assert.equal(lireRetryAfter(' 3 '), 3)
  assert.equal(lireRetryAfter(null), undefined)
  assert.equal(lireRetryAfter(''), undefined)
  assert.equal(lireRetryAfter('bientot'), undefined)
  const t0 = Date.parse('2026-10-15T10:00:00Z')
  assert.equal(lireRetryAfter('Thu, 15 Oct 2026 10:00:12 GMT', t0), 12)
  // Une date passee n'est pas une attente : on laisse la politique choisir.
  assert.equal(lireRetryAfter('Thu, 15 Oct 2026 09:00:00 GMT', t0), undefined)
})

test('503 = place occupee, avec le delai du serveur', () => {
  const e = erreurDeStatut(503, { retryAfter: '5' })
  assert.equal(e.couche, 'limite')
  assert.match(e.message, /Place occupée/)
  assert.equal(e.attenteSecondes, 5)
})

test('503 sans Retry-After : pas de delai invente', () => {
  assert.equal(erreurDeStatut(503).attenteSecondes, undefined)
})

test('401 = session expiree (couche auth)', () => {
  assert.equal(erreurDeStatut(401).couche, 'auth')
})

test('415 = format non lisible, dit clairement HEVC', () => {
  const e = erreurDeStatut(415, { code: 'format_non_lisible' })
  assert.equal(e.couche, 'codec')
  assert.match(e.message, /HEVC/)
  assert.match(e.detail ?? '', /format_non_lisible/)
})

test('chaque statut a une couche nommee, jamais un message vide', () => {
  for (const s of [400, 403, 404, 416, 429, 500, 501, 502, 504]) {
    const e = erreurDeStatut(s)
    assert.ok(e.message.length > 0 && e.action.length > 0, String(s))
    assert.match(e.detail ?? '', new RegExp(`HTTP ${s}`))
  }
})
