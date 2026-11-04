// US-47 CA2 : tri des chaines du Direct, numero du bouquet, regroupement des
// variantes dans le zapping (logique pure, sans navigateur).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comparerChaines, trierChaines, numeroDuGroupe, indiceGroupeActif, libelleVariante } from '../../src/lib/direct-tri'
import { grouperVariantes } from '../../src/lib/variantes'

test('CA2 tri par numero du fournisseur, les non numerotees apres', () => {
  const l = trierChaines([
    { nom: 'Chaîne 12', numero: 12 },
    { nom: 'Chaîne 2', numero: 2 },
    { nom: 'Sans numéro' },
    { nom: 'Chaîne 1', numero: 1 },
  ])
  assert.deepEqual(l.map((c) => c.nom), ['Chaîne 1', 'Chaîne 2', 'Chaîne 12', 'Sans numéro'])
})

test('CA2 sans numero : ordre naturel du nom (« 2 » avant « 12 »)', () => {
  const l = trierChaines([{ nom: 'Chaîne 12' }, { nom: 'Chaîne 2' }, { nom: 'Chaîne 1' }, { nom: 'chaîne 10' }])
  assert.deepEqual(l.map((c) => c.nom), ['Chaîne 1', 'Chaîne 2', 'chaîne 10', 'Chaîne 12'])
  // localeCompare seul mettait « Chaîne 12 » avant « Chaîne 2 » (audit A UX13).
  assert.ok(comparerChaines({ nom: 'Chaîne 2' }, { nom: 'Chaîne 12' }) < 0)
})

test('CA2 un numero invalide (0, NaN, negatif) compte comme absent', () => {
  const l = trierChaines([{ nom: 'B', numero: 0 }, { nom: 'A', numero: Number.NaN }, { nom: 'C', numero: 3 }, { nom: 'D', numero: -1 }])
  assert.deepEqual(l.map((c) => c.nom), ['C', 'A', 'B', 'D'])
})

test('CA2 le tri ne modifie pas la liste d origine', () => {
  const src = [{ nom: 'B', numero: 2 }, { nom: 'A', numero: 1 }]
  trierChaines(src)
  assert.deepEqual(src.map((c) => c.nom), ['B', 'A'])
})

test('CA2 colonne N° : le plus petit numero du groupe, sinon le rang', () => {
  assert.equal(numeroDuGroupe([{ nom: 'TF1 HD', numero: 101 }, { nom: 'TF1', numero: 1 }], 7), 1)
  assert.equal(numeroDuGroupe([{ nom: 'X' }, { nom: 'X HD' }], 7), 7)
})

test('CA2 zapping regroupe : une entree par chaine, groupe actif par n importe quelle variante', () => {
  const voisines = [
    { cle: 'live:a', nom: 'FR - Chaîne 0', pays: 'FR' },
    { cle: 'live:b', nom: 'FR - Chaîne 0 HD', pays: 'FR' },
    { cle: 'live:c', nom: 'FR - Chaîne 1', pays: 'FR' },
    { cle: 'live:d', nom: 'FR - Chaîne 0 4K', pays: 'FR' },
  ]
  const groupes = grouperVariantes(voisines)
  assert.equal(groupes.length, 2)
  assert.equal(groupes[0]!.variantes.length, 3)
  assert.equal(indiceGroupeActif(groupes, 'live:b'), 0, 'la variante HD jouee surligne le groupe « Chaîne 0 »')
  assert.equal(indiceGroupeActif(groupes, 'live:c'), 1)
  assert.equal(indiceGroupeActif(groupes, 'live:zz'), -1)
})

test('CA2 bandeau : la variante n est annoncee que s il y en a plusieurs', () => {
  assert.equal(libelleVariante('HD', 1), undefined)
  assert.equal(libelleVariante('HD', 3), 'Variante HD · choisie pour votre liaison')
})
