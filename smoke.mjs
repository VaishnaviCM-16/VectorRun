// End-to-end browser smoke test for VECTOR//RUN. Builds must already exist in dist/.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
let context
const errors = []
let stage = 'startup'
const guard = setTimeout(() => fail('timed out'), 120_000)

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await context?.close().catch(() => {})
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}
async function openGame(browserContext) {
  await browserContext.route('**/manus-storage/game/sha256/7d6c344f6b5855f6aff42c4f647db5d8483aa2b3b193bf3c9e3bf45a80089ca1.glb', route => route.fulfill({ path: 'assets/models/vector_car.glb', contentType: 'model/gltf-binary' }))
  const page = await browserContext.newPage()
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => response.status() >= 400 && errors.push(`HTTP ${response.status()} ${response.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30_000 })
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-screen="title"]')).opacity) >= 0.99, undefined, { timeout: 5_000 })
  await page.waitForFunction(() => Boolean(window.__game?.game && window.__game?.ui))
  return page
}
const state = page => page.evaluate(() => {
  const { game, ui } = window.__game
  const projected = game.carRoot.position.clone().project(game.camera)
  return { mode: game.mode, screen: ui.screen, distance: game.run.distance, targetDistance: game.run.targetDistance, elapsed: game.run.elapsed,
    speed: game.run.speed, lane: game.run.lane, airborne: game.run.airborne, cleanLandings: game.run.cleanLandings, boostTime: game.run.boostTime, driftTime: game.run.driftTime, selection: game.selection,
    vehicleId: game.vehicleId, rivalCount: game.rivals?.cars.length ?? 0, racePosition: game.racePosition, inputMethod: game.input.method,
    heldDrift: game.input.held('dash'), heldBoost: game.input.held('sprint'), heldActions: [...game.input.held_], move: { ...game.input.move }, steering: game.steering, keys: [...game.input.keys],
    updateCount: game.input.debugUpdateCount, sample: game.input.debugSample, visibility: document.visibilityState,
    pos: { x: game.carRoot.position.x, y: game.carRoot.position.y, z: game.carRoot.position.z },
    carScreen: { x: projected.x, y: projected.y, z: projected.z } }
})

try {
  await waitForServer()
  const args = ['--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader']
  browser = await chromium.launch({ args }).catch(() => chromium.launch({ args: ['--ignore-gpu-blocklist'] , channel: 'chrome' }))
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  const page = await openGame(context)
  await page.evaluate(() => {
    const input = window.__game.game.input
    const update = input.update.bind(input)
    input.debugUpdateCount = 0
    input.update = function (seconds) {
      this.debugUpdateCount += 1
      const result = update(seconds)
      this.debugSample = { keys: [...this.keys], held: [...this.held_], move: { ...this.move } }
      return result
    }
  })
  if (!await page.title().then(title => title.includes('VECTOR//RUN'))) throw new Error('document title is not branded')
  const landing = (await page.locator('.landing-hero').innerText()).toUpperCase()
  const setup = (await page.locator('.setup-panel').innerText()).toUpperCase()
  for (const token of ['VECTOR//RUN', 'BEND THE LINE', 'LOCAL RIVALS', 'ENTER THE GRID']) if (!landing.includes(token)) throw new Error(`landing page is missing ${token}`)
  for (const token of ['SELECT CIRCUIT', 'SELECT CAR', 'BRANCHING LINE', 'RACE FORMAT']) if (!setup.includes(token)) throw new Error(`race setup panel is missing ${token}`)
  const quickKeys = await page.locator('.control-guide-keys').innerText()
  for (const token of ['W', 'THROTTLE', 'A', 'D', 'STEER', 'S', 'BRAKE']) if (!quickKeys.includes(token)) throw new Error(`landing keyboard guide is missing ${token}`)
  const quickNote = await page.locator('.control-summary > small').innerText()
  if (!quickNote.includes('DRAG THE TRACK TO STEER')) throw new Error('landing keyboard guide does not explain pointer steering')
  const vehicleHeading = await page.evaluate(() => window.__game.game.model.rotation.y)
  if (Math.abs(vehicleHeading - Math.PI / 2) > 0.01) throw new Error(`generated GLB chassis is not aligned nose-forward (model yaw ${vehicleHeading})`)
  await page.screenshot({ path: `${out}/01-garage.png` })

  await page.click('[data-course="mirage-grid"]')
  await page.click('[data-vehicle="spectre-gt"]')
  await page.waitForFunction(() => window.__game.game.vehicleId === 'spectre-gt')
  await page.click('[data-vehicle="vector-vxr"]')
  await page.click('[data-route="undercut"]')
  await page.click('[data-mode="drift-cup"]')
  let current = await state(page)
  if (current.selection.courseId !== 'mirage-grid' || current.selection.routeId !== 'undercut' || current.selection.mode !== 'drift-cup') throw new Error(`race selection did not apply: ${JSON.stringify(current.selection)}`)
  await page.click('[data-action="play"]')
  stage = 'race launch'
  await page.waitForSelector('[data-screen="hud"].is-active')
  const before = await state(page)
  await page.waitForTimeout(450)
  const stationary = await state(page)
  if (stationary.distance !== 0 || stationary.speed !== 0) throw new Error(`player moved without throttle: speed=${stationary.speed}, distance=${stationary.distance}`)
  if (stationary.rivalCount !== 4) throw new Error(`expected four local racing rivals, got ${stationary.rivalCount}`)
  if (stationary.vehicleId !== 'vector-vxr') throw new Error(`garage car choice was not applied: ${stationary.vehicleId}`)
  stage = 'manual throttle'
  await page.keyboard.down('w')
  await page.waitForFunction(() => window.__game.game.run.distance > 4 && window.__game.game.run.speed > 8, undefined, { timeout: 10_000 })
  await page.keyboard.up('w')
  const afterThrottle = await state(page)
  if (!(afterThrottle.speed > 0 && afterThrottle.distance > 4)) throw new Error(`player throttle did not drive the car: ${JSON.stringify(afterThrottle)}`)
  if (!(Math.abs(afterThrottle.carScreen.x) < 0.9 && Math.abs(afterThrottle.carScreen.y) < 0.85 && afterThrottle.carScreen.z > 0 && afterThrottle.carScreen.z < 1)) throw new Error(`player car is outside the chase-camera view: ${JSON.stringify(afterThrottle.carScreen)}`)
  await page.waitForTimeout(220)
  await page.screenshot({ path: `${out}/02-race-hud.png` })
  stage = 'keyboard steering'
  await page.keyboard.down('w')
  await page.keyboard.down('d')
  await page.waitForFunction(() => window.__game.game.input.keys.has('KeyD') && window.__game.game.input.move.x > 0.6, undefined, { timeout: 10_000 }).catch(async error => { throw new Error(`D input was not sampled: ${JSON.stringify(await state(page))}; ${error.message}`) })
  await page.waitForFunction(() => window.__game.game.run.lane > 0.25, undefined, { timeout: 10_000 }).catch(async error => { throw new Error(`D input did not move the lane: ${JSON.stringify(await state(page))}; ${error.message}`) })
  const afterSteer = await state(page)
  await page.keyboard.up('w')
  await page.keyboard.up('d')
  if (!(afterSteer.lane > 0.25 && afterSteer.steering > 0.15)) throw new Error(`keyboard steering did not change the racing line: ${JSON.stringify(afterSteer)}`)
  const canvasBox = await page.locator('#game').boundingBox()
  if (!canvasBox) throw new Error('race canvas has no pointer hit area')
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.54, canvasBox.y + canvasBox.height * 0.57)
  stage = 'mouse drag steering'
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.54 + 80, canvasBox.y + canvasBox.height * 0.57, { steps: 5 })
  await page.waitForFunction(() => window.__game.game.input.method === 'pointer' && window.__game.game.input.move.x > 0.6, undefined, { timeout: 10_000 })
  await page.mouse.up()
  stage = 'jump'
  await page.keyboard.down('Space')
  await page.waitForTimeout(80)
  await page.keyboard.up('Space')
  await page.waitForFunction(() => { const r = window.__game.game.run; return r.airborne || r.cleanLandings > 0 }, undefined, { timeout: 10_000 })
  const afterJump = await state(page)
  stage = 'nitro while throttling'
  await page.keyboard.down('w')
  await page.keyboard.down('Shift')
  await page.waitForFunction(() => window.__game.game.input.held('sprint'), undefined, { timeout: 10_000 })
  await page.waitForFunction(() => window.__game.game.run.boostTime > 0, undefined, { timeout: 10_000 })
  const afterBoost = await state(page)
  await page.keyboard.up('Shift')
  await page.keyboard.up('w')
  stage = 'landing and drift'
  await page.waitForFunction(() => { const r = window.__game.game.run; return !r.airborne && r.cleanLandings > 0 }, undefined, { timeout: 10_000 })
  const tickBeforeDrift = await page.evaluate(() => window.__game.game.input.debugUpdateCount)
  await page.keyboard.down('f')
  await page.keyboard.down('d')
  await page.waitForFunction(tick => window.__game.game.input.debugUpdateCount >= tick + 3, tickBeforeDrift, { timeout: 10_000 })
  await page.waitForTimeout(240)
  const afterDrift = await state(page)
  await page.keyboard.up('f')
  await page.keyboard.up('d')
  current = await state(page)
  if (!(current.distance > before.distance + 4)) throw new Error(`car did not accelerate along course (${current.distance.toFixed(1)}m)`)
  if (!(afterJump.airborne || afterJump.cleanLandings > before.cleanLandings)) throw new Error('jump did not enter an airborne state or award a landing')
  if (!(afterBoost.boostTime > 0)) throw new Error('nitro did not activate while Shift was held')
  if (!(afterDrift.driftTime > 0.08)) throw new Error(`drifting did not sustain while F and steering were held: ${JSON.stringify({ state: afterDrift, errors })}`)
  if (!(current.speed > 0)) throw new Error('speed telemetry did not advance')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.click('[data-screen="pause"] [data-action="settings"]')
  await page.waitForSelector('[data-screen="settings"].is-active')
  const range = page.locator('[name="sensitivity"]')
  if (await range.count() !== 1) throw new Error('driving settings are missing')
  await page.waitForTimeout(360)
  await page.screenshot({ path: `${out}/03-settings.png` })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  if ((await state(page)).mode !== 'paused') throw new Error('Escape from Settings resumed the race unexpectedly')
  await page.click('[data-screen="pause"] [data-action="resume"]')
  await page.waitForSelector('[data-screen="hud"].is-active')

  await page.evaluate(() => {
    const { game } = window.__game
    game.run.speed = Math.max(40, game.run.speed)
    game.run.distance = game.run.targetDistance - game.run.speed / 60
    game.step(1 / 60)
  })
  await page.waitForSelector('[data-screen="results"].is-active', { timeout: 10_000 })
  const result = await state(page)
  if (result.mode !== 'ended') throw new Error(`expected ended game, got ${result.mode}`)
  if (!await page.locator('.results-medal').textContent()) throw new Error('race results are missing the medal')
  await page.screenshot({ path: `${out}/04-results.png` })

  await context.close()
  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
  context = phone
  const mobilePage = await openGame(phone)
  const mobileHero = await mobilePage.evaluate(() => {
    const launch = document.querySelector('.landing-hero [data-action="play"]').getBoundingClientRect()
    const controls = document.querySelector('.control-summary').getBoundingClientRect()
    return { launchBottom: launch.bottom, controlsBottom: controls.bottom, height: window.innerHeight }
  })
  if (mobileHero.launchBottom > mobileHero.height || mobileHero.controlsBottom > mobileHero.height) throw new Error(`landscape landing hides launch or control hints: ${JSON.stringify(mobileHero)}`)
  await mobilePage.screenshot({ path: `${out}/07-mobile-landing.png` })
  await mobilePage.locator('.garage-layout').evaluate(element => { element.scrollTop = element.scrollHeight })
  await mobilePage.waitForTimeout(120)
  const landscapeCourseVisible = await mobilePage.evaluate(() => {
    const viewport = document.querySelector('.garage-layout').getBoundingClientRect()
    const course = document.querySelector('.setup-panel [data-course]').getBoundingClientRect()
    return course.top < viewport.bottom && course.bottom > viewport.top
  })
  if (!landscapeCourseVisible) throw new Error('landscape landing cannot scroll to course selection')
  await mobilePage.locator('.garage-layout').evaluate(element => { element.scrollTop = 0 })
  await mobilePage.setViewportSize({ width: 390, height: 844 })
  await mobilePage.waitForTimeout(250)
  const portraitLanding = await mobilePage.evaluate(() => {
    const launch = document.querySelector('.landing-hero [data-action="play"]').getBoundingClientRect()
    const controls = document.querySelector('.control-summary').getBoundingClientRect()
    return { launchBottom: launch.bottom, controlsBottom: controls.bottom, height: window.innerHeight }
  })
  if (portraitLanding.launchBottom > portraitLanding.height || portraitLanding.controlsBottom > portraitLanding.height) throw new Error(`portrait landing hides launch or control hints: ${JSON.stringify(portraitLanding)}`)
  await mobilePage.screenshot({ path: `${out}/08-mobile-portrait-landing.png` })
  await mobilePage.locator('.garage-layout').evaluate(element => { element.scrollTop = element.scrollHeight })
  await mobilePage.waitForTimeout(120)
  const portraitCourseVisible = await mobilePage.evaluate(() => {
    const viewport = document.querySelector('.garage-layout').getBoundingClientRect()
    const course = document.querySelector('.setup-panel [data-course]').getBoundingClientRect()
    return course.top < viewport.bottom && course.bottom > viewport.top
  })
  if (!portraitCourseVisible) throw new Error('portrait landing cannot scroll to course selection')
  await mobilePage.locator('.garage-layout').evaluate(element => { element.scrollTop = 0 })
  await mobilePage.setViewportSize({ width: 844, height: 390 })
  await mobilePage.waitForTimeout(250)
  await mobilePage.tap('[data-action="play"]')
  await mobilePage.waitForSelector('[data-screen="hud"].is-active')
  const touchVisible = await mobilePage.locator('.touch').evaluate(element => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0)
  if (!touchVisible) throw new Error('mobile touch controls are not visible')
  const wheel = await mobilePage.locator('.touch-stick').evaluate(element => ({ opacity: getComputedStyle(element).opacity, display: getComputedStyle(element).display, rect: element.getBoundingClientRect().toJSON() }))
  if (Number(wheel.opacity) < 0.25 || wheel.display === 'none') throw new Error(`mobile steering wheel is not discoverable: ${JSON.stringify(wheel)}`)
  stage = 'touch driving'
  await mobilePage.evaluate(() => {
    const canvas = document.querySelector('#game')
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 44, clientX: 130, clientY: 280 }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'touch', pointerId: 44, clientX: 150, clientY: 220 }))
  })
  await mobilePage.waitForFunction(() => window.__game.game.input.method === 'touch' && window.__game.game.input.move.y > 0.5, undefined, { timeout: 10_000 })
  await mobilePage.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', pointerId: 44 })))
  const wheelReturned = await mobilePage.locator('.touch-stick').evaluate(element => element.getAttribute('style') ?? '')
  if (wheelReturned.includes('left:') || wheelReturned.includes('top:')) throw new Error(`touch wheel did not return to home position: ${wheelReturned}`)
  await mobilePage.waitForTimeout(360)
  await mobilePage.screenshot({ path: `${out}/05-mobile-race.png` })
  await mobilePage.setViewportSize({ width: 390, height: 844 })
  await mobilePage.waitForTimeout(360)
  const portraitOverlap = await mobilePage.evaluate(() => {
    const actions = document.querySelector('.touch-actions').getBoundingClientRect()
    const stats = document.querySelector('.race-stats').getBoundingClientRect()
    return actions.left < stats.right && actions.right > stats.left && actions.top < stats.bottom && actions.bottom > stats.top
  })
  if (portraitOverlap) throw new Error('portrait touch buttons overlap the race telemetry')
  await mobilePage.screenshot({ path: `${out}/06-mobile-portrait.png` })
  await mobilePage.tap('.touch-jump')
  await mobilePage.waitForTimeout(100)
  await mobilePage.tap('[data-action="pause"]')
  await mobilePage.waitForSelector('[data-screen="pause"].is-active')

  if (errors.length) throw new Error(`browser console/network errors:\n  ${errors.join('\n  ')}`)
  await context.close()
  await browser.close()
  cleanup()
  console.log(`smoke: OK — nose-forward model, stationary manual launch, throttle, keyboard/drag steering, selectable car, four AI rivals, jump, nitro, pause/settings, medals and mobile controls; screenshots in ${out}/`)
} catch (error) { await fail(`${stage}: ${error?.message ?? String(error)}`) }
