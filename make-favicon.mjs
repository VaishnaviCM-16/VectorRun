import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const output = new URL('../assets/share/favicon.png', import.meta.url)
mkdirSync(new URL('../assets/share/', import.meta.url), { recursive: true })
const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:64px;height:64px;background:transparent}</style></head><body>${svg}</body></html>`)
  await page.screenshot({ path: output.pathname, omitBackground: true })
} finally {
  await browser.close()
}
console.log(`Wrote ${output.pathname}`)
