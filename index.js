const express = require('express');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder
} = require('discord.js');

// ── Keepalive (Render / UptimeRobot) ──────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`✅ Keepalive draait op poort ${PORT}`));

// ── Discord Client ────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ── Config IDs ────────────────────────────────────────────────────
const PREFIX             = '!';
const ADMIN_ROLE_ID      = '1388216679066243252'; // Owner / Co-owner
const STAFF_ROLE_ID      = '1388111236511568003'; // Staff
const WACHTKAMER_VC_ID   = '1390460157108158555';
const WACHTKAMER_TEXT_ID = '1388401216005865542';
const WACHTKAMER_ROLE_ID = '1396866068064243782';
const TICKET_CATEGORY_ID = '1390451461539758090';
const STAFF_LOG_CHANNEL_ID = '1388402045328818257'; // <- nieuwe verplichte log output

// vul evt mute rol in; leeg = auto-create 'Muted'
const MUTE_ROLE_ID       = '';

// ── Globals ───────────────────────────────────────────────────────
const deleteTimers = new Map();        // channelId -> timeout ref
let deleteDelayMinutes = 60;           // standaard delay voor !deletechannel
const warns = new Map();               // userId -> [{modId, reason, ts},...]

// ── Role helpers ─────────────────────────────────────────────────
function hasAdmin(m) { return m.roles.cache.has(ADMIN_ROLE_ID); }
function hasStaff(m) { return m.roles.cache.has(STAFF_ROLE_ID); }
function isMod(m)    { return hasAdmin(m) || hasStaff(m); }

// ── Auto-delete helper (5s) ──────────────────────────────────────
// options.auto=false => NIET autodeleten (gebruikt bij staffaanvraag)
async function replyAndDelete(message, content, options = {}) {
  const auto = options.auto !== false;
  const sent = await message.reply(content);
  if (!auto) return;
  setTimeout(() => {
    message.delete().catch(() => {});
    sent.delete().catch(() => {});
  }, 5000);
}

// ── Warn store helpers ───────────────────────────────────────────
function addWarn(userId, modId, reason) {
  const arr = warns.get(userId) || [];
  arr.push({ modId, reason: reason || 'Geen reden', ts: Date.now() });
  warns.set(userId, arr);
}
function getWarns(userId) {
  return warns.get(userId) || [];
}
function clearWarns(userId) {
  warns.delete(userId);
}

// ── Mute role ensure ─────────────────────────────────────────────
async function ensureMuteRole(guild) {
  if (MUTE_ROLE_ID) {
    const r = guild.roles.cache.get(MUTE_ROLE_ID);
    if (r) return r;
  }
  let role = guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
  if (!role) {
    role = await guild.roles.create({
      name: 'Muted',
      color: 0x555555,
      reason: 'Auto-created mute role.'
    }).catch(() => null);
  }
  if (!role) return null;

  // lock perms per kanaal
  await Promise.all(
    guild.channels.cache.map(ch =>
      ch.permissionOverwrites
        .edit(role, {
          SendMessages: false,
          AddReactions: false,
          Speak: false
        })
        .catch(() => {})
    )
  );
  return role;
}

// ── Ticket Claim helpers ─────────────────────────────────────────
const CLAIM_REGEX = /\|CLAIM:(\d+):(staff|admin)\|/i;

function parseClaim(topic) {
  if (!topic) return null;
  const m = topic.match(CLAIM_REGEX);
  return m ? { userId: m[1], roleType: m[2].toLowerCase() } : null;
}

async function setClaim(channel, userId, roleType) {
  const old = channel.topic || '';
  const cleaned = old.replace(CLAIM_REGEX, '').trim();
  const newTopic = `${cleaned}${cleaned ? ' ' : ''}|CLAIM:${userId}:${roleType}|`;
  await channel.setTopic(newTopic).catch(() => {});
}

function isTicket(channel) {
  return channel.parentId === TICKET_CATEGORY_ID;
}

// Minimal opener-detect (laatste lange cijferreeks in channelnaam)
function getOpenerIdFromName(name) {
  const m = name?.match(/(\d{15,})$/);
  return m ? m[1] : null;
}

// Apply claim perms
async function applyClaimPerms(channel, claimer, roleType) {
  const g = channel.guild;
  const everyone = g.roles.everyone;
  const staffR = g.roles.cache.get(STAFF_ROLE_ID);
  const adminR = g.roles.cache.get(ADMIN_ROLE_ID);

  await channel.permissionOverwrites.edit(everyone, { ViewChannel: false, SendMessages: false }).catch(() => {});
  if (staffR) await channel.permissionOverwrites.edit(staffR, { ViewChannel: true, SendMessages: false }).catch(() => {});
  if (adminR) await channel.permissionOverwrites.edit(adminR, { ViewChannel: true, SendMessages: false }).catch(() => {});

  // opener
  const openerId = getOpenerIdFromName(channel.name);
  if (openerId && openerId !== claimer.id) {
    await channel.permissionOverwrites.edit(openerId, { ViewChannel: true, SendMessages: true }).catch(() => {});
  }

  // claimer
  await channel.permissionOverwrites.edit(claimer.id, { ViewChannel: true, SendMessages: true }).catch(() => {});

  // if staff claimed -> admin can type
  if (roleType === 'staff' && adminR) {
    await channel.permissionOverwrites.edit(adminR, { ViewChannel: true, SendMessages: true }).catch(() => {});
  }
}

// Add member to ticket
async function addMemberToTicket(channel, userId) {
  await channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true }).catch(() => {});
}

// ── Ready ────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Bot ingelogd als ${client.user.tag}`);
});

// ── Message Handler ──────────────────────────────────────────────
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args    = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const member  = message.member;

  // joincode (iedereen, auto delete)
  if (command === 'joincode') {
    return replyAndDelete(message, 'De servercode van 112RP is **wrfj91jj**');
  }

  // ── staffaanvraag (nu ALLEEN MODS) ──
  if (command === 'staffaanvraag') {
    if (!isMod(member)) {
      return replyAndDelete(message, 'Je hebt geen permissies voor dit command. (staffaanvraag)');
    }

    const target = message.mentions.members.first();
    if (!target) {
      return replyAndDelete(message, 'Gebruik: `!staffaanvraag @gebruiker RolNaam [beslissingstekst]`');
    }

    const roleName = args[1] ? args[1] : args[0];
    const beslisIndex = args.indexOf(roleName) + 1;
    const beslis = args.slice(beslisIndex).join(' ');

    // Zoek rol case-insensitive
    const rol = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!rol) return replyAndDelete(message, 'Rol niet gevonden.');

    const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

    // Default beslistekst
    const beslistekst = beslis?.length
      ? beslis
      : `✅ Goedgekeurd:\n🎉 ${target} is ${rol.name} geworden! Welkom in het team!`;

    try {
      await target.roles.add(rol);

      // Stuur log naar vaste channel (met @everyone)
      const logChannel = message.guild.channels.cache.get(STAFF_LOG_CHANNEL_ID);
      if (logChannel && logChannel.isTextBased()) {
        const logMsg =
`@everyone

📝 **Staff Aanvraag Log** 📝

📅 Datum: ${datum}
👤 Aanvrager: ${target}
🎭 Aangevraagde Rol: ${rol.name}
🛠️ Beslissing door: ${member}
📜 Status: ✅ Goedgekeurd

👉 **Tekst van Beslissing:**  
${beslistekst}
`;
        await logChannel.send(logMsg);
      }

      return replyAndDelete(message, `Rol ${rol.name} is toegevoegd aan ${target.user.tag}.`, { auto: false });
    } catch (e) {
      return replyAndDelete(message, 'Fout bij het toevoegen van de rol.');
    }
  }

  // ── wachtkamer add ──
  if (command === 'wachtkameradd') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies voor dit command.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !wachtkameradd @user');
    try {
      await target.roles.add(WACHTKAMER_ROLE_ID);
      // optioneel in VC zetten:
      const vc = message.guild.channels.cache.get(WACHTKAMER_VC_ID);
      if (vc && target.voice.channel && target.voice.channel.id !== WACHTKAMER_VC_ID) {
        await target.voice.setChannel(vc);
      }
      return replyAndDelete(message, `${target.user.tag} is toegevoegd aan de wachtkamer.`);
    } catch {
      return replyAndDelete(message, 'Kon wachtkamerrol niet toekennen.');
    }
  }

  // ── wachtkamer remove ──
  if (command === 'wachtkamerremove') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies voor dit command.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !wachtkamerremove @user');
    try {
      await target.roles.remove(WACHTKAMER_ROLE_ID);
      return replyAndDelete(message, `${target.user.tag} is verwijderd uit de wachtkamer.`);
    } catch {
      return replyAndDelete(message, 'Kon wachtkamerrol niet verwijderen.');
    }
  }

  // ── ban ──
  if (command === 'ban') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !ban @user [reden]');
    const reden = args.slice(1).join(' ') || 'Geen reden opgegeven';
    try {
      await target.ban({ reason: `Door ${member.user.tag}: ${reden}` });
      return replyAndDelete(message, `${target.user.tag} is verbannen.`);
    } catch {
      return replyAndDelete(message, 'Kon gebruiker niet verbannen.');
    }
  }

  // ── kick ──
  if (command === 'kick') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !kick @user [reden]');
    const reden = args.slice(1).join(' ') || 'Geen reden opgegeven';
    try {
      await target.kick(reden);
      return replyAndDelete(message, `${target.user.tag} is gekickt.`);
    } catch {
      return replyAndDelete(message, 'Kon gebruiker niet kicken.');
    }
  }

  // ── timeout ──
  if (command === 'timeout') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !timeout @user aantal_seconden [reden]');
    const seconden = parseInt(args[1], 10);
    if (isNaN(seconden) || seconden < 1) return replyAndDelete(message, 'Ongeldig aantal seconden.');
    const reden = args.slice(2).join(' ') || 'Geen reden opgegeven';
    try {
      await target.timeout(seconden * 1000, `Door ${member.user.tag}: ${reden}`);
      return replyAndDelete(message, `${target.user.tag} is getimeout voor ${seconden} seconden.`);
    } catch {
      return replyAndDelete(message, 'Kon timeout niet toepassen.');
    }
  }

  // ── deletechannel ──
  if (command === 'deletechannel') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const tijd = parseInt(args[0], 10);
    if (isNaN(tijd) || tijd < 1) return replyAndDelete(message, 'Geef een geldige tijd in minuten op.');
    const delayMs = tijd * 60 * 1000;

    if (deleteTimers.has(message.channel.id)) {
      clearTimeout(deleteTimers.get(message.channel.id));
      deleteTimers.delete(message.channel.id);
      replyAndDelete(message, 'Oude delete timer gecanceld.', { auto: false });
    }

    const timer = setTimeout(async () => {
      try {
        await message.channel.delete('Verwijderd na timer via command.');
      } catch {}
    }, delayMs);
    deleteTimers.set(message.channel.id, timer);
    return replyAndDelete(message, `Kanaal wordt verwijderd over ${tijd} minuten.`);
  }

  // ── stopdelete ──
  if (command === 'stopdelete') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    if (!deleteTimers.has(message.channel.id)) {
      return replyAndDelete(message, 'Er is geen delete timer actief.');
    }
    clearTimeout(deleteTimers.get(message.channel.id));
    deleteTimers.delete(message.channel.id);
    return replyAndDelete(message, 'Delete timer geannuleerd.');
  }

  // ── purge / clear ──
  if (command === 'purge' || command === 'clear') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount < 1 || amount > 100) return replyAndDelete(message, 'Geef een getal tussen 1 en 100 op.');
    try {
      const messages = await message.channel.messages.fetch({ limit: amount + 1 });
      await message.channel.bulkDelete(messages, true);
      return replyAndDelete(message, `✅ ${amount} berichten verwijderd.`);
    } catch {
      return replyAndDelete(message, 'Kon berichten niet verwijderen.');
    }
  }

  // ── warn ──
  if (command === 'warn') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !warn @user [reden]');
    const reden = args.slice(1).join(' ') || 'Geen reden opgegeven';
    addWarn(target.id, member.id, reden);
    return replyAndDelete(message, `${target.user.tag} is gewaarschuwd.`);
  }

  // ── warns ──
  if (command === 'warns') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !warns @user');
    const lijst = getWarns(target.id);
    if (lijst.length === 0) {
      return replyAndDelete(message, `${target.user.tag} heeft geen waarschuwingen.`);
    }
    let tekst = `Waarschuwingen van ${target.user.tag}:\n`;
    lijst.forEach((w, i) => {
      tekst += `${i + 1}. Door <@${w.modId}>: ${w.reason} (${new Date(w.ts).toLocaleDateString('nl-NL')})\n`;
    });
    // Let op: bij lange lijst, evt splitsen
    await message.reply(tekst);
  }

  // ── clearwarns ──
  if (command === 'clearwarns') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !clearwarns @user');
    clearWarns(target.id);
    return replyAndDelete(message, `Alle waarschuwingen van ${target.user.tag} zijn verwijderd.`);
  }

  // ── mute ──
  if (command === 'mute') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !mute @user [reden]');
    const reden = args.slice(1).join(' ') || 'Geen reden opgegeven';

    const muteRole = await ensureMuteRole(message.guild);
    if (!muteRole) return replyAndDelete(message, 'Mute rol niet gevonden of aangemaakt.');

    try {
      await target.roles.add(muteRole, `Door ${member.user.tag}: ${reden}`);
      return replyAndDelete(message, `${target.user.tag} is gemute.`);
    } catch {
      return replyAndDelete(message, 'Kon gebruiker niet muten.');
    }
  }

  // ── unmute ──
  if (command === 'unmute') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !unmute @user');
    const muteRole = await ensureMuteRole(message.guild);
    if (!muteRole) return replyAndDelete(message, 'Mute rol niet gevonden.');
    try {
      await target.roles.remove(muteRole);
      return replyAndDelete(message, `${target.user.tag} is unmuted.`);
    } catch {
      return replyAndDelete(message, 'Kon gebruiker niet unmuten.');
    }
  }

  // ── slowmode ──
  if (command === 'slowmode') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const seconds = parseInt(args[0], 10);
    if (isNaN(seconds) || seconds < 0 || seconds > 21600) return replyAndDelete(message, 'Geef een getal tussen 0 en 21600.');
    try {
      await message.channel.setRateLimitPerUser(seconds);
      return replyAndDelete(message, `Slowmode ingesteld op ${seconds} seconden.`);
    } catch {
      return replyAndDelete(message, 'Kon slowmode niet instellen.');
    }
  }

  // ── lock ──
  if (command === 'lock') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return replyAndDelete(message, 'Kanaal gelocked.');
    } catch {
      return replyAndDelete(message, 'Kon kanaal niet locken.');
    }
  }

  // ── unlock ──
  if (command === 'unlock') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    try {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
      return replyAndDelete(message, 'Kanaal unlocked.');
    } catch {
      return replyAndDelete(message, 'Kon kanaal niet unlocken.');
    }
  }

  // ── say ──
  if (command === 'say') {
    if (!isMod(member)) return replyAndDelete(message, 'Geen permissies.');
    const sayMsg = args.join(' ');
    if (!sayMsg) return replyAndDelete(message, 'Geef iets om te zeggen.');
    try {
      await message.channel.send(sayMsg);
      return message.delete();
    } catch {
      return replyAndDelete(message, 'Kon bericht niet sturen.');
    }
  }

  // ── invite ──
  if (command === 'invite') {
    return replyAndDelete(message, 'Hier is de invite link: https://discord.gg/invite-link');
  }

  // ── serverinfo ──
  if (command === 'serverinfo') {
    const guild = message.guild;
    const embed = new EmbedBuilder()
      .setTitle(`Serverinfo: ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: 'ID', value: guild.id, inline: true },
        { name: 'Leden', value: `${guild.memberCount}`, inline: true },
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true }
      )
      .setColor(0x0099ff)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }

  // ── userinfo ──
  if (command === 'userinfo') {
    const target = message.mentions.members.first() || member;
    const roles = target.roles.cache
      .filter(r => r.id !== message.guild.id)
      .map(r => r.name)
      .join(', ') || 'Geen';
    const embed = new EmbedBuilder()
      .setTitle(`Userinfo: ${target.user.tag}`)
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'ID', value: target.id, inline: true },
        { name: 'Account gemaakt', value: target.user.createdAt.toLocaleDateString('nl-NL'), inline: true },
        { name: 'Lid sinds', value: target.joinedAt.toLocaleDateString('nl-NL'), inline: true },
        { name: 'Rollen', value: roles }
      )
      .setColor(0x00ff99)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }

});

client.login(process.env.DISCORD_TOKEN);
