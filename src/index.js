import 'dotenv/config';
import { createRequire } from 'node:module';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  GatewayDispatchEvents,
} from 'discord.js';

const require = createRequire(import.meta.url);
const { Riffy } = require('riffy');

const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'LAVALINK_HOST', 'LAVALINK_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const commands = [
  new SlashCommandBuilder().setName('play').setDescription('Play a song, URL, or playlist')
    .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true)),
  new SlashCommandBuilder().setName('join').setDescription('Join your voice channel'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the music queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current track'),
  new SlashCommandBuilder().setName('music').setDescription('Music playback controls')
    .addSubcommand(s => s.setName('pause').setDescription('Pause playback'))
    .addSubcommand(s => s.setName('resume').setDescription('Resume playback'))
    .addSubcommand(s => s.setName('skip').setDescription('Skip the current track'))
    .addSubcommand(s => s.setName('stop').setDescription('Stop and clear the queue'))
    .addSubcommand(s => s.setName('shuffle').setDescription('Shuffle the queue'))
    .addSubcommand(s => s.setName('loop').setDescription('Set loop mode')
      .addStringOption(o => o.setName('mode').setDescription('Loop mode').setRequired(true)
        .addChoices({name:'Off',value:'none'},{name:'Track',value:'track'},{name:'Queue',value:'queue'})))
    .addSubcommand(s => s.setName('volume').setDescription('Set volume')
      .addIntegerOption(o => o.setName('percent').setDescription('0 to 100').setMinValue(0).setMaxValue(100).setRequired(true)))
    .addSubcommand(s => s.setName('seek').setDescription('Seek to a position in seconds')
      .addIntegerOption(o => o.setName('seconds').setDescription('Position in seconds').setMinValue(0).setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a queued track')
      .addIntegerOption(o => o.setName('position').setDescription('Queue position (starting at 1)').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('move').setDescription('Move a queued track')
      .addIntegerOption(o => o.setName('from').setDescription('Current queue position').setMinValue(1).setRequired(true))
      .addIntegerOption(o => o.setName('to').setDescription('New queue position').setMinValue(1).setRequired(true)))
    .addSubcommand(s => s.setName('clear').setDescription('Clear the upcoming queue'))
    .addSubcommand(s => s.setName('leave').setDescription('Leave voice and clear playback'))
    .addSubcommand(s => s.setName('247').setDescription('Toggle 24/7 voice mode')
      .addBooleanOption(o => o.setName('enabled').setDescription('Keep the bot in voice when idle').setRequired(true))),
].map(c => c.toJSON());

const guildSettings = new Map();
const settings = id => {
  if (!guildSettings.has(id)) guildSettings.set(id, { loop: 'none', volume: 80, stay: false, idleTimer: null });
  return guildSettings.get(id);
};
const getPlayer = id => client.riffy?.players?.get(id) ?? null;
const embed = (title, description) => new EmbedBuilder()
  .setColor(0x5865f2).setTitle(title).setDescription(description).setTimestamp();

function voiceCheck(interaction, player = null) {
  const voice = interaction.member?.voice?.channel;
  if (!voice) throw new Error('Join a voice channel first.');
  if (player && player.voiceChannel !== voice.id) throw new Error('You must be in my voice channel to control playback.');
  return voice;
}
function createPlayer(interaction) {
  const voice = voiceCheck(interaction);
  let player = getPlayer(interaction.guildId);
  if (player && player.voiceChannel !== voice.id) {
    player.destroy();
    player = null;
  }
  if (!player) {
    player = client.riffy.createConnection({
      guildId: interaction.guildId,
      voiceChannel: voice.id,
      textChannel: interaction.channelId,
      deaf: true,
    });
  }
  player.setVolume(settings(interaction.guildId).volume);
  return player;
}
function trackName(track) {
  return track?.info?.title || 'Unknown track';
}
function formatTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'LIVE';
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
async function reply(interaction, title, description) {
  const payload = { embeds: [embed(title, description)], flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}
function assertPlayer(interaction) {
  const player = getPlayer(interaction.guildId);
  if (!player) throw new Error('There is no active music player.');
  voiceCheck(interaction, player);
  return player;
}
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);
  await rest.put(route, { body: commands });
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.riffy.init(client.user.id);
});

client.riffy = new Riffy(client, [{
  name: process.env.LAVALINK_NAME || 'Barracks-Lavalink',
  host: process.env.LAVALINK_HOST,
  port: Number(process.env.LAVALINK_PORT || 2333),
  password: process.env.LAVALINK_PASSWORD,
  secure: String(process.env.LAVALINK_SECURE || 'false').toLowerCase() === 'true',
}], {
  send: payload => {
    const guildId = payload.d?.guild_id;
    if (!guildId) return;
    const guild = client.guilds.cache.get(guildId);
    if (guild?.shard) guild.shard.send(payload);
    else {
      const count = client.ws.shards.size || 1;
      const shardId = Number((BigInt(guildId) >> 22n) % BigInt(count));
      client.ws.shards.get(shardId)?.send(payload);
    }
  },
  defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
  restVersion: 'v4',
  bypassChecks: { nodeFetchInfo: true },
});

client.on('raw', packet => {
  if ([GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(packet.t)) {
    client.riffy.updateVoiceState(packet);
  }
});

client.riffy.on('nodeConnect', node => console.log(`Lavalink connected: ${node.name}`));
client.riffy.on('nodeError', (node, error) => console.error(`Lavalink node error (${node.name}):`, error?.message || error));
client.riffy.on('playerError', (player, error) => console.error(`Player error in ${player.guildId}:`, error));
client.riffy.on('trackStart', (player, track) => {
  const s = settings(player.guildId);
  if (s.idleTimer) clearTimeout(s.idleTimer);
  if (s.loop && player.loop !== s.loop) player.setLoop(s.loop);
  console.log(`Now playing in ${player.guildId}: ${trackName(track)}`);
});
client.riffy.on('queueEnd', player => {
  const s = settings(player.guildId);
  if (s.stay) return;
  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => {
    const current = getPlayer(player.guildId);
    if (current && !current.playing && !current.paused && !current.current) current.destroy();
  }, 30000);
});
client.riffy.on('trackError', (player, track, payload) => {
  console.error(`Track error: ${trackName(track)}`, payload?.error || payload);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;
  try {
    if (interaction.commandName === 'play') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const player = createPlayer(interaction);
      const query = interaction.options.getString('query', true);
      const result = await client.riffy.resolve({ query, requester: interaction.user });
      const { loadType, tracks, playlistInfo } = result;
      if (!tracks?.length || !['playlist','search','track','PLAYLIST_LOADED','SEARCH_RESULT','TRACK_LOADED'].includes(loadType)) {
        throw new Error('No playable results found. Try another search or URL.');
      }
      for (const track of tracks) {
        track.info.requester = interaction.user;
        player.queue.add(track);
      }
      const count = tracks.length;
      if (!player.playing && !player.paused) await player.play();
      const desc = loadType === 'playlist' || loadType === 'PLAYLIST_LOADED'
        ? `Added **${count}** tracks from **${playlistInfo?.name || 'playlist'}**.`
        : `Added **${trackName(tracks[0])}** to the player.`;
      await reply(interaction, 'Added to the music queue', desc);
      return;
    }
    if (interaction.commandName === 'join') {
      const voice = voiceCheck(interaction);
      createPlayer(interaction);
      await reply(interaction, 'Joined voice', `Connected to **${voice.name}**.`);
      return;
    }
    if (interaction.commandName === 'queue') {
      const player = assertPlayer(interaction);
      const list = [...(player.queue || [])].slice(0, 10);
      const current = player.current ? `**Now playing:** ${trackName(player.current)}` : '**Nothing is playing right now.**';
      const upcoming = list.length ? list.map((t, i) => `${i + 1}. ${trackName(t)}`).join('\n') : 'The queue is empty.';
      await reply(interaction, 'Music queue', `${current}\n\n**Up next:**\n${upcoming}`);
      return;
    }
    if (interaction.commandName === 'nowplaying') {
      const player = assertPlayer(interaction);
      if (!player.current) throw new Error('Nothing is playing right now.');
      await reply(interaction, 'Now playing', `**${trackName(player.current)}**\n${player.current.info?.author || 'Unknown artist'}\nDuration: ${formatTime(player.current.info?.length)}`);
      return;
    }
    if (interaction.commandName === 'music') {
      const sub = interaction.options.getSubcommand();
      const player = assertPlayer(interaction);
      const s = settings(interaction.guildId);
      switch (sub) {
        case 'pause':
          if (!player.current) throw new Error('Nothing is playing.');
          player.pause(true); await reply(interaction, 'Paused', 'Playback paused.'); break;
        case 'resume':
          if (!player.current) throw new Error('Nothing is playing.');
          player.pause(false); await reply(interaction, 'Resumed', 'Playback resumed.'); break;
        case 'skip': {
          if (!player.current) throw new Error('Nothing is playing.');
          const title = trackName(player.current);
          if (player.loop === 'track') player.setLoop('none');
          player.stop(); await reply(interaction, 'Skipped', `Skipped **${title}**.`); break;
        }
        case 'stop':
          player.queue.clear(); player.stop(); player.destroy();
          await reply(interaction, 'Stopped', 'Playback stopped and the queue was cleared.'); break;
        case 'shuffle':
          if (!player.queue.length) throw new Error('The queue is empty.');
          player.queue.shuffle(); await reply(interaction, 'Shuffled', 'The queue has been shuffled.'); break;
        case 'loop': {
          const mode = interaction.options.getString('mode', true);
          s.loop = mode; player.setLoop(mode);
          await reply(interaction, 'Loop updated', `Loop mode: **${mode}**.`); break;
        }
        case 'volume': {
          const volume = interaction.options.getInteger('percent', true);
          s.volume = volume; player.setVolume(volume);
          await reply(interaction, 'Volume updated', `Volume set to **${volume}%**.`); break;
        }
        case 'seek': {
          if (!player.current) throw new Error('Nothing is playing.');
          const seconds = interaction.options.getInteger('seconds', true);
          player.seek(seconds * 1000);
          await reply(interaction, 'Seeked', `Moved to **${formatTime(seconds * 1000)}**.`); break;
        }
        case 'remove': {
          const position = interaction.options.getInteger('position', true) - 1;
          if (position < 0 || position >= player.queue.length) throw new Error('That queue position does not exist.');
          const removed = player.queue[position]; player.queue.remove(position);
          await reply(interaction, 'Removed', `Removed **${trackName(removed)}**.`); break;
        }
        case 'move': {
          const from = interaction.options.getInteger('from', true) - 1;
          const to = interaction.options.getInteger('to', true) - 1;
          if (from < 0 || from >= player.queue.length || to < 0 || to >= player.queue.length) throw new Error('Invalid queue positions.');
          const item = player.queue[from]; player.queue.remove(from); player.queue.splice(to, 0, item);
          await reply(interaction, 'Moved', `Moved **${trackName(item)}** to position **${to + 1}**.`); break;
        }
        case 'clear':
          player.queue.clear(); await reply(interaction, 'Queue cleared', 'All upcoming tracks were removed.'); break;
        case 'leave':
          player.queue.clear(); player.stop(); player.destroy();
          await reply(interaction, 'Disconnected', 'Left the voice channel and cleared the queue.'); break;
        case '247':
          s.stay = interaction.options.getBoolean('enabled', true);
          await reply(interaction, '24/7 mode updated', `24/7 mode is now **${s.stay ? 'on' : 'off'}**.`); break;
      }
    }
  } catch (error) {
    console.error('Command error:', error);
    const message = error?.message || 'Something went wrong while handling that command.';
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, embeds: [] });
      else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    } catch {}
  }
});

async function main() {
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
}
main().catch(error => {
  console.error('Startup failed:', error);
  process.exit(1);
});

process.on('SIGTERM', () => {
  for (const player of client.riffy?.players?.values?.() || []) {
    try { player.destroy(); } catch {}
  }
  client.destroy();
  process.exit(0);
});
