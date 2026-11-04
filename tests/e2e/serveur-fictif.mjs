// Faux serveur mytv pour les tests de parcours de l'interface. Il parle le
// contrat /api/v1 (lecture, EPG, diagnostic) et sert l'interface construite. Il
// n'ecoute QUE sur 127.0.0.1, sur un port que le systeme choisit, et ne
// contacte jamais personne : aucun fournisseur, aucun hote externe.
//
// Les scenarios se choisissent par l'identifiant du contenu :
//   chaine 1001  normale                       film iptva:100  lecture directe (Range)
//   chaine 1002  503 deux fois, puis normale   film iptva:101  remux (Accept-Ranges: none, ?t=)
//   chaine 1003  503 sans fin                  film iptva:102  415 format_non_lisible
//   chaine 1004  401                           film iptva:103  503 une fois, puis normal
//   chaine 1005  502 une fois, puis normale    film iptva:104  401
//   chaine 1006  502 fournisseur_compte_invalide (expiration connue), jamais de reprise
//   chaine 1007  502 fournisseur_adresse_refusee
//   chaine 1008  502 fournisseur_compte_invalide sans date          film iptva:105  idem (HEAD sans corps)
//   chaine 1009  les deux premiers segments passent, puis le compte « expire » : 502 fournisseur_compte_invalide
//   (US-32) chaine 1101  415 format_hevc_non_lisible (X-Mytv-Mode: refus)
//           chaine 1102  X-Mytv-Mode: audio, playlist lente (5 s : demarrage d'ffmpeg)
//           chaine 1103  segments illisibles (fragParsingError) sauf avec ?forcer=audio
//           chaine 1104  segments illisibles sauf avec ?forcer=video
//           chaine 1105  segments illisibles quoi qu'on force (abandon apres audio puis video)
//   (US-35) film iptva:106  503 compte_utilise_ailleurs (Retry-After 2) deux fois, puis normal
//           chaine 1201  503 compte_utilise_ailleurs (Retry-After 2) trois fois, puis normale
//           chaine 1202  503 compte_occupe (Retry-After 2) deux fois, puis normale
//           chaine 1203  503 compte_utilise_par_mytv avec Retry-After 700 (> plafond : abandon d'emblee)
//           chaine 1204  coupure : les segments 0-1 passent, puis 403 ; ensuite la playlist repond
//                        503 compte_utilise_ailleurs (Retry-After 2) deux fois, puis la place est libre
//   (US-25 : comme le vrai serveur, le code est aussi dans l'en-tete X-Mytv-Erreur)
//   (coupures) film iptva:107  remux annonce 120 s mais corps TRONQUE a 3 s (le serveur coupe quand son remux casse)
//              film iptva:108  remux SANS X-Mytv-Duree (duree inconnue)
//   (US-39) chaines 1301, 1302, 1303  variantes d'une meme chaine (HD, FHD, 4K), normales ; 1302 repond sa playlist en 400 ms
//   (US-38 CA4) `?qualite=eco` ou `X-Mytv-Qualite: eco` sur une playlist ou un film : `X-Mytv-Mode: video`
//               (reencodage a debit reduit), et le journal retient `qualite` (requete) et `qualiteEntete` (en-tete)
//   (US-40/41) `POST /api/v1/cast/lien` { lecture, parametres } -> { url: /api/v1/cast/<jeton>/..., expire } ;
//              `GET|HEAD /api/v1/cast/<jeton>/live/<chaine>.m3u8|/seg/...|/vod/<id>` servis SANS cookie comme les
//              routes normales (segments reecrits sous le prefixe signe) ; 401 jeton_invalide sinon ; OPTIONS 204 CORS.
//              Le journal retient `corps` (lecture, parametres) de la demande de lien et `cookie` (presence).
//   (US-43)    `GET /api/v1/profil/a_voir` -> { elements } poses par `POST /__a_voir` (etat de preparation simule) ;
//              `PUT|DELETE /api/v1/profil/a_voir[/{id}]` -> 204, journalises ; `GET /api/v1/vod/{id}/disponibilite`
//              -> reponse posee par `POST /__disponibilite` ({ id, reponse }), sinon { etat: immediat, debit_kbps: 12000 } ;
//              `requis_kbps` (debit du fichier) toujours present, 8000 par defaut.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { mp3, segmentTs } from './media.mjs'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
}

const DUREE_SEGMENT = 2
const NB_SEGMENTS = 6
const FILM = mp3(20)
/** Film « tronque » : le serveur annonce 120 s mais ferme apres 3 s de corps. */
const FILM_TRONQUE = mp3(3)

export async function demarrerServeur({ dossier, limites = { pagination_max: 200, grille_fenetre: 172800 } } = {}) {
  /** Toutes les requetes recues, dans l'ordre. */
  const journal = []
  /** Compteurs de scenarios (503 n fois...), remis a zero par /__reinit. */
  let etat = new Map()
  const evenements = []
  const fois = (cle) => {
    const n = (etat.get(cle) ?? 0) + 1
    etat.set(cle, n)
    return n
  }

  const json = (res, statut, corps, entetes = {}) => {
    res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', ...entetes })
    res.end(JSON.stringify(corps))
  }
  const erreur = (res, statut, code, message, entetes = {}) => json(res, statut, { code, message }, entetes)
  const EXPIRATION = '2026-10-01T00:00:00Z'
  /** 502 « fournisseur » comme le serveur : corps {code, message[, expiration]} + en-tetes. */
  const refus = (res, code, avecDate = true) => {
    const message = code === 'fournisseur_compte_invalide' ? 'abonnement expire ou refuse par le fournisseur' : 'adresse refusee'
    const date = code === 'fournisseur_compte_invalide' && avecDate ? EXPIRATION : undefined
    json(res, 502, { code, message, ...(date ? { expiration: date } : {}) }, { 'X-Mytv-Erreur': code, ...(date ? { 'X-Mytv-Expiration': date } : {}) })
  }

  /** Mode qu'on sert a un segment : celui de la derniere playlist demandee pour la chaine. */
  const modeChaine = new Map()
  const lisible = (chaine) => {
    const m = modeChaine.get(chaine)
    if (chaine === '1103') return m === 'audio'
    if (chaine === '1104') return m === 'video'
    return chaine !== '1105'
  }

  /** US-43 : liste « À voir » rendue telle quelle, et reponses de la sonde par identifiant. */
  let aVoir = []
  const disponibilite = new Map()
  const lireCorps = (req) => new Promise((ok) => {
    const morceaux = []
    req.on('data', (c) => morceaux.push(c))
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(morceaux).toString('utf8') || 'null')) } catch { ok(undefined) } })
  })

  /** Liens de diffusion emis (US-40 CA1) : jeton -> { ressource, expire }. */
  const liensCast = new Map()
  const DUREE_CAST_MS = 12 * 3_600_000

  function playlist(chaine, prefixe = '/api/v1') {
    // Segments STABLES d'une playlist a l'autre : meme jeton pour meme numero.
    // Sous le prefixe signe, les segments restent sous ce prefixe (US-40 CA3).
    const lignes = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${DUREE_SEGMENT}`, '#EXT-X-MEDIA-SEQUENCE:0']
    for (let i = 0; i < NB_SEGMENTS; i++) {
      lignes.push(`#EXTINF:${DUREE_SEGMENT}.000,`, `${prefixe}/live/${chaine}/seg/jeton${i}`)
    }
    lignes.push('#EXT-X-ENDLIST')
    return lignes.join('\n') + '\n'
  }

  function grille(chaines, de, a) {
    // Un programme par heure UTC, titre = heure UTC : la page doit l'afficher en heure locale.
    const out = {}
    for (const id of chaines) {
      const liste = []
      for (let t = Math.floor(de / 3_600_000) * 3_600_000; t < a; t += 3_600_000) {
        if (t + 3_600_000 <= de) continue
        liste.push({
          debut: new Date(t).toISOString(), fin: new Date(t + 3_600_000).toISOString(),
          titre: `Prog ${id} ${new Date(t).toISOString().slice(11, 13)}hUTC`,
        })
      }
      out[id] = liste
    }
    return out
  }

  function repondreFilm(req, res, url, id) {
    const tete = req.method === 'HEAD'
    const numero = id.replace(/^iptva:/, '')
    if (numero === '104') return erreur(res, 401, 'non_authentifie', 'session expiree')
    if (numero === '102') return erreur(res, 415, 'format_non_lisible', 'HEVC')
    if (numero === '105') {
      // Un HEAD n'a pas de corps : seuls les en-tetes disent pourquoi.
      if (tete) return res.writeHead(502, { 'X-Mytv-Erreur': 'fournisseur_compte_invalide', 'X-Mytv-Expiration': EXPIRATION }), res.end()
      return refus(res, 'fournisseur_compte_invalide')
    }
    if (numero === '106' && fois('vod106') <= 2)
      return erreur(res, 503, 'compte_utilise_ailleurs', 'occupe', { 'Retry-After': '2', 'X-Mytv-Erreur': 'compte_utilise_ailleurs' })
    if (numero === '103' && fois('vod103') === 1) return erreur(res, 503, 'place_occupee', 'occupe', { 'Retry-After': '1' })
    const eco = url.searchParams.get('qualite') === 'eco' || req.headers['x-mytv-qualite'] === 'eco'
    const remux = numero === '101' || numero === '107' || numero === '108' || eco
    const entetes = { 'Content-Type': remux ? 'video/mp4' : 'audio/mpeg', 'Cache-Control': 'private, no-store' }
    if (remux) {
      const duree = numero === '108' ? {} : { 'X-Mytv-Duree': '120' }
      res.writeHead(200, { ...entetes, 'Accept-Ranges': 'none', ...duree, 'X-Mytv-Mode': eco ? 'video' : 'remux' })
      return res.end(tete ? undefined : numero === '107' ? FILM_TRONQUE : FILM)
    }
    const plage = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    if (plage) {
      const debut = plage[1] === '' ? Math.max(0, FILM.length - Number(plage[2])) : Number(plage[1])
      const fin = plage[1] === '' || plage[2] === '' ? FILM.length - 1 : Math.min(Number(plage[2]), FILM.length - 1)
      if (debut >= FILM.length) return erreur(res, 416, 'plage_invalide', 'hors fichier')
      res.writeHead(206, { ...entetes, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${debut}-${fin}/${FILM.length}`, 'Content-Length': fin - debut + 1 })
      return res.end(tete ? undefined : FILM.subarray(debut, fin + 1))
    }
    res.writeHead(200, { ...entetes, 'Accept-Ranges': 'bytes', 'Content-Length': FILM.length })
    return res.end(tete ? undefined : FILM)
  }

  const serveur = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const chemin = decodeURIComponent(url.pathname)
    const entree = {
      methode: req.method, chemin, requete: url.search, t: Date.now(), cap: req.headers['x-mytv-capacites'],
      qualite: url.searchParams.get('qualite') ?? undefined, qualiteEntete: req.headers['x-mytv-qualite'],
      cookie: req.headers.cookie !== undefined,
    }
    journal.push(entree)

    if (chemin === '/__journal') return json(res, 200, journal)
    if (chemin === '/__evenements') return json(res, 200, evenements)
    if (chemin === '/__reinit') {
      journal.length = 0; evenements.length = 0; etat = new Map(); aVoir = []; disponibilite.clear()
      return json(res, 200, { ok: true })
    }
    if (chemin === '/__a_voir' && req.method === 'POST') return void lireCorps(req).then((c) => { aVoir = c?.elements ?? []; json(res, 200, { ok: true }) })
    if (chemin === '/__disponibilite' && req.method === 'POST')
      return void lireCorps(req).then((c) => { if (c?.reponse) disponibilite.set(c.id, c.reponse); else disponibilite.delete(c?.id); json(res, 200, { ok: true }) })

    if (chemin.startsWith('/api/v1/')) {
      let r = chemin.slice('/api/v1'.length)
      if (r === '/compte') return json(res, 200, { session: { id: 's', identifiant: 'test' }, profils: [], limites })
      let m
      // --- Diffusion par lien signe (US-40) ----------------------------------------
      if (r === '/cast/lien') {
        if (req.method !== 'POST') return erreur(res, 405, 'methode_refusee', 'POST')
        const morceaux = []
        req.on('data', (c) => morceaux.push(c))
        req.on('end', () => {
          let corps
          try { corps = JSON.parse(Buffer.concat(morceaux).toString('utf8')) } catch { return erreur(res, 400, 'requete_invalide', 'corps') }
          entree.corps = corps
          const lecture = typeof corps?.lecture === 'string' ? corps.lecture : ''
          const cible = /^\/api\/v1\/(live\/[A-Za-z0-9_-]+\.m3u8|vod\/[^/?#]+)$/.exec(lecture)
          if (!cible) return erreur(res, 400, 'requete_invalide', 'lecture inconnue')
          const parametres = typeof corps.parametres === 'string' ? corps.parametres : ''
          if (parametres && !/^(cap=[a-z0-9,]*|qualite=(auto|eco)|t=[0-9]+)(&(cap=[a-z0-9,]*|qualite=(auto|eco)|t=[0-9]+))*$/.test(parametres))
            return erreur(res, 400, 'requete_invalide', 'parametres')
          const jeton = 'cast' + Math.random().toString(36).slice(2, 12)
          const expire = new Date(Date.now() + DUREE_CAST_MS).toISOString()
          liensCast.set(jeton, { ressource: cible[1], expire })
          json(res, 200, { url: `/api/v1/cast/${jeton}/${cible[1]}${parametres ? '?' + parametres : ''}`, expire })
        })
        return
      }
      let prefixe = '/api/v1'
      if ((m = /^\/cast\/([^/]+)(\/.*)$/.exec(r))) {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'Range' })
          return res.end()
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') return erreur(res, 405, 'methode_refusee', 'GET, HEAD')
        const lien = liensCast.get(m[1])
        const reste = m[2]
        const autorise = lien && (reste === '/' + lien.ressource || reste.startsWith('/' + lien.ressource.replace(/\.m3u8$/, '') + '/seg/'))
        if (!autorise) return erreur(res, 401, 'jeton_invalide', 'jeton de diffusion absent, expire ou etranger')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Expose-Headers', 'X-Mytv-Mode, X-Mytv-Duree, X-Mytv-Codec')
        prefixe = `/api/v1/cast/${m[1]}`
        r = reste
      }
      if ((m = /^\/live\/([A-Za-z0-9_-]+)\.m3u8$/.exec(r))) {
        const chaine = m[1]
        if (chaine === '1004') return erreur(res, 401, 'non_authentifie', 'session expiree')
        if (chaine === '1006') return refus(res, 'fournisseur_compte_invalide')
        if (chaine === '1007') return refus(res, 'fournisseur_adresse_refusee')
        if (chaine === '1008') return refus(res, 'fournisseur_compte_invalide', false)
        const forcer = url.searchParams.get('forcer') ?? undefined
        if (chaine === '1101')
          return erreur(res, 415, 'format_hevc_non_lisible', 'HEVC 3840x2160', { 'X-Mytv-Erreur': 'format_hevc_non_lisible', 'X-Mytv-Mode': 'refus' })
        if (/^110[345]$/.test(chaine)) modeChaine.set(chaine, forcer)
        const occupe = (code, ra) => erreur(res, 503, code, 'occupe', { 'Retry-After': String(ra), 'X-Mytv-Erreur': code })
        if (chaine === '1201' && fois('live1201') <= 3) return occupe('compte_utilise_ailleurs', 2)
        if (chaine === '1202' && fois('live1202') <= 2) return occupe('compte_occupe', 2)
        if (chaine === '1203') return occupe('compte_utilise_par_mytv', 700)
        if (chaine === '1204' && etat.get('coupe1204')) {
          if (fois('live1204b') <= 2) return occupe('compte_utilise_ailleurs', 2)
          etat.set('coupe1204', false)
        }
        if (chaine === '1003') return erreur(res, 503, 'place_occupee', 'occupe', { 'Retry-After': '1' })
        if (chaine === '1002' && fois('live1002') <= 2) return erreur(res, 503, 'place_occupee', 'occupe', { 'Retry-After': '1' })
        if (chaine === '1005' && fois('live1005') === 1) return erreur(res, 502, 'amont', 'amont indisponible')
        const eco = url.searchParams.get('qualite') === 'eco' || req.headers['x-mytv-qualite'] === 'eco'
        const mode = eco ? 'video' : forcer ?? (chaine === '1102' ? 'audio' : 'direct')
        const servir = () => {
          res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store', 'X-Mytv-Mode': mode })
          res.end(playlist(chaine, prefixe))
        }
        return chaine === '1102' ? void setTimeout(servir, 5000) : chaine === '1302' ? void setTimeout(servir, 400) : servir()
      }
      if ((m = /^\/live\/([A-Za-z0-9_-]+)\/seg\/jeton(\d+)$/.exec(r))) {
        if (m[1] === '1204' && etat.get('coupe1204') !== false && Number(m[2]) >= 2) {
          // Le « nouvel occupant » arrive 3 s apres le debut : la lecture a deja donne des images.
          if (!etat.has('debut1204')) etat.set('debut1204', Date.now())
          const reste = etat.get('debut1204') + 3000 - Date.now()
          const refuser = () => { etat.set('coupe1204', true); res.writeHead(403); res.end() }
          return reste > 0 ? void setTimeout(refuser, reste) : refuser()
        }
        if (m[1] === '1009' && Number(m[2]) >= 2) return refus(res, 'fournisseur_compte_invalide')
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Cache-Control': 'no-store' })
        if (!lisible(m[1])) return res.end(Buffer.alloc(5000, 0x41))
        return res.end(segmentTs(Number(m[2]), DUREE_SEGMENT))
      }
      if ((m = /^\/live\/([A-Za-z0-9_-]+)\/fin$/.exec(r)) && req.method === 'POST') {
        res.writeHead(204)
        return res.end()
      }
      // US-43 : liste « À voir » et sonde de disponibilite.
      if (r === '/profil/a_voir' && req.method === 'GET') return json(res, 200, { elements: aVoir, budget: { utilise: 0, total: 10737418240 } })
      // Lot 10 (US-44 CA3) : nouvelle tentative, journalisee, 204.
      if ((m = /^\/profil\/a_voir\/(.+)\/reessayer$/.exec(r)) && req.method === 'POST') { res.writeHead(204); return res.end() }
      if (r === '/profil/a_voir' && req.method === 'PUT') return void lireCorps(req).then((c) => { entree.corps = c; res.writeHead(204); res.end() })
      if ((m = /^\/profil\/a_voir\/(.+)$/.exec(r)) && (req.method === 'PUT' || req.method === 'DELETE'))
        return void lireCorps(req).then((c) => { entree.corps = c; res.writeHead(204); res.end() })
      if ((m = /^\/vod\/([^/]+)\/disponibilite$/.exec(r)) && req.method === 'GET')
        return json(res, 200, { mesure: new Date().toISOString(), requis_kbps: 8000, ...(disponibilite.get(m[1]) ?? { etat: 'immediat', debit_kbps: 12000 }) })
      if ((m = /^\/vod\/(.+)$/.exec(r)) && (req.method === 'GET' || req.method === 'HEAD')) return repondreFilm(req, res, url, m[1])
      if (r === '/epg/grille') {
        const chaines = (url.searchParams.get('chaines') ?? '').split(',').filter(Boolean)
        const de = Date.parse(url.searchParams.get('de') ?? '')
        const a = Date.parse(url.searchParams.get('a') ?? '')
        if (!chaines.length || Number.isNaN(de) || Number.isNaN(a) || a <= de) return erreur(res, 400, 'requete_invalide', 'plage')
        if (chaines.length > limites.pagination_max) return erreur(res, 400, 'requete_invalide', 'trop de chaines')
        return json(res, 200, { chaines: grille(chaines, de, a) })
      }
      if ((m = /^\/epg\/chaines\/([^/]+)\/maintenant$/.exec(r))) {
        const t = Math.floor(Date.now() / 3_600_000) * 3_600_000
        return json(res, 200, {
          courant: { debut: new Date(t).toISOString(), fin: new Date(t + 3_600_000).toISOString(), titre: `Journal ${m[1]}` },
          suivant: { debut: new Date(t + 3_600_000).toISOString(), fin: new Date(t + 7_200_000).toISOString(), titre: `Film ${m[1]}` },
        })
      }
      if (r === '/diagnostic/evenements' && req.method === 'POST') {
        const morceaux = []
        req.on('data', (c) => morceaux.push(c))
        req.on('end', () => {
          try {
            const corps = JSON.parse(Buffer.concat(morceaux).toString('utf8'))
            evenements.push(...corps.evenements.map((e) => ({ ...e, __appareil: corps.appareil })))
            json(res, 200, { recus: corps.evenements.length, ignores: 0 })
          } catch {
            erreur(res, 400, 'requete_invalide', 'corps')
          }
        })
        return
      }
      return erreur(res, 404, 'introuvable', r)
    }

    // Tout le reste : l'interface construite.
    if (!dossier) return erreur(res, 404, 'introuvable', chemin)
    let fichier = normalize(join(dossier, chemin === '/' ? 'index.html' : chemin))
    if (!fichier.startsWith(dossier)) return erreur(res, 403, 'interdit', 'chemin')
    if (!existsSync(fichier) || statSync(fichier).isDirectory()) fichier = join(dossier, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] ?? 'application/octet-stream' })
    return res.end(readFileSync(fichier))
  })

  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok))
  const { port } = serveur.address()
  return {
    port,
    origine: `http://127.0.0.1:${port}`,
    journal: () => journal,
    evenements: () => evenements,
    reinit: () => { journal.length = 0; evenements.length = 0; etat = new Map() },
    fermer: () => new Promise((ok) => { serveur.closeAllConnections?.(); serveur.close(ok) }),
  }
}
