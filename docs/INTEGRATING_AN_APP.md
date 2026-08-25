# Integrating a Tempest Application

1. Add a `tempest.app.json` file using the application schema.
2. Give the application a stable reverse-domain ID.
3. Declare only capabilities the application currently implements.
4. Declare asset types separately from runtime capabilities.
5. Register the manifest in Studio.
6. Connect to the Bridge, send `hello`, and subscribe to required topics.
7. Report health and capability changes instead of assuming another application is installed.
8. Handle targeted `command` envelopes whose topic matches a provided capability.
9. Treat workflow `activate` and `release` phases as idempotent operations and restore local state on release.

Applications must continue functioning when the Bridge is unavailable. Cross-application features should enter a visible disconnected state, retry with backoff, and never block core local work.

For temporary effects, save or stack the application's prior local state when activation begins and associate it with the workflow run ID. A matching release restores that state. Applications should also apply their own conservative expiry timer from the supplied lease so a Bridge crash cannot leave an effect permanently active.

The import-ready examples describe Quartic Pulse, Data Horizon, Tempest Broadcast, and the Warudo adapter. Development applications intentionally omit launch descriptors until they produce a stable executable or adapter entry point.
