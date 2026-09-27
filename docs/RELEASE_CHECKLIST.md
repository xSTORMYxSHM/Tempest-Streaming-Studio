# 1.5.0 coordinated release checklist

Studio and Broadcast 1.5.0 remain release candidates until every required gate below passes on the same installed build pair. A prior release's checks, artifacts, or stream results do not satisfy these gates.

## Scope freeze

- [x] Limit Studio scope to the known Browser Source fixes, Emote Wall recovery, Dice Box completion and styles, numeric chat polls, reusable GIPHY alert assignment, the dedicated Stream Together call window, on-air workspace cleanup, chatbot quality-of-life work, and release validation.
- [x] Keep video canvases, encoders, Enhanced Broadcasting, platform output services, recording, and final audio routing owned by Broadcast.
- [x] Keep accounts, stream information, chat/chatbot behavior, alerts, interactions, counters, Dice Box, operator readiness, and orchestration owned by Studio.
- [x] Keep both Twitch Extension packages on their independent `0.1.0` version line; 1.5.0 does not itself authorize a Twitch-hosted extension deployment.
- [x] Record Broadcast's matching 1.5.0 RC5 commit (`fe8d6b9a4411836ffbc4d1387e5cfe6ad677cc3e`) and confirm the shared production contract.
- [ ] Do not add new release features after the candidate is packaged; fixes require a new candidate and a repeated rehearsal.

## Automated Studio gates

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm check` (107 tests, 0 failures)
- [x] `pnpm package:win`
- [x] Packaged executable smoke test exits 0 with a new isolated profile.
- [x] NSIS and ZIP artifacts pass checksum generation and release verification.
- [x] Secret/path scan passes for packaged resources.
- [x] Release audit records the exact candidate commit, artifact hashes, signatures, and test count.

## Coordinated installed-build rehearsal

Run these checks with freshly installed Studio and Broadcast 1.5.0 candidates. Do not substitute a development checkout or an older installed app.

- [ ] Studio and Broadcast display 1.5.0 and the recorded candidate commits match the packaged sources.
- [ ] Broadcast reports the expected Studio capability/overlay status and no compatibility warning appears.
- [ ] Twitch and Interaction Alert Browser Sources connect independently and each reports one client.
- [ ] A Twitch alert with assigned audio moves its Broadcast source meter and is audible through Monitor and Output.
- [ ] An Interaction Alert with assigned audio moves its own source meter and is audible through Monitor and Output.
- [ ] Alert audio still plays when the first loopback fetch is deliberately stalled or interrupted, and the Broadcast log shows the bounded fallback rather than an unhandled timeout.
- [ ] Emote Wall receives at least one native Twitch emote and one supported third-party emote while already live, without recreating or refreshing the Browser Source.
- [ ] A fixed d20 and a custom-range roll visibly bounce, settle, record their physical results, and clear on schedule without a completion failure.
- [ ] Switch among at least Classic, Wooden, and Gemstone Dice Box styles; each style loads locally and preserves physical result reporting.
- [ ] Studio restart/reconnect recovers only the disconnected active Studio Browser Sources and preserves their UUIDs and settings.
- [ ] Twitch horizontal and vertical Enhanced Broadcasting previews are correct in Stream Manager and on a physical phone.
- [ ] Kick can start, stop, fail, and retry independently without interrupting Twitch; Emergency Stop All Outputs stops both.
- [ ] Twitch and Kick messages share Studio's Collaboration Center while replies remain platform-local.
- [ ] Open Stream Together from Studio, sign in within its isolated call session, and confirm Twitch does not show the unsupported-browser page; camera, microphone, speakers, guest controls, and one selected screen share work while Shared Chat and polls remain connected independently. Confirm Broadcast captures call audio through exactly one chosen route so desktop audio and Twitch Browser Source audio do not create an echo.
- [ ] `!song` sends `https://www.tempestmainframe.com/listen` for the migrated default provider and preserves custom providers.
- [ ] Rotating chatbot messages can trigger by elapsed time and by chat count, target Twitch/Kick/both, and remain silent while offline.
- [ ] Start a numeric poll, confirm each Twitch and Kick account's first valid number counts only once, then end and clear the poll while preserving the displayed final totals until clear.
- [ ] Use GIPHY to assign and preview a locally downloaded GIF on an Interaction Alert, a base Twitch Alert, and a Twitch Alert variant; confirm each target remains portable in its Alert Pack.
- [ ] Confirm Stream Together has its own primary On Air tab; Live Desk opens directly to Shared Chat and polls; setup drawers begin collapsed, Guided Setup reveals the requested hidden setup page, and all controls remain keyboard reachable.
- [ ] Confirm Private Info Hidden remains visible from every workspace and still masks account identities, credentials, locations, provider URLs, and local endpoints inside expanded setup drawers.
- [ ] Multiple alerts remain FIFO and Emergency Restore clears queued playback and temporary interactions.
- [ ] No new error, uncaught rejection, repeated reconnect loop, or growing alert queue appears in Studio or Broadcast logs.

## Performance and soak gates

- [ ] Capture at least 30 minutes with Tempest telemetry, including five minutes idle, game launch/load, active gameplay, alerts, Emote Wall, Dice Box, and a Studio reconnect marker.
- [ ] Confirm Tempest telemetry ingests Broadcast's atomic `%APPDATA%\\tempest-broadcast-system\\telemetry\\runtime.json` sidecar when OBS WebSocket is disabled and can read active logs without a sharing violation.
- [ ] Compare Broadcast render lag, encode skips, dropped frames, CPU, memory, GPU 3D/encode, and VRAM with the 1.4.7 stream baseline.
- [ ] Confirm Studio and Browser Source CPU/memory settle after each interaction and show no sustained growth across the soak.
- [ ] Preserve current Enhanced Broadcasting resolution, frame rate, and bitrate unless output counters—not aggregate GPU utilization alone—show a regression.
- [ ] If extra GPU headroom is needed, evaluate optional Vertical Canvas Backtrack separately; do not silently disable it for users who rely on replay.
- [ ] Review the complete Studio, Broadcast, and telemetry logs after the soak and record any accepted warnings.

## Clean-install and upgrade gates

- [ ] Windows installer starts and uninstalls on a non-developer account.
- [ ] Guided Setup contains no personal Twitch, Kick, station, location, bot, or companion-app values.
- [ ] Upgrade from 1.4.7 preserves credentials, stream information, alerts, media, commands, counters, interactions, dice settings, platform settings, and encrypted secrets.
- [ ] Backup/restore succeeds, requests reconnects clearly, and creates a pre-restore snapshot.
- [ ] Offline use, disconnected optional integrations, missing media, and provider outages show recoverable errors.
- [ ] Keyboard navigation, Windows scaling, reduced-motion preference, and 1080p/1440p layouts are reviewed.

## Publication gates

- [ ] Both Studio and Broadcast rehearsals are signed off against the same candidate pair.
- [ ] Build and timestamp-sign the final installer, uninstaller, elevation helper, desktop executable, and native DLL payload.
- [ ] Confirm `latest.yml` names the exact 1.5.0 installer and includes its SHA-512 digest and size.
- [ ] Upload `latest.yml`, matching blockmap, installer, portable ZIP, checksums, release manifest, release notes, privacy notice, installation guide, and third-party notices.
- [ ] Publish only after all required gates pass; do not publish a draft candidate as the stable updater release.
- [ ] From installed 1.4.7, download, verify, restart, retain settings, and confirm 1.5.0 in **Settings + About**.
- [ ] Verify any public Twitch Extension/EBS deployment separately before advertising viewer-facing Bits features.
