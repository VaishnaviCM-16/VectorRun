import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { COURSES, CourseWorld, ROUTE_WIDTH } from '../src/game/course'

describe('3D race courses', () => {
  let world: CourseWorld | undefined
  afterEach(() => { world?.dispose(); world = undefined })

  it('offers three unique themed tracks and two playable branches per track', () => {
    expect(COURSES).toHaveLength(3)
    for (const definition of COURSES) {
      expect(definition.route).toHaveLength(2)
      expect(definition.route[0].id).not.toBe(definition.route[1].id)
      for (const route of definition.route) {
        world = new CourseWorld(new THREE.Scene(), { courseId: definition.id, routeId: route.id })
        expect(world.length).toBeGreaterThan(800)
        expect(world.hazards.length).toBe(6)
        expect(world.pickups.length).toBe(12)
        const start = world.pose(0)
        expect(start.point.toArray().every(Number.isFinite)).toBe(true)
        expect(start.tangent.length()).toBeCloseTo(1, 4)
        expect(start.right.length()).toBeCloseTo(1, 4)
        expect(ROUTE_WIDTH).toBeGreaterThan(12)
        world.dispose(); world = undefined
      }
    }
  })
})
