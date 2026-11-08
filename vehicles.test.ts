import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createVehicleModel, isVehicleId, VEHICLES, vehicleSpec } from '../src/game/vehicles'

describe('garage vehicles', () => {
  it('exposes three stable vehicle choices with distinct handling tradeoffs', () => {
    expect(VEHICLES).toHaveLength(3)
    expect(new Set(VEHICLES.map(vehicle => vehicle.id)).size).toBe(3)
    expect(new Set(VEHICLES.map(vehicle => vehicle.topSpeed)).size).toBeGreaterThan(1)
    expect(new Set(VEHICLES.map(vehicle => vehicle.acceleration)).size).toBeGreaterThan(1)
    expect(isVehicleId('spectre-gt')).toBe(true)
    expect(isVehicleId('../invalid')).toBe(false)
    expect(vehicleSpec('raptor-x').steering).toBeGreaterThan(vehicleSpec('spectre-gt').steering)
  })

  it('builds detailed rival shells that point forward and fit within road-sized dimensions', () => {
    for (const id of ['spectre-gt', 'raptor-x'] as const) {
      const car = createVehicleModel(id)
      const bounds = new THREE.Box3().setFromObject(car)
      const size = bounds.getSize(new THREE.Vector3())
      expect(size.z).toBeGreaterThan(4)
      expect(size.x).toBeGreaterThan(2)
      expect(size.y).toBeGreaterThan(1)
      expect(car.getObjectByName(`${id === 'spectre-gt' ? 'spectre' : 'raptor'}-shell`)).toBeDefined()
    }
  })
})
