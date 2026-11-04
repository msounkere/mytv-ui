import test from 'node:test'
import assert from 'node:assert/strict'
import {
  badgeEtat, compteurRangee, deplacer, enTeteListe, libelleDisponibilite, libelleEpisodesAvance, libellePreparation,
  phraseEtat, prochainApres, prochainDansListe, resumeSerie, resumeSerieCourt, secondesRestantes, trierPretsDabord,
  type Preparation,
} from '../../src/lib/ma-liste-regles'
import { cheminAVoir, cleDeIdAVoir, idAVoirDeCle } from '../../src/lib/identifiants'
import { episodeApres, episodesOrdonnes, prochainAVoir } from '../../src/lib/episodes-suivants'
import type { SaisonApi } from '../../src/lib/api'

// Lot 10, US-46 : regles pures de « Ma liste » (libelles du rapport C §5.5).

// Identifiants (lot 9, inchange) : la cle locale et l'identifiant du serveur se traduisent a la frontiere.
test('un film et une serie ont un identifiant de liste type ; un episode ou une chaine, non', () => {
  assert.equal(idAVoirDeCle('vod:iptva:5521'), 'vod:iptva:5521')
  assert.equal(idAVoirDeCle('series:iptva:s77'), 'serie:iptva:s77')
  assert.throws(() => idAVoirDeCle('series:iptva:77123.mkv'), /sans place/)
  assert.throws(() => idAVoirDeCle('live:iptva:100'), /sans place/)
  assert.equal(cleDeIdAVoir('vod:iptva:5521'), 'vod:iptva:5521')
  assert.equal(cleDeIdAVoir('serie:iptva:s77'), 'series:iptva:s77')
  assert.equal(cleDeIdAVoir('iptva:5521'), undefined)
  assert.equal(cheminAVoir('serie:iptva:s77'), 'serie:iptva:s77')
  assert.throws(() => cheminAVoir('serie:iptva:s77/../x'), /invalide/)
})

// CA5 : les quatre phrases du chip, avec raison, pourcentage, temps restant et cause.
test('CA5 phrase du chip : attente + raison, preparation + % + temps, pret, echec + cause', () => {
  assert.equal(phraseEtat({ etat: 'attente' }), '○ En attente')
  assert.equal(phraseEtat({ etat: 'attente', raison: 'lecture_en_cours' }), '○ En attente · une lecture est en cours')
  assert.equal(phraseEtat({ etat: 'attente', raison: 'file', position: 2 }), '○ En attente · 2e dans la file')
  assert.equal(phraseEtat({ etat: 'attente', raison: 'file', position: 1 }), '○ En attente · 1er dans la file')
  assert.equal(phraseEtat({ etat: 'attente', raison: 'budget_plein' }), '○ En attente · disque plein')
  // 420 octets sur 1000 a 2,1 Mbit/s : le temps restant est calcule, pas invente.
  assert.equal(phraseEtat({ etat: 'en_cours', octets: 420, total: 1000, debitKbps: 2100 }), '⟳ En préparation · 42 % · ~1 s')
  // (total - octets) / debit : 4,2 Go restants a 8 Mbit/s = 70 min.
  const grand = { etat: 'en_cours' as const, octets: 0, total: 4_200_000_000, debitKbps: 8000 }
  assert.equal(Math.round(secondesRestantes(grand)! / 60), 70)
  assert.equal(phraseEtat(grand), '⟳ En préparation · 0 % · ~1 h 10')
  assert.equal(phraseEtat({ etat: 'en_cours' }), '⟳ En préparation')
  assert.equal(phraseEtat({ etat: 'pret' }), '● Prêt')
  assert.equal(phraseEtat({ etat: 'echec', cause: 'disque plein' }), '✕ Échec · disque plein')
  assert.equal(phraseEtat(undefined), '○ État inconnu')
  // Compat : la ligne sans symbole garde UN seul mot pour « en preparation » (C9).
  assert.equal(libellePreparation({ etat: 'en_cours', octets: 420, total: 1000 }), 'En préparation · 42 %')
  assert.ok(!libellePreparation({ etat: 'en_cours' }).includes('En cours'))
})

// CA2 / CA5 : badge de coin d'une carte, jamais une phrase a la place de la legende.
test('CA5 badge de coin : Prêt, ⟳ 42 %, En attente, ✕ Échec', () => {
  assert.equal(badgeEtat({ etat: 'pret' }), 'Prêt')
  assert.equal(badgeEtat({ etat: 'en_cours', octets: 420, total: 1000 }), '⟳ 42 %')
  assert.equal(badgeEtat({ etat: 'attente', raison: 'file', position: 3 }), 'En attente')
  assert.equal(badgeEtat({ etat: 'echec', cause: 'disque plein' }), '✕ Échec')
  assert.equal(badgeEtat(undefined), undefined)
})

// CA5 : une serie tient en une ligne, avec le symbole, jamais ses douze episodes.
test('CA5 une serie se resume « ● S01E02 prêt · S01E03 en préparation »', () => {
  const p: Preparation = {
    etat: 'pret',
    episodes: [
      { contenu: 'iptva:1.mkv', saison: 1, episode: 2, etat: 'pret' },
      { contenu: 'iptva:2.mkv', saison: 1, episode: 3, etat: 'en_cours', octets: 1, total: 4 },
      { contenu: 'iptva:3.mkv', saison: 1, episode: 4, etat: 'attente' },
    ],
  }
  assert.equal(resumeSerie(p), '● S01E02 prêt · S01E03 en préparation')
  assert.equal(resumeSerieCourt(p), '● S01E02 prêt · suivant ⟳')
  assert.equal(resumeSerie({ etat: 'attente', episodes: [{ contenu: 'x', saison: 2, episode: 1, etat: 'attente', raison: 'lecture_en_cours' }, { contenu: 'y', saison: 2, episode: 2, etat: 'attente' }] }), '○ S02E01 en attente · une lecture est en cours · S02E02 en attente')
  assert.equal(resumeSerie({ etat: 'echec', episodes: [{ contenu: 'x', saison: 1, episode: 1, etat: 'echec', cause: 'fournisseur injoignable' }] }), '✕ S01E01 échec · fournisseur injoignable')
  assert.equal(resumeSerie({ etat: 'attente' }), '○ En attente')
  assert.ok(!resumeSerie(p).includes('S01E04'), 'le troisieme episode n est pas enumere')
  assert.ok(!/mbit/.test(resumeSerie({ etat: 'en_cours', episodes: [{ contenu: 'x', saison: 1, episode: 1, etat: 'en_cours', octets: 50, total: 100, debitKbps: 2100 }] })), 'jamais « mbit/s » en minuscules (C9)')
})

// CA5 : en-tete de l'ecran et compteur de la rangee.
test('CA5 en-tete « 5 titres · 2 prêts · 1 en préparation · 4,2 Go sur 10 Go » et compteur « 5 · 2 prêts »', () => {
  const l = [
    { preparation: { etat: 'pret' } as Preparation }, { preparation: { etat: 'pret' } as Preparation },
    { preparation: { etat: 'en_cours' } as Preparation }, { preparation: { etat: 'attente' } as Preparation }, {},
  ]
  assert.equal(enTeteListe(l, { utilise: 4_509_715_660, total: 10_737_418_240 }), '5 titres · 2 prêts · 1 en préparation · 4,2 Go sur 10 Go')
  assert.equal(enTeteListe(l.slice(3)), '2 titres')
  assert.equal(enTeteListe([]), 'Votre liste est vide')
  assert.equal(compteurRangee(l), '5 · 2 prêts')
  assert.equal(compteurRangee(l.slice(2)), '3')
  assert.equal(compteurRangee(l.slice(1, 3)), '2 · 1 prêt')
})

test('CA5 « Préparer N épisodes d’avance » nomme le reglage du serveur quand rien n est choisi', () => {
  assert.equal(libelleEpisodesAvance(undefined, 2), 'Préparer 2 (réglage du serveur) épisodes d’avance')
  assert.equal(libelleEpisodesAvance(3, 2), 'Préparer 3 épisodes d’avance')
  assert.equal(libelleEpisodesAvance(1, 2), 'Préparer 1 épisode d’avance')
})

test('deplacer : monter, descendre, bornes', () => {
  assert.deepEqual(deplacer(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b'])
  assert.deepEqual(deplacer(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(deplacer(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c'])
  assert.deepEqual(deplacer(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c'])
})

test('tri « prets d abord » (compat lot 9) : stable, puis le rang', () => {
  const l = [
    { cle: 'a', rang: 1, preparation: { etat: 'attente' } as Preparation },
    { cle: 'b', rang: 2, preparation: { etat: 'pret' } as Preparation },
    { cle: 'c', rang: 3 },
    { cle: 'd', rang: 4, preparation: { etat: 'pret' } as Preparation },
  ]
  assert.deepEqual(trierPretsDabord(l).map((e) => e.cle), ['b', 'd', 'a', 'c'])
})

// CA7 : le prochain de la liste n'est jamais le contenu qui vient de finir, et un film hors liste
// propose le premier element sans etre « suivant ».
test('CA7 prochainDansListe : jamais le contenu courant ; hors liste = premier element, enListe faux', () => {
  const l = [{ cle: 'a' }, { cle: 'b' }, { cle: 'c' }]
  assert.equal(prochainDansListe(l, 'a')?.cle, 'b')
  assert.equal(prochainDansListe(l, 'c')?.cle, 'a')
  assert.equal(prochainDansListe(l, 'z')?.cle, 'a')
  assert.equal(prochainDansListe([{ cle: 'a' }], 'a'), undefined)
  assert.equal(prochainDansListe([], 'a'), undefined)
  assert.deepEqual(prochainApres(l, 'b'), { suivant: { cle: 'c' }, enListe: true })
  assert.deepEqual(prochainApres(l, 'z'), { suivant: { cle: 'a' }, enListe: false })
  assert.deepEqual(prochainApres([{ cle: 'a' }], 'a'), { suivant: undefined, enListe: true })
})

const saisons: SaisonApi[] = [
  { numero: 2, episodes: [{ id: 'iptva:21.mkv', numero: 1, titre: 'E1', extension: 'mkv', duree: 1, lecture: '/api/v1/vod/iptva:21.mkv' }] },
  {
    numero: 1,
    episodes: [
      { id: 'iptva:12.mkv', numero: 2, titre: 'E2', extension: 'mkv', duree: 1, lecture: '/api/v1/vod/iptva:12.mkv' },
      { id: 'iptva:11.mkv', numero: 1, titre: 'E1', extension: 'mkv', duree: 1, lecture: '/api/v1/vod/iptva:11.mkv' },
      { id: 'iptva:13.mkv', numero: 3, titre: 'E3', extension: '', duree: 1, lecture: '' },
    ],
  },
]

test('episode suivant : saisons dans l ordre, passage de saison, fin de serie', () => {
  assert.deepEqual(episodesOrdonnes(saisons, 'Ma serie').map((e) => e.nom), ['Ma serie — S01E01', 'Ma serie — S01E02', 'Ma serie — S02E01'])
  assert.equal(episodeApres(saisons, 'Ma serie', 'series:iptva:11.mkv')?.cle, 'series:iptva:12.mkv')
  assert.equal(episodeApres(saisons, 'Ma serie', 'series:iptva:12.mkv')?.cle, 'series:iptva:21.mkv')
  assert.equal(episodeApres(saisons, 'Ma serie', 'series:iptva:21.mkv'), undefined)
  assert.equal(episodeApres(saisons, 'Ma serie', 'series:iptva:99.mkv'), undefined)
})

test('prochain episode a regarder : premier non vu (seuil 0,9), a partir de « depuis »', () => {
  const vus = new Map([['series:iptva:11.mkv', 0.92]])
  assert.equal(prochainAVoir(saisons, 'S', vus, 0.9)?.cle, 'series:iptva:12.mkv')
  assert.equal(prochainAVoir(saisons, 'S', new Map(), 0.9, { saison: 2, episode: 1 })?.cle, 'series:iptva:21.mkv')
  assert.equal(prochainAVoir(saisons, 'S', new Map([['series:iptva:11.mkv', 1], ['series:iptva:12.mkv', 1], ['series:iptva:21.mkv', 0.95]]), 0.9), undefined)
})

// CA7 : la sonde ne parle plus en Mbit/s en premiere ligne ; le debit est un detail.
test('CA7 libelle de la sonde : trois phrases humaines, debit en detail', () => {
  assert.deepEqual(libelleDisponibilite({ etat: 'pret', debit_kbps: 0 }), { texte: '● Prêt · préparé sur le serveur', proposerAVoir: false, ton: 'pret' })
  assert.deepEqual(libelleDisponibilite({ etat: 'immediat', debit_kbps: 12000 }), { texte: 'Lecture fluide', detail: '12 Mbit/s mesurés', proposerAVoir: false, ton: 'ok' })
  assert.deepEqual(libelleDisponibilite({ etat: 'lent', debit_kbps: 2700, requis_kbps: 4400 }), {
    texte: 'Risque de coupures — préparer d’avance ?', detail: '2,7 Mbit/s mesurés pour 4,4 nécessaires', proposerAVoir: true, ton: 'lent',
  })
  assert.equal(libelleDisponibilite({ etat: 'lent', debit_kbps: 2700 })?.detail, '2,7 Mbit/s mesurés')
  assert.ok(!/Mbit/.test(libelleDisponibilite({ etat: 'lent', debit_kbps: 2700 })!.texte))
  assert.equal(libelleDisponibilite({ etat: 'inconnu', debit_kbps: 0 }), undefined)
  assert.equal(libelleDisponibilite(undefined), undefined)
})
