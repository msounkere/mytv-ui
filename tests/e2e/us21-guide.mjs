// US-21 : grille EPG et mini-guide contre le faux serveur.
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us21-guide.mjs
import { construireHarnais, ouvrirBanc, creerVerificateur, jusqua, attendre, chaine } from './banc.mjs'

const v = creerVerificateur('US-21 guide')
await construireHarnais()

const semer = (page, n) =>
  page.evaluate((nb) => window.harnais.semer(Array.from({ length: nb }, (_, i) => {
    const num = 3000 + i
    return {
      cle: `live:${num}`, type: 'live', id: num, nom: `Chaine ${String(num).padStart(4, '0')}`,
      recherche: `chaine ${num}`, categorie: 'c1', idServeur: `iptva:${num}`,
      lecture: `/api/v1/live/${num}.m3u8`, epgId: `e${num}`,
    }
  })), n)

async function guide({ timezoneId, limites }) {
  const banc = await ouvrirBanc({ ecran: 'guide', timezoneId, limites })
  await semer(banc.page, 60)
  await banc.page.reload()
  await banc.page.waitForFunction(() => !!window.harnais)
  return banc
}

const grilles = (banc) => banc.api((r) => r.chemin === '/api/v1/epg/grille')
const ids = (r) => new URLSearchParams(r.requete).get('chaines').split(',')
const decalage = (tz, utcMs) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(utcMs))
  return `${parts.find((p) => p.type === 'hour').value}:${parts.find((p) => p.type === 'minute').value}`
}

// --- 1. Chargement : un appel pour toutes les lignes visibles ----------------------
console.log('1. ouverture du guide (Europe/Paris)')
let banc = await guide({ timezoneId: 'Europe/Paris' })
try {
  const { page } = banc
  v.ok(await jusqua(async () => (await page.locator('button[title*="Prog "]').count()) > 0, 15_000), 'des programmes sont affiches')
  const lignes = await page.locator('button[title$="— ouvrir"]').count()
  await attendre(500)
  const g = grilles(banc)
  v.info(`${lignes} lignes montees, ${g.length} appel(s) de grille`)
  v.ok(g.length >= 1 && g.length <= 2, 'un a deux appels de grille (un par bloc de temps) pour toutes les lignes visibles')
  v.ok(Math.max(...g.map((r) => ids(r).length)) >= Math.min(lignes, 8), 'les chaines visibles voyagent ensemble dans UN appel')
  v.ok(lignes > g.length * 3, `bien plus de lignes (${lignes}) que d'appels (${g.length}) : aucun appel par chaine`)
  v.ok(banc.api((r) => r.chemin.endsWith('/maintenant')).length === 0, 'aucun appel /maintenant pour la grille')
  v.ok(!banc.api().some((r) => /xmltv|player_api|\/flux\//.test(r.chemin)), 'plus de XMLTV ni d\'ancien service')
  v.ok((await page.getByText(/Charger le guide|Recharger le guide/).count()) === 0, 'plus de bouton « Charger le guide » (le worker XMLTV a disparu)')

  // Fuseau : le titre porte l'heure UTC du programme, l'etiquette doit etre locale.
  const titre = await page.locator('button[title*="Prog "]').first().getAttribute('title')
  const m = /^(\d\d:\d\d) – (\d\d:\d\d) · Prog \S+ (\d\d)hUTC/.exec(titre ?? '')
  v.ok(!!m, `titre de cellule lisible (${titre?.split('\n')[0]})`)
  if (m) {
    const maintenant = Date.now()
    const candidats = [-1, 0, 1].map((j) => Date.UTC(new Date(maintenant).getUTCFullYear(), new Date(maintenant).getUTCMonth(), new Date(maintenant).getUTCDate() + j, Number(m[3])))
    const attendu = candidats.map((t) => decalage('Europe/Paris', t))
    v.ok(attendu.includes(m[1]), `programme de ${m[3]}h UTC affiche en heure de Paris : ${m[1]}`)
    if (Number(m[3]) !== Number(m[1].slice(0, 2))) v.info(`(${m[3]}h UTC ≠ ${m[1]} : ce n'est pas l'UTC)`)
    else v.ok(false, "l'heure affichee est l'heure UTC")
  }

  // --- 2. Fenetre glissante -------------------------------------------------------------
  console.log('2. fenetre glissante')
  const avant = grilles(banc).length
  await page.getByRole('button', { name: '3 h ⏩' }).click()
  v.ok(await jusqua(() => grilles(banc).length > avant, 8000), 'avancer de 3 h demande le nouveau bloc')
  const apresAvance = grilles(banc).length
  await page.getByRole('button', { name: '⏪ 3 h' }).click()
  await attendre(800)
  v.ok(grilles(banc).length === apresAvance, 'revenir en arriere ne redemande rien (bloc deja en cache)')
  const urls = grilles(banc).map((r) => r.requete)
  v.ok(new Set(urls).size === urls.length, 'aucun appel de grille identique envoye deux fois')
  await page.getByRole('button', { name: 'Maintenant' }).click()
  await attendre(500)
  v.ok(grilles(banc).length === apresAvance, '« Maintenant » : toujours en cache')

  // --- 3. Defilement vertical : seules les nouvelles lignes ---------------------------------
  console.log('3. defilement vertical')
  const vus = new Set(grilles(banc).flatMap(ids))
  await page.evaluate(() => {
    const z = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 200 && getComputedStyle(d).overflowY !== 'visible')
    if (z) z.scrollTop = 1800
  })
  v.ok(await jusqua(() => new Set(grilles(banc).flatMap(ids)).size > vus.size, 8000), 'de nouvelles chaines sont demandees apres defilement')
  const nouvelles = grilles(banc).slice(apresAvance).flatMap(ids)
  v.ok(nouvelles.every((i) => !vus.has(i)), 'et seulement celles qu on n a pas encore (aucune chaine redemandee)')

  v.ok(banc.externes.length === 0, `aucune requete hors 127.0.0.1 (${banc.externes.length})`)
  v.info(`erreurs de page : ${banc.erreursPage.length}`)
} finally {
  await banc.fermer()
}

// --- 4. Fuseau decale de 45 minutes ---------------------------------------------------------
console.log('4. fuseau Asia/Kathmandu (UTC+5:45)')
banc = await guide({ timezoneId: 'Asia/Kathmandu' })
try {
  const { page } = banc
  await jusqua(async () => (await page.locator('button[title*="Prog "]').count()) > 0, 15_000)
  const regle = await page.evaluate(() =>
    [...document.querySelectorAll('span.num.tertiaire')].map((s) => s.textContent?.trim() ?? '').filter((t) => /^\d\d:\d\d$/.test(t)))
  v.ok(regle.length >= 4, `graduations de la regle horaire (${regle.slice(0, 4).join(' ')} …)`)
  v.ok(regle.every((t) => /:(00|30)$/.test(t)), 'toutes les graduations tombent sur la demi-heure LOCALE')
  const titre = await page.locator('button[title*="Prog "]').first().getAttribute('title')
  v.ok(/^\d\d:45 – \d\d:45/.test(titre ?? ''), `un programme UTC pile s'affiche a :45 a Katmandou (${titre?.split('\n')[0]})`)
} finally {
  await banc.fermer()
}

// --- 5. Limites du serveur respectees ---------------------------------------------------------
console.log('5. limites du serveur (5 chaines par appel, fenetre 3 h)')
banc = await guide({ timezoneId: 'Europe/Paris', limites: { pagination_max: 5, grille_fenetre: 3 * 3600 } })
try {
  const { page } = banc
  await jusqua(async () => (await page.locator('button[title*="Prog "]').count()) > 0, 15_000)
  await attendre(800)
  const g = grilles(banc)
  v.ok(g.length > 1, `decoupe en plusieurs appels (${g.length})`)
  v.ok(g.every((r) => ids(r).length <= 5), 'jamais plus de 5 chaines par appel')
  v.ok(g.every((r) => {
    const q = new URLSearchParams(r.requete)
    return Date.parse(q.get('a')) - Date.parse(q.get('de')) <= 3 * 3600_000
  }), 'jamais plus de 3 h par appel')
  v.ok(banc.api((r) => r.status === 400).length === 0, 'aucun 400 du serveur')
} finally {
  await banc.fermer()
}

// --- 6. Mini-guide et programme en cours dans le lecteur -----------------------------------------
console.log('6. mini-guide du lecteur')
banc = await ouvrirBanc({ ecran: 'lecture', timezoneId: 'Europe/Paris' })
try {
  const { page } = banc
  const voisines = Array.from({ length: 12 }, (_, i) => chaine(4001 + i))
  await page.evaluate((e) => window.harnais.semer(e), voisines)
  await page.evaluate((e) => window.harnais.ouvrir(e), voisines[4])
  v.ok(await jusqua(() => banc.api((r) => r.chemin.endsWith('/maintenant')).length >= 1, 10_000), 'le programme de la chaine regardee vient de /epg/chaines/{id}/maintenant')
  v.ok(banc.api((r) => r.chemin.endsWith('/maintenant'))[0].chemin.includes('iptva:4005'), 'pour la bonne chaine (identifiant API)')
  v.ok(await jusqua(async () => /Journal iptva:4005/.test(await page.evaluate(() => document.body.innerText)), 8000), '« en cours » affiche')
  v.ok(await jusqua(async () => /Film iptva:4005/.test(await page.evaluate(() => document.body.innerText)), 8000), '« suivant » affiche')
  const apres = banc.api((r) => r.chemin.endsWith('/maintenant')).length
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('g')
  v.ok(await jusqua(async () => (await page.locator('[role="dialog"][aria-label="Mini-guide"]').count()) > 0, 5000), 'mini-guide ouvert')
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/epg/grille').length >= 1, 5000), 'ses lignes viennent de /epg/grille')
  await attendre(600)
  const gr = banc.api((r) => r.chemin === '/api/v1/epg/grille')
  v.ok(gr.length <= 2, `UN appel de grille (par bloc) pour toutes ses lignes (${gr.length})`)
  v.ok(Math.max(...gr.map((r) => new URLSearchParams(r.requete).get('chaines').split(',').length)) >= 7, 'avec les huit chaines ensemble')
  v.ok(banc.api((r) => r.chemin.endsWith('/maintenant')).length === apres, 'aucun /maintenant de plus pour les lignes du mini-guide')
  v.ok(await jusqua(async () => /Prog iptva:400\d \d\dhUTC/.test(await page.evaluate(() => document.body.innerText)), 5000), 'les programmes des voisines sont affiches')
  v.ok(banc.externes.length === 0, `aucune requete hors 127.0.0.1 (${banc.externes.length})`)
} finally {
  await banc.fermer()
}
v.termine()
