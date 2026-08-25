# Twitch Extension release images

Upload these files in **Version Details → Image Assets**:

| Twitch field | File | Required size |
| --- | --- | --- |
| Logo Image | `logo-100x100.png` | 100×100 PNG |
| Taskbar Icon Image | `taskbar-icon-24x24.png` | 24×24 PNG |
| Discovery Image | `discovery-300x200.png` | 300×200 opaque PNG |
| Screenshot Image | `screenshot-panel-1024x768.png` | 1024×768 PNG, 4:3, under 10 MB |

`manifest.json` records the validated dimensions, format, color mode, and file size. The `source` folder contains the generated gravitational artwork and the authentic 318×496 local panel capture used to build the final upload images.

Regenerate the final files with:

```powershell
python apps/twitch-extension/tools/build-release-assets.py
```
