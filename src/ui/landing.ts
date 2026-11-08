export function landingScreen(courseCards: string, vehicleCards: string, logoMark: string): string {
  return /* html */ `
<section class="screen screen-title" data-screen="title">
  <div class="title-grain"></div>
  <div class="title-veil"></div>
  <header class="title-top">
    <span class="landing-brand-mark">${logoMark}</span>
    <span class="eyebrow"><i></i> VECTOR DYNAMICS <b>/</b> NIGHT ARCADE</span>
    <span class="build-tag">LOCAL GRID <b>●</b> <span>04 RIVALS</span></span>
  </header>
  <main class="garage-layout">
    <section class="garage-copy landing-hero" aria-label="VECTOR//RUN game introduction">
      <div class="title-kicker" data-i18n="game.kicker"></div>
      <div class="logo-lockup">
        <h1 class="logo-text">VECTOR<span>//</span>RUN</h1>
        <div class="logo-axis">VR<br><i>09</i></div>
      </div>
      <p class="tagline" data-i18n="game.tagline"></p>
      <p class="landing-intro" data-i18n="landing.description"></p>
      <div class="landing-stats" aria-label="Race features">
        <div><b>03</b><span data-i18n="landing.statCircuits"></span></div>
        <div><b>04</b><span data-i18n="landing.statRivals"></span></div>
        <div><b>YOU</b><span data-i18n="landing.statDriver"></span></div>
      </div>
      <nav class="garage-actions" aria-label="Start or explore">
        <button class="launch-button" data-nav data-action="play"><span data-i18n="menu.launch"></span><i>↗</i></button>
        <button class="icon-button" data-nav data-action="leaderboard" data-i18n-label="menu.leaderboard" title="Records">⌁</button>
        <button class="icon-button" data-nav data-action="settings" data-i18n-label="menu.settings" title="Settings">⚙</button>
      </nav>
      <div class="control-summary" aria-label="Quick driving controls">
        <div class="control-summary-head">
          <b data-i18n="controls.quickLabel"></b>
          <button data-action="settings" data-i18n="controls.configure"></button>
        </div>
        <div class="control-guide-keys">
          <span><kbd>W</kbd><b data-i18n="controls.throttle"></b></span>
          <span><kbd>A</kbd><kbd>D</kbd><b data-i18n="controls.steer"></b></span>
          <span><kbd>S</kbd><b data-i18n="controls.brake"></b></span>
        </div>
        <small data-i18n="controls.quickNote"></small>
      </div>
    </section>
    <aside class="setup-panel" aria-label="Configure a race">
      <div class="setup-heading">
        <div><b data-i18n="landing.setup"></b><small data-i18n="landing.setupNote"></small></div>
        <span>GRID<br><strong>09</strong></span>
      </div>
      <div class="garage-record"></div>
      <div class="selector-block selector-course">
        <div class="section-label"><span data-i18n="menu.course"></span><i></i><small>01—03</small></div>
        <div class="course-list">${courseCards}</div>
      </div>
      <div class="selector-block selector-vehicle">
        <div class="section-label"><span data-i18n="menu.car"></span><i></i><small>CHOOSE YOUR CHASSIS</small></div>
        <div class="vehicle-list">${vehicleCards}</div>
      </div>
      <div class="selector-block selector-split">
        <div class="section-label"><span data-i18n="menu.line"></span><i></i><small>CHOOSE YOUR ARC</small></div>
        <div class="choice-row">
          <button class="choice-chip" data-nav data-route="highline" aria-pressed="false"><b data-i18n="route.highline.name"></b><small data-i18n="route.highline.short"></small></button>
          <button class="choice-chip" data-nav data-route="undercut" aria-pressed="false"><b data-i18n="route.undercut.name"></b><small data-i18n="route.undercut.short"></small></button>
        </div>
        <p class="selected-route-copy"></p>
      </div>
      <div class="selector-block selector-mode">
        <div class="section-label"><span data-i18n="menu.session"></span><i></i><small>RACE FORMAT</small></div>
        <div class="choice-row mode-row">
          <button class="choice-chip mode-chip" data-nav data-mode="sprint" aria-pressed="false"><b data-i18n="mode.sprint.name"></b><small>01 LAP</small></button>
          <button class="choice-chip mode-chip" data-nav data-mode="time-attack" aria-pressed="false"><b data-i18n="mode.time.name"></b><small>03 LAPS</small></button>
          <button class="choice-chip mode-chip" data-nav data-mode="drift-cup" aria-pressed="false"><b data-i18n="mode.drift.name"></b><small>02 LAPS</small></button>
        </div>
        <p class="selected-mode-copy"></p>
      </div>
    </aside>
  </main>
  <footer class="title-footer">
    <div class="prompts"></div>
    <span class="footer-code">THREE CIRCUITS <b>×</b> FOUR LOCAL RIVALS</span>
    <span class="footer-weather">START AT ZERO <i>—</i> TAKE THE THROTTLE</span>
  </footer>
</section>`
}
