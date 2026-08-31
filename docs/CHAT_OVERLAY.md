# Studio Chat Overlay

Tempest Streaming Studio can replace a hosted chat widget with a loopback-only Browser Source. Add `http://127.0.0.1:4765/chat-overlay` to OBS or compatible broadcast software using the configured base-canvas size, and keep that source in every scene where chat should appear.

The overlay consumes Studio's normalized `viewer.chat.message` events. Live messages arrive through the configured secondary Chatbot account's Twitch EventSub connection, so the Chatbot page must show EventSub and Chat as connected. Messages are inserted with DOM text nodes rather than interpreted as HTML, and the rendering endpoint cannot access Studio's authenticated control API.

The Chat Overlay tab controls:

- bottom-left or bottom-right alignment;
- one to twenty visible messages;
- a five-to-120-second message lifetime;
- role chips for broadcaster, moderator, subscriber, and VIP identities;
- accent color and message-card opacity;
- preview and immediate clear actions;
- Browser Source connection and local-buffer monitoring.

Settings persist in Studio's Bridge data directory. Chat messages remain an in-memory display buffer and are discarded as their display leases expire or when Studio closes.

The Chat Overlay Browser Source URL is concealed on the Chat Overlay page and in Guided Setup while Privacy Shield is active. Its copy button remains available so the source can be configured without displaying the address on stream.
