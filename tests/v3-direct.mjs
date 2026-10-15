import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
const journal = []
page.on('pageerror', (e) => journal.push('[PAGEERROR] ' + e.message.slice(0, 220)))
page.on('console', (m) => { if (m.type() === 'error') journal.push('[err] ' + m.text().slice(0, 200)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
console.log('EPG en base :', JSON.stringify(await page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('mytv-epg'); q.onsuccess = () => r(q.result) })
  if (!d.objectStoreNames.contains('programmes')) return { programmes: 0, chaines: 0 }
  const c = (s) => new Promise((r) => { const q = d.transaction(s).objectStore(s).count(); q.onsuccess = () => r(q.result) })
  return { programmes: await c('programmes'), chaines: await c('chaines') }
})))

await page.locator('.rail-item', { hasText: 'Direct' }).first().click()
await page.waitForTimeout(3000)
await page.screenshot({ path: 'captures/v3-direct-liste.png' })

const sonde = () => page.evaluate(() => {
  const aside = document.querySelector('aside[aria-label="Catégories"]')
  const asideScroll = aside ? [...aside.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto') : null
  const sec = [...document.querySelectorAll('section')].find(s => s.querySelector('h1'))
  const zone = sec ? [...sec.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto') : null
  const rangees = sec ? [...sec.querySelectorAll('div')].filter(d => /^repeat\(/.test(d.style.gridTemplateColumns||'')) : []
  return {
    titre: sec?.querySelector('h1')?.textContent,
    compte: sec?.querySelector('h1')?.nextElementSibling?.textContent,
    catsDOM: asideScroll ? asideScroll.querySelectorAll('div[style*="34px"]').length : 0,
    catsHauteur: asideScroll?.firstElementChild?.style.height,
    sections: aside ? [...aside.querySelectorAll('div')].filter(d => d.style.textTransform === 'uppercase').map(d => d.textContent) : [],
    epingles: aside ? aside.querySelectorAll('button[aria-pressed="true"]').length : 0,
    lignesDOM: zone ? zone.querySelectorAll('button[title]').length : 0,
    hauteurTotale: zone?.firstElementChild?.style.height,
    rangeesDOM: rangees.length,
    cols: rangees[0]?.style.gridTemplateColumns,
    avecProgramme: zone ? [...zone.querySelectorAll('button[title]')].filter(b => /\d\d:\d\d – \d\d:\d\d/.test(b.innerText)).length : 0,
  }
})
console.log('LISTE  :', JSON.stringify(await sonde()))

// Recherche de catégorie
await page.getByPlaceholder('Rechercher une catégorie').fill('sport')
await page.waitForTimeout(800)
await page.screenshot({ path: 'captures/v3-direct-recherche.png' })
console.log('RECH   :', JSON.stringify(await page.evaluate(() => {
  const aside = document.querySelector('aside[aria-label="Catégories"]')
  return { compte: aside.querySelector('.num')?.textContent,
    premieres: [...aside.querySelectorAll('button[title]')].slice(0, 5).map(b => b.title) }
})))

// Épingle sur la première catégorie trouvée
const epingle = page.locator('button[aria-label^="Épingler"]').first()
const nomEpingle = await epingle.getAttribute('aria-label')
await epingle.click()
await page.waitForTimeout(700)
await page.getByLabel('Effacer la recherche').click()
await page.waitForTimeout(900)
await page.screenshot({ path: 'captures/v3-direct-epingle.png' })
console.log('ÉPINGLE:', nomEpingle, '→', JSON.stringify(await page.evaluate(() => {
  const aside = document.querySelector('aside[aria-label="Catégories"]')
  const scroll = [...aside.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto')
  return { sections: [...aside.querySelectorAll('div')].filter(d => d.style.textTransform === 'uppercase').map(d => d.textContent),
    tete: [...scroll.querySelectorAll('button[title]')].slice(0, 3).map(b => b.title),
    posees: aside.querySelectorAll('button[aria-pressed="true"]').length }
})))

// Mode Cartes
await page.getByRole('radio', { name: 'Cartes' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'captures/v3-direct-cartes.png' })
console.log('CARTES :', JSON.stringify(await sonde()))

// Persistance des épingles : rechargement complet
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.locator('.rail-item', { hasText: 'Direct' }).first().click()
await page.waitForTimeout(2500)
console.log('APRÈS RECHARGEMENT :', JSON.stringify(await page.evaluate(() => {
  const aside = document.querySelector('aside[aria-label="Catégories"]')
  return { posees: aside.querySelectorAll('button[aria-pressed="true"]').length,
    sections: [...aside.querySelectorAll('div')].filter(d => d.style.textTransform === 'uppercase').map(d => d.textContent) }
})))

// Guide TV = raccourci vers l'écran Guide
await page.getByRole('radio', { name: 'Guide TV' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'captures/v3-direct-guide.png' })
console.log('GUIDE  :', JSON.stringify(await page.evaluate(() => ({
  fil: document.querySelector('h1')?.textContent,
  grille: !!document.body.innerText.match(/Maintenant|guide/i),
}))))

console.log('\nJOURNAL:', journal.length ? journal.join('\n') : 'aucune erreur')
await nav.close()
