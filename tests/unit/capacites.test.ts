import test from 'node:test'
import assert from 'node:assert/strict'
import { marquageValide, codecEstHevc, DUREE_HEVC_DEFAILLANT_MS, detecter, urlAvecCapacites, nomNavigateur, analyserMemorisation, formaterCapacites } from '../../src/lib/capacites'
import { AUCUNE_TENTATIVE, suiteApresErreur, type EtatTentatives } from '../../src/lib/modes-direct'

const ms = (types: string[]) => ({ isTypeSupported: (t: string) => types.some((x) => t.includes(x)) })
const dec = (r: { supported: boolean; smooth?: boolean; powerEfficient?: boolean }) => ({ decodingInfo: async () => r })

test('Firefox : ni HEVC ni EAC3', async () => {
  assert.deepEqual(await detecter({ MediaSource: ms(['mp4a', 'avc1', 'ac-3']), mediaCapabilities: dec({ supported: false }) }), ['ac3'])
  assert.deepEqual(await detecter({ MediaSource: ms([]) }), [])
  assert.deepEqual(await detecter({}), [])
})

test('Chrome/Edge materiel : hevc, eac3, ac3', async () => {
  const c = await detecter({ MediaSource: ms(['hvc1', 'ec-3', 'ac-3']), mediaCapabilities: dec({ supported: true, smooth: true, powerEfficient: true }) })
  assert.deepEqual(c, ['hevc', 'eac3', 'ac3'])
  assert.equal(formaterCapacites(c), 'hevc,eac3,ac3')
})

// US-45 CA9 (D23) : `cap=hevc` seulement si decodingInfo repond smooth ET powerEfficient ; sinon jamais.
test('CA9 hev1 annonce sans MediaCapabilities : PAS de hevc (jamais sans la preuve du decodage materiel)', async () => {
  assert.deepEqual(await detecter({ MediaSource: ms(['hev1']) }), [])
})

test('CA9 HEVC annonce mais decodage 4K ni fluide ni econome, ou l un sans l autre : pas de hevc', async () => {
  assert.deepEqual(await detecter({ MediaSource: ms(['hvc1']), mediaCapabilities: dec({ supported: true, smooth: false, powerEfficient: false }) }), [])
  assert.deepEqual(await detecter({ MediaSource: ms(['hvc1']), mediaCapabilities: dec({ supported: true, smooth: true, powerEfficient: false }) }), [])
  assert.deepEqual(await detecter({ MediaSource: ms(['hvc1']), mediaCapabilities: dec({ supported: true, smooth: false, powerEfficient: true }) }), [])
  assert.deepEqual(await detecter({ MediaSource: ms(['hvc1']), mediaCapabilities: dec({ supported: false, smooth: true, powerEfficient: true }) }), [])
})

test('CA9 Firefox 157 Linux (codec annonce, decodage logiciel) : pas de hevc', async () => {
  assert.deepEqual(await detecter({ MediaSource: ms(['hvc1', 'ac-3']), mediaCapabilities: dec({ supported: true, smooth: true, powerEfficient: false }) }), ['ac3'])
})

test('API qui leve : on ne plante pas, et pas de hevc', async () => {
  const mc = { decodingInfo: async () => { throw new Error('x') } }
  assert.deepEqual(await detecter({ MediaSource: ms(['hvc1']), mediaCapabilities: mc }), [])
  assert.deepEqual(await detecter({ MediaSource: { isTypeSupported: () => { throw new Error('x') } } }), [])
})

test('urlAvecCapacites : ?cap= sans doublon, requete conservee', () => {
  assert.equal(urlAvecCapacites('/api/v1/live/1.m3u8', ['hevc', 'eac3']), '/api/v1/live/1.m3u8?cap=hevc,eac3')
  assert.equal(urlAvecCapacites('/api/v1/live/1.m3u8?forcer=audio', ['ac3']), '/api/v1/live/1.m3u8?forcer=audio&cap=ac3')
  assert.equal(urlAvecCapacites('/x?cap=hevc&t=2', []), '/x?t=2&cap=')
})

test('memorisation lue avec prudence', () => {
  assert.deepEqual(analyserMemorisation('{"v":1,"cap":["hevc","zzz","ac3"]}'), ['hevc', 'ac3'])
  assert.equal(analyserMemorisation('{"v":9,"cap":[]}'), undefined)
  assert.equal(analyserMemorisation('pas du json'), undefined)
  assert.equal(analyserMemorisation(null), undefined)
})

test('navigateur : nom et version', () => {
  assert.deepEqual(nomNavigateur('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'), { nom: 'Firefox', version: '130' })
  assert.equal(nomNavigateur('Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0').nom, 'Edge')
  assert.equal(nomNavigateur('Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36').nom, 'Chrome')
  assert.equal(nomNavigateur('').nom, 'inconnu')
})

const parsing = { couche: 'codec', detail: 'fragParsingError' }

test('repli : hevc annonce -> UNE tentative sans hevc, puis audio, video, abandon (borne)', () => {
  let etat: EtatTentatives = AUCUNE_TENTATIVE
  const actions: string[] = []
  for (let i = 0; i < 50; i++) {
    const s = suiteApresErreur(etat, parsing, { hevcAnnonce: true })
    actions.push(s.action === 'forcer' ? 'forcer:' + s.mode : s.action)
    etat = s.etat
  }
  assert.deepEqual(actions.slice(0, 4), ['sans-hevc', 'forcer:audio', 'forcer:video', 'abandonner'])
  assert.equal(actions.filter((a) => a === 'sans-hevc').length, 1)
  assert.ok(actions.slice(3).every((a) => a === 'abandonner'))
})

test('repli : bufferAppendError declenche aussi le repli, une fois', () => {
  const e = { couche: 'codec', detail: 'bufferAppendError' }
  const s = suiteApresErreur(AUCUNE_TENTATIVE, e, { hevcAnnonce: true })
  assert.equal(s.action, 'sans-hevc')
  assert.equal(suiteApresErreur(s.etat, e, { hevcAnnonce: true }).action, 'ignorer')
})

test('sans hevc annonce : pas de repli sans-hevc (comportement US-32 CA2 inchange)', () => {
  assert.equal(suiteApresErreur(AUCUNE_TENTATIVE, parsing, { hevcAnnonce: false }).action, 'forcer')
  assert.equal(suiteApresErreur(AUCUNE_TENTATIVE, { couche: 'reseau', detail: 'fragParsingError' }, { hevcAnnonce: true }).action, 'ignorer')
})

test('marquage hevc defaillant : expire apres 24 h, ignore le bruit', () => {
  const t0 = 1_000_000_000_000
  assert.ok(marquageValide(String(t0), t0 + 1000))
  assert.ok(marquageValide(String(t0), t0 + DUREE_HEVC_DEFAILLANT_MS - 1))
  assert.ok(!marquageValide(String(t0), t0 + DUREE_HEVC_DEFAILLANT_MS))
  assert.ok(!marquageValide('1', t0))
  assert.ok(!marquageValide(null, t0))
  assert.ok(!marquageValide('abc', t0))
  assert.ok(!marquageValide(String(t0 + 5000), t0), 'horodatage futur refuse')
})

test('on ne memorise que pour une source HEVC (X-Mytv-Codec)', () => {
  assert.ok(codecEstHevc('hevc'))
  assert.ok(codecEstHevc('HEVC'))
  assert.ok(codecEstHevc('h265'))
  assert.ok(!codecEstHevc('h264'))
  assert.ok(!codecEstHevc(undefined))
  assert.ok(!codecEstHevc(''))
})
