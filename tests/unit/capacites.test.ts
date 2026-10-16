import test from 'node:test'
import assert from 'node:assert/strict'
import { detecter, urlAvecCapacites, nomNavigateur, analyserMemorisation, formaterCapacites } from '../../src/lib/capacites'
import { AUCUNE_TENTATIVE, suiteApresErreur, type EtatTentatives } from '../../src/lib/modes-direct'

const ms = (types: string[]) => ({ isTypeSupported: (t: string) => types.some((x) => t.includes(x)) })
const dec = (r: { supported: boolean; smooth?: boolean; powerEfficient?: boolean }) => ({ decodingInfo: async () => r })

test('Firefox : ni HEVC ni EAC3', async () => {
  assert.deepEqual(await detecter({ MediaSource: ms(['mp4a', 'avc1', 'ac-3']), mediaCapabilities: dec({ supported: false }) }), ['ac3'])
  assert.deepEqual(await detecter({ MediaSource: ms([]) }), [])
  assert.deepEqual(await detecter({}), [])
})

test('Chrome/Edge materiel : hevc, eac3, ac3', async () => {
  const c = await detecter({ MediaSource: ms(['hvc1', 'ec-3', 'ac-3']), mediaCapabilities: dec({ supported: true, powerEfficient: true }) })
  assert.deepEqual(c, ['hevc', 'eac3', 'ac3'])
  assert.equal(formaterCapacites(c), 'hevc,eac3,ac3')
})

test('hev1 seul suffit ; sans MediaCapabilities l annonce du codec fait foi', async () => {
  assert.deepEqual(await detecter({ MediaSource: ms(['hev1']) }), ['hevc'])
})

test('HEVC annonce mais decodage 4K ni fluide ni econome : pas de hevc', async () => {
  assert.deepEqual(await detecter({ MediaSource: ms(['hvc1']), mediaCapabilities: dec({ supported: true, smooth: false, powerEfficient: false }) }), [])
  assert.deepEqual(await detecter({ MediaSource: ms(['hvc1']), mediaCapabilities: dec({ supported: false, smooth: true }) }), [])
})

test('API qui leve : on ne plante pas', async () => {
  const mc = { decodingInfo: async () => { throw new Error('x') } }
  assert.deepEqual(await detecter({ MediaSource: ms(['hvc1']), mediaCapabilities: mc }), ['hevc'])
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
