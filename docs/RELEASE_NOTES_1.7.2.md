# Tempest Streaming Studio 1.7.2 release notes

Tempest Streaming Studio 1.7.2 is an OBS compatibility hotfix for the Unified Stage and its Stage Actor renderer.

## Unified Stage rendering

- Fixed the Interactive Stage disappearing when OBS's embedded Chromium compositor loaded it inside the Unified Stage iframe stack.
- The Unified Stage now loads the Interactive Stage through the alternate loopback hostname. This keeps the source local while separating the child compositor surface that OBS was dropping.
- Transparent output remains intact, including the default avatar floor and empty areas of the canvas.
- Viewer avatars and active polls can render together through the single Unified Stage Browser Source.

## Stage Actor assets

- Stage Actor atlases, palette masks, and motion-rig assets receive one revision per Browser Source session so OBS cannot reuse stale image data after an avatar pack changes.
- Actor files are served with no-store cache headers while retaining local-only access and the existing pack format.

## Compatibility

- The Studio/Broadcast wire protocol remains `1.0` and remains compatible with Tempest Broadcast 1.5.0.
- Existing settings and Stage Actor packs remain compatible with 1.7.1.
- Tempest Mainframe and Tempest Streaming retain their independent Twitch Extension versions; this desktop hotfix does not require a Twitch-hosted asset upload or Railway deployment.
