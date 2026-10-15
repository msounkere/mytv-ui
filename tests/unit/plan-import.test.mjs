// Decision d'import : ETag inchange = aucune requete de donnees ; reprise au type pres.
import test from 'node:test'
import assert from 'node:assert/strict'
import { decider, delaiRetry, partAvancement, ORDRE_EXPORTS } from '../../src/lib/plan-import.ts'

test('version inchangee : rien a telecharger', () => {
  assert.deepEqual(decider({ versionComplete: 'v1' }, { version: 'v1' }), { action: 'rien' })
})

test('premiere installation : tout est a importer, sans reprise', () => {
  const d = decider({}, { version: 'v1' })
  assert.equal(d.action, 'importer')
  assert.deepEqual(d.restants, [...ORDRE_EXPORTS])
  assert.equal(d.reprise, false)
})

test('nouvelle version : tout recommence, meme si un ancien import etait en cours', () => {
  const d = decider(
    { versionComplete: 'v1', enCours: { version: 'v1bis', faits: ['live'] } },
    { version: 'v2' },
  )
  assert.equal(d.reprise, false)
  assert.deepEqual(d.restants, [...ORDRE_EXPORTS])
})

test('import interrompu pour la meme version : on reprend apres les types termines', () => {
  const d = decider({ enCours: { version: 'v2', faits: ['categories', 'live'] } }, { version: 'v2' })
  assert.equal(d.reprise, true)
  // Les categories sont toujours relues (petites, et utiles aux compteurs).
  assert.deepEqual(d.restants, ['categories', 'vod', 'series'])
})

test('force : reimport complet meme a version egale', () => {
  const d = decider(
    { versionComplete: 'v1', enCours: { version: 'v1', faits: ['live'] } },
    { version: 'v1' },
    true,
  )
  assert.equal(d.action, 'importer')
  assert.equal(d.reprise, false)
  assert.deepEqual(d.restants, [...ORDRE_EXPORTS])
})

test('avancement borne entre 0 et 1, total inconnu = 0', () => {
  assert.equal(partAvancement(5, 10), 0.5)
  assert.equal(partAvancement(15, 10), 1)
  assert.equal(partAvancement(-1, 10), 0)
  assert.equal(partAvancement(3, 0), 0)
})

test('delai de retry exponentiel et plafonne', () => {
  assert.deepEqual([0, 1, 2, 3].map((n) => delaiRetry(n)), [500, 1000, 2000, 4000])
  assert.equal(delaiRetry(20), 8000)
})
