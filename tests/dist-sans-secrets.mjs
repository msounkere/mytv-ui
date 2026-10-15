// Greppe `dist` : aucun identifiant ni hote de fournisseur/infra ne doit etre
// dans le bundle (US-19 CA1). Usage : npm run build && node tests/dist-sans-secrets.mjs
//   STRICT=1 : les reliquats de l'ancienne API (en attente de US-20/21) echouent aussi.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

// INTERDIT dans tous les cas.
const DURS = [
  ['adresse IP privee', /\b(?:192\.168|10\.77|10\.0|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
  ['hote de production', /msocasa|tuliprox\.[a-z]|cloudflare|trycloudflare/i],
  ['port du relais', /:8901\b|:8902\b|:8099\b/],
  ['identifiants en chaine de requete', /[?&](?:username|password|user|pass|token)=/i],
  ['en-tete Authorization', /Authorization['"]?\s*:/],
  ['mot de passe en dur', /(?:mot_de_passe|password)['"]?\s*[:=]\s*['"][^'"\s]{4,}['"]/i],
  ['jeton de session en dur', /__Host-mytv|mytv=[0-9a-f]{16,}/],
]
// RELIQUATS de l'ancienne API : a disparaitre avec US-20 (lecture) et US-21 (EPG).
const RELIQUATS = [
  ['player_api.php', /player_api\.php/],
  ['xmltv.php', /xmltv\.php/],
  ['/flux/', /['"`]\/flux\//],
  ['chemin /live|movie|series/<user>/<pass>', /\/(?:live|movie|series)\/\$\{[^}]*(?:username|password)/],
]

function* fichiers(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* fichiers(p)
    else if (/\.(js|css|html|map|json)$/.test(e.name)) yield p
  }
}

let dur = 0
let reste = 0
let lus = 0
for (const f of fichiers(DIST)) {
  lus++
  const texte = fs.readFileSync(f, 'utf8')
  for (const [nom, re] of DURS) {
    const m = re.exec(texte)
    if (m) { dur++; console.log(`KO   ${nom} dans ${path.relative(DIST, f)} : ${JSON.stringify(m[0])}`) }
  }
  for (const [nom, re] of RELIQUATS) {
    if (re.test(texte)) { reste++; console.log(`${process.env.STRICT ? 'KO  ' : 'WARN'} reliquat ${nom} dans ${path.relative(DIST, f)}`) }
  }
}
if (lus === 0) { console.log('KO   dist vide : lancer npm run build'); process.exit(1) }
console.log(`${lus} fichiers lus : ${dur} secret(s), ${reste} reliquat(s) de l'ancienne API`)
process.exit(dur || (process.env.STRICT && reste) ? 1 : 0)
