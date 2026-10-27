// Decision d'import : ETag inchange = aucune requete de donnees ; reprise au type pres.
import test from 'node:test'
import assert from 'node:assert/strict'
import { decider, delaiRetry, partAvancement, partDifference, ORDRE_EXPORTS } from '../../src/lib/plan-import.ts'

test('version inchangee : rien a telecharger', () => {
  assert.deepEqual(decider({ versionComplete: 'v1' }, { version: 'v1' }), { action: 'rien' })
})

test('premiere installation : tout est a importer, en complet, sans reprise', () => {
  const d = decider({}, { version: 'v1' })
  assert.equal(d.action, 'importer')
  assert.deepEqual(d.restants, [...ORDRE_EXPORTS])
  assert.equal(d.reprise, false)
  assert.equal(d.mode, 'complet')
  assert.equal(d.depuis, undefined)
})

// US-36 CA4 : base complete a une version connue -> difference depuis cette version.
test('nouvelle version, base complete : import par difference depuis la version en base', () => {
  const d = decider({ versionComplete: 'v1' }, { version: 'v2' })
  assert.equal(d.action, 'importer')
  assert.equal(d.mode, 'difference')
  assert.equal(d.depuis, 'v1')
  assert.equal(d.version, 'v2')
  assert.deepEqual(d.restants, [...ORDRE_EXPORTS])
})

// US-36 CA4 : le serveur a repondu 409 version_inconnue -> complet, meme cible.
test('409 version_inconnue : on repart en complet pour la meme version', () => {
  const d = decider({ versionComplete: 'v1' }, { version: 'v2' }, { sansDifference: true })
  assert.equal(d.action, 'importer')
  assert.equal(d.mode, 'complet')
  assert.equal(d.depuis, undefined)
  assert.equal(d.version, 'v2')
})

test('nouvelle version : tout recommence, meme si un ancien import etait en cours', () => {
  const d = decider(
    { versionComplete: 'v1', enCours: { version: 'v1bis', faits: ['live'] } },
    { version: 'v2' },
  )
  assert.equal(d.reprise, false)
  assert.deepEqual(d.restants, [...ORDRE_EXPORTS])
  // La base est encore complete a v1 : la difference reste possible.
  assert.equal(d.mode, 'difference')
  assert.equal(d.depuis, 'v1')
})

// US-36 CA4 : une difference interrompue reprend en difference depuis la MEME
// version (la base est entre les deux ; la difference est idempotente).
test('difference interrompue : reprise en difference depuis la meme version', () => {
  const d = decider({ enCours: { version: 'v2', faits: ['live'], depuis: 'v1' } }, { version: 'v2' })
  assert.equal(d.reprise, true)
  assert.equal(d.mode, 'difference')
  assert.equal(d.depuis, 'v1')
  assert.deepEqual(d.restants, ['categories', 'vod', 'series'])
})

test('import complet interrompu : reprise en complet (pas de depuis)', () => {
  const d = decider({ enCours: { version: 'v2', faits: ['live'] } }, { version: 'v2' })
  assert.equal(d.reprise, true)
  assert.equal(d.mode, 'complet')
  assert.equal(d.depuis, undefined)
})

test('base incomplete (pas de versionComplete) : jamais de difference', () => {
  const d = decider({}, { version: 'v2' })
  assert.equal(d.mode, 'complet')
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
  assert.equal(d.mode, 'complet', 'force = complet, jamais une difference')
  assert.deepEqual(decider({ versionComplete: 'v1' }, { version: 'v2' }, { force: true }).mode, 'complet')
})

test('avancement par difference : type par type, total inconnu d\'avance', () => {
  assert.equal(partDifference(0, 3, 50, 100), 0.5 / 3)
  assert.equal(partDifference(1, 3, 0, 10), 1 / 3)
  assert.equal(partDifference(2, 3, 10, 10), 1)
  assert.equal(partDifference(1, 3, 0, 0), 2 / 3, 'type vide = termine')
  assert.equal(partDifference(0, 0, 0, 0), 0)
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
