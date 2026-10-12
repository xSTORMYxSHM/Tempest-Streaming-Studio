# Tempest Streaming Studio 1.7.3 release notes

Tempest Streaming Studio 1.7.3 improves canvas layout control and fixes viewer-avatar floor state.

## Viewer avatars

- Turning off the avatar floor now remains authoritative during Interactive World startup and when viewers join later.
- Existing avatar, world, and Stage Actor settings remain compatible.

## Discord Guests canvas

- Added bottom-left, bottom-right, top-center, left/right stack, responsive grid, canvas perimeter, and lower-arc automatic arrangements.
- Manual placement now provides selectable guests, 1%, 5%, and 10% snapping, center and safe-edge alignment, exact X/Y readouts, and arrow-key nudging.
- Arrow keys move 1%; holding Shift moves 5%.
- Studio's preview and the live Discord Browser Source share the same automatic-layout behavior.

## Interactive Stage canvas

- Added configurable drag snapping, magnetic center and safe-edge guides, alignment buttons, exact position readouts, and automatic saving.
- Arrow keys move the selected object by 1%; holding Shift moves it by 5%.
- Horizontal and portrait layouts retain independent normalized placements.

## Compatibility

- The Studio/Broadcast wire protocol remains `1.0` and remains compatible with Tempest Broadcast 1.5.0.
- Tempest Mainframe remains version `0.2.0`; Tempest Streaming remains version `0.1.0`.
- No Railway deployment or Twitch-hosted Extension update is required for this desktop release.
- Paid Extension/Bits controls remain unavailable in the active product UI.
