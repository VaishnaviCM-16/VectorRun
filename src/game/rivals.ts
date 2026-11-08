import * as THREE from 'three'
import type { CourseWorld } from './course'
import { createVehicleModel, type VehicleId } from './vehicles'

export const RIVAL_DRIVERS = [
  { name: 'VEX', vehicle: 'spectre-gt' as VehicleId, color: '#ff557e', pace: 39.2, lane: -5.55, offset: 0.2 },
  { name: 'NYX', vehicle: 'raptor-x' as VehicleId, color: '#a678ff', pace: 35.4, lane: -2.78, offset: 0.75 },
  { name: 'ECHO', vehicle: 'spectre-gt' as VehicleId, color: '#31ddff', pace: 37.3, lane: 2.78, offset: 1.25 },
  { name: 'HALO', vehicle: 'raptor-x' as VehicleId, color: '#ffb547', pace: 41.1, lane: 5.55, offset: 1.8 },
] as const

export type RivalCar = {
  name: string
  vehicle: VehicleId
  root: THREE.Group
  color: string
  pace: number
  lane: number
  distance: number
  speed: number
  finishTime: number | null
  phase: number
}
export type RivalStanding = { name: string; vehicle: VehicleId; color: string; distance: number; time: number | null; ahead: boolean }

export class RivalPack {
  readonly cars: RivalCar[]
  constructor(private readonly scene: THREE.Scene, private readonly road: CourseWorld, private readonly targetDistance: number) {
    this.cars = RIVAL_DRIVERS.map((driver, index) => {
      const root = createVehicleModel(driver.vehicle, driver.color)
      root.scale.multiplyScalar(0.82)
      scene.add(root)
      return {
        name: driver.name, vehicle: driver.vehicle, root, color: driver.color, pace: driver.pace,
        lane: driver.lane, distance: driver.offset, speed: 0, finishTime: null, phase: index * 1.71,
      }
    })
    this.placeCars()
  }

  update(dt: number, elapsed: number): void {
    for (const rival of this.cars) {
      if (rival.finishTime !== null) continue
      const targetSpeed = rival.pace + Math.sin(elapsed * 0.62 + rival.phase) * 1.25 + Math.sin(elapsed * 0.19 + rival.phase * 1.4) * 0.45
      rival.speed = Math.min(targetSpeed, rival.speed + 22 * dt)
      const next = rival.distance + rival.speed * dt
      if (next >= this.targetDistance) {
        rival.distance = this.targetDistance
        rival.finishTime = Math.max(0, elapsed - (next - this.targetDistance) / Math.max(1, rival.speed))
      } else rival.distance = next
      rival.lane = RIVAL_DRIVERS[this.cars.indexOf(rival)].lane + Math.sin(elapsed * 0.72 + rival.phase) * 0.28
    }
    this.placeCars()
  }

  position(playerDistance: number, elapsed: number): number {
    return 1 + this.cars.filter(rival => rival.finishTime !== null
      ? rival.finishTime <= elapsed
      : rival.distance > playerDistance + 0.001).length
  }

  standings(playerDistance: number, elapsed: number): RivalStanding[] {
    return this.cars.map(rival => ({
      name: rival.name, vehicle: rival.vehicle, color: rival.color, distance: rival.distance,
      time: rival.finishTime, ahead: rival.finishTime !== null ? rival.finishTime <= elapsed : rival.distance > playerDistance,
    })).sort((a, b) => {
      if (a.time !== null && b.time !== null) return a.time - b.time
      if (a.time !== null) return -1
      if (b.time !== null) return 1
      return b.distance - a.distance
    })
  }

  placeCars(): void {
    for (const rival of this.cars) {
      const pose = this.road.pose(rival.distance, rival.lane)
      rival.root.position.copy(pose.point).addScaledVector(pose.normal, 0.55)
      rival.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), pose.tangent)
    }
  }

  dispose(): void {
    for (const rival of this.cars) {
      this.scene.remove(rival.root)
      rival.root.traverse(object => {
        const part = object as THREE.Mesh
        if (!part.isMesh) return
        part.geometry.dispose()
        for (const material of (Array.isArray(part.material) ? part.material : [part.material])) material.dispose()
      })
    }
  }
}
