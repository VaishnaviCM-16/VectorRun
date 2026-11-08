import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'jump' | 'dash' | 'run'
type Control = { id: string; type: 'number'; category: string; label: string; description: string; unit: string; default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY' }
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const bindings: Binding[] = []
function number<S extends keyof typeof CONFIG>(section: S, key: keyof typeof CONFIG[S] & string, label: string, min: number, max: number, step: number, unit: string, boundary?: Boundary): void {
  const values = CONFIG[section] as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as Record<string, number>
  bindings.push({ control: Object.freeze({ id: `${section}.${key}`, type: 'number', category: section === 'player' ? 'Driving' : section === 'camera' ? 'Camera' : 'Race', label,
    description: boundary === 'jump' ? 'Applies when the next jump begins.' : boundary === 'dash' ? 'Applies when boost is next activated.' : boundary === 'run' ? 'Applies at the next race start.' : 'Updates this preview immediately.',
    unit, default: defaults[key], min, max, step, applyMode: boundary === 'run' ? 'NEXT_RUN' : boundary ? 'NEXT_ACTION' : 'LIVE', integrity: section === 'camera' ? 'COSMETIC' : 'GAMEPLAY' }), boundary,
    read: () => values[key], write: value => { values[key] = value } })
}
number('player', 'walkSpeed', 'Feather-throttle speed', 14, 50, 1, 'm/s')
number('player', 'sprintSpeed', 'Full-throttle speed', 24, 85, 1, 'm/s')
number('player', 'acceleration', 'Throttle acceleration', 20, 120, 2, '')
number('player', 'airControl', 'Air steering', 0.1, 1, 0.05, '')
number('player', 'jumpSpeed', 'Launch force', 5, 20, 0.5, 'm/s', 'jump')
number('player', 'dashSpeed', 'Nitro ceiling', 32, 100, 1, 'm/s', 'dash')
number('player', 'dashTime', 'Nitro burst', 0.8, 5, 0.1, 's', 'dash')
number('camera', 'fov', 'Field of view', 42, 90, 1, '°')
number('camera', 'distance', 'Chase distance', 7, 24, 0.5, 'm')
number('camera', 'follow', 'Camera damping', 2, 16, 1, '')
number('run', 'seconds', 'Safety time cap', 60, 300, 10, 's', 'run')
number('run', 'lives', 'Crash tolerance', 1, 10, 1, '', 'run')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
const valid = (values: Record<string, number>) => values['player.walkSpeed'] <= values['player.sprintSpeed']
let unranked = false
const gameplayModified = () => bindings.some(binding => binding.control.integrity === 'GAMEPLAY' && binding.read() !== binding.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(binding => binding.control)),
  read() { return { requested: { ...requested }, active: Object.fromEntries(bindings.map(binding => [binding.control.id, binding.read()])) } },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (value !== control.default && Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    const candidate = { ...requested, ...patch } as Record<string, number>
    const nextActive = this.read().active
    for (const [id, value] of entries) if (byId.get(id)!.control.applyMode === 'LIVE') nextActive[id] = value
    if (!valid(candidate) || !valid(nextActive)) throw new Error('Cruise speed must not exceed throttle speed')
    requested = candidate
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) if (binding.boundary === boundary) binding.write(requested[binding.control.id])
    unranked = boundary === 'run' ? gameplayModified() : unranked || gameplayModified()
  },
}
