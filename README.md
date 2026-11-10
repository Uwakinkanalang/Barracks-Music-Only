# Barracks Music Only

A standalone Discord music bot for the Barracks community. It uses Discord.js v14, Riffy, and your existing Lavalink v4 server. It does not include the main Barracks moderation/community bot or require a database.

## Commands

- `/play query:` Play a song, URL, or playlist
- `/join` Join your voice channel
- `/queue` Show the current track and queue
- `/nowplaying` Show the current track
- `/music pause|resume|skip|stop|shuffle|loop|volume|seek|remove|move|clear|leave|247`

## Railway variables

Set these on the new Railway service:

- `DISCORD_TOKEN` — token for the Discord music bot application
- `CLIENT_ID` — Discord application ID
- `LAVALINK_HOST=lavalink.railway.internal`
- `LAVALINK_PORT=2333`
- `LAVALINK_PASSWORD` — reference the existing Lavalink service password
- `LAVALINK_SECURE=false`
- `LAVALINK_SEARCH_PLATFORM=ytmsearch`

Use Node.js 20.10 or newer. Railway will run `npm start`.

## Discord setup

Create a separate Discord application/bot, enable the Server Members Intent only if you need it (this bot does not), and invite it with the `bot` and `applications.commands` scopes. Grant View Channels, Send Messages, Embed Links, Connect, and Speak permissions. Keep the bot token private.

## Run locally

1. Copy `.env.example` to `.env` and fill in your values.
2. Run `npm install`.
3. Run `npm start`.

If `GUILD_ID` is set, slash commands register in that server for quick testing. Otherwise, they register globally.
