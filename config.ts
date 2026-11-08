/** Shared source defaults for racing feel and the development Tweak bridge. */
export const DEFAULT_CONFIG = {
  run: {
    seconds: 180,
    lives: 3,
    invulnerable: 1.6,
    killY: -18,
  },
  score: {
    core: 100,
    comboWindow: 4.4,
    comboMax: 9,
    timeBonus: 25,
    lifeBonus: 500,
  },
  player: {
    radius: 1.25,
    halfHeight: 0.52,
    walkSpeed: 34,
    sprintSpeed: 56,
    acceleration: 44,
    airControl: 0.68,
    jumpSpeed: 11.5,
    gravity: -24,
    lowJumpGravity: -31,
    maxFall: -38,
    coyoteTime: 0.12,
    jumpBuffer: 0.14,
    dashSpeed: 77,
    dashTime: 2.4,
    dashCooldown: 3.6,
    turnSpeed: 14,
  },
  camera: {
    distance: 13,
    height: 6.2,
    minPitch: -0.35,
    maxPitch: 1.1,
    follow: 7.8,
    fov: 58,
  },
  drones: { speed: 3.2, radius: 0.7, rageSpeed: 5, rageAt: 45 },
} as const

type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)
