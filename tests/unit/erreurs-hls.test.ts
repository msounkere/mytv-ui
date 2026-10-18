import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ETAT_HLS_INITIAL, FENETRE_MEDIA_MS, FENETRE_SANS_PROGRES_MS, RECUPERATIONS_MAX, SANS_PROGRES_MAX,
  TYPE_MEDIA, TYPE_RESEAU, DETAIL_SANS_PROGRES, reagir, type EtatHls, type EvenementHls, type ActionHls,
} from '../../src/lib/erreurs-hls'

const ev = (x: Partial<EvenementHls>): EvenementHls => ({
  type: TYPE_MEDIA, details: 'bufferAppendError', fatal: true, maintenant: 0, position: 0, ...x,
})

/** Deroule une suite d'evenements et rend les actions. */
function derouler(evenements: EvenementHls[], depart: EtatHls = ETAT_HLS_INITIAL): { actions: ActionHls[]; etat: EtatHls } {
  let etat = depart
  const actions: ActionHls[] = []
  for (const e of evenements) {
    const r = reagir(etat, e)
    etat = r.etat
    actions.push(r.action)
  }
  return { actions, etat }
}

test('erreur media fatale : recuperer, puis permuter l audio si elle se repete sous 10 s, puis remonter', () => {
  const { actions } = derouler([ev({ maintenant: 0 }), ev({ maintenant: 2000 }), ev({ maintenant: 4000 })])
  assert.deepEqual(actions, ['recuperer', 'permuter-audio', 'remonter'])
})

test('erreur media isolee (plus de 10 s apres la precedente) : une recuperation simple a nouveau', () => {
  const { actions } = derouler([ev({ maintenant: 0 }), ev({ maintenant: FENETRE_MEDIA_MS + 1 })])
  assert.deepEqual(actions, ['recuperer', 'recuperer'])
})

test('jamais de boucle : les recuperations media sont bornees sur une attache, meme espacees', () => {
  const evts = Array.from({ length: 50 }, (_, i) => ev({ maintenant: i * (FENETRE_MEDIA_MS + 1) }))
  const { actions } = derouler(evts)
  assert.equal(actions.filter((a) => a !== 'remonter').length, RECUPERATIONS_MAX)
  assert.equal(actions[RECUPERATIONS_MAX], 'remonter')
})

test('fragParsingError fatal : jamais recupere ici, remonte (forcages bornes de modes-direct)', () => {
  const r = reagir(ETAT_HLS_INITIAL, ev({ details: 'fragParsingError' }))
  assert.equal(r.action, 'remonter')
  assert.deepEqual(r.etat, ETAT_HLS_INITIAL)
})

test('erreur reseau fatale sans statut (delai, corps tronque) : startLoad une fois, puis remonter', () => {
  const { actions } = derouler([
    ev({ type: TYPE_RESEAU, details: 'fragLoadTimeOut' }),
    ev({ type: TYPE_RESEAU, details: 'fragLoadTimeOut', maintenant: 1000 }),
  ])
  assert.deepEqual(actions, ['recharger', 'remonter'])
})

test('erreur reseau fatale avec un statut HTTP (401, 404, 502) : remontee telle quelle', () => {
  for (const statut of [401, 404, 502]) {
    const r = reagir(ETAT_HLS_INITIAL, ev({ type: TYPE_RESEAU, details: 'manifestLoadError', statut }))
    assert.equal(r.action, 'remonter', `statut ${statut}`)
    assert.equal(r.etat.recharge, false, 'le rechargement reste disponible pour une vraie panne')
  }
})

test('place prise (503/403/407) : toujours remontee, fatale ou non, jamais rechargee', () => {
  assert.equal(reagir(ETAT_HLS_INITIAL, ev({ type: TYPE_RESEAU, details: 'fragLoadError', statut: 403, placePrise: true, fatal: false })).action, 'remonter')
  assert.equal(reagir(ETAT_HLS_INITIAL, ev({ type: TYPE_RESEAU, details: 'levelLoadError', statut: 503, placePrise: true })).action, 'remonter')
})

test('erreur non fatale ordinaire : ignoree, hls.js la rattrape seul', () => {
  const r = reagir(ETAT_HLS_INITIAL, ev({ fatal: false, details: 'bufferStalledError' }))
  assert.equal(r.action, 'ignorer')
  assert.deepEqual(r.etat, ETAT_HLS_INITIAL)
})

const sansProgres = (maintenant: number, position = 0) =>
  ev({ fatal: false, details: DETAIL_SANS_PROGRES, maintenant, position })

test('bufferAppendNoProgress en boucle, position figee : ignore 4 fois, recupere a la 5e, puis remonte a la 10e', () => {
  // Telemetrie reelle : des dizaines d'affilee avec « video:seeking pos 0 », sans erreur fatale.
  const evts = Array.from({ length: 2 * SANS_PROGRES_MAX }, (_, i) => sansProgres(i * 1000))
  const { actions } = derouler(evts)
  assert.deepEqual(actions.slice(0, SANS_PROGRES_MAX), ['ignorer', 'ignorer', 'ignorer', 'ignorer', 'recuperer'])
  assert.deepEqual(actions.slice(SANS_PROGRES_MAX), ['ignorer', 'ignorer', 'ignorer', 'ignorer', 'remonter'])
})

test('bufferAppendNoProgress alors que la lecture AVANCE : jamais une coupure', () => {
  const evts = Array.from({ length: 20 }, (_, i) => sansProgres(i * 1000, i * 2))
  const { actions } = derouler(evts)
  assert.ok(actions.every((a) => a === 'ignorer'))
})

test('bufferAppendNoProgress espaces de plus de 30 s : la serie repart, rien ne remonte', () => {
  const evts = Array.from({ length: 20 }, (_, i) => sansProgres(i * (FENETRE_SANS_PROGRES_MS + 1)))
  const { actions } = derouler(evts)
  assert.ok(actions.every((a) => a === 'ignorer'))
})
