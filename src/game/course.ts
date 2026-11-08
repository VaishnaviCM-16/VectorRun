import * as THREE from 'three'

export type CourseId = 'vanta-crown' | 'mirage-grid' | 'abyssal-run'
export type RouteId = 'highline' | 'undercut'
export type CourseSelection = { courseId: CourseId; routeId: RouteId }
export type TrackHazard = { distance: number; lane: number; phase: number; group: THREE.Group; beam: THREE.Mesh; glow: THREE.MeshStandardMaterial }

export type RouteDefinition = { id: RouteId; nameKey: string; noteKey: string; points: [number, number, number][] }
export type CourseDefinition = {
  id: CourseId; nameKey: string; descriptorKey: string; accent: string; secondary: string; background: string; route: [RouteDefinition, RouteDefinition]
}

export const COURSES: CourseDefinition[] = [
  {
    id: 'vanta-crown', nameKey: 'course.vanta.name', descriptorKey: 'course.vanta.desc', accent: '#c9ff38', secondary: '#31ddff', background: '#081118',
    route: [
      { id: 'highline', nameKey: 'route.highline.name', noteKey: 'route.highline.note', points: [[0, 14, 178], [70, 21, 165], [142, 10, 103], [183, 30, 30], [170, 17, -55], [108, 34, -126], [28, 14, -190], [-62, 27, -169], [-151, 10, -117], [-184, 20, -37], [-159, 13, 55], [-108, 31, 127], [-30, 14, 188]] },
      { id: 'undercut', nameKey: 'route.undercut.name', noteKey: 'route.undercut.note', points: [[0, 8, 164], [62, 5, 150], [126, 4, 96], [156, 11, 25], [141, 5, -44], [87, 7, -107], [16, 12, -156], [-64, 5, -141], [-128, 4, -96], [-154, 12, -27], [-132, 5, 48], [-88, 9, 112], [-26, 6, 168]] },
    ],
  },
  {
    id: 'mirage-grid', nameKey: 'course.mirage.name', descriptorKey: 'course.mirage.desc', accent: '#ff557e', secondary: '#37f2d0', background: '#140a19',
    route: [
      { id: 'highline', nameKey: 'route.highline.name', noteKey: 'route.highline.note', points: [[0, 20, 190], [96, 14, 173], [177, 28, 101], [214, 18, 18], [177, 37, -71], [107, 14, -168], [4, 23, -198], [-101, 14, -166], [-191, 32, -100], [-205, 11, -10], [-169, 26, 89], [-92, 13, 174]] },
      { id: 'undercut', nameKey: 'route.undercut.name', noteKey: 'route.undercut.note', points: [[0, 6, 166], [76, 7, 151], [140, 10, 89], [166, 5, 8], [133, 9, -71], [66, 7, -133], [-8, 16, -162], [-91, 7, -135], [-151, 9, -77], [-169, 5, 3], [-135, 13, 83], [-67, 7, 147]] },
    ],
  },
  {
    id: 'abyssal-run', nameKey: 'course.abyss.name', descriptorKey: 'course.abyss.desc', accent: '#43ffd1', secondary: '#a678ff', background: '#070d19',
    route: [
      { id: 'highline', nameKey: 'route.highline.name', noteKey: 'route.highline.note', points: [[0, 11, 179], [82, 17, 169], [158, 36, 111], [195, 17, 30], [164, 11, -56], [108, 29, -137], [14, 42, -190], [-77, 20, -153], [-178, 13, -113], [-206, 34, -20], [-164, 15, 74], [-84, 26, 159]] },
      { id: 'undercut', nameKey: 'route.undercut.name', noteKey: 'route.undercut.note', points: [[0, 5, 164], [72, 6, 153], [133, 6, 96], [163, 8, 23], [133, 5, -50], [78, 8, -118], [-2, 12, -158], [-81, 5, -128], [-149, 6, -88], [-170, 8, -17], [-131, 5, 62], [-68, 8, 142]] },
    ],
  },
]

export const ROUTE_WIDTH = 15
const SEGMENTS = 420
const ROAD_HALF = ROUTE_WIDTH / 2
const UP = new THREE.Vector3(0, 1, 0)

function mat(color: string, roughness = 0.5, metalness = 0.3, emissive?: string, intensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: emissive ?? '#000000', emissiveIntensity: intensity })
}
function seedRandom(seed: number): () => number {
  let x = seed >>> 0
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 4294967296
  }
}
function frame(curve: THREE.CatmullRomCurve3, t: number) {
  const point = curve.getPointAt((t % 1 + 1) % 1)
  const tangent = curve.getTangentAt((t % 1 + 1) % 1).normalize()
  const right = new THREE.Vector3().crossVectors(tangent, UP).normalize()
  if (right.lengthSq() < 0.01) right.set(1, 0, 0)
  const normal = new THREE.Vector3().crossVectors(right, tangent).normalize()
  return { point, tangent, right, normal }
}

export class CourseWorld {
  readonly root = new THREE.Group()
  readonly curve: THREE.CatmullRomCurve3
  readonly length: number
  readonly hazards: TrackHazard[] = []
  readonly pickups: THREE.Group[] = []
  readonly definition: CourseDefinition
  readonly route: RouteDefinition
  readonly roadAccent: string

  constructor(readonly scene: THREE.Scene, selection: CourseSelection) {
    this.definition = COURSES.find(c => c.id === selection.courseId) ?? COURSES[0]
    this.route = this.definition.route.find(r => r.id === selection.routeId) ?? this.definition.route[0]
    this.roadAccent = this.definition.accent
    this.curve = new THREE.CatmullRomCurve3(this.route.points.map(p => new THREE.Vector3(...p)), true, 'catmullrom', 0.42)
    this.curve.arcLengthDivisions = 1800
    this.curve.updateArcLengths()
    this.length = this.curve.getLength()
    this.root.name = `${this.definition.id}:${this.route.id}`
    this.scene.background = new THREE.Color(this.definition.background)
    this.scene.fog = new THREE.FogExp2(this.definition.background, 0.00075)
    this.root.add(this.makeRoad(), this.makeRails(), this.makeCity(), this.makeStars(), this.makeSkylineCore(), this.makeHazards(), this.makePickups())
    this.scene.add(this.root)
  }

  pose(distance: number, lane = 0, lift = 0) {
    const d = (distance % this.length + this.length) % this.length
    const f = frame(this.curve, d / this.length)
    f.point.addScaledVector(f.right, lane).addScaledVector(f.normal, lift)
    return f
  }

  hazardState(h: TrackHazard, time: number): boolean {
    return Math.sin(time * 2.35 + h.phase) > -0.08
  }

  update(time: number): void {
    for (const h of this.hazards) {
      const active = this.hazardState(h, time)
      h.glow.emissiveIntensity = active ? 3.1 + Math.sin(time * 10 + h.phase) * 0.6 : 0.24
      h.glow.color.set(active ? '#ff4776' : this.definition.accent)
      h.group.scale.y = 1 + Math.sin(time * 4.2 + h.phase) * 0.025
      h.group.userData.active = active
    }
    for (const [i, pickup] of this.pickups.entries()) {
      pickup.rotation.y = time * 0.9 + i * 0.7
      pickup.position.y = Math.sin(time * 2 + i) * 0.6
    }
  }

  dispose(): void {
    this.scene.remove(this.root)
    this.root.traverse(o => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      for (const material of (Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [])) material.dispose()
    })
  }

  private makeRoad(): THREE.Group {
    const group = new THREE.Group()
    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const leftEdge: number[] = []
    const rightEdge: number[] = []
    const center: number[] = []
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const t = i / SEGMENTS
      const { point, right, normal } = frame(this.curve, t)
      const surface = point.clone().addScaledVector(normal, 0.05)
      const left = surface.clone().addScaledVector(right, -ROAD_HALF)
      const rightPos = surface.clone().addScaledVector(right, ROAD_HALF)
      positions.push(left.x, left.y, left.z, rightPos.x, rightPos.y, rightPos.z)
      uvs.push(0, t * 80, 1, t * 80)
      leftEdge.push(left.x, left.y + 0.02, left.z)
      rightEdge.push(rightPos.x, rightPos.y + 0.02, rightPos.z)
      const c = surface.clone().addScaledVector(normal, 0.025)
      center.push(c.x, c.y, c.z)
      if (i < SEGMENTS) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const road = new THREE.Mesh(geometry, mat('#101923', 0.34, 0.72))
    road.receiveShadow = true
    road.castShadow = false
    group.add(road)
    group.add(this.makeRibbon(leftEdge, 0.34, this.definition.accent, 0.95), this.makeRibbon(rightEdge, 0.34, this.definition.accent, 0.95))

    const centerPoints: THREE.Vector3[] = []
    for (let i = 0; i < SEGMENTS; i += 1) {
      if (i % 10 > 5) continue
      const p = new THREE.Vector3(center[i * 3], center[i * 3 + 1], center[i * 3 + 2])
      const n = new THREE.Vector3(center[(i + 1) * 3], center[(i + 1) * 3 + 1], center[(i + 1) * 3 + 2])
      centerPoints.push(p, n)
    }
    const laneGeo = new THREE.BufferGeometry().setFromPoints(centerPoints)
    const laneMat = new THREE.LineBasicMaterial({ color: this.definition.secondary, transparent: true, opacity: 0.74 })
    group.add(new THREE.LineSegments(laneGeo, laneMat))
    return group
  }

  private makeRibbon(edgePositions: number[], width: number, color: string, emissive: number): THREE.Mesh {
    const points = Array.from({ length: edgePositions.length / 3 }, (_, i) => new THREE.Vector3(edgePositions[i * 3], edgePositions[i * 3 + 1], edgePositions[i * 3 + 2]))
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.42 + emissive * 0.2 }))
    line.computeLineDistances()
    line.scale.setScalar(1)
    line.userData.width = width
    return line as unknown as THREE.Mesh
  }

  private makeRails(): THREE.InstancedMesh {
    const count = Math.floor(SEGMENTS / 7) * 2
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 1.2, 0.34), mat(this.definition.accent, 0.28, 0.38, this.definition.accent, 0.48), count)
    const obj = new THREE.Object3D()
    let index = 0
    for (let i = 0; i < SEGMENTS; i += 7) {
      const pose = this.pose(this.length * i / SEGMENTS)
      for (const sign of [-1, 1]) {
        obj.position.copy(pose.point).addScaledVector(pose.right, sign * (ROAD_HALF - 0.45)).addScaledVector(pose.normal, 0.64)
        obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), pose.tangent)
        obj.scale.set(1, 0.8 + ((i / 7) % 3) * 0.14, 1)
        obj.updateMatrix()
        mesh.setMatrixAt(index++, obj.matrix)
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    return mesh
  }

  private makeCity(): THREE.Group {
    const group = new THREE.Group()
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: '#071018', roughness: 0.93, metalness: 0.1 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -9
    floor.receiveShadow = true
    group.add(floor)
    const grid = new THREE.GridHelper(1000, 100, new THREE.Color('#20414c'), new THREE.Color('#10232d'))
    grid.position.y = -8.94
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
    for (const m of gridMaterials) { m.transparent = true; m.opacity = 0.25 }
    group.add(grid)

    const random = seedRandom(this.definition.id.length * 371 + this.route.id.length * 173)
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1)
    const buildingMat = mat('#101d27', 0.68, 0.35, '#122b33', 0.25)
    const windowsMat = mat(this.definition.secondary, 0.32, 0.3, this.definition.secondary, 0.8)
    const buildings = new THREE.InstancedMesh(buildingGeo, buildingMat, 92)
    const windowBands = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 1), windowsMat, 92)
    const obj = new THREE.Object3D()
    for (let i = 0; i < 92; i += 1) {
      const angle = (i / 92) * Math.PI * 2 + (random() - 0.5) * 0.06
      const radius = 275 + random() * 100
      const w = 7 + random() * 17
      const d = 7 + random() * 14
      const h = 18 + random() * 105
      obj.position.set(Math.cos(angle) * radius, -8 + h / 2, Math.sin(angle) * radius)
      obj.rotation.y = -angle
      obj.scale.set(w, h, d)
      obj.updateMatrix()
      buildings.setMatrixAt(i, obj.matrix)
      obj.position.y = -8 + h * (0.24 + random() * 0.54)
      obj.scale.set(w * 1.01, 0.14, d * 1.01)
      obj.updateMatrix()
      windowBands.setMatrixAt(i, obj.matrix)
    }
    buildings.instanceMatrix.needsUpdate = true
    windowBands.instanceMatrix.needsUpdate = true
    buildings.receiveShadow = true
    group.add(buildings, windowBands)

    const dots = new THREE.Group()
    for (let i = 0; i < 18; i += 1) {
      const angle = (i / 18) * Math.PI * 2 + 0.08
      const tower = new THREE.Mesh(new THREE.BoxGeometry(3 + random() * 4, 26 + random() * 32, 3 + random() * 4), mat('#15232d', 0.46, 0.45))
      tower.position.set(Math.cos(angle) * 234, 3, Math.sin(angle) * 234)
      tower.lookAt(0, 0, 0)
      dots.add(tower)
    }
    group.add(dots)
    return group
  }

  private makeStars(): THREE.Points {
    const random = seedRandom(20260417 + this.definition.id.length)
    const coords = new Float32Array(1000 * 3)
    for (let i = 0; i < 1000; i += 1) {
      const angle = random() * Math.PI * 2
      const y = 60 + random() * 340
      const radius = 300 + random() * 320
      coords.set([Math.cos(angle) * radius, y, Math.sin(angle) * radius], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(coords, 3))
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#b5ddff', size: 1.45, sizeAttenuation: false, transparent: true, opacity: 0.74 }))
  }

  private makeSkylineCore(): THREE.Group {
    const group = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.TorusGeometry(32, 0.38, 12, 96), mat(this.definition.accent, 0.28, 0.45, this.definition.accent, 1.4))
    ring.position.set(0, 34, -8)
    ring.rotation.x = Math.PI / 2.55
    group.add(ring)
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(46, 0.14, 8, 96), mat(this.definition.secondary, 0.28, 0.4, this.definition.secondary, 0.82))
    ring2.position.copy(ring.position)
    ring2.rotation.set(ring.rotation.x + 0.2, 0.25, 0.1)
    group.add(ring2)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: '#182939' }))
    moon.position.set(-180, 205, -370)
    group.add(moon)
    return group
  }

  private makeHazards(): THREE.Group {
    const group = new THREE.Group()
    const fractions = [0.115, 0.28, 0.445, 0.615, 0.79, 0.93]
    fractions.forEach((fraction, i) => {
      const lane = (i % 2 === 0 ? -1 : 1) * (2.65 + (i % 3) * 0.4)
      const p = this.pose(this.length * fraction, lane)
      const hazard = new THREE.Group()
      hazard.position.copy(p.point)
      hazard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), p.tangent)
      const ringMaterial = mat('#ff4b73', 0.3, 0.4, '#ff285e', 2.4)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.18, 8, 44), ringMaterial)
      ring.position.y = 5.1
      hazard.add(ring)
      const beamMaterial = mat('#ff416d', 0.25, 0.4, '#ff174e', 2.8)
      const beam = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.28, 0.4), beamMaterial)
      beam.position.set(0, 1.18, 0)
      hazard.add(beam)
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.4, 8), mat('#ff345f', 0.32, 0.3, '#ed1a48', 1.4))
        post.position.set(side * 2.4, 1.1, 0)
        hazard.add(post)
      }
      hazard.userData.active = false
      group.add(hazard)
      this.hazards.push({ distance: this.length * fraction, lane, phase: i * 1.57 + this.definition.id.length * 0.34, group: hazard, beam, glow: beamMaterial })
    })
    return group
  }

  private makePickups(): THREE.Group {
    const group = new THREE.Group()
    for (let i = 0; i < 12; i += 1) {
      const fraction = 0.045 + i / 12
      const p = this.pose(this.length * fraction, 0, 2.2)
      const ring = new THREE.Group()
      ring.position.copy(p.point)
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.normal)
      const outer = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.12, 8, 24), mat(this.definition.secondary, 0.25, 0.25, this.definition.secondary, 2.2))
      outer.scale.set(1, 1.18, 1)
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), mat('#e8f5ff', 0.18, 0.42, this.definition.secondary, 3.2))
      ring.add(outer, core)
      group.add(ring)
      this.pickups.push(ring)
    }
    return group
  }
}

export const MODE_INFO = {
  sprint: { nameKey: 'mode.sprint.name', descriptionKey: 'mode.sprint.desc', laps: 1 },
  'time-attack': { nameKey: 'mode.time.name', descriptionKey: 'mode.time.desc', laps: 3 },
  'drift-cup': { nameKey: 'mode.drift.name', descriptionKey: 'mode.drift.desc', laps: 2 },
} as const
export type RaceModeId = keyof typeof MODE_INFO
export type RaceSelection = CourseSelection & { mode: RaceModeId }

export function recordKey(selection: RaceSelection): string {
  return `${selection.courseId}|${selection.routeId}|${selection.mode}`
}

export function courseById(id: CourseId): CourseDefinition {
  return COURSES.find(c => c.id === id) ?? COURSES[0]
}
