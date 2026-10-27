import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { annonceHevc, cleGroupe, cleGroupeEntree, grouperVariantes, qualiteDe, qualitesDuGroupe } from '../../src/lib/variantes'

// US-39 CA1 : regroupement des variantes d'une chaine, sur des libelles REELS.

interface Cas { nom: string; groupe: string; qualite: string; hevc?: boolean }
const fichier = join(process.env['MYTV_RACINE'] ?? '.', 'tests', 'unit', 'cas', 'variantes-reelles.json')
const CAS: Cas[] = (JSON.parse(readFileSync(fichier, 'utf8')) as { cas: Cas[] }).cas

test('CA1 : au moins 30 libelles reels du catalogue, cle de groupe et qualite attendues', () => {
  assert.ok(CAS.length >= 30, `${CAS.length} cas`)
  for (const c of CAS) {
    assert.equal(cleGroupe(c.nom), c.groupe, `cle de « ${c.nom} »`)
    assert.equal(qualiteDe(c.nom), c.qualite, `qualite de « ${c.nom} »`)
    assert.equal(annonceHevc(c.nom), !!c.hevc || c.qualite === '4K', `hevc de « ${c.nom} »`)
  }
})

test('CA1 : la cle est la meme avec ou sans le prefixe pays (le catalogue local le retire deja)', () => {
  assert.equal(cleGroupe('TF1 FHD ◉'), 'tf1')
  assert.equal(cleGroupe('|FR| TF1 HD'), 'tf1')
  assert.equal(cleGroupe('FR: TF1'), 'tf1')
  assert.equal(cleGroupe('FR - TF1 (backup)'), 'tf1')
  assert.equal(cleGroupe('TF1 H265'), 'tf1')
  assert.equal(cleGroupe('  Tf1  '), 'tf1')
  // Les marqueurs ne sont retires que comme mots entiers.
  assert.equal(cleGroupe('HDTV5'), 'hdtv5')
  assert.equal(cleGroupe('TV5 MONDE'), 'tv5 monde')
  // « +1 » reste une autre chaine.
  assert.notEqual(cleGroupe('TF1 +1'), cleGroupe('TF1'))
})

test('CA1 : grouperVariantes sur les cas reels -> un groupe par cle, variantes triees par definition', () => {
  const entrees = CAS.map((c, i) => ({ cle: `live:iptva:${i}`, nom: c.nom }))
  const groupes = grouperVariantes(entrees)
  const parCle = new Map(groupes.map((g) => [g.cle, g]))
  assert.equal(groupes.length, new Set(CAS.map((c) => c.groupe)).size, 'autant de groupes que de cles distinctes')
  const tf1 = parCle.get('tf1')!
  assert.deepEqual(tf1.variantes.map((v) => v.nom), ['FR - TF1 4K', 'FR - TF1 FHD ◉', 'FR - TF1 HD', 'FR - TF1 HEVC'])
  assert.deepEqual(qualitesDuGroupe(tf1), ['4K', 'FHD', 'HD', 'inconnue'])
  assert.equal(tf1.nom, 'FR - TF1 HD', 'le nom du groupe est celui de la variante la plus courte')
  const bein = parCle.get('bein sports 1')!
  assert.equal(bein.variantes.length, 4)
  assert.equal(bein.representant.nom, 'FR - BEIN SPORTS 1', 'le representant est la premiere variante rencontree')
  // Une chaine sans variante reste telle quelle.
  const seule = parCle.get('dubai one')!
  assert.equal(seule.variantes.length, 1)
  assert.equal(seule.representant.nom, 'AE - DUBAI ONE ◉')
  // L'ordre des groupes suit la liste.
  assert.equal(groupes[0]!.cle, 'tf1')
})

test('CA1 : deux entrees de meme cle de catalogue ne font qu une variante ; une liste vide ne groupe rien', () => {
  const g = grouperVariantes([{ cle: 'a', nom: 'ARTE' }, { cle: 'a', nom: 'ARTE' }, { cle: 'b', nom: 'ARTE' }])
  assert.equal(g.length, 1)
  assert.equal(g[0]!.variantes.length, 2)
  assert.deepEqual(grouperVariantes([]), [])
})

test('CA1 : dans le catalogue, le pays separe par l import fait partie de la cle (FR TF1 et BE TF1 ne sont pas une meme chaine)', () => {
  const g = grouperVariantes([
    { cle: '1', nom: 'TF1 HD', pays: 'FR' }, { cle: '2', nom: 'TF1 4K', pays: 'FR' },
    { cle: '3', nom: 'TF1 HD', pays: 'BE' }, { cle: '4', nom: 'TF1', pays: undefined },
  ])
  assert.deepEqual(g.map((x) => [x.cle, x.variantes.length]), [['fr|tf1', 2], ['be|tf1', 1], ['tf1', 1]])
  assert.equal(cleGroupeEntree({ nom: 'الثقافية', pays: 'AR' }), 'ar|الثقافية', 'un nom non latin garde ses lettres')
})
