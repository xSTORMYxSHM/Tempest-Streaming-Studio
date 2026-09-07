# Tempest Streaming Studio 1.2.6

This release hardens public Twitch Extension setup and replaces internal connection errors with clear recovery guidance.

## Improvements and fixes

- **One public Extension service:** installed users connect through Tempest Signal on Railway automatically. The self-hosted service address is no longer exposed in the Studio interface.
- **Safer Twitch migration:** upgraded installations that retain a custom or legacy Twitch application are detected before public Extension pairing and can switch back to the built-in Tempest Twitch sign-in.
- **Actionable pairing failures:** Studio distinguishes a broadcaster authorization problem from a Tempest Signal allowlist problem, while the service returns a stable machine-readable failure code.
- **Cleaner desktop errors:** Electron's internal remote-method prefix is removed from errors shown to streamers.
- **Honest Discord guidance:** Discord authorization failures now explain when an account must be an accepted App Tester. Public Discord Guests connectivity still requires Discord approval for the `rpc` and `rpc.voice.read` scopes; Twitch Extension publication does not grant that separate approval.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.2.6-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.2.5 can open **Settings + About → Automatic updates**, check for version 1.2.6, download it, and approve the restart. Existing alerts, scenes, Discord guest profiles, credentials, and local media are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
