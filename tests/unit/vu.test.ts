import test from 'node:test'
import assert from 'node:assert/strict'
import { PART_VUE, estVu, partLue } from '../../src/lib/vu'

// Lot 10, US-46 CA3 : seuil « vu » UNIQUE, 0,9, le meme que `domain.PartVue`.
test('CA3 le seuil « vu » est 0,9 partout', () => {
  assert.equal(PART_VUE, 0.9)
  assert.ok(estVu(90, 100))
  assert.ok(estVu(92, 100), 'une position a 92 % (entre les anciens 90 et 95 %) compte comme vue')
  assert.ok(!estVu(89, 100))
  assert.ok(!estVu(0, 0), 'sans duree, rien n est vu')
  assert.equal(partLue(50, 100), 0.5)
  assert.equal(partLue(150, 100), 1)
  assert.equal(partLue(5, 0), 0)
})
