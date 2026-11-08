import { isVehicleId, type VehicleId } from '../game/vehicles'

export type Locale = 'en' | 'zh-CN'
export type Quality = 'low' | 'medium' | 'high'
export type ScoreEntry = { name: string; score: number; seconds: number; at: number }
export type SavedGhostFrame = { t: number; d: number; lane: number; lift: number }

export type SaveData = {
  version: 1
  locale: Locale | ''
  musicVolume: number
  sfxVolume: number
  muted: boolean
  sensitivity: number
  invertY: boolean
  quality: Quality
  reducedMotion: boolean
  steerAssist: boolean
  vehicleId: VehicleId
  tutorialDone: boolean
  playerName: string
  leaderboard: ScoreEntry[]
  records: Record<string, number>
  ghosts: Record<string, SavedGhostFrame[]>
}

export const SAVE_KEY = 'vector-run.save'
export const LEADERBOARD_SIZE = 10

export function defaultSave(): SaveData {
  return {
    version: 1, locale: '', musicVolume: 0.72, sfxVolume: 0.86, muted: false, sensitivity: 1,
    invertY: false, quality: 'high', reducedMotion: false, steerAssist: true, vehicleId: 'vector-vxr', tutorialDone: false,
    playerName: 'RUNNER', leaderboard: [], records: {}, ghosts: {},
  }
}
const clamp01 = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback
const validGhostFrame = (f: unknown): f is SavedGhostFrame => !!f && typeof f === 'object' && Number.isFinite((f as SavedGhostFrame).t) && Number.isFinite((f as SavedGhostFrame).d) && Number.isFinite((f as SavedGhostFrame).lane) && Number.isFinite((f as SavedGhostFrame).lift)

/** Parse untrusted browser storage into a bounded racing save record. */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave()
  if (!raw) return base
  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    data = parsed as Record<string, unknown>
  } catch { return base }
  if (data.version !== 1) return base
  const board = Array.isArray(data.leaderboard) ? data.leaderboard : []
  const rawRecords = data.records && typeof data.records === 'object' && !Array.isArray(data.records) ? data.records as Record<string, unknown> : {}
  const records = Object.fromEntries(Object.entries(rawRecords).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0).slice(0, 40)) as Record<string, number>
  const rawGhosts = data.ghosts && typeof data.ghosts === 'object' && !Array.isArray(data.ghosts) ? data.ghosts as Record<string, unknown> : {}
  const ghosts = Object.fromEntries(Object.entries(rawGhosts).filter(([key, value]) => typeof key === 'string' && Array.isArray(value)).slice(0, 40).map(([key, value]) => [key, (value as unknown[]).filter(validGhostFrame).slice(0, 1400)])) as Record<string, SavedGhostFrame[]>
  return {
    version: 1,
    locale: data.locale === 'en' || data.locale === 'zh-CN' ? data.locale : '',
    musicVolume: clamp01(data.musicVolume, base.musicVolume), sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true, sensitivity: typeof data.sensitivity === 'number' && data.sensitivity >= 0.2 && data.sensitivity <= 3 ? data.sensitivity : base.sensitivity,
    invertY: data.invertY === true, quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true, steerAssist: data.steerAssist !== false,
    vehicleId: isVehicleId(data.vehicleId) ? data.vehicleId : base.vehicleId, tutorialDone: data.tutorialDone === true,
    playerName: typeof data.playerName === 'string' && data.playerName.trim() ? data.playerName.trim().slice(0, 16) : base.playerName,
    leaderboard: board.filter((e): e is ScoreEntry => !!e && typeof e === 'object' && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score))
      .map(e => ({ name: e.name.slice(0, 16), score: Math.max(0, Math.floor(e.score)), seconds: Number.isFinite(e.seconds) ? Math.max(0, e.seconds) : 0, at: Number.isFinite(e.at) ? e.at : 0 })).slice(0, LEADERBOARD_SIZE),
    records, ghosts,
  }
}

export function insertScore(board: ScoreEntry[], entry: ScoreEntry): { board: ScoreEntry[]; rank: number } {
  const next = [...board, entry].sort((a, b) => b.score - a.score || a.seconds - b.seconds || a.at - b.at).slice(0, LEADERBOARD_SIZE)
  return { board: next, rank: next.indexOf(entry) }
}

export class SaveStore {
  data: SaveData
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
    let raw: string | null = null
    try { raw = this.storage?.getItem(SAVE_KEY) ?? null } catch { raw = null }
    this.data = parseSave(raw)
  }
  update(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch }
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data)) } catch { /* Keep settings in memory when browser storage is unavailable. */ }
  }
}
