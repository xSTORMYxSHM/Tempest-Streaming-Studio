# Twitch Dual Format

Tempest Streaming Studio treats Twitch Dual Format as a production output owned by Tempest Broadcast. Studio does not encode video, store stream keys, or create a second RTMP session. It displays readiness and sends authenticated local control requests; Broadcast owns OBS canvases, scene links, audio routing, Enhanced Broadcasting, encoders, and the live Twitch output.

Twitch currently makes Dual Format available to all streamers. It requires Enhanced Broadcasting and one additional 9:16 canvas. Twitch recommends 1080 × 1920 and also documents 720 × 1280 as a lower-load vertical option. The horizontal canvas continues serving desktop and TV viewers while mobile viewers receive the vertical format. Twitch adds chat to the mobile view, so Studio's Chat Overlay should not be placed on the vertical canvas.

## Studio workflow

1. Open Tempest Broadcast and connect its Studio Integration dock.
2. Open **Dual Format** in Studio.
3. While off air, select a vertical resolution and choose **Prepare Dual Format**.
4. Complete or inspect the vertical scene composition in Broadcast. Link each production horizontal scene to its vertical partner and confirm program audio reaches both orientations.
5. Add Studio's displayed `?orientation=vertical` alert sources to the vertical scenes. These copies automatically use a portrait-safe layout and do not play audio or TTS, preventing doubled alerts; the horizontal source remains the audio-producing copy.
6. Use **Open Vertical Preview**, then verify Twitch Stream Manager and a physical phone before the show.
7. Start the stream once Studio reports every readiness check as ready.

Studio refuses configuration changes while Broadcast reports that streaming is active. Disabling Dual Format deselects the additional output but asks Broadcast to preserve the vertical canvas for later use.

## Bridge contract

Broadcast advertises these API 1.0 capabilities:

- `broadcast.status`
- `broadcast.dual-format.configure`
- `broadcast.dual-format.preview`

`broadcast.status` includes a `dualFormat` object:

```json
{
  "supported": true,
  "enabled": true,
  "enhancedBroadcastingEnabled": true,
  "additionalCanvasSelected": true,
  "canvas": {
    "id": "canvas-uuid",
    "name": "Tempest Vertical",
    "baseWidth": 1080,
    "baseHeight": 1920,
    "outputWidth": 1080,
    "outputHeight": 1920,
    "fpsNumerator": 60,
    "fpsDenominator": 1
  },
  "sceneLinksReady": true,
  "linkedScenes": 4,
  "totalScenes": 4,
  "audioReady": true,
  "browserSourcesReady": true,
  "previewAvailable": true
}
```

Studio sends `broadcast.dual-format.configure` with guarded arguments for Enhanced Broadcasting, the additional canvas, and two visual-only vertical Browser Sources. `verticalBrowserSources.chatOverlay` is deliberately `null` because Twitch supplies chat in the mobile viewer. Broadcast must apply the request atomically, preserve existing sources and scenes, and publish a fresh `broadcast.status` result. `broadcast.dual-format.preview` receives `{ "orientation": "vertical" }` and should focus or open the native Broadcast vertical preview without beginning an output.

Older Broadcast builds remain compatible with the Bridge but appear as **Update Required** on the Dual Format page. Studio never interprets an ordinary horizontal `canvasProfile` as proof that the vertical route is ready.

## Platform boundary

Dual Format controls Twitch's horizontal and vertical versions of one Twitch broadcast. The separate **Go Live** workspace coordinates that Twitch output with Kick horizontal delivery. Twitch and Kick chat remain unified in Studio, while simulcast destinations, encrypted stream keys, encoders, reconnection, and video-output health remain in Broadcast. See [TWITCH_KICK_SIMULCAST.md](TWITCH_KICK_SIMULCAST.md).

Official references:

- [Twitch Dual Format setup, requirements, and troubleshooting](https://help.twitch.tv/s/article/dual-format-vertical-video?language=en_US)
- [Twitch announcement: Dual Format and 2K streaming](https://blog.twitch.tv/en/2026/06/17/introducing-dual-format-and-2k-streaming-on-twitch/)
