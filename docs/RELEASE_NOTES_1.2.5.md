# Tempest Streaming Studio 1.2.5

This compatibility hotfix restores Discord Desktop connections on Windows systems where Discord publishes its RPC endpoint through the standard named-pipe form.

## Fixes

- **Broader Windows compatibility:** Studio now tries both `\\.\pipe\discord-ipc-{n}` and `\\?\pipe\discord-ipc-{n}` across all ten Discord IPC slots.
- **Clearer recovery guidance:** connection failures now explain whether Discord's local endpoint is unavailable or Windows denied access instead of displaying a raw final `ENOENT` path.
- **No authorization changes:** Discord OAuth still occurs only after the local desktop connection succeeds, and credentials remain encrypted on Windows.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.2.5-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.2.4 can open **Settings + About → Automatic updates**, check for version 1.2.5, download it, and approve the restart. Existing alerts, scenes, Discord guest profiles, credentials, and local media are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
