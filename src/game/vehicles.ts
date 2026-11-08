import * as THREE from 'three'

export type VehicleId = 'vector-vxr' | 'spectre-gt' | 'raptor-x'
export type VehicleSpec = {
  id: VehicleId
  nameKey: string
  detailKey: string
  accent: string
  topSpeed: number
  acceleration: number
  steering: number
  width: number
  length: number
}

export const VEHICLES: readonly VehicleSpec[] = [
  { id: 'vector-vxr', nameKey: 'car.vector.name', detailKey: 'car.vector.detail', accent: '#c9ff38', topSpeed: 56, acceleration: 23, steering: 1.08, width: 2.15, length: 4.35 },
  { id: 'spectre-gt', nameKey: 'car.spectre.name', detailKey: 'car.spectre.detail', accent: '#41eaff', topSpeed: 62, acceleration: 20, steering: 0.92, width: 2.35, length: 4.65 },
  { id: 'raptor-x', nameKey: 'car.raptor.name', detailKey: 'car.raptor.detail', accent: '#ff557e', topSpeed: 51, acceleration: 27, steering: 1.24, width: 2.65, length: 4.25 },
]

export function isVehicleId(value: unknown): value is VehicleId {
  return VEHICLES.some(vehicle => vehicle.id === value)
}

export function vehicleSpec(id: VehicleId): VehicleSpec {
  return VEHICLES.find(vehicle => vehicle.id === id) ?? VEHICLES[0]
}

/** Build the two original garage cars and all local AI shells. Their nose points along local -Z. */
export function createVehicleModel(id: VehicleId, paint?: string): THREE.Group {
  const spec = vehicleSpec(id)
  const accentColor = paint ?? spec.accent
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: id === 'raptor-x' ? '#18202a' : '#0d1b27', metalness: 0.8, roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.18 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 1.05, metalness: 0.58, roughness: 0.26 })
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#062a38', emissive: '#0b4654', emissiveIntensity: 0.45, metalness: 0.34, roughness: 0.12, transparent: true, opacity: 0.9, clearcoat: 1 })
  const rubberMaterial = new THREE.MeshStandardMaterial({ color: '#03070b', roughness: 0.66, metalness: 0.18 })
  const hubMaterial = new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.6, metalness: 0.72, roughness: 0.22 })
  const lightMaterial = new THREE.MeshBasicMaterial({ color: id === 'raptor-x' ? '#ff7897' : '#bafaff' })
  const car = new THREE.Group()
  car.name = `car-${id}`

  if (id === 'spectre-gt') {
    const profiles: Section[] = [
      { z: -2.34, w: 0.23, bottom: 0.34, middle: 0.45, top: 0.58 },
      { z: -1.75, w: 0.82, bottom: 0.28, middle: 0.48, top: 0.72 },
      { z: -0.9, w: 1.03, bottom: 0.26, middle: 0.49, top: 0.7 },
      { z: 0.75, w: 1.0, bottom: 0.27, middle: 0.47, top: 0.65 },
      { z: 1.75, w: 0.9, bottom: 0.29, middle: 0.45, top: 0.62 },
      { z: 2.31, w: 0.37, bottom: 0.36, middle: 0.45, top: 0.54 },
    ]
    car.add(mesh(loft(profiles), bodyMaterial, 'spectre-shell'))
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.43, 1.48), glassMaterial)
    canopy.position.set(0, 0.88, -0.12)
    canopy.rotation.x = -0.08
    canopy.name = 'spectre-canopy'
    car.add(canopy)
    addSideSills(car, accentMaterial, 0.94, 0.15)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.11, 0.38), accentMaterial)
    wing.position.set(0, 0.7, 1.94)
    car.add(wing)
    addWheels(car, rubberMaterial, hubMaterial, 1.12, 1.46, 0.44)
    addLights(car, lightMaterial, 0.72, -2.23, 0.55)
  } else {
    const profiles: Section[] = [
      { z: -2.14, w: 0.32, bottom: 0.34, middle: 0.46, top: 0.65 },
      { z: -1.56, w: 0.94, bottom: 0.3, middle: 0.54, top: 0.82 },
      { z: -0.78, w: 1.2, bottom: 0.26, middle: 0.58, top: 0.9 },
      { z: 0.85, w: 1.17, bottom: 0.28, middle: 0.55, top: 0.83 },
      { z: 1.72, w: 1.05, bottom: 0.3, middle: 0.51, top: 0.76 },
      { z: 2.12, w: 0.72, bottom: 0.37, middle: 0.5, top: 0.69 },
    ]
    car.add(mesh(loft(profiles), bodyMaterial, 'raptor-shell'))
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.55, 1.32), glassMaterial)
    canopy.position.set(0, 1.04, -0.1)
    canopy.name = 'raptor-canopy'
    car.add(canopy)
    const roofLight = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.12), accentMaterial)
    roofLight.position.set(0, 1.34, -0.08)
    car.add(roofLight)
    addSideSills(car, accentMaterial, 1.12, 0.19)
    const wingSupport = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), accentMaterial)
    for (const x of [-0.72, 0.72]) { const support = wingSupport.clone(); support.position.set(x, 0.82, 1.7); car.add(support) }
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.15, 0.42), accentMaterial)
    wing.position.set(0, 1.02, 1.82)
    car.add(wing)
    addWheels(car, rubberMaterial, hubMaterial, 1.28, 1.36, 0.53)
    addLights(car, lightMaterial, 0.78, -2.07, 0.62)
  }

  const underglow = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.76, 0.07, spec.length * 0.58), new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.72 }))
  underglow.position.set(0, 0.26, 0.1)
  underglow.name = 'underglow'
  car.add(underglow)
  car.traverse(object => {
    const part = object as THREE.Mesh
    if (part.isMesh) { part.castShadow = true; part.receiveShadow = true }
  })
  return car
}

type Section = { z: number; w: number; bottom: number; middle: number; top: number }
function loft(sections: Section[]): THREE.BufferGeometry {
  const sides: [number, number][] = [[0, 0], [0.72, -0.04], [1, -0.12], [0.88, -0.9], [0, -1], [-0.88, -0.9], [-1, -0.12], [-0.72, -0.04]]
  const vertices: number[] = []
  const indices: number[] = []
  for (const section of sections) {
    const lower = section.bottom + 0.08
    for (let i = 0; i < sides.length; i++) {
      const [x, y] = sides[i]
      let vertical: number
      if (i === 0 || i === 1 || i === 7) vertical = section.top + y
      else if (i === 2 || i === 6) vertical = section.middle
      else if (i === 4) vertical = lower
      else vertical = lower + (section.middle - lower) * 0.72
      vertices.push(x * section.w, vertical, section.z)
    }
  }
  const count = sides.length
  for (let ring = 0; ring < sections.length - 1; ring++) {
    for (let side = 0; side < count; side++) {
      const a = ring * count + side
      const b = ring * count + (side + 1) % count
      const c = (ring + 1) * count + side
      const d = (ring + 1) * count + (side + 1) % count
      indices.push(a, c, b, b, c, d)
    }
  }
  const frontCenter = vertices.length / 3
  vertices.push(0, sections[0].middle, sections[0].z)
  const rearCenter = vertices.length / 3
  vertices.push(0, sections.at(-1)!.middle, sections.at(-1)!.z)
  for (let side = 0; side < count; side++) {
    indices.push(frontCenter, (side + 1) % count, side)
    const last = (sections.length - 1) * count
    indices.push(rearCenter, last + side, last + (side + 1) % count)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material)
  result.name = name
  return result
}
function addWheels(car: THREE.Group, rubber: THREE.Material, hub: THREE.Material, halfTrack: number, axle: number, radius: number): void {
  for (const x of [-halfTrack, halfTrack]) for (const z of [-axle, axle]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.36, 18), rubber)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, radius, z)
    wheel.name = `wheel-${x < 0 ? 'left' : 'right'}-${z < 0 ? 'front' : 'rear'}`
    car.add(wheel)
    const hubcap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.43, radius * 0.43, 0.39, 12), hub)
    hubcap.rotation.z = Math.PI / 2
    hubcap.position.copy(wheel.position)
    hubcap.name = 'wheel-hub'
    car.add(hubcap)
  }
}
function addSideSills(car: THREE.Group, accent: THREE.Material, halfWidth: number, height: number): void {
  for (const x of [-halfWidth, halfWidth]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 2.6), accent)
    sill.position.set(x, height, 0.05)
    car.add(sill)
  }
}
function addLights(car: THREE.Group, light: THREE.Material, halfWidth: number, z: number, y: number): void {
  for (const x of [-halfWidth, halfWidth]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), light)
    lamp.position.set(x, y, z)
    lamp.name = 'headlight'
    car.add(lamp)
  }
}
