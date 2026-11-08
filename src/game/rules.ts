import { MODE_INFO, type RaceSelection } from './course'

export type Medal = 'none' | 'bronze' | 'silver' | 'gold'
export type RacePhase = 'playing' | 'finished'
export type GhostFrame = { t: number; d: number; lane: number; lift: number }
export type RaceRun = {
  phase: RacePhase
  selection: RaceSelection
  targetLaps: number
  targetDistance: number
  trackLength: number
  elapsed: number
  distance: number
  speed: number
  lane: number
  score: number
  combo: number
  comboPeak: number
  comboTimer: number
  driftTime: number
  nitro: number
  boostTime: number
  jumpVelocity: number
  airborne: boolean
  airTime: number
  cleanLandings: number
  nearMisses: number
  hits: number
  medal: Medal
  ghostFrames: GhostFrame[]
  opponentFrames: GhostFrame[]
  ghostDelta: number | null
  recordTime: number | null
  unranked: boolean
}

export function createRun(selection: RaceSelection, trackLength: number, recordTime?: number, ghostFrames: GhostFrame[] = [], unranked = false): RaceRun {
  const targetLaps = MODE_INFO[selection.mode].laps
  return {
    phase: 'playing', selection: { ...selection }, targetLaps, trackLength, targetDistance: trackLength * targetLaps,
    elapsed: 0, distance: 0, speed: 0, lane: 0, score: 0, combo: 0, comboPeak: 0, comboTimer: 0,
    driftTime: 0, nitro: 0.54, boostTime: 0, jumpVelocity: 0, airborne: false, airTime: 0,
    cleanLandings: 0, nearMisses: 0, hits: 0, medal: 'none', ghostFrames: [], opponentFrames: ghostFrames,
    ghostDelta: ghostFrames.length ? 0 : null, recordTime: Number.isFinite(recordTime) ? recordTime! : null, unranked,
  }
}

export function advance(run: RaceRun, dt: number): RaceRun {
  if (run.phase !== 'playing') return run
  const elapsed = run.elapsed + dt
  const distance = Math.min(run.targetDistance, run.distance + Math.max(0, run.speed) * dt)
  const next = { ...run, elapsed, distance, comboTimer: Math.max(0, run.comboTimer - dt) }
  if (next.comboTimer <= 0) next.combo = 0
  if (distance >= run.targetDistance) next.phase = 'finished'
  return next
}

/** Driver-only speed control: throttle adds speed, brake removes it, and neutral coasts to a stop. */
export function driveSpeed(speed: number, throttle: number, brake: number, dt: number, maxSpeed: number, acceleration: number, brakingForce = acceleration * 1.5, rollingDrag = 3.8): number {
  const frame = Math.max(0, dt)
  const gas = Math.max(0, Math.min(1, throttle))
  const stop = Math.max(0, Math.min(1, brake))
  let next = Math.max(0, speed)
  if (stop > 0) next = Math.max(0, next - brakingForce * stop * frame)
  else if (gas > 0) next = Math.min(Math.max(0, maxSpeed), next + acceleration * gas * frame)
  else next = Math.max(0, next - rollingDrag * frame)
  return next
}

export function scoreEvent(run: RaceRun, base: number, comboSeconds = 4.4): number {
  if (run.comboTimer > 0) run.combo = Math.min(9, run.combo + 1)
  else run.combo = 1
  run.comboTimer = comboSeconds
  run.comboPeak = Math.max(run.comboPeak, run.combo)
  const points = Math.round(base * run.combo)
  run.score += points
  return points
}

export function tickDrift(run: RaceRun, dt: number, speed: number, active: boolean): number {
  if (!active || speed < 12) { run.driftTime = Math.max(0, run.driftTime - dt * 1.6); return 0 }
  run.driftTime += dt
  run.nitro = Math.min(1, run.nitro + dt * 0.075)
  const rate = (5 + speed * 0.14) * Math.min(8, 1 + Math.floor(run.driftTime / 1.25))
  run.score += rate * dt
  run.combo = Math.max(1, Math.min(9, 1 + Math.floor(run.driftTime / 1.25)))
  run.comboPeak = Math.max(run.comboPeak, run.combo)
  run.comboTimer = 4.4
  return rate * dt
}

export function awardCleanLanding(run: RaceRun): number { run.cleanLandings += 1; run.nitro = Math.min(1, run.nitro + 0.2); return scoreEvent(run, 400) }
export function awardNearMiss(run: RaceRun): number { run.nearMisses += 1; run.nitro = Math.min(1, run.nitro + 0.1); return scoreEvent(run, 240) }
export function recordHit(run: RaceRun): void { run.hits += 1; run.combo = 0; run.comboTimer = 0; run.nitro = Math.max(0, run.nitro - 0.16) }

export function calculateMedal(run: RaceRun): Medal {
  if (run.selection.mode === 'drift-cup') {
    if (run.score >= 12000) return 'gold'
    if (run.score >= 6500) return 'silver'
    return 'bronze'
  }
  const ideal = run.targetDistance / 52 * 1.09
  if (run.elapsed <= ideal) return 'gold'
  if (run.elapsed <= ideal * 1.22) return 'silver'
  return 'bronze'
}

export function formatClock(seconds: number): string {
  const hundredths = Math.floor(Math.max(0, seconds) * 100)
  const mins = Math.floor(hundredths / 6000)
  const wholeSeconds = Math.floor(hundredths / 100) % 60
  return `${mins}:${String(wholeSeconds).padStart(2, '0')}.${String(hundredths % 100).padStart(2, '0')}`
}
export function progressPercent(run: RaceRun): number { return Math.max(0, Math.min(1, run.distance / run.targetDistance)) }
