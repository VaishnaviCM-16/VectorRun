import './styles/main.css'
import { Audio } from './engine/audio'
import { Assets } from './engine/assets'
import { I18n } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, insertScore, type SaveData } from './engine/save'
import { PLAYER_CAR_URL } from './game/assetUrls'
import { recordKey, type RaceSelection } from './game/course'
import type { Game } from './game/game'
import type { RaceRun } from './game/rules'
import type { RivalStanding } from './game/rivals'
import type { VehicleId } from './game/vehicles'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const i18n = new I18n('en')
  const input = new Input(canvas)
  const audio = new Audio()
  const assets = new Assets()
  let game: Game | undefined
  let loop!: GameLoop

  const applySettings = (d: SaveData) => {
    input.sensitivity = d.sensitivity
    input.invertY = d.invertY
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) { game.reducedMotion = d.reducedMotion; game.steerAssist = d.steerAssist }
  }
  const startRun = (selection: RaceSelection) => {
    if (!game) return
    audio.unlock()
    const id = recordKey(selection)
    game.start(selection, save.data.records[id], save.data.ghosts[id], save.data.steerAssist)
    ui.show('hud')
    loop.resetAccumulator()
  }
  const pause = () => {
    if (game?.mode !== 'playing') return
    game.pause(); ui.show('pause')
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume(); ui.show('hud'); loop.resetAccumulator()
  }

  const ui = new Ui(i18n, save, audio, input, {
    play: startRun,
    restart: () => startRun(ui.selection),
    resume,
    quit: () => { game?.toTitle(); ui.show('title') },
    selection: selection => game?.select(selection),
    vehicle: (id: VehicleId) => game?.setVehicle(id),
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch); applySettings(save.data)
      if (qualityChanged) game?.setQuality(save.data.quality)
    },
  })
  ui.show('boot'); applySettings(save.data)

  let loaded = 0
  const track = <T>(promise: Promise<T>, total = 4): Promise<T> => promise.then(value => { loaded += 1; ui.setBootProgress(loaded / total); return value })
  ui.setBootProgress(0.04)
  const modelPromise = assets.gltf(PLAYER_CAR_URL).catch(error => {
    console.warn('VECTOR//RUN vehicle asset unavailable; using the loading placeholder.', error)
    return undefined
  })
  const [{ Game: GameClass }, { Renderer, suggestQuality }, vehicle] = await Promise.all([
    track(import('./game/game')), track(import('./engine/renderer')), track(modelPromise), track(document.fonts.ready),
  ])
  if (firstRun) { save.update({ quality: suggestQuality() }); ui.refreshSettings() }

  const renderer = new Renderer(canvas, save.data.quality)
  game = new GameClass(renderer, input, audio, {
    popup: (text, tone) => ui.popup(text, tone),
    finish: (run: RaceRun, position: number, rivals: RivalStanding[]) => {
      const key = recordKey(run.selection)
      const oldRecord = save.data.records[key]
      const newRecord = !run.unranked && (oldRecord === undefined || run.elapsed < oldRecord)
      if (!run.unranked) {
        const records = newRecord ? { ...save.data.records, [key]: run.elapsed } : save.data.records
        const ghosts = newRecord ? { ...save.data.ghosts, [key]: run.ghostFrames.slice(0, 1400) } : save.data.ghosts
        const entry = { name: save.data.playerName, score: Math.floor(run.score), seconds: run.elapsed, at: Date.now() }
        save.update({ records, ghosts, leaderboard: insertScore(save.data.leaderboard, entry).board })
      }
      ui.showResults(run, newRecord, position, rivals)
    },
  })
  if (vehicle) game.setVehicleModel(vehicle)
  game.setVehicle(save.data.vehicleId)
  applySettings(save.data)

  if (import.meta.env.DEV) {
    const [{ registerGameTuning }, { tuning }] = await Promise.all([import('../scripts/manus-tuning/adapter.js'), import('./game/tuning')])
    await registerGameTuning(tuning)
  }
  const g = game
  loop = new GameLoop({
    beforeFrame: frameSeconds => input.update(frameSeconds),
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      if (input.consume('pause')) {
        if (g.mode === 'playing') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      ui.frame(frameSeconds)
      loop.paused = g.mode === 'paused'
      g.render(alpha, frameSeconds)
      if (g.mode === 'playing') ui.updateHud(g.run, g.racePosition, g.rivalStandings.length + 1)
    },
  })
  loop.start()
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause() })
  window.addEventListener('game:pause', pause)
  new TouchControls(document.getElementById('ui')!, input, () => g.mode === 'playing')
  window.setTimeout(() => ui.show('title'), 180)
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save, assets }
}

function safeGet(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  if (el) el.innerHTML = `<div class="fatal">Failed to start: ${String((err as Error)?.message ?? err).replace(/[<>&]/g, '')}</div>`
})
