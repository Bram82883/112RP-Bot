// 112RP Mod & Ticket Bot – full build (v2+: staffaanvraag @rol mention + beslisser override + log kanaal + beslistekst)

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
const PREFIX               = '!';
const ADMIN_ROLE_ID        = '1388216679066243252'; // Owner / Co-owner
const STAFF_ROLE_ID        = '1388111236511568003'; // Staff
const WACHTKAMER_VC_ID     = '1390460157108158555';
const WACHTKAMER_TEXT_ID   = '1388401216005865542';
const WACHTKAMER_ROLE_ID   = '1396866068064243782';
const TICKET_CATEGORY_ID   = '1390451461539758090';
const STAFF_LOG_CHANNEL_ID = '1388402045328818257'; // <- nieuwe verplichte log output

// vul evt mute rol in; leeg = auto-create 'Muted'
const MUTE_ROLE_ID         = '';

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

  // ── staffaanvraag (MODS) ──
  // Gebruik: !staffaanvraag @gebruiker @rol [@beslisser] [beslissingstekst...]
  if (command === 'staffaanvraag') {
    if (!isMod(member)) {
      return replyAndDelete(message, 'Je hebt geen permissies voor dit command. (staffaanvraag)');
    }

    // Alle member mentions
    const memberMentions = [...message.mentions.members.values()];
    const target = memberMentions[0];              // user die rol krijgt
    const beslisserUser = memberMentions[1] || member; // optioneel override beslisser

    // Rol mention
    const rol = message.mentions.roles.first();
    if (!target || !rol) {
      return message.reply('Gebruik: `!staffaanvraag @gebruiker @rol [@beslisser] [tekst]`');
    }

    // Filter beslistekst uit args (haal mentions weg)
    const mentionPatternUser = /^<@!?(\d+)>$/;
    const mentionPatternRole = /^<@&(\d+)>$/;
    const beslisArgs = args.filter(tok => !mentionPatternUser.test(tok) && !mentionPatternRole.test(tok));
    const beslis = beslisArgs.join(' ');

    const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

    // default beslistekst
    const beslistekst = beslis?.length
      ? beslis
      : `✅ Goedgekeurd:\n🎉 ${target} is ${rol} geworden! Welkom in het team!`;

    try {
      await target.roles.add(rol);

      // stuur log naar vaste channel (met @everyone)
      const logChannel = message.guild.channels.cache.get(STAFF_LOG_CHANNEL_ID);
      if (logChannel && logChannel.isTextBased()) {
        const logMsg =
`@everyone

📝 **Staff Aanvraag Log** 📝

📅 Datum: ${datum}
👤 Aanvrager: ${target}
🎭 Aangevraagde Rol: ${rol}
🛠️ Beslissing door: ${beslisserUser}
📜 Status: ✅ Goedgekeurd

👉 **Tekst van Beslissing:**
${beslistekst}`;
        logChannel.send({
          content: logMsg,
          allowedMentions: { parse: ['everyone', 'users', 'roles'] }
        }).catch(() => {});
      }

      // ack in channel waar command werd gedaan (NIET auto delete)
      return message.reply(`${target} is succesvol toegevoegd aan de rol ${rol}.`);
    } catch (err) {
      console.error(err);
      return message.reply('Kon de rol niet toekennen.');
    }
  }

  // mod-only vanaf hier
  if (!isMod(member)) {
    return replyAndDelete(message, 'Je hebt geen permissies voor dit command.');
  }

  // ── Ban ──
  if (command === 'ban') {
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'Geen reden';
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te bannen.');
    if (!target.bannable) return replyAndDelete(message, 'Ik kan deze gebruiker niet bannen.');
    await target.ban({ reason }).catch(() => {});
    return replyAndDelete(message, `${target.user.tag} is geband. (${reason})`);
  }

  // ── Kick ──
  if (command === 'kick') {
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'Geen reden';
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te kicken.');
    if (!target.kickable) return replyAndDelete(message, 'Ik kan deze gebruiker niet kicken.');
    await target.kick(reason).catch(() => {});
    return replyAndDelete(message, `${target.user.tag} is gekickt. (${reason})`);
  }

  // ── Timeout ──
  if (command === 'timeout') {
    const target = message.mentions.members.first();
    const sec = parseInt(args[1]) || 600;
    if (!target || !target.moderatable) return replyAndDelete(message, 'Kan geen timeout zetten.');
    await target.timeout(sec * 1000).catch(() => {});
    return replyAndDelete(message, `${target.user.tag} timeout ${sec}s.`);
  }

  // ── Deletechannel (delay) ──
  if (command === 'deletechannel') {
    if (deleteTimers.has(message.channel.id)) {
      return replyAndDelete(message, 'Er staat al een delete gepland.');
    }
    const mins = deleteDelayMinutes;
    await replyAndDelete(message, `⏳ Dit kanaal wordt verwijderd over **${mins} min**. Gebruik \`!stopdelete\` om te annuleren.`);
    const timer = setTimeout(() => {
      message.channel.delete().catch(() => {});
      deleteTimers.delete(message.channel.id);
    }, mins * 60 * 1000);
    deleteTimers.set(message.channel.id, timer);
    return;
  }

  // ── Stopdelete ──
  if (command === 'stopdelete') {
    if (!deleteTimers.has(message.channel.id)) {
      return replyAndDelete(message, 'Geen delete gepland.');
    }
    clearTimeout(deleteTimers.get(message.channel.id));
    deleteTimers.delete(message.channel.id);
    return replyAndDelete(message, '❌ Kanaalverwijdering geannuleerd.');
  }

  // ── Deletedelay <min> ──
  if (command === 'deletedelay') {
    const mins = parseInt(args[0]);
    if (isNaN(mins) || mins < 1 || mins > 1440) {
      return replyAndDelete(message, 'Geef aantal minuten (1-1440).');
    }
    deleteDelayMinutes = mins;
    return replyAndDelete(message, `Delete-delay ingesteld op **${mins} min**.`);
  }

  // ── Purge / clear ──
  if (command === 'purge' || command === 'clear') {
    const count = parseInt(args[0]) || 10;
    if (count < 1 || count > 100) return replyAndDelete(message, 'Aantal 1-100.');
    const deleted = await message.channel.bulkDelete(count, true).catch(() => null);
    const amt = deleted?.size ?? 0;
    return replyAndDelete(message, `✅ ${amt} berichten verwijderd.`);
  }

  // ── Invite ──
  if (command === 'invite') {
    const link = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    return replyAndDelete(message, `Bot invite:\n${link}`);
  }

  // ── Warn ──
  if (command === 'warn') {
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'Geen reden';
    if (!target) return replyAndDelete(message, 'Gebruik: !warn @user [reden]');
    addWarn(target.id, member.id, reason);
    return replyAndDelete(message, `${target.user.tag} gewaarschuwd: ${reason}`);
  }

  // ── Warns ──
  if (command === 'warns') {
    const target = message.mentions.members.first() || member;
    const list = getWarns(target.id);
    if (list.length === 0) return replyAndDelete(message, `${target.user.tag} heeft geen warns.`);
    const lines = list
      .map((w,i) => `${i+1}. door <@${w.modId}> - ${w.reason} (${new Date(w.ts).toLocaleString('nl-NL')})`)
      .join('\n');
    return replyAndDelete(message, `Warns voor ${target}:\n${lines}`);
  }

  // ── Clearwarns ──
  if (command === 'clearwarns') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !clearwarns @user');
    clearWarns(target.id);
    return replyAndDelete(message, `Warns voor ${target.user.tag} gewist.`);
  }

  // ── Mute ──
  if (command === 'mute') {
    const target = message.mentions.members.first();
    const durSec = parseInt(args[1]) || 0; // 0 = permanent
    if (!target) return replyAndDelete(message, 'Gebruik: !mute @user [seconden]');
    let muteRole = await ensureMuteRole(message.guild);
    if (!muteRole) return replyAndDelete(message, 'Geen mute rol beschikbaar.');
    await target.roles.add(muteRole).catch(() => {});
    replyAndDelete(message, `${target.user.tag} gemuted${durSec ? ` voor ${durSec}s` : ''}.`);
    if (durSec > 0) {
      setTimeout(() => {
        target.roles.remove(muteRole).catch(() => {});
      }, durSec * 1000);
    }
    return;
  }

  // ── Unmute ──
  if (command === 'unmute') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !unmute @user');
    let muteRole = await ensureMuteRole(message.guild);
    if (!muteRole) return replyAndDelete(message, 'Geen mute rol beschikbaar.');
    await target.roles.remove(muteRole).catch(() => {});
    return replyAndDelete(message, `${target.user.tag} unmuted.`);
  }

  // ── Slowmode ──
  if (command === 'slowmode') {
    const sec = parseInt(args[0]) || 0;
    if (sec < 0 || sec > 21600) return replyAndDelete(message, 'Slowmode 0-21600s.');
    await message.channel.setRateLimitPerUser(sec).catch(() => {});
    return replyAndDelete(message, `Slowmode = ${sec}s.`);
  }

  // ── Lock / Unlock ──
  if (command === 'lock') {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {});
    return replyAndDelete(message, '🔒 Kanaal gelockt.');
  }
  if (command === 'unlock') {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {});
    return replyAndDelete(message, '🔓 Kanaal unlocked.');
  }

  // ── Say ──
  if (command === 'say') {
    const text = args.join(' ');
    if (!text) return replyAndDelete(message, 'Gebruik: !say <tekst>');
    await message.delete().catch(() => {}); // command weg
    message.channel.send(text).catch(() => {});
    return;
  }

  // ── Serverinfo ──
  if (command === 'serverinfo') {
    const g = message.guild;
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`Serverinfo: ${g.name}`)
      .addFields(
        { name: 'Leden', value: `${g.memberCount}`, inline: true },
        { name: 'Kanalen', value: `${g.channels.cache.size}`, inline: true },
        { name: 'Rollen', value: `${g.roles.cache.size}`, inline: true }
      )
      .setThumbnail(g.iconURL({ size: 128 }))
      .setTimestamp();
    const sent = await message.reply({ embeds: [embed] });
    setTimeout(() => {
      message.delete().catch(() => {});
      sent.delete().catch(() => {});
    }, 5000);
    return;
  }

  // ── Userinfo ──
  if (command === 'userinfo') {
    const target = message.mentions.members.first() || member;
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`Gebruiker: ${target.user.tag}`)
      .setThumbnail(target.user.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'ID', value: target.id, inline: true },
        { name: 'Account gemaakt', value: `<t:${Math.floor(target.user.createdTimestamp/1000)}:R>`, inline: true },
        { name: 'Server join', value: `<t:${Math.floor(target.joinedTimestamp/1000)}:R>`, inline: true },
        {
          name: 'Rollen',
          value: target.roles.cache
            .filter(r => r.id !== target.guild.id)
            .map(r => r.toString())
            .join(', ') || 'Geen',
          inline: false
        }
      );
    const sent = await message.reply({ embeds: [embed] });
    setTimeout(() => {
      message.delete().catch(() => {});
      sent.delete().catch(() => {});
    }, 5000);
    return;
  }

  // ── Wachtkamer Add ──
  if (command === 'wachtkameradd') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !wachtkameradd @user');
    try {
      await target.roles.add(WACHTKAMER_ROLE_ID).catch(() => {});
      if (target.voice.channel && target.voice.channel.id !== WACHTKAMER_VC_ID) {
        await target.voice.setChannel(WACHTKAMER_VC_ID).catch(() => {});
      }
      return replyAndDelete(message, `${target.user.tag} → wachtkamer.`);
    } catch (err) {
      console.error(err);
      return replyAndDelete(message, 'Kon niet toevoegen.');
    }
  }

  // ── Wachtkamer Remove ──
  if (command === 'wachtkamerremove') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !wachtkamerremove @user');
    try {
      await target.roles.remove(WACHTKAMER_ROLE_ID).catch(() => {});
      if (target.voice.channel && target.voice.channel.id === WACHTKAMER_VC_ID) {
        await target.voice.disconnect().catch(() => {});
      }
      return replyAndDelete(message, `${target.user.tag} uit wachtkamer.`);
    } catch (err) {
      console.error(err);
      return replyAndDelete(message, 'Kon niet verwijderen.');
    }
  }

  // ── Claim ──
  if (command === 'claim') {
    if (!isTicket(message.channel)) {
      return replyAndDelete(message, 'Gebruik dit alleen in ticket-kanalen.');
    }
    const info = parseClaim(message.channel.topic);
    if (info) return replyAndDelete(message, 'Dit ticket is al geclaimed.');
    const roleType = hasAdmin(member) ? 'admin' : 'staff';
    await setClaim(message.channel, member.id, roleType);
    await applyClaimPerms(message.channel, member, roleType);
    return replyAndDelete(message, `Ticket geclaimd door ${member} (${roleType}).`);
  }

  // ── Memberticket ──
  if (command === 'memberticket') {
    if (!isTicket(message.channel)) {
      return replyAndDelete(message, 'Alleen in tickets.');
    }
    const info = parseClaim(message.channel.topic);
    const isClaimer = info && info.userId === member.id;
    if (!(isClaimer || isMod(member))) {
      return replyAndDelete(message, 'Geen rechten om toe te voegen.');
    }
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !memberticket @user');
    await addMemberToTicket(message.channel, target.id);
    return replyAndDelete(message, `${target} toegevoegd aan ticket.`);
  }

  // ── Onbekend ──
  return replyAndDelete(message, 'Onbekend command.');
});

// ── Voice cleanup wachtkamer rol ─────────────────────────────────
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (oldState.channelId === WACHTKAMER_VC_ID && newState.channelId !== WACHTKAMER_VC_ID) {
    const m = oldState.member;
    if (m?.roles.cache.has(WACHTKAMER_ROLE_ID)) {
      await m.roles.remove(WACHTKAMER_ROLE_ID).catch(() => {});
    }
  }
});

// ── Login ────────────────────────────────────────────────────────
client.login(process.env.TOKEN);
