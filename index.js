const express = require('express');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

// ==== KEEPALIVE WEB SERVER (Render / Uptime Ping) ====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`✅ Keepalive webserver draait op poort ${PORT}`));

// ==== DISCORD CLIENT ====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ==== CONFIG ====
const PREFIX = '!';
const ADMIN_ROLE_ID = '1388216679066243252';          // Owner / Co-Owner
const STAFF_ROLE_ID = '1388111236511568003';          // Staff
const TICKET_CATEGORY_ID = '1390451461539758090';     // Ticketcategorie (alleen hier werkt !claim)
const ALGEMEEN_KANAAL_ID = '1388398258883137658';    // Algemeen kanaal waar commands mogen

// Wachtkamer setup
const WACHTKAMER_VC_ID   = '1390460157108158555';     // Voice: Wachtkamer
const WACHTKAMER_TEXT_ID = '1388401216005865542';     // Textkanaal waar je !wachtkameradd kan doen
const WACHTKAMER_ROLE_ID = '1396866068064243782';     // Rol met spreek-perms in wachtkamer


// ==== CLAIM METADATA ====
// Formaat in topic: |CLAIM:<userId>:staff| of |CLAIM:<userId>:admin|
const CLAIM_REGEX = /\|CLAIM:(\d+):(staff|admin)\|/i;
function parseClaimFromTopic(topic) {
  if (!topic) return null;
  const m = topic.match(CLAIM_REGEX);
  return m ? { userId: m[1], roleType: m[2].toLowerCase() } : null;
}
async function setClaimInTopic(channel, userId, roleType) {
  const oldTopic = channel.topic || '';
  const cleaned = oldTopic.replace(CLAIM_REGEX, '').trim();
  const nieuwTopic = `${cleaned}${cleaned.length ? ' ' : ''}|CLAIM:${userId}:${roleType}|`;
  await channel.setTopic(nieuwTopic).catch(err => {
    console.warn(`[setClaimInTopic] #${channel.name}: ${err?.message || err}`);
  });
}


// ==== ROLE / CONTEXT HELPERS ====
function isInTicketCategory(channel) {
  return channel.parentId === TICKET_CATEGORY_ID;
}
function hasAdmin(member) {
  return member.roles.cache.has(ADMIN_ROLE_ID);
}
function hasStaff(member) {
  return member.roles.cache.has(STAFF_ROLE_ID);
}

// Ticketstarter bepalen uit kanaalnaam: pak laatste lange cijferreeks (Discord user-id) aan eind
// bv: ticket-123456789012345678
function getOpenerIdFromChannelName(name) {
  if (!name) return null;
  const m = name.match(/(\d{15,})$/);
  return m ? m[1] : null;
}


// ==== PERMISSION LOGICA BIJ CLAIM ====
// @everyone: geen zicht
// Staff: zien, niet typen
// Admin: zien, niet typen (tenzij staff claimt → mag typen)
// Ticketstarter: zien + typen
// Claimer: zien + typen
async function applyClaimPermissions(channel, { claimerMember, roleType }) {
  const guild = channel.guild;
  const everyoneRole = guild.roles.everyone;
  const staffRole = guild.roles.cache.get(STAFF_ROLE_ID);
  const adminRole = guild.roles.cache.get(ADMIN_ROLE_ID);

  // @everyone -> dicht
  await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false, SendMessages: false }).catch(console.error);

  // Staff -> zien, niet typen
  if (staffRole) {
    await channel.permissionOverwrites.edit(staffRole, { ViewChannel: true, SendMessages: false }).catch(console.error);
  }

  // Admin -> zien, niet typen (openen we later als staff claimt)
  if (adminRole) {
    await channel.permissionOverwrites.edit(adminRole, { ViewChannel: true, SendMessages: false }).catch(console.error);
  }

  // Ticketstarter open (indien uit kanaalnaam te halen & niet dezelfde als claimer)
  const openerId = getOpenerIdFromChannelName(channel.name);
  if (openerId && openerId !== claimerMember.id) {
    await channel.permissionOverwrites.edit(openerId, { ViewChannel: true, SendMessages: true }).catch(console.error);
  }

  // Claimer open
  await channel.permissionOverwrites.edit(claimerMember.id, { ViewChannel: true, SendMessages: true }).catch(console.error);

  // Staff claimt -> Admin-role mag typen
  if (roleType === 'staff' && adminRole) {
    await channel.permissionOverwrites.edit(adminRole, { ViewChannel: true, SendMessages: true }).catch(console.error);
  }
}


// ==== EXTRA USER TO TICKET ====
async function addMemberToTicket(channel, memberId) {
  await channel.permissionOverwrites.edit(memberId, { ViewChannel: true, SendMessages: true }).catch(console.error);
}


// ==== REPLY + DELETE HELPER ====
async function replyAndDelete(message, text) {
  const sent = await message.reply(text);
  setTimeout(() => {
    if (!message.deleted) message.delete().catch(() => {});
    if (!sent.deleted) sent.delete().catch(() => {});
  }, 5000);
}


// ==== READY ====
client.once('ready', () => {
  console.log(`✅ Bot ingelogd als ${client.user.tag}`);
});


// ==== MESSAGE COMMAND HANDLER ====
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const member = message.member;

  // Commands mogen in ticketcategorie of in algemeen kanaal
  const canRunInChannel =
    (message.channel.parentId === TICKET_CATEGORY_ID) ||
    (message.channel.id === ALGEMEEN_KANAAL_ID);

  if (!canRunInChannel) {
    return replyAndDelete(message, 'Dit command kan hier niet worden gebruikt.');
  }

  // Publiek: iedereen mag joincode zien
  if (command === 'joincode') {
    return replyAndDelete(message, 'De servercode van 112RP is **wrfj91jj**');
  }

  // Alleen Staff + Admin mogen ALLE andere commands (incl. wachtkamer)
  const isMod = hasAdmin(member) || hasStaff(member);
  if (
    ['ban','kick','timeout','deletechannel','purge','invite','claim','memberticket','wachtkameradd','wachtkamerremove']
      .includes(command) && !isMod
  ) {
    return replyAndDelete(message, 'Je hebt geen permissies voor dit command.');
  }

  // === STAFFAANVRAAG ===
  if (command === 'staffaanvraag') {
    const aangewezenUser = message.mentions.members.first();
    const rolNaam = args[1];
    if (!aangewezenUser || !rolNaam) {
      return message.reply('Gebruik: `!staffaanvraag @gebruiker RolNaam`');
    }
    const rol = message.guild.roles.cache.find(r => r.name.toLowerCase() === rolNaam.toLowerCase());
    if (!rol) return message.reply('Rol niet gevonden.');
    const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

    try {
      await aangewezenUser.roles.add(rol);
      const logKanaal = message.guild.channels.cache.find(c => c.name === 'staff-aanvragen-log');
      if (logKanaal) {
        const bericht = `📝 **Staff Aanvraag Log** 📝\n\n📅 Datum: ${datum}\n👤 Aanvrager: ${aangewezenUser}\n🎭 Aangevraagde Rol: ${rol.name}\n🛠️ Beslissing door: ${member}\n📜 Status: ✅ Goedgekeurd\n\n✅ ${aangewezenUser} is **${rol.name}** geworden! Welkom in het team!`;
        logKanaal.send(bericht);
      }
      return message.reply(`${aangewezenUser} is succesvol toegevoegd aan de rol ${rol.name}.`);
    } catch (err) {
      console.error(err);
      return message.reply('Kon de rol niet toekennen.');
    }
  }

  // === BAN ===
  if (command === 'ban') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te bannen.');
    if (!target.bannable) return replyAndDelete(message, 'Ik kan deze gebruiker niet bannen.');
    await target.ban();
    return replyAndDelete(message, `${target.user.tag} is geband.`);
  }

  // === KICK ===
  if (command === 'kick') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te kicken.');
    if (!target.kickable) return replyAndDelete(message, 'Ik kan deze gebruiker niet kicken.');
    await target.kick();
    return replyAndDelete(message, `${target.user.tag} is gekickt.`);
  }

  // === TIMEOUT ===
  if (command === 'timeout') {
    const target = message.mentions.members.first();
    const tijd = parseInt(args[1]) || 600;
    if (!target || !target.moderatable) return replyAndDelete(message, 'Kan gebruiker geen timeout geven.');
    await target.timeout(tijd * 1000);
    return replyAndDelete(message, `${target.user.tag} heeft een timeout van ${tijd} seconden.`);
  }

  // === DELETECHANNEL ===
  if (command === 'deletechannel') {
    await message.channel.delete();
  }

  // === PURGE ===
  if (command === 'purge') {
    const aantal = parseInt(args[0]) || 10;
    if (aantal > 100) return replyAndDelete(message, 'Max 100 berichten verwijderen.');
    const messages = await message.channel.bulkDelete(aantal, true);
    return replyAndDelete(message, `✅ ${messages.size} berichten verwijderd.`);
  }

  // === INVITE ===
  if (command === 'invite') {
    return replyAndDelete(message, 'Hier is je invite link: https://discord.gg/yourserverlink');
  }

  // === CLAIM ===
  if (command === 'claim') {
    if (!isInTicketCategory(message.channel)) {
      return replyAndDelete(message, 'Dit command kan alleen in tickets worden gebruikt.');
    }
    const topic = message.channel.topic || '';
    const claimData = parseClaimFromTopic(topic);
    if (claimData) return replyAndDelete(message, 'Dit ticket is al geclaimed.');
    // Alleen staff/admin mag claimen
    if (!isMod) return replyAndDelete(message, 'Je hebt geen permissies om dit ticket te claimen.');

    const roleType = hasAdmin(member) ? 'admin' : 'staff';
    await setClaimInTopic(message.channel, member.id, roleType);
    await applyClaimPermissions(message.channel, { claimerMember: member, roleType });
    return replyAndDelete(message, `✅ Ticket geclaimed door ${member.user.tag} als ${roleType}`);
  }

  // === MEMBERTICKET ===
  if (command === 'memberticket') {
    if (!isInTicketCategory(message.channel)) {
      return replyAndDelete(message, 'Dit command kan alleen in tickets worden gebruikt.');
    }
    const mention = message.mentions.members.first();
    if (!mention) return replyAndDelete(message, 'Gebruik: !memberticket @gebruiker');
    await addMemberToTicket(message.channel, mention.id);
    return replyAndDelete(message, `${mention.user.tag} is toegevoegd aan dit ticket.`);
  }

  // === WACHTKAMERADD ===
  if (command === 'wachtkameradd') {
    if (message.channel.id !== WACHTKAMER_TEXT_ID) {
      return replyAndDelete(message, 'Dit command kan alleen in het wachtkamer-tekstkanaal worden gebruikt.');
    }
    const mention = message.mentions.members.first();
    if (!mention) return replyAndDelete(message, 'Gebruik: !wachtkameradd @gebruiker');
    try {
      await mention.roles.add(WACHTKAMER_ROLE_ID);
      // Verplaats naar wachtkamer voice channel als in andere vc
      if (mention.voice.channel && mention.voice.channel.id !== WACHTKAMER_VC_ID) {
        await mention.voice.setChannel(WACHTKAMER_VC_ID);
      }
      return replyAndDelete(message, `${mention.user.tag} is toegevoegd aan de wachtkamer.`);
    } catch (err) {
      console.error(err);
      return replyAndDelete(message, 'Er is iets misgegaan.');
    }
  }

  // === WACHTKAMERREMOVE ===
  if (command === 'wachtkamerremove') {
    if (message.channel.id !== WACHTKAMER_TEXT_ID) {
      return replyAndDelete(message, 'Dit command kan alleen in het wachtkamer-tekstkanaal worden gebruikt.');
    }
    const mention = message.mentions.members.first();
    if (!mention) return replyAndDelete(message, 'Gebruik: !wachtkamerremove @gebruiker');
    try {
      await mention.roles.remove(WACHTKAMER_ROLE_ID);
      // Verplaats uit wachtkamer vc naar geen kanaal (disconnect)
      if (mention.voice.channel && mention.voice.channel.id === WACHTKAMER_VC_ID) {
        await mention.voice.setChannel(null);
      }
      return replyAndDelete(message, `${mention.user.tag} is verwijderd uit de wachtkamer.`);
    } catch (err) {
      console.error(err);
      return replyAndDelete(message, 'Er is iets misgegaan.');
    }
  }

});

client.login(process.env.TOKEN);
