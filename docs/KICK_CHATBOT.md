# Kick Chat Integration

Tempest Streaming Studio can run one command directory and one live monitor across Twitch and Kick. Twitch continues to use EventSub WebSockets. Kick uses the official OAuth 2.1 API and `chat.message.sent` webhooks.

## Production setup

1. Pair **Hosted Extension** in Studio's Twitch Gateway. The outbound relay is reused for signed Kick webhook delivery, so Studio never needs a public inbound port.
2. Create an application in Kick's developer settings with 2FA enabled.
3. In **Chatbot → Kick Chat Connection**, copy the displayed OAuth Redirect URL and Signed Webhook URL into the Kick application exactly.
4. Paste the application's Client ID and Client Secret into Studio and select **Save Kick App**. The secret is stored only in the Windows-encrypted credential file.
5. Select **Connect Kick** and approve `user:read`, `chat:write`, and `events:subscribe` in the browser.
6. After authorization, select **Validate + Subscribe**. Studio validates the account, creates the official `chat.message.sent` subscription if needed, and links the verified Kick identity to the hosted relay.

The OAuth callback is loopback-only. The hosted service validates the Kick access token only while linking the installation and does not store it. Incoming webhooks must carry a current timestamp and a valid RSA-SHA256 signature from Kick. The service routes the event to the installation linked to the webhook's broadcaster ID and waits for Studio to acknowledge it.

## Chat behavior

- The Collaboration Center labels every message as Twitch or Kick.
- Operator messages use the selected platform.
- Command replies return only to the platform that delivered the command.
- Cooldowns remain shared across the running chatbot, preventing dual-stream viewers from multiplying command throughput.
- Twitch Shared Chat policy applies only to Twitch. Kick roles are derived from the official webhook badges.
- Twitch-specific metadata commands (`!uptime`, `!title`, `!game`, and `!schedule`) are omitted from Kick's `!commands` result until native Kick metadata responses are enabled. Custom replies, local weather, now-playing, and Studio workflows work on both platforms.
- The live feed remains memory-only and is cleared when Studio closes.

Disconnecting Kick revokes the access token, removes the encrypted Kick credential file, and unlinks the hosted relay. Twitch authorization and Twitch chat remain active.
