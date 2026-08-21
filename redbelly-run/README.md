# Redbelly Run — seven-zone waiting-room dash

A **fully self-contained** Sonic-style platformer in one HTML file.
No build step, no dependencies, no required external assets — all art is
drawn in canvas code and all audio is synthesized with WebAudio.

**Theme:** you are a hedgehog with a red belly. Run through **seven zones**
(HILL → MARBLE → SPRING YARD → LABYRINTH → STAR LIGHT → SCRAP BRAIN →
FINAL ZONE), grab the little *green options* (rings), dodge the *bad
trades* (enemies), beat the **Egg Crusher** boss, and **CASH OUT** as fast
as you can. The timer runs continuously across all seven zones.

## Play

Just open `index.html` in a browser (Chrome/Edge/Firefox/Safari).

| Key | Action |
|---|---|
| `A` / `D` | move |
| `W` / `Space` | jump (hold = higher) |
| `Shift` (either) / `X` | spin dash — tap 3 times, release |
| `S` | drop through platforms |
| `Esc` / `P` | pause |
| `M` | mute |
| `R` | restart |
| `Enter` | start / confirm on screens |
| `F` + `G` + `H` | **cheat** — hold all three together to cut to the next zone (in FINAL ZONE: straight to CASH OUT) |

Arrow keys are also mapped (for full keyboards) but not shown in the in-game
panel.

### On phones (touch)

On touch devices (iPhone 8 and up, Android) the game shows four
semi-transparent thumb buttons instead of needing a keyboard:

- **◀ / ▶** bottom-left — move
- **↑** (big) bottom-right — jump (hold = higher)
- **⚡ DASH** (labeled, above the jump button) — spin dash: tap once
  to launch (the mobile Shift×3, condensed to a single tap on touch)

The buttons are anchored to the *screen* corners, not the canvas: in
**portrait** the game is a letterboxed strip and the buttons sit in the
dark bar below it (they never cover the action); in **landscape** they
overlay the bottom corners of the game. Tapping the play area starts the
run (and restarts after the win/game-over screen, with a 0.9 s guard so
you can still read your rank). The canvas renders at the screen's native
resolution (devicePixelRatio-aware), pauses when the app loses focus or is
backgrounded, and zoom/pull-to-refresh is locked off. A portrait title
screen shows a "rotate to landscape" tip.

For QA on a desktop, `?touch=1` forces the touch buttons on.

The **F+G+H** cheat fires once per combo (releasing any key re-arms it) and
only works while a run is in progress. It triggers the exact same ZONE
CLEAR transition as reaching the gate (2.4 s banner, timer keeps running)
or, in the final zone (beating Robotnik instantly), the CASH OUT win. A
short on-screen "CUT → …" flash confirms it fired.

### The zones

- **Z1 · HILL ZONE** — daylight: sun, clouds, rolling hills, dirt-and-grass
  ground. Enemies: `FEE`, `STOP`, `LAG`, `SLIP`.
- **Z2 · MARBLE ZONE** — a dark crystal cavern à la the 16-bit original: a
  giant glowing **crystal core** in the background (turning rings, pulsing
  heart), polished dark-marble ground with bright cyan rims, stalactite
  ceiling, glowing crystal decor, and **glowing lava pits** (with rising
  embers) to jump over. Enemies: `SPAM` (fast hoppers), `RUG` (sliding
  carpets), `PUMP` (rising bubbles), `WICK` (darting flames).
- **Z3 · SPRING YARD** — a dusk-city **pinball amusement park** (à la the
  16-bit original): maroon brick ground with green wire fencing, blue pillars
  with pink caps, neon signs and sparkling light rows, purple mountains and
  lit city-skyline silhouettes under a pale moon. The signature gimmick is
  the **pinball bumpers** (bounce up, +50 points) plus roaming **iron balls**
  that shove you around. Red and yellow springs (two red MEGA) keep the
  bounce-across feel. Enemies mirror the original lineup: `DROP` (flying
  bomber), `CRAB` (scuttling crab), `ROLL` (rolling ball), `SPIK` (spiky
  crawler).
- **Z4 · LABYRINTH ZONE** — a flooded ancient ruin (à la the 16-bit
  original): murky green water, yellow-brick ground with moss and crystals,
  a vined stone ceiling and dim mosaic arches. New gimmicks: **sliding
  stone walls** (non-lethal — they shove you back; time your crossing),
  **floor spike strips** that extend and retract on a cycle, and **swinging
  iron-ball pendulums** hanging from the ceiling. Enemies: `HIDE` (burrows
  in the rubble and leaps when you approach), `JAWS` (spiky diver patrolling
  a water pit), `UNID` (heavy turtle, slow and steady), `GARG` (gargoyle on
  a plinth that spits fireballs — smash a fireball with a rolling spin for
  +50).
- **Z5 · STAR LIGHT ZONE** — the 16-bit original's finale: a highway
  construction site under a starry night sky. Dark asphalt road with a
  yellow centre line, raised overpasses and a low underpass, street lamps
  with warm light cones, red traffic cones, yellow-black striped barriers,
  green X-braced girders, roadwork signs, traffic lights and tire stacks;
  behind it all: twinkling stars, a distant lit city, a metal gantry
  truss, big turning fan silhouettes and the faint outline of an egg-shaped
  loop. New gimmicks: **construction fans** that spin up on a cycle and
  blast you backwards (non-lethal — cross when the blades are slow) and
  **seesaws** that fling you up high when you land on them. Enemies mirror
  the original lineup: `UNIC` (the little Uni Uni turtle that hops along),
  `BOMB` (spiky mines that blink red when you get close), `TIRE` (spiky
  tires rolling their lane) and `DRON` (propeller drones hovering over the
  lane).
- **Z6 · SCRAP BRAIN ZONE** — the polluted exterior of **Dr. Eggman's
  industrial base** (à la the 16-bit original): a smog-grey sky with
  billowing smoke plumes, a distant complex of light-grey factories with
  **blinking red/green/yellow warning lights**, rusted tanks, gears and
  girders. Dark industrial-concrete ground with rust patches, **red/yellow
  hazard-stripe edges** and a row of props — rusted pipes, control panels
  with blinking meters, slow-turning gears, stacked crates and rotating
  warning beacons. New gimmicks: **flame jets** (ground nozzles that spit a
  straight jet of fire in short timed windows — lethal while lit),
  **conveyor belts** that carry you while you're on them (some forward,
  some backwards) and **dropping platforms** that periodically flip down
  and reset. Enemies mirror the original lineup: `CATE` (the spiky
  Caterkiller crawler), `HOGG` (the spiky Ball Hog that patrols lazily,
  then charges at full tilt when you get close), plus reappearances of
  `BOMB` (mines) and `HIDE` (leaping Burrobots).
- **Z7 · FINAL ZONE** — the single-act boss room at the heart of Scrap
  Brain (à la the 16-bit original): a short corridor leads into the **Egg
  Crusher** arena — dark green laboratory walls with purple diamond panels
  and blinking warning lights, light-grey metal floor with yellow warning
  plates, a **door that slams shut behind you** (no going back) and a
  solid arena ceiling. The boss: **Dr. Robotnik riding the Egg Crusher** —
  a machine with two floor pistons (his platforms) that he teleports
  between after each hit. Stomp his head **8 times** to win. The machine
  fights back: two **ceiling crusher pistons** that slam down in
  telegraphed windows (red blink = it's coming — don't stand under it),
  and **energy orb columns** that drop from the ceiling after each hit
  (they always spawn away from his slot — stay near his slot, not under
  the orbs). No rings, no checkpoints, no goal gate — the run ends when
  the machine explodes and Robotnik flees in the Egg Mobile.

Crossing a **ZONE CLEAR** gate triggers a 2.4 s transition banner into the
next zone (the timer keeps running).

### The rules

- **Rings (green options)** = score + protection. Getting hit scatters your
  rings; getting hit with zero rings costs a life.
- **Enemies (bad trades)**: `FEE`/`SPAM` hop in place, `STOP`/`RUG` patrol,
  `LAG` crawls, `SLIP`/`PUMP` drift/float, `WICK` darts, in SPRING YARD
  `DROP` hovers in a figure-eight, `CRAB` scuttles (fast when you're near),
  `ROLL` rolls its lane, `SPIK` crawls with pulsing spines, in LABYRINTH
  `HIDE` ambushes, `JAWS` swims a pit, `UNID` plods and `GARG` spits
  fireballs (smash one with a rolling spin for +50), and in STAR LIGHT
  `UNIC` hops along, `BOMB` blinks when you approach, `TIRE` rolls and
  `DRON` hovers, and in SCRAP BRAIN `CATE` (the spiky Caterkiller crawler)
  inches along, `HOGG` (the spiky Ball Hog) patrols lazily then **charges
  at full tilt** the moment you get close, while `BOMB` and leaping `HIDE`
  badniks reappear. Jumping down on them or rolling into them smashes them
  (+100). Walking into them hurts.
- **Springs** launch you high (yellow pads in HILL, blue in MARBLE, yellow +
  red MEGA in SPRING YARD and STAR LIGHT — megas launch far higher).
  **Bumpers** in SPRING YARD give a shorter bounce plus 50 points. In
  LABYRINTH, **walls** shove (no damage), **spikes** and **pendulums**
  hurt. In STAR LIGHT, **fans** blast you backwards on a cycle (no damage)
  and **seesaws** fling you up. In SCRAP BRAIN, **flame jets** spit a
  straight jet of fire from ground nozzles in short timed windows (lethal
  while lit — time your crossing), **conveyor belts** carry you while
  you're on them (some forward, some backwards), and **dropping
  platforms** periodically flip down and reset (don't stand on one when it
  drops). **Checkpoints** light up when touched.
- In **FINAL ZONE** the boss body hurts from the side, but diving from
  above is stomp territory: land on his head while he is vulnerable
  (right after a hit he is briefly out of reach, and the machine shifts
  him to the other piston). The ceiling crushers and orb columns hurt.
  There are no rings to collect — any hit costs a life. Death respawns you
  at the arena entrance (the door is already shut).
- Fall in a pit or a lava/water pool, or get hit with no rings → lose a
  life, respawn at the last checkpoint (three lives).
- Ranks (total time for all seven zones): `S < 160s · A < 185s ·
  B < 210s · C < 245s`. Best time is saved in `localStorage`
  (`rb_run_best`).

## Dev / QA hooks

Query params on `index.html` (handy for screenshots or embedding):

```
index.html?autostart                  # skip title screen
index.html?autostart&x=2130          # teleport player to world x=2130 (lands on that ground)
index.html?autostart&stage=2         # start directly in MARBLE ZONE
index.html?autostart&stage=3         # start directly in SPRING YARD
index.html?autostart&stage=4         # start directly in LABYRINTH ZONE
index.html?autostart&stage=5         # start directly in STAR LIGHT ZONE
index.html?autostart&stage=6         # start directly in SCRAP BRAIN ZONE
index.html?autostart&stage=7         # start directly in FINAL ZONE (the boss)
index.html?autostart&x=2300&stage=2  # teleport inside MARBLE
index.html?autostart&win=1           # zones 1-6: jump to the final zone and finish;
                                     # FINAL ZONE: 1 HP left on Robotnik (one stomp wins)
index.html?autostart&x=5185&stage=2&boost=1  # capture the Marble→Spring banner
index.html?autostart&stage=4&x=3800&dbg=9  # dump a state snapshot to the title at t=9s
index.html?autostart&stage=7&t=1      # advance machine phases (piston 1 mid-slam)
index.html?autostart&stage=7&state=win   # force a state for screenshots
index.html?autostart&stage=7&orbs=1     # deterministic orb columns (screenshots)
```

`window.__RB` (browser console / tests): `state`, `player`, `time`, `lives`,
`best`, `stage`, `ringsTotal`, `loadStage(i)`, `startRun`, `teleport`,
`killAllEnemies`, `setLives`, `damage`, `step`, `render`, `keys`,
`bossZone()` (FINAL ZONE only: boss `x/y/hp/inv/dead/slots`, falling orbs,
ceiling-piston `ext`/`warn` state).

## Music

Seven optional drop-in slots, checked on first user gesture (works on
`file://` and `http`):

- `music1.mp3` — plays in **HILL** (zone 1). Falls back to the built-in
  168 BPM chiptune loop if missing.
- `music2.mp3` — plays in **MARBLE** (zone 2). Falls back to the built-in
  128 BPM, darker-transposed cavern loop if missing.
- `music3.mp3` — plays in **SPRING YARD** (zone 3). Falls back to the
  built-in 180 BPM upbeat loop if missing.
- `music4.mp3` — plays in **LABYRINTH** (zone 4). Falls back to the
  built-in 110 BPM slow, murky minor cavern loop if missing.
- `music5.mp3` — plays in **STAR LIGHT** (zone 5). Falls back to the
  built-in 176 BPM bright city-pop loop if missing.
- `music6.mp3` — plays in **SCRAP BRAIN** (zone 6). Falls back to the
  built-in 190 BPM tense industrial loop if missing.
- `music7.mp3` — plays in **FINAL ZONE** (zone 7). Falls back to the
  built-in 92 BPM slow, menacing boss-drone loop if missing.
- `.ogg` / `.wav` / `.m4a` variants are also probed (`music1.***`, …).

`M` mutes everything; `Esc`/`P` pauses the file track.

> **Currently in place:** `music1.mp3` (Green Hill Zone theme),
> `music2.mp3` (Marble Zone theme), `music3.mp3` (Spring Yard Zone theme),
> `music4.mp3` (Labyrinth Zone theme), `music5.mp3` (Star Light Zone theme),
> `music6.mp3` (Scrap Brain Zone theme) and `music7.mp3` (Final Zone theme)
> — all user-supplied. Deleting a file falls back to the original
> synthesized chiptune for that zone.
>
> Note: all seven are copyrighted Yuzo Koshiro / Sega compositions — fine
> for local/prototyping use, but if this ships publicly or gets pushed to a
> public repo, sort out the licensing first (and exclude the `music*.mp3`
> files from the repo until then).

## Tests

Headless (Node, no browser needed) — stubs the DOM/canvas and actually plays
the game:

```
node waiting-room/headless-test.js   # ~70 scenario checks: title, run, jump,
                                     # rings, all six zone transitions
                                     # (music1→…→music7), water pits (zones
                                     # 2, 3, 4 and 5), zone-6 pit + flame-jet
                                     # damage path, zone-7 door/ceiling/stomp/
                                     # orbs/respawn, win, gameover, damage,
                                     # drop-through, spin dash, pause, soak
node waiting-room/bot-test.js        # seven-zone traversal bot (geometry
                                     # check + the Egg Crusher stomp loop;
                                     # asserts the full run is completable,
                                     # reports completion time ~145 s)
```

Screenshots via headless Edge:

```
msedge --headless=new --window-size=1280,720 --virtual-time-budget=6000 \
  --screenshot=shots/play.png "file:///<path>/waiting-room/index.html?autostart&x=2150"
```

## Hosting (live public build)

The canonical home of the live game is the dedicated
**`RedbellyRun`** repo (`github.com/rbfl91/RedbellyRun`), which serves
its root via GitHub Pages:

- **`https://rbfl91.github.io/RedbellyRun/`** — share this URL
- repo contents: `index.html` (the game), `music1..7.mp3` (the
  per-zone drop-ins, probed relative to the page URL), `README.md`
- the dev working copy lives on the developer machine
  (`Redbelly MVP/waiting-room/`); to ship a build: copy the fresh HTML
  over `index.html` in the `RedbellyRun` repo, commit, push

A **mirror** of the game (same `index.html` + mp3s at the repo root)
still lives in the `BondsTradingProject` repo, so the older URL
`https://rbfl91.github.io/BondsTradingProject/` keeps working. If it is
ever removed there, only the `RedbellyRun` URL remains.
## Integrating into the platform

- Drop the `waiting-room/` folder anywhere you can serve static files.
- To embed in an iframe, no postMessage API is needed for basic play.
  (If you later want to e.g. auto-start or report finish times, extend the
  existing query-param hooks or add a small `window.postMessage` listener.)
- All player-facing text is in the `drawTitle`/`drawWin`/`drawGameOver` /
  `drawStageClear` functions if you want to rebrand.

## Architecture (single file)

- **Physics**: fixed 60 Hz timestep with an accumulator (float-jitter
  tolerant). Coyote time, jump buffering, variable jump height, spin-dash
  charge, rolling, one-way platforms with drop-through, springs (yellow
  normal + red MEGA that launch ~1.6× higher), heightmap terrain with slopes,
  pits, and (zone 2) glowing lava pools.
- **Stages**: data-driven `STAGES` array — `HILL` (worldW 4700, goal 4560),
  `MARBLE` (worldW 5400, goal 5200), `SPRINGY` (worldW 5600, goal 5400),
  `LABYR` (worldW 6200, goal 6000), `STL` (worldW 5800, goal 5600),
  `SCRAP` (worldW 5800, goal 5600), `FINAL` (worldW 1400, goal 99999 —
  never reached: victory comes from the boss). `applyStage(i)` binds all
  stage globals (`TERRAIN`, `PLATFORMS`, `SPRINGS`, `RINGS`, `ENEMIES`,
  `CHECKPOINTS`, `GOAL_X`, `WORLD_W`, `PITS`, plus zone-4 `WALLS`/
  `SPIKES`/`PENDS`, zone-5 `FANS`/`SEEWAS`, zone-6 `FJETS`/`BELTS` and
  zone-7 `CPISTS`/`CEIL`/`BOSS`/`doorClosed`), resets per-stage state, and
  sets the per-zone synth tempo. `loadStage(i)` resets player + camera
  (zone 7 respawns at the arena entrance, since the door is shut).
  Terrain segments are flat 4-value `[x0,y0,x1,y1]` pairs —
  `groundHeight()` only support that shape. Dropping platforms (zone 6) use
  an optional `dp`/`ph` flag: `platDown(pl)` returns true for ~15% of the
  cycle, skipping collision while the platform is dropped.
- **Rendering**: per-zone parallax backgrounds (day sky, crystal cavern with
  spires and glowing spores, dusk pinball-city with neon and lit buildings,
  murky ruin with dim mosaic arches, a starry construction-site night with
  city lights, gantry truss, fan silhouettes and a loop outline), a giant
  turning crystal core (zone 2), animated water/lava, stalactite/vined
  ceilings, deterministic decor (hash-based), particles, squash & stretch,
  camera lead + shake, per-zone ground/spring/platform/goal palettes, zone-4
  trap rendering (sliding walls with warning glow, cycling spike strips with
  pre-extension shimmer, swinging pendulums, gargoyle fireballs) and zone-5
  props (asphalt with a yellow centre line, street lamps, traffic cones,
  striped barriers, girders, roadwork signs, traffic lights, tire stacks,
  construction fans with wind streaks, seesaws, blinking pit-edge lamps) and
  zone-6 props (smog sky with smoke plumes and a factory complex with
  blinking warning lights, rusted concrete with hazard-stripe edges, pipes,
  control panels with blinking meters, turning gears, crates, warning
  beacons, animated conveyor belts with chevron strips, animated flame jets
  with embers, dropping platforms that sag and spark when down) and the
  zone-7 boss arena (dark-green lab wall panels with purple diamond
  accents and blinking warning lights, big pipe runs, metal floor with
  warning plates, a ceiling beam with a hazard band, two crusher pistons
  with state lights and floor danger ellipses, hazard-striped piston caps
  on hydraulic columns, the sliding door slab, Robotnik himself — yellow
  face, cyan goggles, red jacket, mustache, blink/low-HP sparks, death
  explosion + Egg Mobile escape — and rotating purple energy orbs).
- **Audio**: `AudioSys` — synthesized SFX + per-zone chiptune loops
  (lead/bass/drums, transposed per zone: 168/128/180/110/176/190/92 BPM),
  plus the optional `music1.mp3` … `music7.mp3` drop-ins that replace the
  synth loop for their zone.
- **State machine**: `title → play ⇄ paused → dying → (respawn | gameover)`,
  `stclear` (zone banner, timer keeps running) → next zone (generic: any
  non-final gate), `win`. FINAL ZONE has no gate: the boss's death
  sequence (explosions → the Egg Mobile flees → `advanceStage()`) ends the
  run.
- **The Egg Crusher (zone 7)**: Robotnik rides two floor-piston slots and
  teleports to the other one shortly after each hit (as in the original);
  8 head-stomps win. Stomps need a fast fall (`vy > 80`) onto the head
  zone; after a hit he is briefly out of reach and the machine shifts him.
  Two ceiling crusher pistons slam down in telegraphed sine windows
  (warn → ext), falling **energy orb columns** spawn offset from his slot
  after each hit (plus a periodic column), a door closes behind you at
  x=400, and the arena ceiling clamps jumps. The progress bar shows the
  boss's remaining hits instead of position.
- **Test hooks**: `window.__RB` exposes state, stage, player, and controls
  for the headless tests (harmless in the browser); `?dbg=N` dumps a state
  snapshot to `document.title` after N seconds of game time (for
  `--dump-dom` capture).
