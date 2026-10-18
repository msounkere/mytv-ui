import test from 'node:test'
import assert from 'node:assert/strict'
import { erreurDeStatut, lireRetryAfter, erreurDeMedia } from '../../src/lib/errors'

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

// US-25 CA5 : un 502 « compte » ou « adresse » n'est pas une panne du relais.
test('502 fournisseur_compte_invalide : abonnement expire, avec la date si connue', () => {
  const t0 = Date.parse('2026-10-15T10:00:00Z')
  const passe = erreurDeStatut(502, { code: 'fournisseur_compte_invalide', expiration: '2026-10-01T00:00:00Z', maintenantMs: t0 })
  assert.equal(passe.couche, 'fournisseur')
  assert.match(passe.message, /^Abonnement expiré ou refusé par le fournisseur \(expiré le 1 octobre 2026\)\.$/)
  const futur = erreurDeStatut(502, { code: 'fournisseur_compte_invalide', expiration: '2026-10-20T00:00:00Z', maintenantMs: t0 })
  assert.match(futur.message, /échéance le 20 octobre 2026/)
  const sansDate = erreurDeStatut(502, { code: 'fournisseur_compte_invalide' })
  assert.equal(sansDate.message, 'Abonnement expiré ou refusé par le fournisseur.')
  assert.match(sansDate.detail ?? '', /HTTP 502 fournisseur_compte_invalide/)
  // Une date illisible n'est jamais affichee.
  assert.doesNotMatch(erreurDeStatut(502, { code: 'fournisseur_compte_invalide', expiration: 'pas une date' }).message, /Invalid|NaN|\(/)
})

test('502 fournisseur_adresse_refusee et 502 ordinaire restent distincts', () => {
  const adresse = erreurDeStatut(502, { code: 'fournisseur_adresse_refusee' })
  assert.equal(adresse.couche, 'fournisseur')
  assert.match(adresse.message, /Adresse du serveur refusée par le fournisseur/)
  const panne = erreurDeStatut(502, { code: 'fournisseur_indisponible' })
  assert.equal(panne.couche, 'relais')
  assert.equal(erreurDeStatut(502).couche, 'relais')
  // Le code n'a de sens que sur un 502 : un autre statut garde sa traduction.
  assert.equal(erreurDeStatut(401, { code: 'fournisseur_compte_invalide' }).couche, 'auth')
})

// Regression (recette reelle) : une requete de film en echec est « source non prise en charge »
// + « Request failed » chez Firefox ; ce n'est PAS un probleme de format.
test('Firefox : requete en echec = reseau, pas un format non lisible', () => {
  const e = erreurDeMedia(4, '2152398949: Request failed')
  assert.equal(e.couche, 'reseau')
  assert.match(e.message, /telechargement/)
})

test('un vrai format refuse reste un probleme de codec', () => {
  assert.equal(erreurDeMedia(4, 'MEDIA_ELEMENT_ERROR: Format error').couche, 'codec')
  assert.equal(erreurDeMedia(4, undefined).couche, 'codec')
  assert.equal(erreurDeMedia(3, 'decode').couche, 'codec')
})

test('codes reseau et abandon', () => {
  assert.equal(erreurDeMedia(2, '').couche, 'reseau')
  assert.equal(erreurDeMedia(1, '').couche, 'reseau')
  assert.equal(erreurDeMedia(undefined, '').couche, 'relais')
})
