# Tempest Streaming Studio 1.8.0 release notes

Tempest Streaming Studio 1.8.0 focuses the operator experience around the tools used during a real stream, adds secure hosted Discord companion pairing, and retires the heavier Streamworld and Kick integrations from Studio.

## Clearer operator workspace

- Replaced the multi-level workspace navigation with one persistent sidebar organized into **On Air**, **Create**, collapsed **Setup + Connections**, and **System** destinations.
- Made Live Chat, Polls, Stream Together, 3D Dice, and Go Live direct On Air destinations.
- Kept sensitive setup controls behind the collapsed setup drawer while preserving the global private-information guard.
- Removed duplicate nested tab rows and corrected the production-health layout for Twitch-only monitoring.

## Hosted Discord companion

- Added Tempest Signal pairing for the hosted Discord companion using a short-lived setup code.
- Stores the issued tenant credential through Windows encryption and supports a distinct Studio alias when several people share one Discord server.
- Shows pairing, connection, server, session, and participant status inside Discord Guests.
- Keeps the local Discord RPC path available while making the hosted bot the simple multi-user option.

## Focused interaction platform

- Removed viewer sprite avatars, avatar packs and closets, the stream pet, duels, world physics, gaze controls, and Stage Actor development assets.
- Retained the bounded Interactive Stage for text, images, effects, meters, polls, alerts, emotes, and 3D Dice.
- Retained Discord Guests and optional VTube Studio, Warudo, Tempest2D, and Stormframe connections.
- Existing retired-feature data remains on disk so an upgrade does not destroy prior user files.

## Twitch-only Studio services

- Removed Kick account setup, OAuth storage, chat routing, hosted relay linkage, poll and automatic-message destinations, and Kick-specific output controls from Studio.
- Live Chat, polls, automation, extensions, and production supervision now focus on Twitch and Stream Together.
- Tempest Broadcast remains authoritative for encoders, canvases, destinations, final audio, and recording.

## Compatibility

- The Studio/Broadcast wire protocol remains `1.0` and remains compatible with Tempest Broadcast 1.5.0.
- Tempest Mainframe remains `0.2.1` and Tempest Streaming remains `0.1.1`; this Studio release does not publish new Twitch Extension versions.
- Existing Twitch credentials, alerts, managed media, commands, counters, dice configuration, Discord guest profiles, and companion pairings remain compatible.
