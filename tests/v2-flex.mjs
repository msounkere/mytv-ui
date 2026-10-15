import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForTimeout(6000)
const m = await page.evaluate(() => {
  const sc = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300)
  const secs = [...sc.firstElementChild.children]
  const f = (el,k) => { const c = getComputedStyle(el); const r=el.getBoundingClientRect()
    return [k, {w:+r.width.toFixed(1),h:+r.height.toFixed(1),flex:c.flex,minW:c.minWidth,width:c.width,ai:c.alignItems,ss:c.scrollSnapType||'-'}] }
  const o = []
  o.push(f(secs[0],'hero'))
  o.push(['heroStyles', {h:getComputedStyle(secs[0]).height, ar:getComputedStyle(secs[0]).aspectRatio, maxH:getComputedStyle(secs[0]).maxHeight, minH:getComputedStyle(secs[0]).minHeight}])
  for (const [i,n] of [[1,'reprise'],[2,'chaine'],[3,'direct'],[4,'affiche'],[7,'favori']]) {
    const piste = secs[i].children[1]
    o.push(f(piste, n+'.piste'))
    o.push(f(piste.children[0], n+'.carte0'))
    o.push([n+'.nb', piste.children.length])
  }
  // badges affiche
  const aff = secs[4].children[1].children[0]
  const med = aff.querySelector('div > div')
  const bad = [...med.children]
  o.push(['affiche.medChildren', bad.length])
  bad.forEach((b,i)=>{ const c=getComputedStyle(b); const r=b.getBoundingClientRect()
    o.push(['aff.med'+i, {w:+r.width.toFixed(1),h:+r.height.toFixed(1),pos:c.position,ins:[c.top,c.right,c.bottom,c.left].join('/'),bg:c.backgroundColor,fs:c.fontSize,lh:c.lineHeight,pad:c.padding,br:c.borderRadius,col:c.color,txt:(b.innerText||'').slice(0,20)}])})
  // sous-titre affiche
  const bas = aff.children[0].children[1]
  o.push(f(bas,'aff.bas'))
  ;[...bas.children].forEach((b,i)=>{const c=getComputedStyle(b);o.push(['aff.bas'+i,{fs:c.fontSize,lh:c.lineHeight,fw:c.fontWeight,col:c.color,txt:(b.innerText||'').slice(0,24)}])})
  return o
})
for (const [k,v] of m) console.log(k.padEnd(20), JSON.stringify(v))
await nav.close()
