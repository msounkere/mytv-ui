import test from 'node:test'
import assert from 'node:assert/strict'
import { decider, borner, ESSAIS_MAX, ESSAIS_MAX_OCCUPE, ATTENTE_DEFAUT, ATTENTE_MAX, ATTENTE_MIN } from '../../src/lib/politique-reprise'

test('une panne reseau : trois essais puis abandon', () => {
  for (let i = 0; i < ESSAIS_MAX; i++) {
    const d = decider({ couche: 'reseau' }, i)
    assert.equal(d.action, 'reessayer')
    if (d.action === 'reessayer') {
      assert.equal(d.essai, i + 1)
      assert.equal(d.total, ESSAIS_MAX)
      assert.equal(d.motif, 'panne')
    }
  }
  assert.equal(decider({ couche: 'reseau' }, ESSAIS_MAX).action, 'abandonner')
})

test('place occupee : plus patient, mais borne (jamais de boucle infinie)', () => {
  let essais = 0
  let tentatives = 0
  while (decider({ couche: 'limite', attenteSecondes: 2 }, essais).action === 'reessayer') {
    essais++
    tentatives++
    assert.ok(tentatives <= 100, 'boucle infinie')
  }
  assert.equal(tentatives, ESSAIS_MAX_OCCUPE)
  const d = decider({ couche: 'limite', attenteSecondes: 4 }, 0)
  assert.deepEqual(d, { action: 'reessayer', essai: 1, total: ESSAIS_MAX_OCCUPE, delai: 4, motif: 'occupe' })
})

test('format illisible et session expiree : aucun reessai', () => {
  assert.equal(decider({ couche: 'codec' }, 0).action, 'abandonner')
  assert.equal(decider({ couche: 'auth' }, 0).action, 'abandonner')
  assert.equal(decider({ couche: 'donnees' }, 0).action, 'abandonner')
})

test("l'attente annoncee est bornee : ni 0 s (boucle serree) ni plusieurs minutes", () => {
  assert.equal(borner(undefined), ATTENTE_DEFAUT)
  assert.equal(borner(Number.NaN), ATTENTE_DEFAUT)
  assert.equal(borner(0), ATTENTE_MIN)
  assert.equal(borner(-5), ATTENTE_MIN)
  assert.equal(borner(3600), ATTENTE_MAX)
  assert.equal(borner(7.4), 7)
})
