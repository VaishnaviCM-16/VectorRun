import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Renderer } from '../engine/renderer'
import { CONFIG } from './config'
import { CourseWorld, recordKey, type RaceSelection } from './course'
import { advance, awardCleanLanding, awardNearMiss, calculateMedal, createRun, driveSpeed, recordHit, scoreEvent, tickDrift, type GhostFrame, type RaceRun } from './rules'
import { RivalPack, type RivalStanding } from './rivals'
import { tuning } from './tuning'
import { createVehicleModel, vehicleSpec, type VehicleId } from './vehicles'

export type GameMode = 'attract' | 'playing' | 'paused' | 'ended'
export type GameHooks = {
  popup(text: string, tone: 'score' | 'danger' | 'ghost'): void
  finish(run: RaceRun, position: number, rivals: RivalStanding[]): void
}

const FRONT = new THREE.Vector3(0, 0, -1)
const clamp = THREE.MathUtils.clamp
const damp = (from: number, to: number, speed: number, dt: number) => THREE.MathUtils.damp(from, to, speed, dt)

/** Fixed-step arcade racer. The road is spline-driven; steering changes racing line, while jump/drift/boost change the vertical and scoring state. */
export class Game {
  mode: GameMode = 'attract'
  selection: RaceSelection = { courseId: 'vanta-crown', routeId: 'highline', mode: 'time-attack' }
  run: RaceRun
  reducedMotion = false
  steerAssist = true
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 1800)
  readonly carRoot = new THREE.Group()
  readonly ghostRoot = new THREE.Group()
  road: CourseWorld
  private readonly chaseTarget = new THREE.Vector3()
  private readonly chasePosition = new THREE.Vector3()
  private readonly shadow = new THREE.Mesh(new THREE.CircleGeometry(2.3, 24), new THREE.MeshBasicMaterial({ color: '#03060c', transparent: true, opacity: 0.62, depthWrite: false }))
  private model: THREE.Object3D
  private boostJets: THREE.Mesh[] = []
  private wheelMeshes: THREE.Object3D[] = []
  private previewDistance = 0
  private lateralSpeed = 0
  private lift = 0
  private steering = 0
  private hitCooldown = 0
  private jumpCooldown = 0
  private nextSample = 0
  private hitSet = new Set<number>()
  private pickupSet = new Set<number>()
  private time = 0
  private shake = 0
  private finished = false
  private vehicleId: VehicleId = 'vector-vxr'
  private vehicleAsset?: THREE.Object3D
  private rivals?: RivalPack

  constructor(private readonly renderer: Renderer, private readonly input: Input, private readonly audio: Audio, private readonly hooks: GameHooks) {
    this.scene.background = new THREE.Color('#081118')
    this.scene.fog = new THREE.FogExp2('#081118', 0.00075)
    this.scene.add(new THREE.HemisphereLight('#b5e7ff', '#14202b', 1.15))
    const key = new THREE.DirectionalLight('#dcf5ff', 3.0)
    key.position.set(-90, 135, 80)
    key.castShadow = true
    key.shadow.mapSize.set(renderer.shadowMapSize, renderer.shadowMapSize)
    key.shadow.camera.left = -280; key.shadow.camera.right = 280; key.shadow.camera.top = 280; key.shadow.camera.bottom = -280
    key.shadow.camera.near = 1; key.shadow.camera.far = 700
    this.scene.add(key)
    const rim = new THREE.DirectionalLight('#52ccff', 2.1)
    rim.position.set(90, 55, -180)
    this.scene.add(rim)
    this.scene.add(new THREE.AmbientLight('#a7bbd2', 0.55))
    this.road = new CourseWorld(this.scene, this.selection)
    this.run = createRun(this.selection, this.road.length)
    this.model = this.makePlaceholder()
    this.carRoot.add(this.model)
    this.scene.add(this.carRoot, this.ghostRoot)
    this.ghostRoot.visible = false
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.renderOrder = 3
    this.scene.add(this.shadow)
    this.makeBoostJets()
    this.camera.fov = CONFIG.camera.fov
    this.camera.updateProjectionMatrix()
    this.setPose(this.previewDistance)
    this.chasePosition.copy(this.carRoot.position).add(new THREE.Vector3(0, 7, 15))
    this.camera.position.copy(this.chasePosition)
  }

  get recordId(): string { return recordKey(this.selection) }
  get length(): number { return this.road.length }
  get racePosition(): number { return this.rivals?.position(this.run.distance, this.run.elapsed) ?? 1 }
  get rivalStandings(): RivalStanding[] { return this.rivals?.standings(this.run.distance, this.run.elapsed) ?? [] }

  setVehicleModel(gltf: GLTF): void {
    this.vehicleAsset = gltf.scene
    if (this.vehicleId === 'vector-vxr') this.applyVehicle()
  }

  setVehicle(id: VehicleId): void {
    if (id === this.vehicleId) return
    this.vehicleId = id
    this.applyVehicle()
  }

  private applyVehicle(): void {
    const next = this.vehicleId === 'vector-vxr' && this.vehicleAsset
      ? this.vehicleAsset.clone(true)
      : createVehicleModel(this.vehicleId)
    if (this.vehicleId === 'vector-vxr' && this.vehicleAsset) this.fitModel(next)
    this.carRoot.remove(this.model)
    this.model = next
    this.carRoot.add(next)
    this.wheelMeshes = []
    next.traverse(o => {
      if (/wheel|tire|tyre/i.test(o.name)) this.wheelMeshes.push(o)
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true }
    })
    const ghost = next.clone(true)
    ghost.traverse(o => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.material = new THREE.MeshBasicMaterial({ color: '#74f5ff', transparent: true, opacity: 0.34, wireframe: true, depthWrite: false })
        mesh.castShadow = false
      }
    })
    this.ghostRoot.clear()
    this.ghostRoot.add(ghost)
    this.ghostRoot.visible = false
    this.makeBoostJets()
  }

  select(selection: RaceSelection): void {
    const changed = selection.courseId !== this.selection.courseId || selection.routeId !== this.selection.routeId
    this.selection = { ...selection }
    if (changed) {
      this.road.dispose()
      const next = new CourseWorld(this.scene, selection)
      this.road = next
      this.camera.far = 1800
      this.camera.updateProjectionMatrix()
    }
    this.run = createRun(this.selection, this.road.length)
    this.setPose(0)
  }

  start(selection: RaceSelection, recordTime: number | undefined, ghost: GhostFrame[] | undefined, steerAssist: boolean): void {
    tuning.activate('run')
    this.select(selection)
    this.steerAssist = steerAssist
    this.run = createRun(selection, this.road.length, recordTime, ghost, tuning.unranked)
    this.rivals?.dispose()
    this.rivals = new RivalPack(this.scene, this.road, this.run.targetDistance)
    this.hitSet.clear(); this.pickupSet.clear()
    this.hitCooldown = 0; this.jumpCooldown = 0; this.lateralSpeed = 0; this.lift = 0; this.steering = 0
    this.nextSample = 0; this.finished = false; this.shake = 0
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
    this.audio.unlock()
    this.audio.startMusic()
  }

  pause(): void { if (this.mode === 'playing') { this.mode = 'paused'; this.audio.stopMusic() } }
  resume(): void { if (this.mode === 'paused') { this.mode = 'playing'; this.audio.startMusic(); this.input.endFrame() } }
  toTitle(): void {
    this.mode = 'attract'; this.audio.stopMusic(); this.input.endFrame()
    this.rivals?.dispose(); this.rivals = undefined
  }

  setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.renderer.applyQuality(quality)
    const shadow = this.scene.children.find(o => o instanceof THREE.DirectionalLight && o.castShadow) as THREE.DirectionalLight | undefined
    if (!shadow) return
    shadow.shadow.map?.dispose()
    shadow.shadow.map = null
    shadow.shadow.mapSize.set(this.renderer.shadowMapSize, this.renderer.shadowMapSize)
    this.scene.traverse(obj => {
      const material = (obj as THREE.Mesh).material
      for (const m of (Array.isArray(material) ? material : material ? [material] : [])) m.needsUpdate = true
    })
  }

  step(dt: number): void {
    this.time += dt
    const jumpPressed = this.input.consume('jump')
    this.input.consume('dash')
    if (this.mode !== 'playing') {
      if (this.mode === 'attract') {
        this.previewDistance = 0
        this.setPose(0)
      }
      this.road.update(this.time)
      return
    }
    let run = this.run
    run.unranked ||= tuning.unranked
    if (jumpPressed && !run.airborne && this.jumpCooldown <= 0) {
      tuning.activate('jump')
      run.airborne = true
      run.jumpVelocity = CONFIG.player.jumpSpeed
      run.airTime = 0
      this.jumpCooldown = 0.28
      this.audio.play('jump')
      this.hooks.popup('AIRBORNE', 'score')
    }

    const throttle = Math.max(0, this.input.move.y)
    const braking = Math.max(0, -this.input.move.y)
    const driftHeld = this.input.held('dash')
    const boosting = this.input.held('sprint') && run.nitro > 0.005
    const vehicle = vehicleSpec(this.vehicleId)
    if (boosting && run.boostTime <= 0) {
      tuning.activate('dash')
      run.boostTime = CONFIG.player.dashTime
      this.audio.play('dash')
      this.hooks.popup('VECTOR BURST', 'score')
    }
    if (boosting) {
      run.nitro = Math.max(0, run.nitro - dt * 0.13)
      run.boostTime = Math.max(0, run.boostTime - dt)
    } else run.boostTime = Math.max(0, run.boostTime - dt * 2.3)

    const vehicleSpeedFactor = vehicle.topSpeed / 56
    const throttleLimit = (CONFIG.player.walkSpeed + throttle * (CONFIG.player.sprintSpeed - CONFIG.player.walkSpeed)) * vehicleSpeedFactor
    const speedLimit = boosting && throttle > 0 ? Math.max(throttleLimit, CONFIG.player.dashSpeed * vehicleSpeedFactor) : throttleLimit
    run.speed = driveSpeed(run.speed, throttle, braking, dt, speedLimit, CONFIG.player.acceleration * (vehicle.acceleration / 23) * (boosting ? 1.12 : 1))
    if (driftHeld && Math.abs(this.input.move.x) > 0.18) run.speed = Math.max(0, run.speed * (1 - dt * 0.14))
    this.steering = damp(this.steering, this.input.move.x * this.input.sensitivity * vehicle.steering, 14, dt)
    const turn = this.steering
    const airSteer = run.airborne ? CONFIG.player.airControl : 1
    const lateralRate = (2.4 + run.speed * 0.14) * (0.16 + clamp(run.speed / 18, 0, 1) * 0.84)
    this.lateralSpeed += (turn * lateralRate * airSteer - this.lateralSpeed * (this.steerAssist ? 1.08 : 0.36)) * dt
    if (this.steerAssist && Math.abs(turn) < 0.08) this.lateralSpeed -= run.lane * 0.22 * dt
    run.lane += this.lateralSpeed * dt
    this.lateralSpeed = clamp(this.lateralSpeed, -8.5, 8.5)

    tickDrift(run, dt, run.speed, driftHeld && Math.abs(turn) > 0.2 && !run.airborne)
    if (run.airborne) {
      run.airTime += dt
      run.jumpVelocity += CONFIG.player.gravity * dt
      this.lift += run.jumpVelocity * dt
      if (this.lift <= 0 && run.airTime > 0.28) {
        this.lift = 0
        run.airborne = false
        this.audio.play('land')
        if (run.airTime > 0.52 && Math.abs(run.lane) < 5.5) {
          const earned = awardCleanLanding(run)
          this.hooks.popup(`PERFECT LANDING +${earned}`, 'score')
        } else if (Math.abs(run.lane) > 6.8) {
          this.impact('WIDE LANDING')
        }
        run.jumpVelocity = 0
        run.airTime = 0
      }
    }
    this.hitCooldown = Math.max(0, this.hitCooldown - dt)
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt)
    this.road.update(this.time)
    this.rivals?.update(dt, run.elapsed + dt)

    const oldDistance = run.distance
    run = advance(run, dt)
    this.run = run
    this.checkCourseEvents(oldDistance, run.distance)
    if (run.elapsed >= this.nextSample) {
      run.ghostFrames.push({ t: run.elapsed, d: run.distance, lane: run.lane, lift: this.lift })
      this.nextSample = run.elapsed + 0.12
    }
    this.updateGhost(run.elapsed)
    run.ghostDelta = this.ghostDelta(run.elapsed)
    if (run.phase === 'finished' && !this.finished) {
      this.finished = true
      run.medal = calculateMedal(run)
      this.mode = 'ended'
      this.audio.stopMusic()
      this.audio.play('win')
      this.hooks.finish(run, this.racePosition, this.rivalStandings)
    }
  }

  render(_alpha: number, frameSeconds: number): void {
    const dt = Math.min(frameSeconds, 0.05)
    this.road.update(this.time)
    const distance = this.mode === 'attract' ? this.previewDistance : this.run.distance
    const pose = this.road.pose(distance, this.mode === 'attract' ? 0.7 : this.run.lane, this.mode === 'playing' ? this.lift : 0)
    this.positionCar(this.carRoot, pose.point, pose, this.mode === 'playing' ? this.steering : 0, this.mode === 'playing' ? this.run.speed : 22, this.mode === 'playing' && this.run.airborne)
    this.rivals?.placeCars()
    this.shadow.position.set(pose.point.x, pose.point.y + 0.08, pose.point.z)
    this.shadow.visible = !this.run.airborne || this.mode !== 'playing'
    const pace = this.mode === 'playing' ? this.run.speed : 0
    const desiredCamera = pose.point.clone().addScaledVector(pose.tangent, -(CONFIG.camera.distance + pace * 0.065)).addScaledVector(pose.normal, CONFIG.camera.height + pace * 0.025)
    if (this.mode === 'attract') desiredCamera.addScaledVector(pose.right, Math.sin(this.time * 0.17) * 15)
    if (!this.reducedMotion && this.shake > 0) desiredCamera.add(new THREE.Vector3(Math.sin(this.time * 42), Math.cos(this.time * 37), Math.sin(this.time * 32)).multiplyScalar(this.shake * 0.18))
    this.shake = Math.max(0, this.shake - dt * 1.8)
    this.chasePosition.lerp(desiredCamera, 1 - Math.exp(-CONFIG.camera.follow * dt))
    this.camera.position.copy(this.chasePosition)
    this.chaseTarget.copy(pose.point).addScaledVector(pose.tangent, 15).addScaledVector(pose.normal, 0.4)
    this.camera.lookAt(this.chaseTarget)
    const fov = clamp(CONFIG.camera.fov + Math.max(0, pace - 28) * 0.2, CONFIG.camera.fov, 81)
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov = damp(this.camera.fov, fov, 3.8, dt); this.camera.updateProjectionMatrix() }
    for (const wheel of this.wheelMeshes) wheel.rotation.x += pace * dt * 0.18
    for (const jet of this.boostJets) {
      jet.visible = this.mode === 'playing' && this.run.boostTime > 0
      jet.scale.set(0.6 + pace * 0.01, 0.6 + pace * 0.01, 0.55 + Math.random() * 0.45)
    }
    this.renderer.render(this.scene, this.camera)
  }

  private checkCourseEvents(oldDistance: number, newDistance: number): void {
    const run = this.run
    const firstLap = Math.floor(oldDistance / this.road.length)
    const lastLap = Math.floor(newDistance / this.road.length)
    for (let lap = firstLap; lap <= lastLap; lap += 1) {
      for (let i = 0; i < this.road.hazards.length; i += 1) {
        const hazard = this.road.hazards[i]
        const crossing = lap * this.road.length + hazard.distance
        if (oldDistance < crossing && newDistance >= crossing) {
          const key = lap * this.road.hazards.length + i
          if (this.hitSet.has(key)) continue
          this.hitSet.add(key)
          const laneDifference = Math.abs(run.lane - hazard.lane)
          const active = this.road.hazardState(hazard, this.time)
          if (active && laneDifference < 2.45 && !run.airborne && this.lift < 0.8) this.impact('GATE STRIKE')
          else if (laneDifference < 4.8 || run.airborne) {
            const earned = awardNearMiss(run)
            this.hooks.popup(`NEAR MISS +${earned}`, 'score')
            this.audio.play('pickup')
          }
        }
      }
      for (let i = 0; i < 12; i += 1) {
        const crossing = lap * this.road.length + this.road.length * (0.045 + i / 12)
        const key = lap * 12 + i
        if (oldDistance < crossing && newDistance >= crossing && !this.pickupSet.has(key)) {
          this.pickupSet.add(key)
          scoreEvent(run, 120)
          run.nitro = Math.min(1, run.nitro + 0.12)
          this.audio.play('pickup')
          this.hooks.popup('VECTOR CELL +120', 'score')
        }
      }
    }
    if (Math.abs(run.lane) > 7.3 && this.hitCooldown <= 0) this.impact('OFF THE LINE')
  }

  private impact(message: string): void {
    if (this.hitCooldown > 0) return
    const run = this.run
    recordHit(run)
    run.speed *= 0.69
    run.lane = clamp(run.lane, -8, 8)
    this.lateralSpeed *= -0.24
    this.hitCooldown = 1.3
    this.shake = this.reducedMotion ? 0 : 0.42
    this.audio.play('hurt')
    this.hooks.popup(message, 'danger')
  }

  private updateGhost(time: number): void {
    const frames = this.run.opponentFrames
    if (!frames?.length) { this.ghostRoot.visible = false; return }
    const frame = this.frameAtTime(frames, time)
    if (!frame || frame.d >= this.run.targetDistance) { this.ghostRoot.visible = false; return }
    const pose = this.road.pose(frame.d, frame.lane, frame.lift)
    this.positionCar(this.ghostRoot, pose.point, pose, 0, 0, false)
    this.ghostRoot.visible = true
  }

  private ghostDelta(time: number): number | null {
    const frames = this.run.opponentFrames
    if (!frames?.length) return null
    const f = this.frameAtTime(frames, time)
    return f ? this.run.distance - f.d : this.run.distance
  }

  private frameAtTime(frames: GhostFrame[], time: number): GhostFrame | undefined {
    if (time < frames[0].t) return frames[0]
    let lo = 0; let hi = frames.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (frames[mid].t < time) lo = mid + 1
      else hi = mid
    }
    const b = frames[lo]; const a = frames[Math.max(0, lo - 1)]
    const t = b.t <= a.t ? 0 : clamp((time - a.t) / (b.t - a.t), 0, 1)
    return { t: time, d: THREE.MathUtils.lerp(a.d, b.d, t), lane: THREE.MathUtils.lerp(a.lane, b.lane, t), lift: THREE.MathUtils.lerp(a.lift, b.lift, t) }
  }

  private setPose(distance: number): void {
    const pose = this.road.pose(distance, 0, 0)
    this.positionCar(this.carRoot, pose.point, pose, 0, 0, false)
  }

  private positionCar(root: THREE.Group, position: THREE.Vector3, pose: ReturnType<CourseWorld['pose']>, steering: number, speed: number, airborne: boolean): void {
    root.position.copy(position).addScaledVector(pose.normal, 0.55)
    root.quaternion.setFromUnitVectors(FRONT, pose.tangent)
    root.rotateY(-steering * 0.24)
    root.rotateZ(this.reducedMotion ? 0 : steering * (airborne ? 0.16 : 0.075))
    if (speed > 0) root.rotateX(airborne ? -0.08 : Math.min(0.035, speed * 0.00038))
  }

  private fitModel(model: THREE.Object3D): void {
    model.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    const maxHorizontal = Math.max(size.x, size.z, 0.1)
    const scale = 4.35 / maxHorizontal
    model.scale.setScalar(scale)
    // The imported vehicle's longest axis is local X; turn its nose onto the track's -Z forward axis.
    model.rotation.y = Math.PI / 2
    model.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(model)
    const center = fitted.getCenter(new THREE.Vector3())
    model.position.x -= center.x
    model.position.y -= fitted.min.y + 0.13
    model.position.z -= center.z
  }

  private makePlaceholder(): THREE.Group {
    const car = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#101e2c', roughness: 0.34, metalness: 0.72 })
    const accentMat = new THREE.MeshStandardMaterial({ color: '#c9ff38', emissive: '#c9ff38', emissiveIntensity: 1.1, metalness: 0.25, roughness: 0.28 })
    const glass = new THREE.MeshStandardMaterial({ color: '#183b48', emissive: '#0c4952', emissiveIntensity: 0.55, metalness: 0.55, roughness: 0.18 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.58, 4.3), bodyMat)
    body.position.y = 0.42; body.castShadow = true
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.12, 2.1, 4), bodyMat)
    nose.rotation.x = -Math.PI / 2; nose.position.set(0, 0.45, -2.5); nose.scale.set(1, 1, 0.52)
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.64, 1.65), glass)
    canopy.position.set(0, 0.92, -0.15)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.5), accentMat)
    wing.position.set(0, 0.65, 1.85)
    car.add(body, nose, canopy, wing)
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.34, 18)
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#03070b', roughness: 0.52, metalness: 0.28 })
    const hubMat = new THREE.MeshStandardMaterial({ color: '#c9ff38', emissive: '#c9ff38', emissiveIntensity: 0.7 })
    for (const x of [-1.12, 1.12]) for (const z of [-1.45, 1.45]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.47, z); wheel.castShadow = true
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.37, 12), hubMat)
      hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position)
      car.add(wheel, hub); this.wheelMeshes.push(wheel)
    }
    const lampMat = new THREE.MeshStandardMaterial({ color: '#d7ffff', emissive: '#69eaff', emissiveIntensity: 4 })
    for (const x of [-0.75, 0.75]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.1), lampMat)
      lamp.position.set(x, 0.54, -2.65); car.add(lamp)
    }
    return car
  }

  private makeBoostJets(): void {
    for (const old of this.boostJets) this.carRoot.remove(old)
    this.boostJets = []
    for (const x of [-0.62, 0.62]) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 8), new THREE.MeshBasicMaterial({ color: '#63eaff', transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false }))
      flame.position.set(x, 0.55, 2.55)
      flame.rotation.x = Math.PI / 2
      flame.visible = false
      this.carRoot.add(flame)
      this.boostJets.push(flame)
    }
  }
}
