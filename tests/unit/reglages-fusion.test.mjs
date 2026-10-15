// Fusion des reglages (conflit 409 : fusion puis nouvel essai).
import test from 'node:test'
import assert from 'node:assert/strict'
import { fusionner, egaux, lireEnsemble, ecrireEnsemble } from '../../src/lib/reglages-fusion.ts'

const ens = (...x) => ecrireEnsemble(x)

test('deux machines epinglent chacune une categorie : les deux sont gardees', () => {
  const base = { 'epingles.live': ens('a') }
  const local = { 'epingles.live': ens('a', 'b') } // j'ajoute b
  const distant = { 'epingles.live': ens('a', 'c') } // l'autre a ajoute c
  assert.deepEqual(lireEnsemble(fusionner(base, local, distant)['epingles.live']), ['a', 'b', 'c'])
})

test('un retrait local survit a la fusion, un ajout distant aussi', () => {
  const base = { masquees: ens('x', 'y') }
  const local = { masquees: ens('x') } // j'ai demasque y
  const distant = { masquees: ens('x', 'y', 'z') } // l'autre a masque z
  assert.deepEqual(lireEnsemble(fusionner(base, local, distant).masquees), ['x', 'z'])
})

test('un retrait distant n\'est pas ressuscite par une copie locale non modifiee', () => {
  const base = { 'epingles.live': ens('a', 'b') }
  const local = { 'epingles.live': ens('a', 'b') }
  const distant = { 'epingles.live': ens('a') }
  assert.deepEqual(lireEnsemble(fusionner(base, local, distant)['epingles.live']), ['a'])
})

test('scalaire : seul ce que NOUS avons change l\'emporte', () => {
  const base = { theme: 'dark', barreDeployee: '1' }
  const local = { theme: 'light', barreDeployee: '1' } // j'ai change le theme seulement
  const distant = { theme: 'dark', barreDeployee: '0' } // l'autre a replie la barre
  assert.deepEqual(fusionner(base, local, distant), { theme: 'light', barreDeployee: '0' })
})

test('conflit sur le meme scalaire : le geste local gagne (nouvel essai avec la revision courante)', () => {
  const base = { theme: 'dark' }
  assert.equal(fusionner(base, { theme: 'light' }, { theme: 'auto' }).theme, 'light')
})

test('premiere synchronisation : le serveur l\'emporte sur un defaut local, les ensembles s\'unissent', () => {
  const local = { theme: 'dark', 'epingles.live': ens('a') }
  const distant = { theme: 'light', 'epingles.live': ens('b') }
  const f = fusionner(undefined, local, distant)
  assert.equal(f.theme, 'light')
  assert.deepEqual(lireEnsemble(f['epingles.live']), ['a', 'b'])
})

test('premiere synchronisation, serveur vide : le local est pousse', () => {
  assert.deepEqual(fusionner(undefined, { theme: 'light' }, {}), { theme: 'light' })
})

test('suppression locale d\'un scalaire (cle absente chez moi, presente dans la base)', () => {
  assert.deepEqual(fusionner({ theme: 'dark' }, {}, { theme: 'dark' }), {})
})

test('ensemble vide : la cle disparait, jamais "[]"', () => {
  assert.deepEqual(fusionner({ masquees: ens('x') }, {}, { masquees: ens('x') }), {})
})

test('egaux ignore l\'ordre des ensembles et rien d\'autre', () => {
  assert.ok(egaux({ masquees: '["b","a"]', theme: 'x' }, { masquees: '["a","b"]', theme: 'x' }))
  assert.ok(!egaux({ theme: 'x' }, { theme: 'y' }))
  assert.ok(!egaux({ theme: 'x' }, { theme: 'x', autre: '1' }))
})

test('un ensemble corrompu est lu comme vide, sans lever', () => {
  assert.deepEqual(lireEnsemble('pas du json'), [])
  assert.deepEqual(lireEnsemble('{"a":1}'), [])
  assert.deepEqual(lireEnsemble(undefined), [])
})
