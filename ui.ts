import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import type { Quality, SaveData, SaveStore } from '../engine/save'
import { COURSES, MODE_INFO, type RaceSelection } from '../game/course'
import { formatClock, progressPercent, type RaceRun } from '../game/rules'
import type { RivalStanding } from '../game/rivals'
import { VEHICLES, type VehicleId } from '../game/vehicles'
import { landingScreen } from './landing'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'leaderboard' | 'results'
export type UiActions = {
  play(selection: RaceSelection): void
  restart(): void
  resume(): void
  quit(): void
  selection(selection: RaceSelection): void
  vehicle(id: VehicleId): void
  settings(patch: Partial<SaveData>): void
}

const logoMark = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 50 25 12h10L52 50H40l-10-24-10 24Z" fill="currentColor"/><path d="M21 42h20" stroke="#c9ff38" stroke-width="5"/><path d="m14 56 36-44" stroke="#39e9ff" stroke-width="2" opacity=".8"/></svg>'
const iconPause = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z" fill="currentColor"/></svg>'

export class Ui {
  screen: Screen = 'boot'
  selection: RaceSelection = { courseId: 'vanta-crown', routeId: 'highline', mode: 'time-attack' }
  vehicleId: VehicleId
  private readonly root: HTMLElement
  private readonly stack: Screen[] = []
  private cache = new Map<string, string>()
  private navRepeat = 0
  private lastMethod = ''
  private savedRank = -1

  constructor(private readonly i18n: I18n, private readonly save: SaveStore, private readonly audio: Audio, private readonly input: Input, private readonly actions: UiActions) {
    this.vehicleId = save.data.vehicleId
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    this.root.addEventListener('focusin', e => { if ((e.target as HTMLElement).matches('.btn, .seg button, .toggle, .course-card, .choice-chip')) this.audio.play('ui') })
    window.addEventListener('keydown', e => this.onKey(e))
    i18n.onChange(() => this.translate())
    this.translate(); this.refreshSettings(); this.renderSelection()
  }

  show(screen: Screen): void { this.stack.length = 0; this.setScreen(screen) }
  push(screen: Screen): void { this.stack.push(this.screen); this.setScreen(screen) }
  back(): void { const prev = this.stack.pop(); if (prev) this.setScreen(prev); else if (this.screen === 'pause') this.actions.resume() }
  private setScreen(screen: Screen): void {
    this.screen = screen
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const active = el.dataset.screen === screen || (el.dataset.screen === 'hud' && (screen === 'pause' || screen === 'results' || (screen === 'settings' && this.stack.includes('pause'))))
      el.classList.toggle('is-active', active); el.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
    if (screen === 'title') { this.renderSelection(); this.renderTitleRecord() }
    if (screen === 'leaderboard') this.renderLeaderboard()
    requestAnimationFrame(() => {
      const first = this.navItems()[0]
      if (first && this.input.method !== 'touch') first.focus({ preventScroll: true })
      else (document.activeElement as HTMLElement | null)?.blur?.()
    })
  }

  setBootProgress(progress: number): void { this.q<HTMLElement>('.boot-progress i').style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})` }

  updateHud(run: RaceRun, position = 1, totalCars = 5): void {
    this.set('speed', String(Math.round(run.speed * 3.6)).padStart(3, '0'))
    this.set('clock', formatClock(run.elapsed))
    this.set('lap', `${String(Math.min(run.targetLaps, Math.floor(run.distance / run.trackLength) + 1)).padStart(2, '0')}<i> / ${String(run.targetLaps).padStart(2, '0')}</i>`)
    this.set('score', Math.floor(run.score).toLocaleString('en-US'))
    this.set('combo', `${run.combo}×`); this.set('peak', String(run.comboPeak).padStart(2, '0'))
    this.set('air', String(run.cleanLandings)); this.set('near', String(run.nearMisses)); this.set('hits', String(run.hits))
    this.set('position', `P${position}<small> / ${totalCars}</small>`)
    this.q<HTMLElement>('.race-progress > i').style.transform = `scaleX(${progressPercent(run)})`
    this.q<HTMLElement>('.lap-orbit').style.setProperty('--lap', String(run.distance / run.trackLength % 1))
    this.q<HTMLElement>('.nitro-meter i').style.transform = `scaleX(${run.nitro})`
    this.q<HTMLElement>('.drift-meter i').style.transform = `scaleX(${Math.min(1, run.driftTime / 5)})`
    const delta = this.q<HTMLElement>('.ghost-delta')
    if (run.ghostDelta === null) { delta.textContent = 'NO GHOST'; delta.dataset.state = 'neutral' }
    else { const ahead = run.ghostDelta >= 0; delta.textContent = `${ahead ? 'AHEAD' : 'BEHIND'} ${Math.abs(run.ghostDelta).toFixed(1)}M`; delta.dataset.state = ahead ? 'ahead' : 'behind' }
    this.q<HTMLElement>('.drift-state').classList.toggle('is-active', run.driftTime > 0.12)
    this.q<HTMLElement>('.race-readout').classList.toggle('is-boosting', run.boostTime > 0)
    this.q<HTMLElement>('.speed-unit').textContent = run.boostTime > 0.05 ? 'BOOST' : 'KM/H'
  }

  popup(text: string, tone: 'score' | 'danger' | 'ghost'): void {
    const el = document.createElement('div'); el.className = `race-toast toast-${tone}`; el.textContent = text
    this.q('.toasts').append(el); window.setTimeout(() => el.remove(), 1800)
  }

  showResults(run: RaceRun, newRecord: boolean, position: number, rivals: RivalStanding[]): void {
    this.q<HTMLElement>('.results').dataset.medal = run.medal
    this.q<HTMLElement>('.results-medal').textContent = this.i18n.t(`results.${run.medal}`)
    this.q<HTMLElement>('.results-course').textContent = `${this.i18n.t(COURSES.find(c => c.id === run.selection.courseId)?.nameKey ?? 'game.title')} / ${this.i18n.t(run.selection.routeId === 'highline' ? 'route.highline.name' : 'route.undercut.name')}`
    this.q<HTMLElement>('.results-time').textContent = formatClock(run.elapsed)
    this.q<HTMLElement>('.results-score').textContent = Math.floor(run.score).toLocaleString('en-US')
    this.q<HTMLElement>('.results-combo').textContent = `${run.comboPeak}×`
    this.q<HTMLElement>('.results-air').textContent = String(run.cleanLandings)
    this.q<HTMLElement>('.results-near').textContent = String(run.nearMisses)
    this.q<HTMLElement>('.results-hits').textContent = String(run.hits)
    this.q<HTMLElement>('.results-position').textContent = `P${position} / ${rivals.length + 1}`
    this.renderRaceResults(run, rivals)
    const recordNotice = this.q('.results-record')
    recordNotice.dataset.i18n = run.unranked ? 'results.unranked' : 'results.newRecord'
    recordNotice.classList.toggle('is-hidden', !newRecord && !run.unranked)
    this.translate(); this.show('results')
  }

  private renderRaceResults(run: RaceRun, rivals: RivalStanding[]): void {
    const rows = [
      ...rivals.filter(rival => rival.ahead).map(rival => ({ name: rival.name, time: rival.time, player: false })),
      { name: `${this.save.data.playerName} · YOU`, time: run.elapsed, player: true },
      ...rivals.filter(rival => !rival.ahead).map(rival => ({ name: rival.name, time: rival.time, player: false })),
    ]
    const list = this.q<HTMLOListElement>('.results-rivals')
    list.replaceChildren()
    rows.forEach((row, index) => {
      const item = document.createElement('li')
      item.className = row.player ? 'is-player' : ''
      const rank = document.createElement('b'); rank.textContent = String(index + 1).padStart(2, '0')
      const name = document.createElement('span'); name.textContent = row.name
      const time = document.createElement('em'); time.textContent = row.time === null ? this.i18n.t('results.onCourse') : formatClock(row.time)
      item.append(rank, name, time)
      list.append(item)
    })
  }

  refreshSettings(): void {
    const d = this.save.data
    for (const key of ['musicVolume', 'sfxVolume', 'sensitivity'] as const) this.q<HTMLInputElement>(`[name="${key}"]`).value = String(d[key])
    for (const t of this.qa<HTMLButtonElement>('.toggle')) {
      const key = t.dataset.setting as 'muted' | 'reducedMotion' | 'steerAssist'
      const on = d[key] === true
      t.setAttribute('aria-pressed', String(on))
      t.querySelector<HTMLElement>('.toggle-state')!.textContent = this.i18n.t(on ? t.dataset.labelOn ?? 'settings.on' : t.dataset.labelOff ?? 'settings.off')
    }
    for (const button of this.qa<HTMLButtonElement>('.seg button[data-value]')) {
      if (button.parentElement?.dataset.setting === 'quality') button.setAttribute('aria-pressed', String(button.dataset.value === d.quality))
    }
    for (const r of this.qa<HTMLInputElement>('input[type="range"]')) this.paintRange(r)
    this.translate()
  }

  private onClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], .toggle, .seg button, [data-course], [data-route], [data-mode], [data-vehicle]')
    if (!target) return
    this.audio.unlock()
    if (target.hasAttribute('data-course')) { this.selection.courseId = target.dataset.course as RaceSelection['courseId']; this.renderSelection(); this.actions.selection(this.selection); this.audio.play('ui'); return }
    if (target.hasAttribute('data-route')) { this.selection.routeId = target.dataset.route as RaceSelection['routeId']; this.renderSelection(); this.actions.selection(this.selection); this.audio.play('ui'); return }
    if (target.hasAttribute('data-mode')) { this.selection.mode = target.dataset.mode as RaceSelection['mode']; this.renderSelection(); this.actions.selection(this.selection); this.audio.play('ui'); return }
    if (target.hasAttribute('data-vehicle')) {
      this.vehicleId = target.dataset.vehicle as VehicleId
      this.actions.settings({ vehicleId: this.vehicleId }); this.actions.vehicle(this.vehicleId); this.renderSelection(); this.audio.play('ui'); return
    }
    if (target.matches('.toggle')) {
      const key = target.dataset.setting as 'muted' | 'reducedMotion' | 'steerAssist'
      this.actions.settings({ [key]: !this.save.data[key] }); this.refreshSettings(); this.audio.play('ui'); return
    }
    if (target.matches('.seg button')) {
      const key = target.parentElement!.dataset.setting
      if (key === 'quality') this.actions.settings({ quality: target.dataset.value as Quality })
      this.refreshSettings(); this.audio.play('ui'); return
    }
    switch (target.dataset.action) {
      case 'play': this.actions.play(this.selection); break
      case 'resume': this.actions.resume(); break
      case 'restart': this.actions.restart(); break
      case 'quit': this.actions.quit(); break
      case 'settings': this.push('settings'); break
      case 'leaderboard': this.push('leaderboard'); break
      case 'back': this.back(); break
      case 'pause': window.dispatchEvent(new CustomEvent('game:pause')); break
    }
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement
    if (el.type !== 'range') return
    this.paintRange(el); this.actions.settings({ [el.name]: Number(el.value) } as Partial<SaveData>)
  }
  private paintRange(el: HTMLInputElement): void { el.style.setProperty('--fill', `${((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100}%`) }

  private onKey(e: KeyboardEvent): void {
    if (this.screen === 'hud' || this.screen === 'boot') return
    const typing = (e.target as HTMLElement).matches?.('input:not([type="range"]), textarea')
    if (e.code === 'Escape' && this.screen !== 'pause' && this.screen !== 'title' && !typing) {
      e.preventDefault(); this.input.consume('pause'); this.back(); return
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); this.moveFocus(e.code === 'ArrowDown' ? 1 : -1) }
    if (e.code === 'Enter' && !typing && this.screen === 'title' && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); this.actions.play(this.selection) }
  }

  frame(frameSeconds: number): void {
    if (this.input.method !== this.lastMethod) { this.lastMethod = this.input.method; this.renderPrompts() }
    if (this.screen === 'hud' || this.screen === 'boot') return
    if (this.input.method !== 'gamepad') { this.input.consume('confirm'); this.input.consume('back'); return }
    const y = this.input.move.y, x = this.input.move.x
    this.navRepeat = Math.max(0, this.navRepeat - frameSeconds)
    const active = document.activeElement as HTMLElement | null
    if (Math.abs(y) > 0.6 && this.navRepeat <= 0) { this.moveFocus(y < 0 ? 1 : -1); this.navRepeat = 0.22 }
    else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.matches('input[type="range"]')) {
      const r = active as HTMLInputElement; r.value = String(Number(r.value) + Math.sign(x) * Number(r.step || 0.1)); r.dispatchEvent(new Event('input', { bubbles: true })); this.navRepeat = 0.12
    } else if (Math.abs(x) > 0.6 && this.navRepeat <= 0 && active?.parentElement?.matches('.seg')) {
      const sib = (Math.sign(x) > 0 ? active.nextElementSibling : active.previousElementSibling) as HTMLElement | null; sib?.focus(); this.navRepeat = 0.22
    } else if (Math.abs(y) < 0.3 && Math.abs(x) < 0.3) this.navRepeat = 0
    if (this.input.consume('confirm')) (document.activeElement as HTMLElement | null)?.click()
    if (this.input.consume('back') && this.screen !== 'title') this.back()
  }

  private renderSelection(): void {
    for (const el of this.qa<HTMLElement>('[data-course]')) {
      const selected = el.dataset.course === this.selection.courseId
      el.classList.toggle('is-selected', selected); el.setAttribute('aria-pressed', String(selected))
    }
    for (const el of this.qa<HTMLElement>('[data-route]')) {
      const selected = el.dataset.route === this.selection.routeId
      el.classList.toggle('is-selected', selected); el.setAttribute('aria-pressed', String(selected))
    }
    for (const el of this.qa<HTMLElement>('[data-mode]')) {
      const selected = el.dataset.mode === this.selection.mode
      el.classList.toggle('is-selected', selected); el.setAttribute('aria-pressed', String(selected))
    }
    for (const el of this.qa<HTMLElement>('[data-vehicle]')) {
      const selected = el.dataset.vehicle === this.vehicleId
      el.classList.toggle('is-selected', selected); el.setAttribute('aria-pressed', String(selected))
    }
    const course = COURSES.find(c => c.id === this.selection.courseId) ?? COURSES[0]
    this.q<HTMLElement>('.selection-accent')?.style.setProperty('--course-accent', course.accent)
    this.q<HTMLElement>('.selected-route-copy').textContent = this.i18n.t(this.selection.routeId === 'highline' ? 'route.highline.note' : 'route.undercut.note')
    this.q<HTMLElement>('.selected-mode-copy').textContent = this.i18n.t(MODE_INFO[this.selection.mode].descriptionKey)
    this.renderTitleRecord()
  }

  private renderTitleRecord(): void {
    const record = this.save.data.records[`${this.selection.courseId}|${this.selection.routeId}|${this.selection.mode}`]
    this.q<HTMLElement>('.garage-record').textContent = record ? `${this.i18n.t('menu.personalBest')}  ${formatClock(record)}` : this.i18n.t('menu.noRecord')
  }

  private renderLeaderboard(): void {
    const list = this.q<HTMLOListElement>('.board')
    const board = this.save.data.leaderboard
    if (!board.length) { list.innerHTML = `<li class="board-empty">${this.i18n.t('leaderboard.empty')}</li>`; return }
    list.innerHTML = board.map((entry, i) => `<li class="${i === this.savedRank ? 'is-me' : ''}"><b>${String(i + 1).padStart(2, '0')}</b><span class="board-name"></span><span>${formatClock(entry.seconds)}</span><em>${entry.score.toLocaleString('en-US')}</em></li>`).join('')
    list.querySelectorAll('.board-name').forEach((el, i) => (el.textContent = board[i].name))
  }

  private renderPrompts(): void {
    const key = this.input.method === 'gamepad' ? 'controls.prompt.pad' : this.input.method === 'touch' ? 'controls.prompt.touch' : this.input.method === 'pointer' ? 'controls.prompt.pointer' : 'controls.prompt.keyboard'
    for (const el of this.qa<HTMLElement>('.prompts')) el.textContent = this.i18n.t(key)
  }
  private translate(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = this.i18n.t(el.dataset.i18n!)
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-i18n-label]')) el.setAttribute('aria-label', this.i18n.t(el.dataset.i18nLabel!))
    for (const el of this.root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) el.placeholder = this.i18n.t(el.dataset.i18nPlaceholder!)
    this.renderPrompts(); this.renderSelection(); this.cache.clear(); document.title = 'VECTOR//RUN'
  }

  private set(slot: string, html: string): void {
    if (this.cache.get(slot) === html) return
    this.cache.set(slot, html)
    for (const el of this.qa<HTMLElement>(`[data-slot="${slot}"]`)) el.innerHTML = html
  }
  private navItems(): HTMLElement[] { return [...this.q(`[data-screen="${this.screen}"]`).querySelectorAll<HTMLElement>('[data-nav]')].filter(el => el.offsetParent !== null && !el.closest('.is-hidden')) }
  private moveFocus(dir: 1 | -1): void { const items = this.navItems(); if (!items.length) return; const current = items.indexOf(document.activeElement as HTMLElement); items[(current + dir + items.length) % items.length].focus() }
  private q<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)! }
  private qa<T extends HTMLElement = HTMLElement>(selector: string): T[] { return [...this.root.querySelectorAll<T>(selector)] }

  private template(): string {
    const courseCards = COURSES.map((course, i) => `<button class="course-card" data-nav data-course="${course.id}" aria-pressed="false" style="--card-accent:${course.accent}"><span class="course-code">0${i + 1}</span><span class="course-copy"><b data-i18n="${course.nameKey}"></b><small data-i18n="${course.descriptorKey}"></small></span><i class="course-notch"></i></button>`).join('')
    const vehicleCards = VEHICLES.map((vehicle, i) => `<button class="vehicle-card" data-nav data-vehicle="${vehicle.id}" aria-pressed="false" style="--car-accent:${vehicle.accent}"><span>0${i + 1}</span><b data-i18n="${vehicle.nameKey}"></b><small data-i18n="${vehicle.detailKey}"></small></button>`).join('')
    return /* html */ `
<section class="screen screen-boot is-active" data-screen="boot"><div class="boot-center"><span class="brand-mark">${logoMark}</span><div class="boot-brand">VECTOR<span>//</span>RUN</div><div class="boot-progress"><i></i></div><p data-i18n="boot.loading"></p></div><div class="boot-lines"></div></section>
${landingScreen(courseCards, vehicleCards, logoMark)}
<section class="screen screen-hud" data-screen="hud"><div class="hud-scanline"></div><div class="toasts"></div><div class="damage-flash"></div><div class="hud-top"><div class="hud-brand"><span>${logoMark}</span><b>VECTOR<span>//</span>RUN</b><small>PROTOCOL 09</small></div><div class="race-progress"><i></i><div class="progress-gates"><b></b><b></b><b></b><b></b><b></b></div></div><div class="hud-top-right"><span class="lap-readout"><small data-i18n="hud.lap"></small><b data-slot="lap"></b></span><button class="hud-pause" data-action="pause" data-i18n-label="touch.pause">${iconPause}</button></div></div>
<div class="hud-left"><div class="telemetry-label" data-i18n="hud.telemetry"></div><div class="race-readout"><strong data-slot="speed">000</strong><span class="speed-unit">KM/H</span><div class="speed-ticks"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="hud-instrument"><span data-i18n="hud.time"></span><b data-slot="clock">0:00.00</b></div><div class="race-position"><span data-i18n="hud.position"></span><b data-slot="position">P5<small> / 5</small></b></div><div class="hud-instrument"><span data-i18n="hud.score"></span><b data-slot="score">0</b></div><div class="ghost-delta" data-state="neutral">NO GHOST</div></div>
<div class="hud-right"><div class="combo-card"><span data-i18n="hud.combo"></span><b data-slot="combo">0×</b><small><span data-i18n="hud.peak"></span> <i data-slot="peak">00</i></small></div><div class="lap-orbit"><div><b data-i18n="hud.lap"></b><strong data-slot="lap"></strong></div></div></div>
<div class="hud-bottom"><div class="drift-state"><span class="drift-glyph">↘</span><span data-i18n="hud.drift"></span><div class="drift-meter"><i></i></div><small><span data-i18n="hud.near"></span> <b data-slot="near">0</b></small></div><div class="nitro-card"><div><span data-i18n="hud.nitro"></span><b data-i18n="hud.nitroHint"></b></div><div class="nitro-meter"><i></i></div></div><div class="race-stats"><span><i data-i18n="hud.air"></i><b data-slot="air">0</b></span><span><i data-i18n="hud.hits"></i><b data-slot="hits">0</b></span></div></div>
<div class="touch"><div class="touch-stick"><i></i><b data-i18n="touch.steer"></b></div><div class="touch-actions"><button class="touch-btn touch-boost" data-touch="sprint"><b data-i18n="touch.boost"></b><small>HOLD</small></button><button class="touch-btn touch-drift" data-touch="dash"><b data-i18n="touch.drift"></b><small>HOLD</small></button><button class="touch-btn touch-jump" data-touch="jump"><b data-i18n="touch.jump"></b><small>TAP</small></button></div></div></section>
<section class="screen screen-overlay screen-pause" data-screen="pause"><div class="overlay-grid"></div><div class="modal modal-pause"><div class="modal-eyebrow" data-i18n="pause.eyebrow"></div><h2 class="modal-title" data-i18n="pause.title"></h2><p class="modal-copy" data-i18n="pause.copy"></p><nav class="modal-menu"><button data-nav class="btn btn-primary" data-action="resume"><span data-i18n="menu.resume"></span><i>↗</i></button><button data-nav class="btn" data-action="restart"><span data-i18n="menu.restart"></span><i>↻</i></button><button data-nav class="btn" data-action="settings"><span data-i18n="menu.settings"></span><i>⌘</i></button><button data-nav class="btn" data-action="quit"><span data-i18n="menu.garage"></span><i>←</i></button></nav></div><footer class="modal-footer"><div class="prompts"></div></footer></section>
<section class="screen screen-overlay screen-settings" data-screen="settings"><div class="overlay-grid"></div><div class="modal modal-wide"><div class="modal-eyebrow" data-i18n="settings.eyebrow"></div><h2 class="modal-title" data-i18n="settings.title"></h2><div class="settings-grid"><fieldset><legend data-i18n="settings.audio"></legend>${slider('musicVolume', 'settings.music', 0, 1, 0.05)}${slider('sfxVolume', 'settings.sfx', 0, 1, 0.05)}${toggle('muted', 'settings.mute')}</fieldset><fieldset><legend data-i18n="settings.driving"></legend>${slider('sensitivity', 'settings.steering', 0.2, 2.5, 0.1)}${toggle('steerAssist', 'settings.assist', 'settings.assisted', 'settings.manual')}</fieldset><fieldset><legend data-i18n="settings.visuals"></legend><div class="setting-row"><span data-i18n="settings.quality"></span><div class="seg" data-setting="quality"><button data-nav data-value="low" data-i18n="settings.low"></button><button data-nav data-value="medium" data-i18n="settings.medium"></button><button data-nav data-value="high" data-i18n="settings.high"></button></div></div>${toggle('reducedMotion', 'settings.reduceMotion')}</fieldset><div class="control-card"><b data-i18n="controls.title"></b><p data-i18n="controls.full"></p><p data-i18n="controls.mobile"></p></div></div><nav class="modal-actions"><button data-nav class="btn btn-primary" data-action="back"><span data-i18n="menu.done"></span><i>↗</i></button></nav></div><footer class="modal-footer"><div class="prompts"></div></footer></section>
<section class="screen screen-overlay screen-leaderboard" data-screen="leaderboard"><div class="overlay-grid"></div><div class="modal modal-wide"><div class="modal-eyebrow" data-i18n="leaderboard.eyebrow"></div><h2 class="modal-title" data-i18n="leaderboard.title"></h2><div class="board-head"><b>#</b><span data-i18n="leaderboard.driver"></span><span data-i18n="leaderboard.time"></span><em data-i18n="leaderboard.score"></em></div><ol class="board"></ol><nav class="modal-actions"><button data-nav class="btn btn-primary" data-action="back"><span data-i18n="menu.back"></span><i>↗</i></button></nav></div><footer class="modal-footer"><div class="prompts"></div></footer></section>
<section class="screen screen-overlay screen-results" data-screen="results"><div class="overlay-grid"></div><div class="modal modal-results results" data-medal="none"><div class="result-brand"><span>${logoMark}</span><b data-i18n="results.classified"></b></div><div class="results-record" data-i18n="results.newRecord"></div><div class="results-medal"></div><div class="results-position"></div><h2 class="modal-title" data-i18n="results.finish"></h2><div class="results-course"></div><div class="results-time"></div><div class="result-grid"><div><small data-i18n="results.score"></small><b class="results-score"></b></div><div><small data-i18n="results.combo"></small><b class="results-combo"></b></div><div><small data-i18n="results.landings"></small><b class="results-air"></b></div><div><small data-i18n="results.nearMisses"></small><b class="results-near"></b></div><div><small data-i18n="results.impacts"></small><b class="results-hits"></b></div></div><ol class="results-rivals" aria-label="Race standings"></ol><nav class="modal-actions"><button data-nav class="btn btn-primary" data-action="restart"><span data-i18n="results.again"></span><i>↻</i></button><button data-nav class="btn" data-action="quit"><span data-i18n="menu.garage"></span><i>←</i></button></nav></div><footer class="modal-footer"><div class="prompts"></div></footer></section>`
  }
}

function slider(name: string, label: string, min: number, max: number, step: number): string { return `<label class="setting-row"><span data-i18n="${label}"></span><input data-nav type="range" name="${name}" min="${min}" max="${max}" step="${step}"></label>` }
function toggle(key: string, label: string, on = 'settings.on', off = 'settings.off'): string { return `<div class="setting-row"><span data-i18n="${label}"></span><button class="toggle" data-nav data-setting="${key}" data-label-on="${on}" data-label-off="${off}" aria-pressed="false"><i></i><span class="toggle-state"></span></button></div>` }
