import { describe, expect, it } from 'vitest'
import { recordKey, type RaceSelection } from '../src/game/course'
import { advance, awardCleanLanding, awardNearMiss, calculateMedal, createRun, driveSpeed, formatClock, progressPercent, recordHit, scoreEvent, tickDrift } from '../src/game/rules'

const selection: RaceSelection = { courseId: 'vanta-crown', routeId: 'highline', mode: 'sprint' }

describe('precision racing rules', () => {
  it('builds each format with its own lap target and a matching ghost key', () => {
    expect(createRun(selection, 900).targetLaps).toBe(1)
    expect(createRun({ ...selection, mode: 'time-attack' }, 900).targetLaps).toBe(3)
    expect(createRun({ ...selection, mode: 'drift-cup' }, 900).targetLaps).toBe(2)
    expect(createRun(selection, 900, undefined, [], true).unranked).toBe(true)
    expect(recordKey(selection)).toBe('vanta-crown|highline|sprint')
  })

  it('advances distance by speed, clamps the finish and freezes a completed run', () => {
    const run = createRun(selection, 100)
    expect(run.speed).toBe(0)
    expect(advance(run, 2).distance).toBe(0)
    run.speed = 20
    const moved = advance(run, 2)
    expect(moved.distance).toBe(40)
    expect(progressPercent(moved)).toBeCloseTo(0.4)
    const finish = advance({ ...moved, speed: 50 }, 4)
    expect(finish.phase).toBe('finished')
    expect(finish.distance).toBe(100)
    expect(advance(finish, 1)).toBe(finish)
  })

  it('requires driver throttle to accelerate and responds directly to throttle and brake', () => {
    expect(driveSpeed(0, 0, 0, 1, 60, 40)).toBe(0)
    expect(driveSpeed(0, 1, 0, 0.5, 60, 40)).toBe(20)
    expect(driveSpeed(30, 0, 1, 0.5, 60, 40)).toBe(0)
    expect(driveSpeed(48, 1, 0, 1, 50, 40)).toBe(50)
    expect(driveSpeed(20, 0, 0, 1, 50, 40)).toBeCloseTo(16.2)
  })

  it('links events into a bounded combo with score multipliers', () => {
    const run = createRun(selection, 100)
    expect(scoreEvent(run, 100)).toBe(100)
    expect(scoreEvent(run, 100)).toBe(200)
    expect(scoreEvent(run, 100)).toBe(300)
    expect(run.comboPeak).toBe(3)
    expect(run.score).toBe(600)
    advance({ ...run, comboTimer: 0.01 }, 1)
  })

  it('builds nitro and scoring while maintaining a drift link', () => {
    const run = createRun(selection, 100)
    const before = run.nitro
    tickDrift(run, 3, 40, true)
    expect(run.driftTime).toBe(3)
    expect(run.nitro).toBeGreaterThan(before)
    expect(run.combo).toBe(3)
    expect(run.score).toBeGreaterThan(0)
    tickDrift(run, 1, 40, false)
    expect(run.driftTime).toBeLessThan(3)
  })

  it('rewards clean landings and close calls, while impacts reset combo and consume energy', () => {
    const run = createRun(selection, 100)
    const landing = awardCleanLanding(run)
    const close = awardNearMiss(run)
    expect(landing).toBeGreaterThan(0)
    expect(close).toBeGreaterThan(0)
    expect(run.cleanLandings).toBe(1)
    expect(run.nearMisses).toBe(1)
    expect(run.nitro).toBeGreaterThan(0.54)
    const beforeHit = run.nitro
    recordHit(run)
    expect(run.hits).toBe(1)
    expect(run.combo).toBe(0)
    expect(run.nitro).toBeLessThan(beforeHit)
  })

  it('issues medals using time for speed modes and score for Drift Cup', () => {
    const timeRun = createRun(selection, 100)
    timeRun.phase = 'finished'; timeRun.elapsed = 1
    expect(calculateMedal(timeRun)).toBe('gold')
    const drift = createRun({ ...selection, mode: 'drift-cup' }, 100)
    drift.phase = 'finished'; drift.score = 7000
    expect(calculateMedal(drift)).toBe('silver')
    drift.score = 13000
    expect(calculateMedal(drift)).toBe('gold')
  })

  it('formats hundredth-second race times consistently', () => {
    expect(formatClock(150.08)).toBe('2:30.08')
    expect(formatClock(59.2)).toBe('0:59.20')
    expect(formatClock(0)).toBe('0:00.00')
  })
})
