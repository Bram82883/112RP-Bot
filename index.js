// ===================== 112RP Modbot - Full Commands =====================
// Prefix: !
// Houdt bot wakker via kleine webserver (Render/UptimeRobot friendly)

const express = require('express');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  PermissionFlagsBits
} = require('discord.js');

// ---- Keepalive ----
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`✅ Keepalive draait op poort ${PORT}`));

// ---- Client ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ---- CONFIG ----
const PREFIX                = '!';
const TOKEN                 = process.env.TOKEN || 'VUL_HIER_TOKEN_IN'; // zet hier evt je token
const ADMIN_ROLE_ID         = '1388216679066243252'; // Owner / Co-owner
const STAFF_ROLE_ID         = '1388111236511568003'; // Staff
const BURGER_ROLE_ID        = '1390446268328972460'; // Burger / standaard leden
const WACHTKAMER_VC_ID      = '1390460157108158555';
const WACHTKAMER_ROLE_ID    = '1396866068064243782';
const MEDEDELINGEN_ID       = '1388069527857659985'; // mededelingen
const STAFF_LOG_CHANNEL_ID  = '1388402045328818257'; // staffaanvraag log
const TICKET_CATEGORY_ID    = '1390451461539758090'; // ticket category (claim/memberticket check)

// ---- MINI HELPERS ----
const nlTime = () => new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

function hasAdmin(m) { return m.roles.cache.has(ADMIN_ROLE_ID); }
function hasStaff(m) { return m.roles.cache.has(STAFF_ROLE_ID); }
function isMod(m)    { return hasAdmin(m) || hasStaff(m); }

async function replyAndDelete(msg, content, ms = 5000) {
  const sent = await msg.reply(content);
  setTimeout(() => {
    msg.delete().catch(() => {});
    sent.delete().catch(() => {});
  }, ms);
}

// ---- Warns (in-memory) ----
const warns = new Map(); // userId -> [{reason, ts, modId}]
function addWarn(uid, modId, reason) {
  const arr = warns.get(uid) || [];
  arr.push({ reason, ts: Date.now(), modId });
  warns.set(uid, arr);
}
function getWarns(uid) { return warns.get(uid) || []; }
function clearWarns(uid) { warns.delete(uid); }

// ---- Mute Role helper ----
async function ensureMuteRole(guild) {
  let muteRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
  if (!muteRole) {
    muteRole = await guild.roles.create({
      name: 'Muted',
      color: 0x555555,
      reason: 'Auto aangemaakt voor !mute'
    }).catch(() => null);
  }
  if (!muteRole) return null;
  // Deny in alle kanalen
  await Promise.all(
    guild.channels.cache.map(ch =>
      ch.permissionOverwrites.edit(muteRole, {
        SendMessages: false,
        AddReactions: false,
        Speak: false
      }).catch(() => {})
    )
  );
  return muteRole;
}

// ---- Ticket helpers ----
const CLAIM_RE = /\|CLAIM:(\d+):(staff|admin)\|/i;
function parseClaim(topic) {
  if (!topic) return null;
  const m = topic.match(CLAIM_RE);
  return m ? { userId: m[1], roleType: m[2].toLowerCase() } : null;
}
async function setClaim(channel, userId, roleType) {
  const old = channel.topic || '';
  const cleaned = old.replace(CLAIM_RE, '').trim();
  const nt = `${cleaned}${cleaned ? ' ' : ''}|CLAIM:${userId}:${roleType}|`;
  await channel.setTopic(nt).catch(() => {});
}
function isTicketChannel(ch) {
  return ch.parentId === TICKET_CATEGORY_ID;
}
async function addMemberToTicket(ch, uid) {
  await ch.permissionOverwrites.edit(uid, { ViewChannel: true, SendMessages: true }).catch(() => {});
}

// ---- Deletechannel planner ----
const deleteTimers = new Map(); // channelId -> timeout
let deleteDelayMinutesDefault = 60;

// ---- Ready ----
client.once('ready', () => {
  console.log(`✅ Bot ingelogd als ${client.user.tag}`);
});

// ---- Voice cleanup wachtkamer rol ----
client.on('voiceStateUpdate', async (oldState, newState) => {
  // als ze WACHTKAMER verlaten → rol weghalen
  if (oldState.channelId === WACHTKAMER_VC_ID && newState.channelId !== WACHTKAMER_VC_ID) {
    const m = oldState.member;
    if (m?.roles.cache.has(WACHTKAMER_ROLE_ID)) {
      m.roles.remove(WACHTKAMER_ROLE_ID).catch(() => {});
    }
  }
});

// ---- Message Commands ----
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args    = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const member  = message.member;
  const guild   = message.guild;

  // ------------------ PUBLIEK ------------------
  if (command === 'joincode') {
    return replyAndDelete(message, 'De servercode van 112RP is **wrfj91jj**');
  }

  // ------------------ STAFFAANVRAAG (log, geen auto-delete) ------------------
  if (command === 'staffaanvraag') {
    if (!isMod(member)) return replyAndDelete(message, 'Je hebt geen permissies voor dit command.');
    const target = message.mentions.members.first();
    const roleName = args[1];
    if (!target || !roleName) {
      return message.reply('Gebruik: `!staffaanvraag @gebruiker RolNaam`');
    }
    const rol = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!rol) return message.reply('Rol niet gevonden.');

    const datum = nlTime();
    const embed = new EmbedBuilder()
      .setTitle('📝 Staff Aanvraag Log 📝')
      .setDescription(
        `**📅 Datum:** ${datum}\n` +
        `**👤 Aanvrager:** ${target}\n` +
        `**🎭 Rol:** ${rol.name}\n` +
        `**🛠️ Beslissing door:** ${member}\n\n` +
        `**📜 Status:** ✅ Goedgekeurd\n\n` +
        `**🎉 ${target} is ${rol.name} geworden! Welkom in het team!**`
      )
      .setColor(0x00ff00)
      .setThumbnail(target.user.displayAvatarURL());

    try {
      await target.roles.add(rol);
      const logCh = guild.channels.cache.get(STAFF_LOG_CHANNEL_ID);
      if (logCh) {
        logCh.send({ content: '@everyone', embeds: [embed] }).catch(() => {});
      }
      return message.reply(`${target} is succesvol toegevoegd aan de rol ${rol.name}.`);
    } catch (err) {
      console.error(err);
      return message.reply('Kon de rol niet toekennen.');
    }
  }

  // ------------------ PERMISSIECHECK MOD ------------------
  // ALLES hieronder: alleen staff/admin
  if (!isMod(member)) {
    return replyAndDelete(message, 'Je hebt geen permissies voor dit command.');
  }

  // ================== MODERATIE ==================
  if (command === 'ban') {
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'Geen reden';
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te bannen.');
    if (!target.bannable) return replyAndDelete(message, 'Ik kan deze gebruiker niet bannen.');
    await target.ban({ reason }).catch(() => {});
    return replyAndDelete(message, `${target.user.tag} is geband. (${reason})`);
  }

  if (command === 'kick') {
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'Geen reden';
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te kicken.');
    if (!target.kickable) return replyAndDelete(message, 'Ik kan deze gebruiker niet kicken.');
    await target.kick(reason).catch(() => {});
    return replyAndDelete(message, `${target.user.tag} is gekickt. (${reason})`);
  }

  if (command === 'timeout') {
    const target = message.mentions.members.first();
    const sec = parseInt(args[1]) || 600;
    if (!target || !target.moderatable) return replyAndDelete(message, 'Kan gebruiker geen timeout geven.');
    await target.timeout(sec * 1000).catch(() => {});
    return replyAndDelete(message, `${target.user.tag} heeft een timeout van ${sec} sec.`);
  }

  if (command === 'mute') {
    const target = message.mentions.members.first();
    const sec = parseInt(args[1]) || 0; // 0 = permanent
    if (!target) return replyAndDelete(message, 'Gebruik: !mute @user [seconden]');
    const muteRole = await ensureMuteRole(guild);
    if (!muteRole) return replyAndDelete(message, 'Mute rol kon niet worden gemaakt.');
    await target.roles.add(muteRole).catch(() => {});
    replyAndDelete(message, `${target.user.tag} gemuted${sec ? ` voor ${sec}s` : ''}.`);
    if (sec > 0) {
      setTimeout(() => target.roles.remove(muteRole).catch(() => {}), sec * 1000);
    }
    return;
  }

  if (command === 'unmute') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !unmute @user');
    const muteRole = await ensureMuteRole(guild);
    if (!muteRole) return replyAndDelete(message, 'Mute rol niet gevonden.');
    await target.roles.remove(muteRole).catch(() => {});
    return replyAndDelete(message, `${target.user.tag} unmuted.`);
  }

  if (command === 'warn') {
    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'Geen reden';
    if (!target) return replyAndDelete(message, 'Gebruik: !warn @user [reden]');
    addWarn(target.id, member.id, reason);
    return replyAndDelete(message, `${target.user.tag} gewaarschuwd: ${reason}`);
  }

  if (command === 'warns') {
    const target = message.mentions.members.first() || member;
    const list = getWarns(target.id);
    if (!list.length) return replyAndDelete(message, `${target.user.tag} heeft geen warns.`);
    const lines = list.map((w,i)=>`${i+1}. ${w.reason} (door <@${w.modId}>)`).join('\n');
    // Niet autodelete? Kort lijstje; laten staan? Laten staan 5s anders spam? Ik doe auto-delete.
    return replyAndDelete(message, `Warns voor ${target}:\n${lines}`);
  }

  if (command === 'clearwarns') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !clearwarns @user');
    clearWarns(target.id);
    return replyAndDelete(message, `Warns voor ${target.user.tag} gewist.`);
  }

  // ================== KANAALBEHEER ==================
  if (command === 'purge' || command === 'clear') {
    const count = parseInt(args[0]) || 10;
    if (count < 1 || count > 100) return replyAndDelete(message, 'Aantal 1-100.');
    const deleted = await message.channel.bulkDelete(count, true).catch(() => null);
    const size = deleted?.size ?? 0;
    return replyAndDelete(message, `✅ ${size} berichten verwijderd.`);
  }

  if (command === 'deletechannel') {
    // schedule delete (default 60 min, of param)
    const mins = parseInt(args[0]) || deleteDelayMinutesDefault;
    if (deleteTimers.has(message.channel.id)) {
      return replyAndDelete(message, 'Er staat al een delete gepland. Gebruik !stopdelete.');
    }
    replyAndDelete(message, `⏳ Kanaal wordt verwijderd over ${mins} min.`);
    const t = setTimeout(() => {
      message.channel.delete().catch(() => {});
      deleteTimers.delete(message.channel.id);
    }, mins * 60 * 1000);
    deleteTimers.set(message.channel.id, t);
    return;
  }

  if (command === 'deletedelay') {
    const mins = parseInt(args[0]);
    if (isNaN(mins) || mins < 1 || mins > 1440) {
      return replyAndDelete(message, 'Geef aantal minuten (1-1440).');
    }
    deleteDelayMinutesDefault = mins;
    return replyAndDelete(message, `Standaard delete-delay = ${mins} min.`);
  }

  if (command === 'stopdelete') {
    if (!deleteTimers.has(message.channel.id)) {
      return replyAndDelete(message, 'Geen delete gepland.');
    }
    clearTimeout(deleteTimers.get(message.channel.id));
    deleteTimers.delete(message.channel.id);
    return replyAndDelete(message, '❌ Kanaalverwijdering geannuleerd.');
  }

  if (command === 'slowmode') {
    const sec = parseInt(args[0]) || 0;
    if (sec < 0 || sec > 21600) return replyAndDelete(message, 'Slowmode 0-21600s.');
    await message.channel.setRateLimitPerUser(sec).catch(() => {});
    return replyAndDelete(message, `Slowmode = ${sec}s.`);
  }

  if (command === 'lock') {
    await message.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
    return replyAndDelete(message, '🔒 Kanaal gelockt.');
  }

  if (command === 'unlock') {
    await message.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {});
    return replyAndDelete(message, '🔓 Kanaal unlocked.');
  }

  // ================== WACHTKAMER ==================
  if (command === 'wachtkameradd') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !wachtkameradd @user');
    await target.roles.add(WACHTKAMER_ROLE_ID).catch(() => {});
    if (target.voice.channelId !== WACHTKAMER_VC_ID) {
      await target.voice.setChannel(WACHTKAMER_VC_ID).catch(() => {});
    }
    return replyAndDelete(message, `${target.user.tag} → wachtkamer.`);
  }

  if (command === 'wachtkamerremove') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Gebruik: !wachtkamerremove @user');
    await target.roles.remove(WACHTKAMER_ROLE_ID).catch(() => {});
    if (target.voice.channelId === WACHTKAMER_VC_ID) {
      await target.voice.disconnect().catch(() => {});
    }
    return replyAndDelete(message, `${target.user.tag} uit wachtkamer.`);
  }

  // ================== TICKETS ==================
  if (command === 'claim') {
    if (!isTicketChannel(message.channel)) {
      return replyAndDelete(message, 'Gebruik dit in een ticket-kanaal.');
    }
    const info = parseClaim(message.channel.topic);
    if (info) return replyAndDelete(message, 'Dit ticket is al geclaimd.');
    const roleType = hasAdmin(member) ? 'admin' : 'staff';
    await setClaim(message.channel, member.id, roleType);
    // basis: claimer en ticketstarter mogen typen, rest niet (behalve admin indien staff claimt)
    const everyone = guild.roles.everyone;
    const staffR = guild.roles.cache.get(STAFF_ROLE_ID);
    const adminR = guild.roles.cache.get(ADMIN_ROLE_ID);
    await message.channel.permissionOverwrites.edit(everyone, { ViewChannel: false, SendMessages: false }).catch(() => {});
    if (staffR) await message.channel.permissionOverwrites.edit(staffR, { ViewChannel: true, SendMessages: false }).catch(() => {});
    if (adminR) await message.channel.permissionOverwrites.edit(adminR, { ViewChannel: true, SendMessages: roleType === 'staff' }).catch(() => {});
    await message.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
    return replyAndDelete(message, `Ticket geclaimd door ${member} (${roleType}).`);
  }

  if (command === 'memberticket') {
    if (!isTicketChannel(message.channel)) {
      return replyAndDelete(message, 'Alleen in ticket-kanalen.');
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

  // ================== INFO & UTILITY ==================
  if (command === 'serverinfo') {
    const embed = new EmbedBuilder()
      .setTitle('ℹ️ Serverinfo')
      .addFields(
        { name: 'Naam', value: guild.name, inline: true },
        { name: 'Leden', value: `${guild.memberCount}`, inline: true },
        { name: 'Kanalen', value: `${guild.channels.cache.size}`, inline: true }
      )
      .setThumbnail(guild.iconURL())
      .setColor(0x5865f2);
    // Info mag blijven staan; geen auto-delete
    return message.reply({ embeds: [embed] });
  }

  if (command === 'userinfo') {
    const target = message.mentions.members.first() || member;
    const embed = new EmbedBuilder()
      .setTitle(`👤 Userinfo: ${target.user.tag}`)
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'ID', value: target.id, inline: true },
        { name: 'Account', value: `<t:${Math.floor(target.user.createdTimestamp/1000)}:F>`, inline: true },
        { name: 'Joined', value: `<t:${Math.floor(target.joinedTimestamp/1000)}:F>`, inline: true }
      )
      .setColor(0x5865f2);
    // userinfo blijft staan
    return message.reply({ embeds: [embed] });
  }

  if (command === 'invite') {
    const link = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    return replyAndDelete(message, `Bot invite:\n${link}`);
  }

  if (command === 'say') {
    const text = args.join(' ');
    if (!text) return replyAndDelete(message, 'Gebruik: !say <tekst>');
    await message.delete().catch(() => {});
    message.channel.send(text).catch(() => {});
    return;
  }

  // Unknown
  return replyAndDelete(message, 'Onbekend command.');
});

// ---- Login ----
client.login(TOKEN);
