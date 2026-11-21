import test from 'node:test'
import assert from 'node:assert/strict'
import { versProgramme } from '../../src/lib/epg'
import { erreurDeStatut } from '../../src/lib/errors'
import { estIdentifiantReplay } from '../../src/lib/identifiants'
import { corpsPosition } from '../../src/screens/lecture/position'
import { entreeReplay, revisible } from '../../src/lib/replay'
import type { EntreeCatalogue } from '../../src/lib/db'

const ID = 'iptva:replay-553959-1795260000-40'
const tf1: EntreeCatalogue = {
  cle: 'live:iptva:553959', type: 'live', idServeur: 'iptva:553959', lecture: '/api/v1/live/553959.m3u8',
  id: 553959, nom: 'FR - TF1 FHD', recherche: 'tf1', icone: '/api/v1/image/x', pays: 'FR',
}

test('le guide garde un identifiant de replay valide, et lui seul', () => {
  const brut = { debut: '2026-11-21T12:00:00Z', fin: '2026-11-21T12:40:00Z', titre: 'Le 13h' }
  assert.equal(versProgramme('iptva:553959', { ...brut, replay: ID })?.replay, ID)
  assert.equal(versProgramme('iptva:553959', brut)?.replay, undefined)
  for (const ko of ['iptva:553959', 'iptva:replay-1-2', 'iptva:replay-1-2-3/../x', '../replay-1-2-3'])
    assert.equal(versProgramme('iptva:553959', { ...brut, replay: ko })?.replay, undefined, ko)
})

test('seul un programme TERMINE se revoit ; en cours, le clic reste le direct', () => {
  const p = versProgramme('iptva:553959', { debut: '2026-11-21T12:00:00Z', fin: '2026-11-21T12:40:00Z', titre: 'Le 13h', replay: ID })!
  assert.ok(revisible(p, Date.parse('2026-11-21T13:00:00Z')))
  assert.ok(!revisible(p, Date.parse('2026-11-21T12:20:00Z')))
  assert.ok(!revisible({ ...p, replay: undefined }, Date.parse('2026-11-21T13:00:00Z')))
})

test("l'entree de replay est un film hors catalogue, nomme d'apres le programme", () => {
  const p = versProgramme('iptva:553959', { debut: '2026-11-21T12:00:00Z', fin: '2026-11-21T12:40:00Z', titre: 'Le 13h', replay: ID })!
  const e = entreeReplay(tf1, p as typeof p & { replay: string })
  assert.equal(e.type, 'vod')
  assert.equal(e.cle, `vod:${ID}`)
  assert.equal(e.lecture, `/api/v1/vod/${ID}`)
  assert.equal(e.nom, 'Le 13h · FR - TF1 FHD')
  assert.equal(e.icone, tf1.icone)
})

test("un replay n'entre ni dans l'historique ni dans « Reprendre »", () => {
  assert.ok(estIdentifiantReplay(ID))
  assert.ok(!estIdentifiantReplay('iptva:845410'))
  assert.ok(!estIdentifiantReplay('iptva:77123.mkv'))
  assert.equal(corpsPosition(`vod:${ID}`, 120, 2400), undefined)
  assert.ok(corpsPosition('vod:iptva:845410', 120, 2400))
})

test('replay vide chez le fournisseur : message dedie, pas « contenu supprime »', () => {
  const e = erreurDeStatut(404, { code: 'replay_indisponible' })
  assert.match(e.message, /replay/)
  assert.doesNotMatch(erreurDeStatut(404, {}).message, /replay/)
})
