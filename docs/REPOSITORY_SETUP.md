# Repository and hosting setup

Tempest Streaming Studio uses one Git repository for the desktop application, Twitch Extension, shared contracts, local services, and hosted Twitch EBS. Generated releases and local runtime data do not belong in Git.

## Repository layout

- `apps/studio-desktop` — local Electron control plane.
- `apps/twitch-extension` — Twitch-hosted viewer and broadcaster configuration files.
- `services/twitch-ebs` — public HTTPS API and secure WebSocket relay.
- `services/tempest-bridge` — authenticated local orchestration service.
- `services/warudo-adapter` — local Warudo capability adapter.
- `packages/tempest-contracts` — shared event, capability, and configuration schemas.
- `docs` — architecture, setup, and operational guidance.

## GitHub creation

1. Create an empty GitHub repository without adding a README, license, or `.gitignore`.
2. Keep the repository private while Twitch credentials, deployment, and public-release policies are being prepared.
3. Add the GitHub repository as `origin` and push the existing `main` branch.
4. Confirm the `Studio checks` workflow completes successfully.
5. Enable branch protection for `main` after the first successful workflow run.

Example commands, replacing the URL with the repository GitHub creates:

```powershell
git remote add origin https://github.com/OWNER/tempest-streaming-studio.git
git push -u origin main
```

## Secret boundary

Never commit:

- Twitch OAuth client secrets or Extension shared secrets.
- broadcaster, chatbot, or installation access and refresh tokens.
- relay credentials, pairing credentials, or bridge tokens.
- local `.env` files, TLS certificates, Electron profiles, databases, logs, or build archives.

Commit only placeholder values in `.env.example` files. Production secrets belong in the hosting provider's encrypted environment-variable store. Local tokens belong in the operating-system credential vault managed by Studio.

## Hosted EBS

The public EBS is deployed from this repository as a separate service. Its build context is the repository root because it depends on workspace packages. The root `Dockerfile` is detected automatically by Railway; `services/twitch-ebs/Dockerfile` remains available for hosts that accept an explicit Dockerfile path. Both build the EBS and shared contracts without starting the desktop application.

For the public multi-channel release, provision:

- one always-on EBS service and one PostgreSQL service;
- one PostgreSQL database;
- one stable HTTPS/WSS hostname;
- encrypted environment variables for Twitch and Tempest service secrets;
- health checks, logs, backups, and secret rotation.

The Twitch Extension files remain hosted by Twitch. The Extension calls the EBS through its allowlisted HTTPS origin, while each local Studio pairs with broadcaster OAuth, stores its issued credential with operating-system encryption, and opens an outbound WSS connection to the same origin. PostgreSQL stores channel installations, relay-token hashes, and viewer-safe signal catalogs; OAuth tokens and local media never enter the database.
