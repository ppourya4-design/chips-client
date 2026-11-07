# Chips — Step 0 reconnaissance

Recon of fork commit `d2993438351d2ac785a5a7bc70b491a76b2e3865` on 2026-11-06. This is an inventory, not a claim that the Windows desktop app or the live server has been tested. No product code was changed in this step.

## Repository map and data flow

```text
web/                            React 19 + TypeScript + Vite 8 client
  src/main.tsx                  entry, unlock/sync dialogs
  src/App.tsx                   main UI, connection/session handling, most dialogs
  src/voice.ts, aec3.ts         browser microphone/audio processing
  src/stream.ts, publish.ts     streaming
  src/App.css, index.css, styles/ide.css  presentation
  src/locales/, i18n.tsx        UI translations
  public/                       icons and static assets
  scripts/sync-aec3-assets.mjs  copies dependency's AEC3 WASM assets before dev/build
  vite.config.ts                PWA, build ID, base path

gateway/                        Node.js + TypeScript HTTP/WebSocket server
  src/index.ts                  static UI, /ws, API, session dispatch and limits
  src/ts3/connection.ts          spawns connector; translates messages/events
  src/net.ts                    target/network restrictions
  src/telemetry.ts              upstream usage ping (enabled by default)
  src/{news,store,sync}*.ts     ancillary services and optional standalone servers

connector/                      Rust binary `ts-connector`
  src/main.rs                   CLI, stdin commands, stdout JSON events, TS features
  Cargo.toml, Cargo.lock        dependencies / locked Rust dependency graph

tsclientlib/                    git submodule, Moepchi/tsclientlib `webspeak3` fork
  tsclientlib/                  client library, state, resolver and audio
  tsproto/, utils/              protocol, packet, bookkeeping, declarations crates
  utils/tsproto-structs/declarations/  nested submodule (protocol declarations)

.github/workflows/              upstream Docker, Safari and release workflows
Dockerfile, docker-compose.yml  upstream Linux container deployment
docs/teaspeak.md                upstream TeaSpeak compatibility and limitations
tests/safari_smoke.py           browser smoke test
LICENSE                         upstream MIT license
```

Flow: `web` opens one `/ws` WebSocket per connected server tab. `gateway/src/index.ts` dispatches JSON messages and `gateway/src/ts3/connection.ts` starts **one connector per WebSocket**, passes credentials via environment variables, writes line-based commands to stdin and reads newline-delimited JSON from stdout. `connector/src/main.rs` uses the submodule (including `tsproto` and Opus via `audiopus`) to communicate with the TS/TeaSpeak server. Audio capture/playback is in the browser; audio events pass through this bridge. The gateway also translates fields, validates/limits requests, manages process lifetime, and handles transfer/stream and other messages; it is not simply a static file server. See `README.md` architecture and the source above. TeaSpeak support is not universal: `docs/teaspeak.md` lists unimplemented TeaSpeak features; `wwts.ir:1694` was not tested.

## Toolchains and commands

- Upstream README says Node 20+ and npm; the actual installed Vite 8.1.5 and React plugin require Node `^20.19.0 || >=22.12.0`. Docker uses Node 22; upstream Safari CI uses Node 22. The tested environment here is **Node 22.22.3 / npm 10.9.8 on Linux**. For reproducible Windows CI, Node 22.22.3 is a reasonable candidate exact pin, subject to the Windows build proof.
- Connector is Rust edition 2021; Docker uses floating `rust:1-bookworm`, README says stable. There is **no exact Rust toolchain pin** in this fork. `connector/Cargo.lock` locks dependencies, not the compiler. Select and test an exact stable Rust version on Windows in Step 1; do not present an untested number as verified.
- Package manager: npm, separate lockfiles in `web/` and `gateway/`. `npm ci` uses them. Rust uses Cargo with `connector/Cargo.lock` and recursive git submodules. CMake and a C/C++ toolchain are required to build Opus (`audiopus_sys`); on Windows upstream specifies the Visual Studio Desktop C++ workload. Native TLS is also used (`default-tls`; Windows runtime dependencies need checking).

From the repository root, initialize the pinned submodules (verified here):

```sh
git submodule update --init --recursive
```

Verified on Linux with the Node/npm versions above:

```sh
(cd gateway && npm ci && npm run build)       # TypeScript -> gateway/dist
(cd web && npm ci && npm run build)           # prebuild copies AEC3; tsc -b && vite build
(cd web && npm run lint)                      # exits 0 with 9 existing warnings
```

`web` build succeeded despite the Dockerfile's stale warning about existing `tsc` failures; Vite warned about a large chunk. `npm ci` reported 12 web dependency vulnerabilities (3 low, 5 moderate, 4 high) at recon time; gateway reported none. These are audit results, not a security review.

Development start commands verified here, in separate terminals **after building the web bundle**:

```sh
(cd gateway && TELEMETRY=0 npm run dev)       # http://localhost:8080, /ws
(cd web && npm run dev)                       # Vite normally http://localhost:5173
```

Gateway `/healthz`, its built UI `/`, and Vite `/` each returned HTTP 200 locally. Vite's dev build uses `ws://localhost:8080/ws`; the gateway serves the built UI at :8080. PowerShell equivalent of the first command: `cd gateway; $env:TELEMETRY='0'; npm run dev`. These checks did **not** start a connector or establish a voice session. Vite's default host allowlist also rejects the Arena preview host; its dev-mode browser WebSocket points to the browser's localhost, so a remote preview requires both an allowed host and a same-origin proxy/URL strategy.

Upstream's connector commands (documented, **not verified in this sandbox**: Rust/Cargo and CMake are absent; Windows is unavailable):

```sh
(cd connector && cargo build --locked)
# If the old Opus CMake policy errors with newer CMake:
(cd connector && CMAKE_POLICY_VERSION_MINIMUM=3.5 cargo build --locked)
```

On Windows PowerShell, set `$env:CMAKE_POLICY_VERSION_MINIMUM='3.5'` before `cargo build --locked`. The debug binary is `connector/target/debug/ts-connector[.exe]`; `cargo build --release --locked` is the corresponding release command but has not been verified here either. The gateway's default binary path points at the debug binary; set `CONNECTOR_BIN` for a different location. Docker builds the connector with `CMAKE_POLICY_VERSION_MINIMUM=3.5` and `cargo build --release`, then installs gateway production dependencies and serves the compiled web bundle. Neither Docker nor a Windows installer was built here.

## Connection and existing UI

- `web/src/App.tsx`: `ConnectDialog` (around line 2088) has an editable **server address** input (host and optional `:port` in the same field), nickname, password and expanded identity/channel/server-type options; favorite editor is around line 3516. Initial host state in `AppInner` (around 8766) comes from saved last host or `localhost` (some theme/demo exceptions). `handleConnect` creates a socket and sends connection parameters. `VITE_DEFAULT_SERVER` / runtime `DEFAULT_SERVER` currently trigger **auto-connect**, not merely a prefilled editable field (around 10580); the Chips preset needs different behavior if auto-connect is not intended. The upstream default is not `wwts.ir:1694`.
- `ChannelTree` (around 1433, rendered around 14449) renders the nested channel/client tree, selection, badges and speaking states. `InfoPanel` (around 1870) renders selected server, client, and channel information. `SpeakingNowBar` (around 1781) renders active/current-channel users. `AvatarTile`, `clientAvatarUrl` and `avatarPath` (around 4550) render/download avatar assets, including in the tree and info panel; avatar files use the server's file-transfer system. Group icons and lists are already represented, but categories and XP/rank semantics are not established by this recon.
- Client descriptions are **not currently exposed/rendered** in the connector's `ClientInfo` snapshot (`connector/src/main.rs` around 122/753), gateway client mapping, or UI `ClientInfo`/`InfoPanel`. The `description` fields found in the current UI are for other concepts such as permission descriptions and store themes, not client profiles. The protocol declaration submodule contains client description and update fields, but that alone does not establish a usable connector API or live broadcast behavior. The requested Step 4 write/read/live-sync is therefore a potential conflict with the black-box rule: verify actual connector commands, server permissions and update behavior before promising it; do not silently alter the connector or overwrite existing user descriptions.
- Speaking signals exist: connector emits `talkers`, gateway relays it, UI tracks `talkers` and merges in `selfTalking` into `displayTalkers` (around 10109 and 12510). This is a candidate for talking-reactive styling.

## Desktop packaging assessment and blockers

**Node can potentially be eliminated, but not by configuration alone.** The connector already exposes a process stdin/stdout interface, so a Tauri Rust host could own connector lifecycle and implement the UI-facing bridge in-process, preserving the connector and tsclientlib protocol behavior. This means porting the existing gateway's WebSocket message dispatch, transformations, transfers, security checks, error and multi-session handling (or adapting the UI transport to Tauri IPC), and testing feature/voice parity. Tauri invokes/events must be scoped so untrusted content cannot issue privileged commands. Existing gateway APIs need an explicit disposition rather than being silently lost. This is the preferred route for the no-extra-Node-process/weight rule; feasibility and complete parity are **not yet proven**. Keeping a permanent Node gateway would add an additional process/runtime and conflicts with the stated only-sidecar/weight goal unless explicitly justified and approved; no such justification is established here. One connector per active server tab is upstream behavior even though it is the only *kind* of sidecar.

- `web/src/App.tsx` derives production `/ws` and feedback URLs from `window.location`, and hardcodes localhost for Vite development. A Tauri asset origin is not the gateway HTTP origin; `ws://`/`wss://`, secure-context microphone access, CORS/CSP, WebView2 permissions, origin checks, and mixed-content rules need explicit design/testing. If using loopback, bind only loopback, authenticate/authorize the bridge, avoid fixed-port collisions, and don't expose secrets to other local web pages/processes. `gateway/src/index.ts` currently `server.listen(PORT)` without a bind host, not loopback-only. The Vite PWA/service worker and update polling assume web hosting and require evaluation for Tauri.
- The gateway assumes a relative development binary path or `CONNECTOR_BIN` (`gateway/src/ts3/connection.ts`); packaged paths, Windows executable naming, startup failure, cleanup and no orphan processes need testing. Credentials in environment/local storage and log exposure need review. WebView2 is system-provided; no Electron or bundled Chromium. Windows prerequisites, sidecar signing/bundling and installer behavior have not been verified.
- No-calls-home work is required: upstream gateway telemetry is enabled by default (`gateway/src/telemetry.ts`; `TELEMETRY=0` only disables that one path). Frontend defaults point to upstream news/store (`web/src/App.tsx`) and sync (`web/src/sync.ts`); donation and other external links, feedback and release/news requests also need inventory/disablement. Server-configured banners can fetch remote URLs. The connector's `tsclientlib/tsclientlib/src/resolver.rs` performs TeamSpeak nickname lookup against `named.myteamspeak.com` for certain non-dotted addresses and can use SRV/TSDNS/DNS; with an explicit `host:port` it takes the direct DNS path. DNS and necessary connections to the chosen server must be distinguished from analytics/calls home. The black-box rule means any remaining external lookup behavior must be assessed without modifying protocol behavior, not assumed away.
- Internal names such as `webspeak3-web`, `webspeak3-gateway`, `ts-connector`, `webspeak3:*` storage keys and protocol/asset identifiers remain untouched; blindly renaming them could break references or migration. Visible strings, PWA metadata, icons, window title and app identity will require a separate rebrand. Retain root MIT copyright/license and upstream attribution; submodules and bundled dependencies have their own license notices to preserve.

## Exit status / next-step evidence

Step 0 verifies the web and gateway builds and local HTTP startup only. Connector compilation, an exact Rust pin, Tauri/WebView2, Windows CI, installer, real-server connection and voice are **not verified**. No idle RAM measurement is possible until an actual Windows package exists; measure the full process tree (WebView2, Tauri and connector) in Step 1 and compare honestly. A green Windows Actions installer build would prove a build, **not** connection or voice on a real PC. An unsigned installer is expected to cause a Windows SmartScreen warning. Stop here before Step 1.

## Step 1 — Windows build proof and remaining verification

An initial Chips mark and title, English-only UI, and editable first-use `wwts.ir:1694` address are in place (the last entered address still wins). A Tauri host and desktop bridge have been added, with connector commands and event mapping adapted from the upstream gateway; the connector and tsclientlib remain unchanged. The bridge uses one connector process per session and no Node process. Unit tests cover event mapping, command order, validation, and closing while spawn is pending. These tests use a fake process, **not** a real connector or voice session. The UI build passes on Linux.

The Windows workflow pins Node 22.22.3 and Rust 1.93.1, builds the unchanged connector with its lockfile, and builds an unsigned NSIS installer. GitHub Actions run [42282409728](https://github.com/ppourya4-design/chips-client/actions/runs/42282409728) succeeded for commit `590a0297e3f74b989130ad68ed14554cceaf5bdc`; its non-expired `Chips-win-x64` artifact is 6,605,872 bytes (compressed artifact size, not installed size). Four bridge unit tests and the connector build passed on the Windows runner. The Tauri Cargo dependencies are not yet locked in a committed Cargo.lock, so reproducibility of future builds remains to be addressed. Desktop sync/news are disabled and a restrictive desktop CSP is configured, but the complete no-calls-home audit and runtime verification are still required. The desktop bridge rejects bare server nicknames that would trigger the connector's TeamSpeak nickname lookup; direct host/IP input remains editable. The system DNS resolver may still be involved. Legacy stock animations and shadows are disabled as an interim safety baseline, not the Step 2/3 design.

The requested CI build exit proof exists, but it does not establish runtime correctness. Still verify the installed executable and sidecar paths, audit external traffic and visible branding, and test on a real Windows PC for microphone permission, connect/voice and process cleanup. Idle RAM has **not** been measured: this Linux sandbox cannot install and run the Windows app. Measure the full Windows process tree before judging its weight against TeamSpeak 3. CI proves the build, not voice; the unsigned installer may trigger SmartScreen. Step 2 is recorded below.

## Step 2 — Liquid Glass reskin and the no-calls-home audit

### What the design does

The default design is **Liquid Glass** (`web/src/styles/liquid-glass.css`, selected with `.ts-design-glass`, listed first in Options → Design, and the fallback for a removed theme). Upstream's Standard/Nova/Pulse/IDE layouts remain selectable, unchanged.

- Palette in CSS variables on the app root: `--primary`, `--primary-rgb`, `--accent`, `--accent-rgb`, `--accent-contrast`, plus the legacy `--bg`/`--border`/… names still read by the stock sheet. Background `#05050a`, surfaces `rgba(255,255,255,0.05)`, `backdrop-filter: blur(20px) saturate(160%)`, 20px card radii, pill controls.
- Accent switcher (toolbar, four swatches) with cyan `#74e5ff` (default), purple `#a74cfd`, red `#fd1d1d`, blue `#1a56db`. The choice is persisted in `localStorage` (`chips:accent`) and written as CSS variables, so nothing else knows about colour maths (`web/src/theme.ts`).
- **Refraction.** `web/src/liquidGlass.ts` rasterizes a rounded-rect SDF to a canvas displacement map (R/G displacement, 0.5 neutral) and drives an SVG `feDisplacementMap` through `backdrop-filter: url(#…) blur() saturate()`. The technique is adapted from [samasante/liquid-glass](https://github.com/samasante/liquid-glass), with three deliberate differences: the backdrop is refracted (not the live DOM), there is no chromatic split and no specular/glow channel in the map, and filters are generated once per bucketed element shape and cached. Bend strength is ~2.2% of the short edge, hard-capped, and lives in a rim band only.
- Refracted surfaces are the marked `[data-lg]` ones — menubar, toolbar, body card, chat panel, log — plus open dialogs and menus. That is **8 elements** in a fully connected layout, under the 12-surface budget. Channel rows, chat lines and menu items never refract; they get plain blur at most.
- Fallback layer: the base rule is always plain `blur() saturate()` over the glass tint; the refraction layer is an `@supports (backdrop-filter: url())` addition that only applies once the engine has assigned a filter. Without support (Firefox, or a WebView2 with the effect off) the whole module no-ops and the tint falls back slightly denser.
- Fonts: Plus Jakarta Sans (UI) and Vazirmatn (Persian *user content* only) are bundled in `web/src/assets/fonts` from the OFL font packs, with their licence files. No font CDN.
- Interface stays English and LTR; user-content text (nicknames, chat, away messages) gets `unicode-bidi: plaintext` so Persian reads RTL inside the English layout.
- **No glow:** the only light is a crisp inset specular line on the top edge of each surface. No blurred coloured halos, no neon bloom, no glowing shadows anywhere; legacy designs keep the flat Step 1 look.
- **No letter motion:** there are no keyframes in the design at all. Transitions are colour/opacity plus a 1px press translate, and `index.css` still pins `animation: none` and `text-shadow: none` globally. The Step 1 blanket `box-shadow/filter: none` was replaced with a scoped policy (legacy designs keep it) because it also erased the specular edges.
- Layout is still TeamSpeak: server tree left, info panel right, chat below, log strip beneath — re-skinned.

### No-calls-home audit (closes the open Step 1 item)

Scope: what the **shipped Tauri app** does, not the optional web/gateway build. Method: static review of the frontend, the Tauri host and the connector's dependency tree, plus what the configured CSP can reach.

| Path | Verdict |
|---|---|
| Upstream telemetry (`gateway/src/telemetry.ts`, on by default) | **Not shipped.** The gateway is not part of the desktop app; there is no Node process and no telemetry code in the bundle. |
| Upstream account sync (`web/src/sync.ts`, `https://gateway.webspeak3.de/api/sync`) | **Disabled.** `startAutoSync` is never started when `isTauri()`; `sync.ts` itself throws in the desktop build (`if (isTauri()) throw new Error("Sync is unavailable in Chips")`); Options → Konto now renders a local-only notice instead of an account UI. No request is possible. |
| Upstream design store (`STORE_URL`) | **Disabled.** `STORE_URL` is the empty string when `isTauri()`, the store panel is never rendered (an early return keeps the fetch in `DesignStorePanel` from ever mounting) and both "Store" buttons are hidden. |
| Upstream news feed (`https://gateway.webspeak3.de/api/store/news`) | **Disabled.** `NEWS_FEED_URL` is the empty string when `isTauri()` and `NewsTicker` returns before fetching under `isTauri()`. A server-configured news item with a URL is rendered through `externalLinkProps`, which copies the address instead of navigating. |
| Feedback form, donation link, own-hosted extras | **Absent.** Feedback is own-instance only, the donation link is empty under `isTauri()`, and both are web-build features. |
| External `<a>` links (About, Help menu, ToS/imprint) | **Never navigated.** All go through `externalLinkProps`: in the desktop build the href is withheld, the click is prevented and the address is copied to the clipboard. |
| `version.json` / service-worker update polling | **Local only.** Relative fetch against the bundled assets; the app *is* the origin (`https://tauri.localhost`), so this never leaves the machine. |
| Connector nickname lookup (`https://named.myteamspeak.com/lookup` in `tsclientlib/tsclientlib/src/resolver.rs`) | **Unreachable.** It fires only for a bare server nickname. The Tauri host rejects an address without a dot or a colon before spawning the connector, so the path cannot be taken. Direct `host:port` input (the `wwts.ir:1694` preset) takes the plain DNS/TCP path. |
| Connector TSDNS / `_ts3._udp` / `_gts._udp` SRV lookups | **Unmodified black box.** These are part of TeamSpeak's own resolution protocol and only run against the host the user typed. They are not analytics and were not changed. System DNS is used for a hostname the user entered. |
| WebRTC STUN (`stun:turn.teamspeak.com`, `stun:turn2.teamspeak.com`, `stun:stun.l.google.com` in `stream.ts`/`publish.ts`) | **Reachable but deliberate.** Streaming/screen-share is an explicit user action, and ICE needs a STUN server to learn its own address. It is listed here rather than silently dropped; the stream feature is upstream's, and refusing to contact a STUN server would make it unusable. No STUN traffic occurs unless the user starts a stream. |
| Third-party fonts, analytics, ads, crash reporting | **None.** Fonts are bundled; there is no analytics/telemetry SDK anywhere in `web/`. |

### What remains in the shipped JavaScript bundle

The three upstream endpoints are still *present as dead strings* in the built bundle, because Vite substitutes `import.meta.env` at build time while `isTauri()` is a runtime check, and the same bundle also serves the web build:

```text
https://gateway.webspeak3.de/api/store/news     NEWS_FEED_URL  ("" under isTauri)
https://gateway.webspeak3.de/api/store/themes   STORE_URL      ("" under isTauri)
https://gateway.webspeak3.de/api/sync           DEFAULT_SYNC_SERVER (call path throws under isTauri)
```

They cannot be reached from the desktop app: the desktop value of each constant is `""`, the callers are guarded, and the CSP's `connect-src 'self' ipc: http(s)://ipc.localhost` would block such a request even if a caller slipped through. Callers may notice vanity links (`webspeak3.de`, the GitHub repo, the Weblate page, `ko-fi.com`) — those are text in the About/Help UI, and in the desktop build `externalLinkProps` withholds the `href` and copies it to the clipboard instead of navigating, so they generate no traffic either. Removing the strings entirely would mean forking every call site for a bundle that also ships to the web, which is why they stay as disabled branches rather than being deleted.

### The navigation guard

The first attempt at a WebView2-level guard (`with_webview` + `NavigationStarting` in `web/src-tauri/src/main.rs`) was **reverted**: it needed the `webview2-com` and `windows` crates plus a hand-rolled event handler, which could not be compiled or tested in this sandbox, and shipping untested unsafe FFI in the window bootstrap was the wrong trade. It is replaced by a JavaScript guard in `web/src/main.tsx`, active only when `isTauri()`:

- a capture-phase `click` listener blocks any anchor whose target is outside the bundle (`https://tauri.localhost`, `ipc:`, `about:`, `data:`, `blob:`) and copies the address instead;
- a `MutationObserver` removes any injected `<base>` element, so relative URLs cannot be re-pointed at another origin;
- the CSP (`default-src 'self'`, `base-uri 'none'`, `object-src 'none'`) remains the primary boundary; the guard closes the intra-bundle navigation case the CSP cannot see.

Defence in depth that is now in place:

- CSP (`tauri.conf.json`): `default-src 'self'`, `connect-src 'self' ipc: http(s)://ipc.localhost`, `img-src 'self' data: blob:`, `object-src 'none'`, `base-uri 'none'`. Nothing else can be loaded or fetched from the bundle.
- Tauri capabilities: three commands only (`start_connector`, `write_connector`, `stop_connector`), each validating its input; no HTTP, shell, fs or updater plugin features are enabled in `web/src-tauri/Cargo.toml`.
- A desktop-only navigation guard in `web/src/main.tsx`: clicks on non-bundle links are prevented and copied, and injected `<base>` elements are removed, so the WebView cannot be steered to a third-party origin after load.

**Honest limits.** This is a source audit plus the CSP/capability argument; no packet capture of the installed Windows build was possible from this Linux sandbox. It should still be confirmed once with a network monitor on a real Windows machine (connect to `wwts.ir:1694`, idle, then start a stream) before the claim is treated as verified at runtime. The connector and `tsclientlib` were not modified, per the black-box rule.

## Step 3 — The animation system (house style)

Motion in Chips is light moving across static elements. Letters and elements never move: no
wave, no bounce, no wiggle, no jumping scale. Step 2 enforced that with a global
`animation: none !important`; Step 3 turns that ban into an allow-list and adds the effects.

**The three permitted animations.** Keyframes in `web/src/styles/name-effects.css` may only
animate `background-position`, the registered `--spark-pos` angle, and the opacity of a light
layer. Every keyframe in the file is one of those three shapes; no keyframe mentions
`transform`, `translate`, `rotate`, `scale` or `filter`. `text-shadow` stays banned globally.
There is no glow: every light here is a crisp gradient stop (the spark's "white-hot" core is
`rgba(180, 240, 255, 0.9)` as a hard stop, not a blur), and no layer adds a drop-shadow.

**How the ban became an allow-list.** `web/src/index.css` now exempts exactly the elements the
system marks with `[data-chips-anim]`:

```css
*:not([data-chips-anim]),
*:not([data-chips-anim])::before,
*:not([data-chips-anim])::after { animation: none !important; }
```

Everything else in the app — upstream's legacy animations, user CSS, future code — still
animates nothing. The flag is on the light layer itself, never on a container, so it cannot be
inherited by in-between elements.

**Files.**

| File | Role |
|---|---|
| `web/src/styles/name-effects.css` | The whole system: `@property --spark-pos`, the keyframes, name styles, electric border, avatar rings, reduced motion. ~21 KB raw / 5.4 KB gzipped. |
| `web/src/nameEffects.ts` | Effect *definitions* and the attribute builder. No React, no rendering: the catalog, the saved choice, the reduced-motion preference. Step 4 imports this. |
| `web/src/App.tsx` | Thin wiring only: `<NamePlate>`, `<AvatarRing>`, the `NameStyleContext`, the Reduce-animations switch. |

No library, no runtime animation framework: pure CSS plus a few hundred bytes of JS.

### Name styles (the catalog)

Applied as `.chips-name[data-name-style="…"]`. All five definitions live in `NAME_STYLES` in
`web/src/nameEffects.ts` with their label, description, colour-slot count, duration and whether
they animate at all — Step 4's picker renders straight from that array.

| id | What it does | Colours | Loop |
|---|---|---|---|
| `solid` | Flat colour. No light layer, no animation. | `--name-c1` | static |
| `shimmer` | Metal shimmer across static glyphs (`linear-gradient(120deg, …)`, `background-size: 200% auto`, `background-position` 200% → -200%) plus a shine-sweep `::after` (`linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.85) 50%, transparent 70%)`). | `--name-c1`, `--name-c2` | 3s linear |
| `crystal` | Flat colour plus one crisp sweep per cycle, then a long calm hold. | `--name-c1` | 6s ease-in-out |
| `prism` | Five colours through the same shimmer, slower and wider. | `--name-c1` … `--name-c5` | 6s linear |
| `talking` | Signature effect: the shimmer keeps running, and while the owner speaks a second gradient set cross-fades in on a `::before` light layer (opacity only). It eases back over 320 ms when they stop. | `--name-c1/c2` + `--name-v1/v2` | 3s linear |

Markup contract, built by `namePlateAttributes(config, text, speaking)`:

```html
<span class="chips-name" data-name-style="shimmer" data-text="Pourya"
      data-speaking="0" data-chips-anim style="--name-c1: …">Pourya</span>
```

`data-text` is what the sweep and the voice layer paint (`content: attr(data-text)`), so the
overlays always sit exactly on the letters. `data-speaking` is the client's existing voice
signal — the same gated `talkers` boolean the talk lamp and `ts-talking` row already use.

**One deliberate deviation.** The brief's shimmer recipe is `--primary` → `--accent` → `--primary`,
but Step 2's accent switcher points `--primary` and `--accent` at the *same* hex, so that recipe
would render a flat bar with nothing travelling through it. The stylesheet therefore keeps the
same 120°/25%/50%/75%/100% structure but defaults the second slot to a lit tint of the accent
(`color-mix(in srgb, var(--accent) 55%, #ffffff)`); both slots are overridable through
`--name-c1` / `--name-c2`, which is what Step 4 will write. Nothing else about the recipe
changed.

### Electric Border (cards / featured elements)

`.chips-electric-border` on the card: `position: relative`, `overflow: visible`, and the ring is
a `::before`/`::after` pair using the mask-composite trick (`padding: 2px` + `mask:
linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)` + `mask-composite: exclude`,
`border-radius: inherit`, so the ring always matches the card). The gradient is a conic gradient
`from var(--spark-pos)` with a spark segment — primary at 0.7 alpha → `rgba(180,240,255,0.9)`
white-hot core → primary 0.7 → transparent — and `--spark-pos` runs 0deg → 360deg in 2.5s
linear. A second, identical ring carries `animation-delay: -1.25s`, so two sparks chase the rim.

`.chips-electric-border--quiet` is the calm variant: a 1px rim with a slow sheen band
(`linear-gradient(115deg, …)`, `background-size: 300% 300%`, 14s linear) and no second ring.

The card must carry `data-chips-anim` — that is the motion-policy opt-in, and the stylesheet
cannot animate without it.

### Avatar rings

`.chips-avatar[data-ring="…"]` is a host span around whatever draws the avatar (an `<img>` or
the initials tile), so the ring is drawn on the host's pseudo-elements and the avatar element
itself is untouched. 2px masked rim, 3px outside the avatar, radius inherited (circle by
default, `chips-avatar-square` for the info panel's 16px-radius photo).

| `data-ring` | What it does |
|---|---|
| `gradient` | Conic gradient turning slowly around the avatar, one lap per 8s (`--spark-pos`). |
| `speaking` | A still specular rim whose brightness follows voice activity: 0.45 opacity idle, 1 while speaking, with a gentle 1.8s opacity-only pulse. Smooth 240 ms easing, no scale change. |
| `electric` | Effect 2 in small format: two sparks, 2.5s, second delayed -1.25s. |

Every variant also lifts its specular edge when `data-speaking="1"`.
**Banned and not implemented:** orbiting particles, floating dots, or any decoration that moves
around an avatar or a name. There is no such code and no definition for it in the catalog.

### Reduced motion

Two triggers, identical result — everything freezes to a still gradient:

- `@media (prefers-reduced-motion: reduce)`;
- the in-app **Options → Design → Motion → “Reduce animations”** switch, persisted in
  `localStorage` (`chips:reduce-motion`) and applied as `chips-reduce-motion` on the app root
  (plus `data-motion="reduced"`). Without a stored choice the switch starts from the OS
  preference.

Frozen state: the shimmer keeps its gradient but stops travelling, the sweep layer is removed
entirely (a frozen white band across a name is a smudge, not light), the sparks hold at 0deg,
and the transformed transitions are disabled. Talking-reactive keeps its second gradient as a
*state colour* — the name still tells you the user is speaking — but it flips instantly and its
overlay does not travel.

### Where it is wired today

The effect system is scoped to the Liquid Glass design (`.ts-app.ts-design-glass`); the legacy
Standard/Nova/Pulse/IDE layouts keep their flat look and never animate, even where their markup
now carries the attributes.

- **Channel tree** — the local user's row (the highlighted `ts-self` row, which is the glass
  layout's self bar) renders through `<NamePlate premium>`, so it carries the saved style and
  the voice signal. Every other row keeps the plain flat label: the client cannot know which
  style another user picked, and a tree full of shimmering names would be a light show, not a
  premium name style.
- **Info panel** — the featured card gets `.chips-electric-border` (spark variant) when a client
  is selected and `.chips-electric-border--quiet` for the calmer server/channel views. The
  selected client's avatar gets the electric ring while they speak and the slow gradient ring
  when they are quiet; the local user's own name in that card uses the chosen style. A client who
  never uploaded a photo gets a 64px initials tile as the ring's host — but only in the glass
  design (`.ts-info-avatar-initials` is `display: none` elsewhere), so the other layouts keep
  their photo-only panel and never show a ring. The panel also keeps its own scrolling: the ring
  is drawn inside its box, so `overflow: visible` is not forced on that card.
- **Speaking strip** (Pulse/IDE) — avatar rings and the premium plate for the local user. The
  strip only exists in those legacy layouts, so the effect classes are inert there today; the
  wiring is in place for when those layouts adopt the system.
- **Not wired:** chat lines. A plate per message would mean one animated light layer per own
  message; the effect belongs on identity surfaces, not on a scrolling log.

### How Step 4's panel and profile card select an effect

Nothing about the picker exists yet — that is Step 4. The contract it will use:

1. Render the choices from `NAME_STYLES` (already ordered, labelled and described) and
   `AVATAR_RINGS`.
2. Keep the selection in a `NameStyleConfig` (`{ style, colors, voiceColors }`), persist it with
   `saveNameStyleConfig()`, read it back with `loadNameStyleConfig()` (key `chips:name-style`).
3. Preview and apply with the existing components — `<NamePlate text premium speaking>` inside
   the app, or `namePlateAttributes(config, text, speaking)` / `avatarRingAttributes(ring,
   speaking)` on any element. The colour slots are `--name-c1` … `--name-c5` (max 5) and
   `--name-v1` / `--name-v2` (talking-reactive), so a colour picker only writes hex strings.
4. To make the choice live, hold it in `AppInner` and put the setter next to the existing
   `useState<NameStyleConfig>(loadNameStyleConfig)`; `NameStyleContext` already distributes it to
   the tree, the info panel and the speaking strip. The profile card is just
   `<NamePlate premium>` on a larger type scale plus an `<AvatarRing>` — no separate CSS.

### Weight and honesty

- Budget: +21 KB raw / +5.4 KB gzipped CSS and a negligible JS delta (effect definitions and one
  React component). No animation library, no canvas, no request, no new dependency.
- `@property` is required for the sparks to travel; where a WebView does not support registered
  custom properties the spark simply holds still at 0deg. The name shimmer, the sweep and the
  opacity fades do not depend on it.
- Not verified on Windows: this sandbox has no browser engine and no Windows host. The claims
  above are a source-level audit plus the web build; the visual result, the cost of the extra
  compositing on WebView2, and the ring geometry around real avatars still need one look on a
  real Windows machine.
- The connector, `tsclientlib` and the gateway are untouched. No telemetry, no new network path,
  no external asset. The app name stays Chips and the preset `wwts.ir:1694` is unchanged.

## Step 4 — profile style token foundation

Added `web/src/profileStyle.ts` as the shared local style/token codec. Local data is stored under `chips:profile-style`; `styles.json` payloads use `{ "version": 1, "style": … }` and are handled by `exportStylesJson` / `importStylesJson`.

Token grammar: `[s:v1;key=value;…]`. `fx` is one of `solid|shimmer|crystal|prism|talking`; `c1` and `c2` are six-digit lowercase hex name colours (without `#`); `ring` is `gradient|speaking|electric`; `talk` is `0|1`; `bg` is comma-separated 2–3 six-digit hex banner stops; `dir` is an integer degree direction; `card` is two comma-separated six-digit hex card colours. Optional `xp` is a nonnegative number and is intentionally absent until an external integration supplies it; no XP value is inferred by this client. Parsing is defensive and unknown/malformed values fall back to defaults. `replaceStyleToken` preserves non-token description text and replaces the existing v1 token in place.

This was the initial foundation-only status, superseded by the Step 4 implementation update below. Its grammar was extended with `st` for the custom status line. XP is never inferred from group names or IDs.

### Step 4 implementation update (current branch)

Connector exposure is intentionally limited to existing protocol data and operations; `tsclientlib` is untouched. `connector/src/main.rs` now adds `description` to the existing `ClientInfo` JSON snapshot from `data::Client.description`, emits `clientDescriptionChanged { client_id, description }` on the bookkeeping `PropertyId::ClientDescription` change, and accepts one `setdescription {"description":"…"}` stdin command. That command sends the existing `clientedit clid=<own id> client_description=<value>` protocol command and uses the existing command-result/error path. The gateway maps the new snapshot field, relays the event, and exposes `setDescription` to the browser. No protocol behavior, tsclientlib source, or protocol declarations changed. Existing full `channels` snapshots also carry descriptions, so clients joining late can read them.

The UI preserves description text around its `[s:v1;…]` token, reapplies local preferences on initial channel snapshots, writes when customization is changed, parses descriptions for every visible client, and applies the parsed name recipe/ring in the tree and profile card. The profile popover contains the banner, overlapping avatar, status, team-group chips with the server's real group icons, current rank/channel and optional XP. Role bucketing is deterministic: names matching `admin|moderator|staff|owner|support` → Staff; known ladder labels matching `rank|level|xp|rookie|member|veteran|legend` → Rank; game-title names matching `game|minecraft|valorant|league|cs2|apex|fortnite|dota` → Games; all other names → Fun. This mapping is deliberately name-based because server group IDs are instance-specific. Exact XP is never derived from rank; the optional `xp` token field is only displayed if supplied.

`status` (`st`, percent-encoded UTF-8, max 80 characters) extends the token grammar. The customization panel includes local avatar/banner image file pickers, gradient stops/direction, card/name colors, effects/rings, and JSON transfer. Image bytes are stored in local styles.json/localStorage and are not embedded in the description token (to avoid oversized descriptions); therefore image selections are local-only while colors, effects, ring, talking flag, and status synchronize through the description token. Server category mapping and image-token limitations are stated explicitly.

## Step 5 — final build and QA

Step 5 re-runs the Windows build on the final state, adds the README, and puts the app through the
release checklist below. It also fixed the two things the checklist turned up. No design was
improvised: what could not be settled in code is reported as a finding instead.

### What was verified, honestly

The whole step ran in a Linux sandbox: no Windows host, no browser engine, no way to reach
`wwts.ir:1694`, and artifact downloads are blocked here. So the QA below separates what the code
and the bundle prove from what still needs one run on a real Windows PC. Nothing is marked PASS on
the strength of a CI build alone.

| # | Checklist item | Result | Evidence / reason |
|---|---|---|---|
| 1 | Fresh install launches; connector sidecar starts and stops cleanly with the app | **CANNOT-VERIFY-HERE** | The Windows job builds the NSIS installer green, and Tauri's bundler strips the target triple, so `ts-connector.exe` is installed next to `Chips.exe` (`tauri-bundler` `bundle/settings.rs::copy_binaries`). `main.rs` resolves exactly `current_exe().parent()/ts-connector.exe`, rejects foreign binaries/flags, `stop_connector` sends `disconnect` and kills after 3 s, and `RunEvent::Exit` kills whatever is left. Bridge tests cover stop-on-close and close-during-spawn. Actually launching and watching the sidecar appear/disappear in Task Manager needs a Windows host. |
| 2 | Preset server `wwts.ir:1694` connects | **CANNOT-VERIFY-HERE** | The connect dialog is pre-filled with `wwts.ir:1694` (`web/src/App.tsx`, `AppInner` host state) and never auto-connects; the native bridge accepts `host:port` and starts the sidecar with `--address=wwts.ir:1694`. Real connection (and voice) can only be proven on a real Windows PC against that server — this sandbox has no route to it. |
| 3 | Channel tree and chat usable | **PASS** (code/event level) | The tree renders every channel/client with the Step 4 label, ring and badges; chat/server/PM commands map to the existing wire commands and the bridge test asserts the exact bytes (`chat hello world\n`, `switch 3 <base64>\n`). The rendered result was not exercised in a browser here. |
| 4 | Profile card opens for self and for others | **PASS** (code level) | Every client row renders the same `setProfileClientId(c.id)` label button (`ChannelTree`), and the card is rendered from `clients.find(c => c.id === profileClientId)`; the own client is just the `ts-self` row, so self and others take the identical path. Not clicked through in a browser here. |
| 5 | A style change is visible from a second client without reconnect | **PASS** (code/event level), live two-PC part **CANNOT-VERIFY-HERE** | *Was broken in the shipped build* — see fix 1. Now: `clientedit client_description` → connector `clientDescriptionChanged` → bridge event → `clients` patched in place → plate/ring/card re-render. The bridge test covers the mapping and the write. Seeing it happen between two PCs needs two Windows machines on one server. |
| 6 | The Reduce-animations toggle freezes the name/card animations | **PASS** (static, now enforced) | `chips-reduce-motion` on the app root selects the second freeze block in `name-effects.css` (`animation: none !important`, `--spark-pos: 0deg`, sweep `content: none`, flat gradient); `web/tests/motion-policy.test.ts` fails if either freeze path stops covering `.chips-name`, `.chips-electric-border` or `.chips-avatar`. Computed styles were not sampled (no browser engine). |
| 7 | No-calls-home audit still holds on the final bundle | **PASS** (bundle + config level), runtime capture **CANNOT-VERIFY-HERE** | Fresh `vite build` grep of `dist/` returns only the already-audited strings: the three disabled `gateway.webspeak3.de` branches, vanity links (copied, never opened), `w3.org` namespaces, `react.dev` error links, Workbox's `bit.ly` error-message text, and the deliberate STUN servers. No new dependency (`web/package.json` and the lockfiles are unchanged vs `main`), no new capability, CSP unchanged, `sw.js` precaches 39 local URLs and nothing external. Packet capture on the installed app still needs a real machine. |

Two findings are deliberately **not** fixed here because they are design decisions, not bugs:

- **Your own plate updates after the server echoes the change.** `updateProfile` writes the token
  and the UI re-renders from the description the server reports back, so your plate can lag one
  round-trip — and on a server that refuses description edits it keeps the old style while the
  editor shows the new one. Optimistic local application would be a design change.
- **The client name in the tree is now a `<button>` inside `role="treeitem"`.** Clicking a name
  opens the profile card instead of selecting the row, and the treeitem contains a focusable
  control. Functional and keyboard-reachable, but it is a nesting an a11y review should decide on.

Also noted, not changed: the lint run is `0 errors / 11 warnings` (two more
`no-constant-binary-expression` warnings than at Step 0, both in upstream code paths), and the
client's style token is visible as text in native TeamSpeak clients, which is the documented price
of syncing through the description field (README, "Profile style sync").

### Fixes made in Step 5

**1 — the shipped app could not sync profile styles at all.** Step 4 added the description field to
the connector and the gateway, but the *desktop* bridge — the one the Tauri app uses — dropped it:
the client snapshot had no `description`, `{type:"setDescription"}` fell into the "unknown message
type" branch, and `clientDescriptionChanged` was never mapped. Writing a style failed with an
error, and another client's change could only be seen after reconnecting. Fixed in
`web/src/desktop/connection.ts`, `web/src/desktop/socket.ts`, `web/src/App.tsx` and
`web/src/connectionSessions.ts` (also for parked tabs), plus a bridge test. The connector, the
gateway and `tsclientlib` are untouched.

**2 — one keyframe outside the animation law.** The Step 4 popover carried an entrance fade that
animated `backdrop-filter`. It never ran (the backdrop is not a `[data-chips-anim]` layer, so the
global freeze killed it), so removing the keyframes changes nothing on screen — but the stylesheet
no longer contains a rule that would break "light moves, elements don't" if it ever became active.
The new `web/tests/motion-policy.test.ts` mechanizes the law (keyframes may only touch
`background-position`, `--spark-pos` and `opacity`; both freeze paths must cover every effect
class; the global allow-list must stay), and the Windows workflow now runs it alongside the bridge
test — 10 tests, all green.

### Build and artifact

- Workflow: [`.github/workflows/build.yml`](.github/workflows/build.yml) — *Build Chips for Windows*,
  triggered on every push to this branch.
- Runs for this branch:
  [Actions, branch filter](https://github.com/ppourya4-design/chips-client/actions?query=branch%3Aarena%2F5f155897-chips-client).
- Artifact: **`Chips-win-x64`** — the NSIS installer for `x86_64-pc-windows-msvc`, unsigned.
- Local gate on the same tree: `npm run build` (tsc + vite) green, `npm run lint` 0 errors,
  `tsx --test web/tests/*.test.ts` 10/10.

### Weight

No dependency was added or changed; `web/package.json`, both lockfiles, `connector/`, `gateway/`
and `tsclientlib/` are byte-identical to `main`. Measured by building `main` and this branch side by
side with the same toolchain:

| Asset | `main` | this branch | Δ |
|---|---|---|---|
| `App-*.js` | 402,189 B (101.51 kB gz) | 403,049 B (101.72 kB gz) | +860 B / +0.21 kB gz |
| `App-*.css` | 51,790 B (8.91 kB gz) | 51,492 B (8.86 kB gz) | −298 B / −0.05 kB gz |
| `index-*.js`, `index-*.css` | 533,875 / 74,872 B | 533,875 / 74,872 B | unchanged |

The JS delta is the bridge plumbing (+ description in the snapshot, the event mapping, the
`setdescription` command, the in-place client patch); the CSS shrank because the dead popover
keyframes are gone.

## Step 6 — one settings hub (no Step 7 implementation)

The **gear in the persistent bottom self-bar**, beside the own avatar, mute and deafen,
opens the six-section Chips settings hub in every layout, including while disconnected.
Changes are applied/saved immediately; the footer says so and has **Done**, not a misleading
Cancel button. The existing dialog focus trap, Escape/backdrop dismissal and focus restoration
are reused. Identity, preset, whisper-list and profile editors are children of the hub: the
hub is suspended while a child is open and returns to the same section when it closes.
The profile editor now uses that same real modal/focus-trap styling (its inherited
`ts-modal` classes had no stylesheet). No new package or native capability was added.

### Consolidation map

| Previous location | Hub destination / disposition |
|---|---|
| Extras → Options; Nova Connect gear | Removed. Settings' primary entry is the bottom self-bar gear. Existing `#options/<section>` deep links for retained IDs still open the same hub, not another dialog. |
| Options → Application | **Connection**, additional connection/session and privacy preferences (server banner and chat-image policy). |
| Extras → Identities; Options → Security → Identities | **Connection → Manage identities**, retaining local identity generation/import/export and nickname handling. Security/password/cache preferences are also in Connection. |
| Favorites → Manage/Add | **Connection → Manage/Save server presets**, including real per-server sound-pack overrides. Ctrl+B and the server context save action open this child through the Connection hub. The Favorites top menu now only quick-connects saved presets. |
| Self → Change nickname | **Connection → Change current nickname** (connected only). The default/next-connect nickname and address:port are editable and saved even without connecting. Connect remains a session action with password, channel and privilege-key entry, not a parallel global-preferences dialog. |
| Options → Playback / Capture; toolbar output-device picker and VAD slider | **Audio**: device selection, playback volume, automatic leveling, mic clicks, activation/PTT/continuous mode, VAD threshold/hangover, mic test, typing attenuation, native echo/noise/AGC and optional bundled AEC3. These are the existing WebView2/browser audio controls, not invented connector DSP commands. |
| Options → Whisper; Extras → Whisper lists | **Audio**, including the existing whisper-list child editor. Immediate whisper targets remain runtime actions in the toolbar, not saved app preferences. |
| Options → Hotkeys | **Hotkeys**, existing PTT binding plus new independently saved mute/deafen keyboard bindings and clear actions. Duplicate PTT/mute/deafen keys are refused. These are explicitly **focused-window** shortcuts, not system-wide hotkeys; typing and open editors suppress mute/deafen actions. PTT keeps its existing keyboard/mouse behavior. |
| Options → Sounds / Notifications / Messages | **Notifications & sounds**, keeping event enable/volume/test/custom-audio/sound-pack controls, native-style notification tree and in-app text positions, disconnect message and away presets. Join/leave/message/poke remain the same working event routes. |
| Options → Design → Motion | **Appearance → Motion → Reduce animations**, same `chips-reduce-motion` class and OS-preference override. |
| Toolbar accent swatches and light/dark button; Options → Design | **Appearance**: existing Step 2 layouts and four accents, persistent brightness, icon-pack selection, tree/GIF preferences, IDE font, plus Liquid Glass **Off / Subtle / Full** and name-style default. Full uses the existing bounded refraction engine; Subtle uses a plain 10px blur; Off disables backdrop filters including fallback surfaces. No extra animated layer or refraction budget was added. |
| Options → Chat | **Appearance**, retaining font, history and chat display preferences. |
| Options → Downloads | **Connection**, additional transfer preferences. Folder/save-picker controls only render when the runtime exposes the corresponding browser API. |
| Top-bar Profile style | **Profile → Customize profile**, opening the existing Step 4 panel, including the existing `styles.json` profile transfer (not a theme-file format). |
| Options → Account | Connection has the existing desktop local-only notice; no account/login control is exposed in Tauri. |

### Hidden/dropped controls and reasons

- Removed inherited disabled **recording/playback/hotkey profiles**, fake Connect sound-pack
  selector, favorite-specific identity selector, and phonetic nickname fields in Connect,
  preset editing and the identity editor. There is one working audio/hotkey configuration,
  not a profile engine, and no phonetic speech engine. Imported identity phonetic metadata
  remains preserved; protocol/identity formats were not changed.
- Removed disabled Self-menu recording/playback/hotkey/sound-pack selectors, avatar/phonetic
  actions and unsupported talk-power request. Profile customization has a real hub entry;
  no disabled replacement is presented.
- Removed the unavailable **subscribe-current-channel-only**, **Overwolf**, **badges** and
  **hide inaccessible groups** controls. The connector subscribes all channels; the other
  integrations aren't implemented here. Working tree preferences remain.
- No **desktop notification** permission/toggle is shown: there is no Tauri notification
  plugin/capability or native notification implementation in this build. A plain explanatory
  sentence is in Notifications & sounds; in-app notifications and sounds still work.
- No manual **capture-volume** slider is fabricated: the capture pipeline has no manual input
  gain setter. Capture device/activation and working AGC are available; playback and event
  volumes are independent real controls.
- No system-wide hotkey toggle: no native global-shortcut plugin exists. Mute/deafen bindings
  are keyboard-only; PTT still supports its existing mouse bindings. Deafen sends the existing
  input/output-mute commands together and restores the prior input-mute state on undeafen,
  rather than opening a previously muted microphone.
- The legacy custom-theme manager/store entry is hidden. Previously saved custom layouts
  remain selectable; **`.chipstheme` import/export is only an explicitly marked Step 7 text
  placeholder**, with no file picker, parser, exporter, or theme-file implementation added.
- Extensions' unimplemented placeholder section is gone. Cloud account/sync/store controls
  remain unavailable in desktop as required by the Step 2 no-calls-home audit.

Runtime actions (connect/disconnect, mute/output mute/PTT, away, whisper targets, chat and
server/channel administration) remain available where useful. They aren't persistent global
settings. Server/channel administration and contact editing are not app preferences and were
not migrated or altered by this step.

### Persistence, safety and weight

Existing audio/design/theme/icon/chat/security/notification/download/profile keys and stores
are retained, so current users keep their preferences. New keys are `chips:auto-connect`
(default off), `chips:brightness`, `chips:glass-intensity` (validated, default Full),
`chips:mute-binding`, `chips:deafen-binding`, `chips:output-device` and `chips:vad-threshold`.
The audit fixed **three inherited persistence gaps**: output-device choice, VAD threshold,
and resetting capture device to system default (the empty ID now overwrites the saved ID).
Sound output routing is restored alongside voice routing. Invalid saved action bindings are
ignored. Auto-connect is opt-in and uses the saved host/nickname/identity on the next launch;
the fresh-install preset remains **wwts.ir:1694** without auto-connect.

No telemetry, URL, dependency, Node process, native command, capability or CSP change was added.
`connector/`, `gateway/`, `tsclientlib/`, both lockfiles and package manifests are untouched.
The existing no-calls-home audit still applies; no packet capture is claimed. English/LTR,
no-glow and motion-policy restrictions are unchanged. Self-bar avatars use existing avatar
rendering or the local profile image, with no orbiting-dot decoration. The weight budget is
unchanged: no framework/plugin and no new timer/animation loop; intensity modes never add a
filter pass. The bundle remains approximately 400–406 kB App JS / 102–103 kB gzip (Step 5:
403 kB / 102 kB); this is not an installed-size or RAM measurement.

### QA evidence and remaining real-PC checks

Local Linux gates: `npm run build --prefix web` succeeds; `npm run lint --prefix web` has
**0 errors / the same 11 inherited warnings**; `gateway/node_modules/.bin/tsx --test
web/tests/*.test.ts` passes **18/18**. Windows CI now also runs `settings-hub.test.ts` alongside
the desktop bridge and motion-policy tests. New coverage exercises saved binding reload/clear,
invalid storage, glass-value validation, six-section/single-entry structure, removal of toolbar
preferences, child-modal visibility, the Step 7 placeholder, device/default/VAD persistence
wiring, filter fallback modes and deafen command/state restoration wiring. Structural tests are
explicitly source-level assertions, **not** a browser interaction or real Windows audio test.

This sandbox has no browser engine or Windows desktop. Remaining manual Windows acceptance:
open the gear in each layout while disconnected/connected; Tab/Escape/return from each child;
change every exposed preference and restart; test mic permission/device switch/test tone,
VAD/PTT/mute/deafen (especially restoring a previously muted mic), sound events and auto-connect
on/off against the real server. As in Step 5, a green installer build proves compilation and
packaging, not live server/voice, WebView rendering or runtime traffic. The final PR/report
links the exact final-commit Windows run and **Chips-win-x64** artifact. Stop after Step 6.

Final honesty pass: light/dark is shown only for the built-in Standard layout (the other
built-ins deliberately use fixed dark palettes), and glass intensity is shown only for the
built-in Liquid Glass layout. Both choices are retained while using another layout, but no
ineffective control is displayed there. This visibility rule is covered by the 18th test.

## Step 6 owner follow-up — comprehensive coverage, DSP and vector icons

This section **supersedes the earlier Step 6 completion claim**. The follow-up audit expanded
coverage rather than treating the first six-section UI as the endpoint. The hub still has the
same six sections; there is no Step 7 theme-file work and no merge.

### Additions and corrected consolidation map

- **Audio → Per-speaker volume:** the connector's existing `setClientVolume`/`clientvolume`
  gain control is now available for each connected speaker, with individual and all-saved
  resets. Values retain their existing UID-keyed persistence and replay on reconnect. The
  context menu now opens Audio settings instead of hiding a separate slider.
- **Audio → Capture setup:** enabling the microphone for setup/testing is available directly
  in the hub, including before connecting. **Playback** also regains the existing native
  output-device picker, only when `selectAudioOutput` is supported; it uses the same saved
  device and voice/sound routes as the dropdown. No fake device-control API was added.
- **Audio → Broadcast defaults:** the existing TS6 P2P setup dialog is a hub child. Resolution,
  FPS, bitrates, source, source-audio, privacy, viewer limit and content hint persist in
  `chips:broadcast-defaults`. The toolbar routes setup through this same hub. Opening setup
  does not acquire media; Go live requires a connection and explicit user action. The
  unimplemented SFU choice is hidden (text explains P2P-only); camera mode hides the
  inapplicable shared-source-audio switch. This remains upstream's alpha streaming feature,
  not a claim of server compatibility or live verification.
- **Connection → Contacts and per-contact whisper policy:** the existing contact editor is
  now a hub child rather than a top-menu settings surface. Local names/categories, ignore
  policy and whisper overrides remain saved in the existing contact store. Its phonetic
  speech field was removed because no speech engine consumes it. Dynamic contact names and
  other user content are not rewritten by the icon cleanup.
- **Appearance → Vector icon packs:** import/delete is reachable independently of the hidden
  legacy theme manager. Existing `.ts3_iconpack`/ZIP parsing/storage/selection are reused,
  restricted to SVG UI assets. Raster-only imports are rejected with an explanation; saved
  raster entries no longer override the built-in vector icons (they are preserved in storage,
  so there is no destructive migration). No `.chipstheme` parser/import/export was added.
- **Hotkeys:** all six actions supported by the app's key handling are now editable:
  **mute, deafen, PTT, Open Connect, Disconnect current session, Save server preset**. The last
  three replace previously fixed Ctrl+S/D/B shortcuts. Every action has capture and Clear;
  exact modifier chords, bare modifiers (captured on release), and legacy unmodified saves
  are supported. PTT also supports its existing middle/side mouse buttons. All six share one
  conflict check, and cleared PTT now removes its storage key (previously it could reappear
  after restart). Explicit nulls in `chips:action-shortcuts` preserve cleared defaults.
  Shortcuts never become global OS hooks: dialog/typing/repeat guards remain, and PTT releases
  on key/modifier release, blur or binding change. Tree/menu navigation and chat Enter/Shift+
  Enter are widget accessibility semantics, not separately bindable actions in this stack.

### Explicit Audio DSP inventory

Code evidence: `web/src/voice.ts` (`MicCaptureOptions`, `MicCapture.start`, PCM callback,
`noteTyping`, `AudioPlayer.setVolume/setAutoVolume`), `web/src/aec3.ts`, and
`web/src/desktop/connection.ts::setClientVolume`. **No connector DSP options were invented.**

| DSP / audio processing | Exists in this Tauri build? | Working hub control / engine |
|---|---|---|
| Noise suppression | **Yes**, requested from WebView2's media capture engine | Audio → Capture → Noise suppression; persisted native `getUserMedia({audio:{noiseSuppression}})` constraint; active capture restarts with the new request. Hidden if the runtime does not advertise this constraint. |
| Native echo cancellation | **Yes** | Audio → Capture → Echo cancellation; persisted WebRTC/WebView2 `getUserMedia.echoCancellation`. Disabled while AEC3 is active to avoid stacking two cancellers. Hidden if unsupported by the runtime. |
| Capture automatic gain control | **Yes** | Audio → Capture → Automatic gain control; persisted WebRTC/WebView2 `getUserMedia.autoGainControl`, independent of native AEC/noise suppression. Hidden if unsupported. |
| AEC3 echo cancellation | **Yes**, already bundled | Audio → Capture → AEC3 toggle; Google WebRTC AEC3 WASM via existing `@ennuicastr/webrtcaec3.js`. Receives the post-gain playback reference and processes capture before VAD/PCM encoding; native AEC is switched off while used. No new package/download/service. |
| Voice-activation detection | **Yes** | Audio → Capture → Voice activation, sensitivity threshold and hangover delay; local PCM RMS comparison and hangover in `MicCapture`, **not** a neural VAD or connector option. Both scalar preferences persist. PTT/continuous are the existing alternative transmission modes. |
| Typing attenuation | **Yes** | Audio → Capture → Typing attenuation toggle; local `MicCapture.noteTyping()` applies a fixed 0.1 amplitude for approximately 0.2 s after typing. Not claimed as neural keyboard-noise removal. |
| Automatic playback leveling | **Yes** | Audio → Playback → Automatic volume leveling toggle; Web Audio `DynamicsCompressorNode` on the mixed voice path. Fixed threshold −30 dB, knee 10 dB, ratio 4, attack 0.005 s, release 0.3 s. Not per-speaker AGC. |
| Master playback gain | **Yes** | Audio → Playback → Voice volume; Web Audio `GainNode`, persisted; same output path as the test tone. |
| Per-speaker playback gain | **Yes**, connector advertises `clientVolume` | Audio → Per-speaker volume; existing connector mixer gain per UID, 0–200%, persisted/reapplied with reset controls. This is separate from the mixed playback compressor. |
| Microphone monitoring | **Yes**, diagnostic audio route | Audio → Capture → Test microphone; monitors processed capture through playback gain/output. Test-on/off is intentionally a session action, not a saved open-microphone state. |
| Shared-tab/music input mix | Module has a fixed −6 dB extra-source mix, but **no supported desktop tab-audio source is enabled** (`TAB_AUDIO_SUPPORTED` is deliberately false) | No dead mixer toggle or gain slider. TS6 screen-source audio is the broadcaster's existing source-audio setting, not microphone DSP. The fixed PCM mix coefficient is not a configurable DSP API. |
| PCM sample rate, clipping and Opus encode/decode/mix | **Yes**, fixed transport processing | 48 kHz/20 ms PCM and integer saturation in the existing frontend; Opus/protocol behavior remains in the untouched connector/library. No fabricated rate/codec-processing settings; changing these would violate the protocol black-box rule. |
| RNNoise / neural denoise / neural VAD / capture EQ / high-pass / manual capture gain / configurable compressor parameters | **ABSENT FROM THE EXPOSED STACK** | No such MicCapture/connector setting API exists. Native noise suppression/AGC and the fixed playback compressor above are not misrepresented as these features. No implementation was improvised. |

Native DSP controls send the actual media constraints, not cosmetic state. Browser support
advertisement does not prove a particular microphone driver honors every request: acoustic
quality and WebView2/device behavior still require real Windows testing. Local tests fake the
media/audio APIs to verify constraints, routing and PCM behavior, not audio quality.

### Required TeamSpeak-client coverage table

| Important area | Hub location / implemented coverage | Plainly absent capabilities |
|---|---|---|
| Connection / identity | **Connection**: saved address:port/nickname/identity, auto-connect, presets, identity import/export, passwords/security, session behavior, contacts/whisper policy and transfer preferences. Connect is a hub-reachable session child for passwords/default channel/privilege key. | **ABSENT FROM THE STACK:** phonetic speech, per-favorite identity profiles and identity security-level tuning UI/API; no dead fields. |
| Capture | **Audio → Capture**: input device, enable/test, VAD threshold/hangover, PTT/continuous, native NS/AEC/AGC, AEC3, typing attenuation. **Hotkeys** owns the PTT binding (Audio links to the same binding state). | **ABSENT FROM THE EXPOSED STACK:** manual input gain, EQ/high-pass, neural processing, multiple capture profiles. |
| Playback | **Audio → Playback / Per-speaker volume**: device dropdown, supported native picker, voice gain, leveling, test tone, mic clicks, connector speaker gains/resets. | **ABSENT FROM THE STACK:** configurable per-speaker compressors or playback profile engine; mixed leveling is not advertised as either. |
| Hotkeys | **Hotkeys**: all six bindable app actions, capture, chords, conflict checks, clear and restart persistence. PTT mouse capture retained. | **ABSENT FROM THIS BUILD:** global OS key hooks/plugin; widget navigation is not an arbitrary action-binding engine. |
| Notifications | **Notifications & sounds**: global/event sound enable/volume, join/leave/message/poke etc., custom sounds/packs, notification tree/scripts/text positions, muted policy, disconnect text and away presets. | **ABSENT FROM THIS BUILD:** native desktop-notification plugin/capability; no fake permission toggle. |
| Chat behavior | **Appearance → Chat**: line limits, font/size/reset, per-scope logging/restoration and notification policy. **Connection → Application/privacy**: auto-open channel chat, poke behavior, banner/chat image choices; notification scripts/messages remain in Notifications. | No missing existing ChatSettings/AppSettings fields were found. Speech/phonetic output is absent, not confused with chat fonts. |
| Appearance | **Appearance**: existing layout/accent, effective brightness/glass choices, Reduce animations, name defaults, tree/GIF preferences, IDE font, SVG icon-pack selection/import/delete; **Profile** opens Step 4 customization. | **ABSENT/DEFERRED:** unavailable integrations/badges and `.chipstheme` (Step 7 placeholder only). Existing custom layouts remain selectable, but no theme-file feature is started. |

### Full stock surface audit / disposition

Inventory method: reviewed **every `*Panel`, `*Dialog` and `*Settings` component in App.tsx**,
all persistent-key readers/writers in `web/src`, public methods in `voice.ts`/`aec3.ts`, the
actual Tauri socket dispatch/features, and ancillary browser-only surfaces. This table is the
exhaustive disposition list rather than a claim that every dialog is an app preference.

| Stock surface(s) | Disposition |
|---|---|
| Options Application (`AnwendungPanel`) | Connection; all seven AppSettings flags plus the two privacy/display flags retained. Subscription-only-current was unsupported and remains hidden. |
| Options Account (`KontoPanel`) | Connection local-only notice in Tauri; cloud account controls remain gated out. |
| Options Playback / Capture (`WiedergabePanel`, `AufnahmePanel`) | Audio, including every exposed DSP/device method and test route; see explicit DSP inventory. |
| Options Hotkeys (`HotkeysPanel`) | Hotkeys; six real bindings instead of three fixed shortcuts plus partial PTT binding. |
| Options Sounds / Notifications / Messages (`SoundsPanel`, `MeldungenPanel`, `NachrichtenPanel`) | Notifications & sounds; no existing event/custom-sound/pack/message control omitted. |
| Options Design / legacy manager / store | Appearance; all working display/tree/IDE/icon controls retained, icon import/delete restored separately; cloud store unavailable, custom theme-file tooling deferred without adding Step 7. |
| Options Extensions | Unsupported placeholder removed. No extension runtime exists. |
| Options Whisper (`WhisperPanel`), `WhisperListsDialog` | Audio and hub child; runtime whisper target action remains available. |
| Options Downloads (`DownloadsPanel`), `FileTransfersWindow` | Saved transfer limits/concurrency/UI choices in Connection. Transfer window is an operational queue, not another preferences page. Unsupported folder picker remains hidden by runtime API check. |
| Options Chat (`ChatPanel`) | Appearance; all ChatSettings fields retained. |
| Options Security (`SecurityPanel`, `MasterPasswordRow`) | Connection, including existing local-vault forms; not another standalone settings entry. |
| `ConnectDialog`, `FavoritesDialog`, `IdentitiesDialog` | Connection and hub children; Connect still also opens as a runtime connect action. Removed stock unsupported profile/phonetic fields; no alternative global settings page. |
| `ContactsDialog` | Connection child; no top-menu settings editor. Existing local name/category/ignore/whisper policy retained, unused speech field hidden. |
| `ProfileStyleEditor` | Profile child; existing styles.json profile transfer stays Step 4, not a theme format. |
| `StreamSettingsDialog` | Audio child, saved broadcast defaults; toolbar setup goes through same hub, explicit Go live retains existing protocol path. SFU absent. |
| Client context speaker-volume slider | Replaced by link to Audio's actual saved per-speaker controls; no hidden parallel setting. |
| `AwayDialog`, channel-password entry, nickname change | Immediate session actions/credentials; away templates/default nickname live in the hub. Current-nickname editor is a Connection child. |
| `ClientConnectionInfoDialog`, `ServerConnectionInfoDialog`, `ClientLogDialog`, `ServerProtocolLogDialog`, `PermissionOverviewDialog`, `WhisperHistoryDialog` | Read-only diagnostics/history; retained as operational views, not app preferences. |
| `GroupAssignDialog`, `MoveClientDialog`, `PermissionsEditorDialog`, `ServerEditDialog`, server icon manager | Server-authorized administration of remote server objects, not hidden local app settings. Not rewritten into client preferences or protocol behavior. |
| `FileBrowserDialog`, invite, collected URLs, offline-message, ban and complaint dialogs | File/session/server actions and data views, not global preferences. Their control icons are vectors now as well. |
| About, feedback, ToS, restart/update notices | Informational/gated web-only or lifecycle surfaces, not app settings; no new calls-home route. |
| Main entry local vault unlock / identity import/sync bootstrap | Startup credentials and existing web-only sync gates, not preference menus; desktop sync remains blocked. |

### Vector icon replacement map and guard

Added lightweight local `<UiIcon>` references to **the existing `public/icons.svg` sprite**
using the same currentColor stroke style as the existing TeamSpeak inline SVGs. No icon package,
font, CDN or animation was added. Replaced app-defined emoji and text-glyph control icons across
hub sections, self-bar mic/deafen/gear, status/away/lock/stream indicators, top menus/toolbars,
profile close controls, favorites/identities/contact children, sound-pack controls, transfer/file
operations, administration/context-menu actions and tab close. Streaming choice labels now use
plain English rather than emoji. English translated test-tone/sound/preset labels were cleaned
up, and the static memorial decoration is plain text; user nicknames/channels/messages were not
transformed. The toolbar Chips mark now uses the existing SVG instead of its PNG sibling.
The legacy CSS send-arrow glyph now masks with a tiny bundled SVG. User avatars/banners and
server-provided group/icon image content remain content, not replacement UI control icons;
Windows packaging icons keep the OS-required `.ico` representation.

`vector-icons.test.ts` parses every root TSX module to reject static emoji literals, checks the
English dictionary, checks all literal/dynamic section icon references resolve in the local
sprite, and tests that raster-only icon packs cannot override UI vectors. It intentionally does
not strip emoji from dynamic user content.

### Follow-up validation

On the final follow-up source: **33/33 tests pass** (bridge, motion policy, hub coverage,
keyboard persistence/chords/clear, audio DSP routing/PCM tests, broadcast-default storage and
vector-icon policy). Production `tsc`/Vite build passes; lint is **0 errors / 11 inherited
warnings**. No dependency/lockfile, telemetry, native capability, CSP, connector, gateway or
`tsclientlib` change. The App bundle is about **410 kB / 104.5 kB gzip** plus ~9 kB of local
SVG sprite paths and tiny send/chevron masks; no new runtime framework or process. The installed-size/
RAM weight budget was not relaxed, and real Windows RAM was not measured in this sandbox.

A final Windows Actions installer run on the pushed final commit is required and linked in
PR #6 and the final report. Artifact remains **Chips-win-x64**. The earlier 18-test green run is
not presented as proof for these additions. Real Windows device/voice/two-client/visual checks
still require a Windows PC; mocked DSP tests are not acoustic testing. No Step 7 implementation
or merge has been performed.

The final vector sweep also replaces legacy disclosure chevrons, stepper minus, unread-dot and back-arrow glyphs with SVGs; a dedicated guard covers these non-emoji control icons.

## Step 6.5 — responsive desktop window (not Step 7)

The final `window-layout.css` is the layout authority after all selectable designs.
At **760 CSS px and above**, tree and chat are side by side. Below **760px**,
chat is hidden, not stacked below the tree. This threshold reserves a usable
240px minimum tree plus at least 400px for chat and chrome when wide. Native
Tauri minimum is now **360 × 560**, down from 800 × 560 so narrow mode is
actually reachable. The 1200 × 760 default is unchanged.

State model: viewport-derived `wide | narrow`; transient `chatSheetOpen`;
existing active chat tab/thread retained independently. Any window resize resets
the sheet flag, so shrinking always returns to the tree and widening always
restores side-by-side chat. Open channel chat and existing private-chat actions
open the sheet in narrow mode. Back to channels / Escape dismiss it, without
losing messages/draft/tab. Back receives focus on opening; the channel-chat
button receives focus on Back. The sheet occupies the body only, leaving the
self-bar accessible. Profile cards remain floating when wide and become full
viewport-height, vertically scrolling sheets below 760px. No position animation
or new effect layer is introduced.

Tree width persists as `chips:tree-width` in localStorage (240–500px, default
280px); malformed values and unavailable storage have safe fallbacks. The
rendered width is additionally bounded to viewport minus 400px without overwriting
the preferred width on resize. Narrow mode uses the full tree width. The splitter
supports captured pointer drags (including touch/pen), arrow keys in 16px steps,
Home/End, focus indication, and separator ARIA values. No new dependency.
The self-bar uses four fixed 36px controls: mute, deafen, explicitly disabled
screen-share placeholder, settings; the name ellipsizes before controls shrink.
Horizontal overflow is suppressed at the root and pane boundaries, long chat
content wraps, and tree labels truncate; vertical scrolling stays within panes.
The old separate info column is hidden in this layout; identity rows retain the
Step 4 profile-card path. `.chipstheme` remains the Step 7 placeholder.

### Width-matrix QA (honest scope)

Exercised **360, 400, 480, 600, 759, 760, 800, 1024, 1200, 1600px** with
Node unit/source tests, **not a browser/DOM layout engine or manual dragging**.
For each width: checked mode selection, 240px tree floor for saved widths
240/280/500, wide-mode chat/chrome reserve, and the self-bar fixed-control width
budget. Also tested persisted reload, malformed/blocked storage, and source
contracts for sheet/back, pointer capture, keyboard splitter and no new animation.
These checks do not prove computed geometry, scrollbar absence or visual quality.
No installed Windows runtime, real device, live server, two-client or manual
WebView2 verification was performed. Those checks remain necessary on a PC,
including the minimum-height window, long names/messages and profile-sheet scroll.

Local gates: **46/46 tests passing**, including motion-policy and vector-icon
policy; production TypeScript/Vite build passes; lint **0 errors / 11 inherited
warnings**. Windows CI now includes the layout tests. Final-commit Windows build
and `Chips-win-x64` artifact evidence are linked in the PR and final report, not
confused with runtime QA. No connector, gateway, tsclientlib, native capability,
CSP, dependency or lockfile changes. No merge and no Step 7 work.

Final overflow audit also replaces the legacy multi-server tab horizontal scroller with
wrapped, vertically scrollable tabs (76px cap), and bounds auxiliary profile/notification/
transfer scrolling horizontally. This adds one source-contract test, not runtime proof.

## Step 7 — `.chipstheme` theme files and the theme-making kit

Step 7 replaces the Step 6 placeholder in **Settings → Appearance** with a real,
token-only theme-file feature. Nothing in the connector, the gateway,
`tsclientlib`, the Tauri host, the CSP or the dependency set changed; a theme
file cannot reach any of them.

### The format (final, as implemented)

A `.chipstheme` file is **one JSON object**. Seven top-level fields, no more:

```json
{
  "format": "chipstheme",
  "version": 1,
  "name": "Name (1–48 chars)",
  "author": "Author (1–48 chars)",
  "description": "optional (≤160 chars)",
  "base": "glass",
  "tokens": { "color.accent": "#a74cfd", "glass.blur": 24 }
}
```

`tokens` holds **design-token values only**. Every key is one of the 36 tokens
in `web/src/themeFile.ts` → `THEME_TOKENS`; each writes custom properties that
the Liquid Glass stylesheet already declares. There is no token for CSS,
scripts, HTML, URLs, external fonts or images, shadows, glow, animations,
layout or behaviour — so those cannot be expressed at all.

| Group | Tokens | Notes |
|---|---|---|
| Colours (page, glass, light, accent, text, status, controls, log) | 28 | `colour` = `#rrggbb` / `#rgb` / `rgba(r,g,b,a)` (a 0–1) / `transparent`. `color.accent` must be **hex**: Chips derives `--primary-rgb`, `--accent-rgb`, `--primary-dim` and (unless the file sets it) `--accent-contrast` from it, exactly as the accent switcher does. |
| Glass | `glass.blur` 0–60 px, `glass.saturate` 100–250 %, `glass.radius` 0–32 px, `controls.radius` 0–999 px | Same values the intensity selector uses (0 = Off, 10/120 = Subtle). |
| Type | `font.family` ∈ `plus-jakarta-sans` \| `manrope` \| `vazirmatn` \| `vt323` (the bundled OFL families only), `font.size` 11–18 px | The glass sheet's `font-family`/`font-size` now read `--font-ui` / `--ui-font-size`, so a theme reaches the interface type without a font download. |

Numeric tokens are plain JSON numbers (no strings, no units). The full table with
type, range and default is `docs/theme-kit/token-reference.md`, generated from
the same array and test-checked against it.

Two tokens were added to the surfaces that already existed as literal CSS
values (`color.toolbar`/`color.toolbarAlt` cover upstream's `--bg-toolbar-1/2`).
Four custom properties remain `var()` aliases of themed tokens
(`--input-text`, `--self-text`, `--log-text`, `--log-error`); the drift test
asserts that these four are the *only* themed properties the schema does not
own directly.

### Validation rules (strict, and they never half-apply)

`validateThemeFile(text)` returns English errors; `importThemeFile()` is pure
(reads the installed list, mutates and persists nothing). The UI applies a
theme **only** when validation returned no errors, so a rejected file leaves the
installed themes, the selection and the applied look untouched.

- not JSON / not an object / empty / >64 KB → refused;
- `format` ≠ `"chipstheme"`, `version` ≠ `1` (a higher number gets an
  "update Chips" message), `base` ≠ `"glass"` → refused;
- any **unknown top-level field** (e.g. `css`, `script`, `url`) → refused, so a
  file cannot smuggle in code that is merely ignored;
- any **unknown token** → refused (not silently ignored), with a pointer to the
  token reference, so a typo cannot look like it worked;
- wrong type or out-of-range value → refused with the range in the message;
- `name`/`author` must be text, 1–48 chars, no control characters;
- no valid token at all → refused ("would not change anything");
- 32 imported themes is the cap (the list is refused, not truncated).

### Import / export / removal

- **Import**: file picker (`accept=".chipstheme,application/json"`), strict
  validation, applied immediately on success, persisted in `chips:themes`, and
  listed next to the built-ins with its author. Failures render as a red,
  English error block and change nothing.
- **Export the current look**: name / author / description are editable; the
  file is written from `resolveThemeTokens(activeTheme, liveAccent)` — the
  built-in base, then the active theme's own tokens, then the live accent — so
  an export is always complete and re-imports to the same look. The author is
  remembered in `chips:theme-author`.
- **Remove**: imported themes only, with a confirm. Built-ins have no remove
  control and the handler only ever filters imported ids; removing the active
  theme falls back to the current built-in accent.
- Selecting a **built-in** theme writes the existing `chips:accent` key (so the
  toolbar swatches and the Appearance list cannot disagree), and picking a
  swatch selects the matching built-in theme again. If a stored `file:` id no
  longer resolves (cleared storage), the app falls back to the built-in look
  instead of a dangling selection.

### Built-in themes

Only the owner's four Liquid Glass accents, defined in code, not as files:
`accent:cyan` `#74e5ff` (default), `accent:purple` `#a74cfd`, `accent:red`
`#fd1d1d`, `accent:blue` `#1a56db`. No third-party/fun themes are bundled — no
Dark Souls, no Windows XP, nothing built on someone else's IP. Those are meant
to ship later as standalone `.chipstheme` files, which the format already
supports (any file with a valid manifest imports into that list).

The tokens are written as inline custom properties on the app root, so they also
reach the legacy Standard/Nova/Pulse/IDE layouts if the user switches to one —
they override that layout's own palette values but change nothing structural.
The supported combination is Liquid Glass + a theme file.

### The theme-making kit — `docs/theme-kit/`

| File | Contents |
|---|---|
| `starter.chipstheme` | Minimal valid template: all 36 tokens present in schema order, every value at its default, so editing one line is a complete introduction. JSON has no comments; naming and order carry the meaning, and the tutorial explains each group. Tested to equal the defaults exactly. |
| `tutorial.md` | Persian, short, friendly. What a `.chipstheme` is, how to import, how to edit the starter, what each token group does, the safety rules, export/sharing, and the AI workflow. Token names and values stay English. |
| `ai-prompt.md` | Ready-to-paste prompt: Persian framing, then English hard rules plus the generated 36-token schema with type, range, default and one-line meaning, and a "describe the vibe" slot with four short examples. |
| `token-reference.md` | Generated from `THEME_TOKENS` (script kept out of the repo, table mirrored in the test): every token with type, allowed range/format and default, plus the accent derivation and the font list. |

`web/tests/theme-file.test.ts` fails if the docs drift from the schema: the
reference must list exactly the schema's tokens with their defaults and ranges,
the starter must carry every token at its default, the AI prompt must embed
every token and font, and the tutorial must be Persian and name the kit files.

### Standing rules

- Themes **cannot introduce glow**: there is no glow/shadow/bloom/halo token,
  and a test asserts no token name or custom property mentions one. The only
  light remains the crisp specular edge.
- The animation law is untouched: a theme sets no keyframes and cannot opt
  elements into motion; the panel adds no animation. `motion-policy.test.ts`
  still passes unchanged.
- English/LTR interface, vector icons only (`UiIcon` trash icon), no new
  dependency, no native capability, no CSP or network change. A theme is inline
  custom properties on the app root — never a stylesheet, never HTML.

### Tests, build and weight

- **77/77 tests pass.** New `theme-file.test.ts` (31 tests): valid import,
  starter/reference/prompt/tutorial drift, hex/rgba normalisation, and rejection
  of malformed JSON, wrong format/version/base, unknown top-level fields,
  unknown tokens, out-of-range and mistyped values, bad meta fields, oversized
  files — each re-checked to leave the stored theme list and active id
  byte-identical; plus export round-trip, accent contrast, file naming, storage
  fallbacks, the 32-theme cap and the built-in/placeholder wiring.
- Production `tsc -b && vite build` passes; `oxlint` is **0 errors / 11
  inherited warnings** (one new file, no new warnings).
- Weight, measured by building `main` and this branch with the same toolchain:

  | Asset | `main` | this branch | Δ |
  |---|---|---|---|
  | `App-*.js` | 411,635 B (105.08 kB gz) | 431,628 B (111.18 kB gz) | +19,993 B / +6.10 kB gz |
  | `App-*.css` | 56,402 B (9.83 kB gz) | 56,474 B (9.85 kB gz) | +72 B |
  | `index-*` | unchanged | unchanged | 0 |

  That is the whole schema, validator, panel, storage and CSS. No new package,
  no new process, no added animation, no extra filter pass.

Honest limits: the theme list, import/export, error rendering and live
application were exercised by Node tests against the real modules and source
contracts, **not** in a browser or on Windows. A rejected-file import was
verified at the storage-state level; the file picker itself needs one click on a
real Windows desktop.

This is the last step of the current pipeline; no image-chat or screen-share
work was started, and the PR is not merged.
