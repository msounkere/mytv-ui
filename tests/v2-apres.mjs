import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
const journal = []
page.on('pageerror', (e) => journal.push('[PAGEERROR] ' + e.message.slice(0, 220)))
page.on('console', (m) => { if (m.type() === 'error') journal.push('[err] ' + m.text().slice(0, 220)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const rail = (nom) => page.locator('.rail-item', { hasText: nom }).first().click()

// ---------- FILMS ----------
await rail('Films')
await page.waitForTimeout(4000)
await page.screenshot({ path: 'captures/v2-apres-films.png' })

const sonde = () => page.evaluate(() => {
  const h1 = [...document.querySelectorAll('h1')].pop()
  const rangees = [...document.querySelectorAll('div')].filter(d => /^repeat\(/.test(d.style.gridTemplateColumns || ''))
  const scroller = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto' && d.querySelector('button[title]'))
  const spacer = scroller?.firstElementChild
  const pas = rangees.slice(0, 3).map(r => parseFloat(getComputedStyle(r.parentElement).transform.split(',')[5] || '0'))
  return {
    titre: h1?.textContent, compte: h1?.nextElementSibling?.textContent,
    pastilles: [...document.querySelectorAll('span')].filter(s => s.style.borderRadius === '13px').map(s => s.textContent),
    nRangeesDOM: rangees.length,
    nAffichesDOM: document.querySelectorAll('button[title]').length,
    colonnes: rangees[0]?.style.gridTemplateColumns,
    pasRangee: pas[1] !== undefined ? pas[1] - pas[0] : null,
    hauteurTotale: spacer?.style.height,
    defilement: scroller ? Math.round(scroller.scrollTop) : null,
  }
})
console.log('FILMS:', JSON.stringify(await sonde(), null, 1))

// ---------- Filtrage : chronométrage réel ----------
async function cliquerFiltre(nom, option) {
  await page.getByRole('button', { name: new RegExp('^' + nom) }).first().click()
  await page.waitForTimeout(350)
  await page.getByRole('option', { name: option, exact: true }).first().click()
  await page.waitForTimeout(700)
}
await cliquerFiltre('Genre', 'Action')
await page.keyboard.press('Escape')
await page.waitForTimeout(700)
await page.screenshot({ path: 'captures/v2-apres-films-filtre.png' })
console.log('APRES GENRE=Action:', JSON.stringify(await sonde(), null, 1))

await cliquerFiltre('Langue', 'Français')
await page.keyboard.press('Escape')
await page.waitForTimeout(700)
await page.screenshot({ path: 'captures/v2-apres-films-2filtres.png' })
console.log('APRES +LANGUE=Français:', JSON.stringify(await sonde(), null, 1))

// bascule
await page.getByRole('button', { name: 'Nouveautés' }).first().click()
await page.waitForTimeout(700)
console.log('APRES +Nouveautés:', JSON.stringify(await sonde(), null, 1))
await page.screenshot({ path: 'captures/v2-apres-films-bascules.png' })

// tri
await page.getByRole('radio', { name: 'Titre (A–Z)' }).first().click()
await page.waitForTimeout(700)
console.log('APRES tri titre:', JSON.stringify(await sonde(), null, 1))

const mesures = await page.evaluate(() =>
  performance.getEntriesByName('mytv:filtrage').map((m) => +m.duration.toFixed(2)))
console.log('DUREES filtrage (ms):', JSON.stringify(mesures))

// État vide : on empile jusqu'à ne plus rien trouver
await page.getByRole('button', { name: /^Pays/ }).first().click()
await page.waitForTimeout(300)
await page.locator('[role="option"]').filter({ hasText: /^Islande$/ }).first().click()
await page.waitForTimeout(300)
await page.keyboard.press('Escape')
await page.waitForTimeout(800)
await page.screenshot({ path: 'captures/v2-apres-films-vide.png' })
console.log('VIDE:', JSON.stringify(await page.evaluate(() => document.body.innerText.includes('Aucun résultat'))))

await page.getByRole('button', { name: 'Tout effacer' }).first().click()
await page.waitForTimeout(800)
console.log('APRES tout effacer:', JSON.stringify(await sonde(), null, 1))

// ---------- SÉRIES ----------
await rail('Séries')
await page.waitForTimeout(3500)
await page.screenshot({ path: 'captures/v2-apres-series.png' })
console.log('SERIES:', JSON.stringify(await sonde(), null, 1))

// ---------- DIRECT : non régression ----------
await rail('Direct')
await page.waitForTimeout(2500)
await page.screenshot({ path: 'captures/v2-apres-direct.png' })
const direct = await page.evaluate(() => {
  const aside = [...document.querySelectorAll('aside')].find(a => /catégories/.test(a.innerText))
  const lignes = aside ? aside.querySelectorAll('button[aria-expanded], button[aria-current], button[title]').length : 0
  const sec = [...document.querySelectorAll('section')].find(s => s.querySelector('h1'))
  const scroller = sec ? [...sec.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto') : null
  return {
    aside: !!aside, nLignesCat: lignes,
    titre: sec?.querySelector('h1')?.textContent,
    compteur: sec?.querySelector('h1')?.nextElementSibling?.textContent,
    nChainesDOM: scroller ? scroller.querySelectorAll('button').length : 0,
    hauteurTotale: scroller?.firstElementChild?.style.height,
  }
})
console.log('DIRECT:', JSON.stringify(direct, null, 1))

console.log('\nJOURNAL:', journal.length ? journal.join('\n') : 'aucune erreur')
await nav.close()
