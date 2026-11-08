import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG, DEFAULT_CONFIG } from '../src/game/config'
import { tuning } from '../src/game/tuning'

const defaults = Object.fromEntries(tuning.controls.map(control => [control.id, control.default]))
afterEach(() => {
  tuning.apply(defaults)
  for (const boundary of ['jump', 'dash', 'run'] as const) tuning.activate(boundary)
})

describe('racing Tweak bridge', () => {
  it('validates a whole patch before committing and preserves immutable source defaults', () => {
    const before = tuning.read()
    for (const patch of [{ 'player.walkSpeed': 30, 'camera.fov': 999 }, { 'player.walkSpeed': 9 }, { 'player.walkSpeed': 34.4 }, { 'player.walkSpeed': '34' }, { 'camera.fov': Infinity }, { unknown: 4 }]) {
      expect(() => tuning.apply(patch)).toThrow()
      expect(tuning.read()).toEqual(before)
    }
    tuning.apply({ 'player.walkSpeed': 30, 'player.sprintSpeed': 60 })
    expect(CONFIG.player.walkSpeed).toBe(30)
    expect(CONFIG.player.sprintSpeed).toBe(60)
    expect(DEFAULT_CONFIG.player.walkSpeed).toBe(34)
  })

  it('keeps jump and boost changes pending until their respective input boundary', () => {
    tuning.apply({ 'player.jumpSpeed': 14, 'player.dashSpeed': 80, 'player.dashTime': 3.2 })
    expect(CONFIG.player.jumpSpeed).toBe(DEFAULT_CONFIG.player.jumpSpeed)
    expect(CONFIG.player.dashSpeed).toBe(DEFAULT_CONFIG.player.dashSpeed)
    tuning.activate('jump')
    expect(CONFIG.player.jumpSpeed).toBe(14)
    expect(CONFIG.player.dashSpeed).toBe(DEFAULT_CONFIG.player.dashSpeed)
    tuning.activate('dash')
    expect(CONFIG.player.dashSpeed).toBe(80)
    expect(CONFIG.player.dashTime).toBe(3.2)
  })

  it('latches live gameplay changes for ranked eligibility and resets eligibility on a clean run', () => {
    tuning.activate('run')
    tuning.apply({ 'camera.fov': 82 })
    expect(tuning.unranked).toBe(false)
    tuning.apply({ 'player.walkSpeed': 33 })
    expect(tuning.unranked).toBe(true)
    tuning.apply(defaults)
    expect(tuning.unranked).toBe(true)
    tuning.activate('run')
    expect(tuning.unranked).toBe(false)
  })

  it('uses the live camera values through the shared configuration object', () => {
    tuning.apply({ 'camera.fov': 72, 'camera.distance': 14 })
    expect(CONFIG.camera.fov).toBe(72)
    expect(CONFIG.camera.distance).toBe(14)
  })
})
