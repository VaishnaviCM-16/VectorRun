import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CourseWorld } from '../src/game/course'
import { RivalPack } from '../src/game/rivals'

describe('offline rival pack', () => {
  it('starts four local cars, advances them on the selected spline and calculates player position', () => {
    const scene = new THREE.Scene()
    const road = new CourseWorld(scene, { courseId: 'vanta-crown', routeId: 'highline' })
    const pack = new RivalPack(scene, road, road.length)
    try {
      expect(pack.cars).toHaveLength(4)
      expect(scene.children.filter(child => child.name.startsWith('car-'))).toHaveLength(4)
      const firstDistance = pack.cars.map(rival => rival.distance)
      pack.update(0.6, 0.6)
      expect(pack.cars.some((rival, index) => rival.distance > firstDistance[index])).toBe(true)
      expect(pack.position(0, 0.6)).toBe(5)
      const ahead = Math.max(...pack.cars.map(rival => rival.distance)) + 1
      expect(pack.position(ahead, 0.6)).toBe(1)
      expect(pack.standings(ahead, 0.6)).toHaveLength(4)
    } finally { pack.dispose() }
  })

  it('records an AI finish exactly once and keeps its racer in the standings', () => {
    const scene = new THREE.Scene()
    const road = new CourseWorld(scene, { courseId: 'mirage-grid', routeId: 'undercut' })
    const pack = new RivalPack(scene, road, 8)
    try {
      for (let i = 1; i <= 10; i += 1) pack.update(0.2, i * 0.2)
      const times = pack.cars.map(rival => rival.finishTime)
      expect(times.every(time => time !== null)).toBe(true)
      const finishTimes = pack.cars.map(rival => rival.finishTime)
      pack.update(1, 4)
      expect(pack.cars.map(rival => rival.finishTime)).toEqual(finishTimes)
    } finally { pack.dispose() }
  })
})
