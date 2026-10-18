import test from 'node:test'
import assert from 'node:assert/strict'
import { pointDeReprise, MARGE_REPRISE } from '../../src/lib/politique-reprise'

// Regression (recette reelle) : une coupure apres 6 min de lecture reprenait au depart demande.
test('apres une coupure, on reprend a la position atteinte (moins une marge)', () => {
  assert.equal(pointDeReprise(1242, 878), 1242 - MARGE_REPRISE)
})

test('sans position valide, on garde le dernier point demande', () => {
  assert.equal(pointDeReprise(0, 878), 878)
  assert.equal(pointDeReprise(NaN, 878), 878)
  assert.equal(pointDeReprise(-5, 878), 878)
})

test('jamais de position negative', () => {
  assert.equal(pointDeReprise(1, 0), 0)
})
