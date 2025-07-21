// 112RP Ticketbot (prefix commands, Render-ready keepalive)

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

  // Publiek: iedereen mag joincode zien
  if (command === 'joincode') {
    return message.reply('De servercode van 112RP is **wrfj91jj**');
  }

  // Alleen Staff + Admin mogen ALLE andere commands (incl. wachtkamer)
  const isMod = hasAdmin(member) || hasStaff(member);
  if (
    ['staffaanvraag','ban','kick','timeout','deletechannel','purge','invite','claim','memberticket','wachtkameradd']
      .includes(command) && !isMod
  ) {
    return message.reply('Je hebt geen permissies voor dit command.');
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
    if (!target) return message.reply('Geef een gebruiker om te bannen.');
    if (!target.bannable) return message.reply('Ik kan deze gebruiker niet bannen.');
    await target.ban();
    return message.reply(`${target.user.tag} is geband.`);
  }

  // === KICK ===
  if (command === 'kick') {
    const target = message.mentions.members.first();
    if (!target) return message.reply('Geef een gebruiker om te kicken.');
    if (!target.kickable) return message.reply('Ik kan deze gebruiker niet kicken.');
    await target.kick();
    return message.reply(`${target.user.tag} is gekickt.`);
  }

  // === TIMEOUT ===
  if (command === 'timeout') {
    const target = message.mentions.members.first();
    const tijd = parseInt(args[1]) || 600;
    if (!target || !target.moderatable) return message.reply('Kan gebruiker geen timeout geven.');
    await target.timeout(tijd * 1000);
    return message.reply(`${target.user.tag} heeft een timeout van ${tijd} seconden.`);
  }

  // === DELETECHANNEL ===
  if (command === 'deletechannel') {
    const kanaal = message.mentions.channels.first() || message.channel;
    message.reply(`Kanaal ${kanaal.name} wordt verwijderd over 60 minuten.`);
    setTimeout(() => {
      kanaal.delete().catch(console.error);
    }, 60 * 60 * 1000);
    return;
  }

  // === PURGE ===
  if (command === 'purge') {
    const user = message.mentions.users.first();
    const channel = message.channel;
    if (!channel.permissionsFor(member).has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply('Geen permissie om berichten te verwijderen.');
    }
    let fetched;
    do {
      fetched = await channel.messages.fetch({ limit: 100 });
      const messagesToDelete = fetched.filter(m => (user ? m.author.id === user.id : true));
      if (messagesToDelete.size > 0) {
        await channel.bulkDelete(messagesToDelete, true);
      }
    } while (fetched.size >= 2);
    return message.reply('Berichten verwijderd.');
  }

  // === INVITE ===
  if (command === 'invite') {
    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    return message.reply(`Voeg de bot toe met deze link:\n${inviteLink}`);
  }

  // === CLAIM ===
  if (command === 'claim') {
    if (!isInTicketCategory(message.channel)) {
      return message.reply('Dit command kan alleen in ticket-kanalen.');
    }
    const roleType = hasAdmin(member) ? 'admin' : hasStaff(member) ? 'staff' : null;
    if (!roleType) {
      return message.reply('Je hebt geen rechten om dit ticket te claimen.');
    }
    const claimInfo = parseClaimFromTopic(message.channel.topic);
    if (claimInfo && claimInfo.userId === member.id) {
      return message.reply('Je hebt dit ticket al geclaimd.');
    }
    try {
      await applyClaimPermissions(message.channel, { claimerMember: member, roleType });
      await setClaimInTopic(message.channel, member.id, roleType);
      return message.reply(`Ticket geclaimd door ${member}.`);
    } catch (err) {
      console.error('[claim] error:', err);
      return message.reply('Kon ticket niet claimen (permissions?).');
    }
  }

  // === MEMBERTICKET ===
  if (command === 'memberticket') {
    if (!isInTicketCategory(message.channel)) {
      return message.reply('Dit command kan alleen in ticket-kanalen.');
    }
    const claimInfo = parseClaimFromTopic(message.channel.topic);
    const isClaimer = claimInfo && claimInfo.userId === member.id;
    // Staff mag toevoegen; Admin mag toevoegen; Claimer mag toevoegen
    if (!(isClaimer || hasAdmin(member) || hasStaff(member))) {
      return message.reply('Je hebt geen rechten om iemand toe te voegen aan dit ticket.');
    }
    const target = message.mentions.members.first();
    if (!target) {
      return message.reply('Gebruik: `!memberticket @gebruiker`');
    }
    try {
      await addMemberToTicket(message.channel, target.id);
      return message.reply(`${target} is toegevoegd aan dit ticket (mag typen).`);
    } catch (err) {
      console.error('[memberticket] error:', err);
      return message.reply('Kon gebruiker niet toevoegen.');
    }
  }

  // === WACHTKAMER ADD ===
  if (command === 'wachtkameradd') {
    // Alleen toegestaan in wachtkamer-textkanaal (en eventueel extra staffkanalen als je wilt)
    if (message.channel.id !== WACHTKAMER_TEXT_ID) {
      return message.reply('Gebruik dit command in de wachtkamer textchat.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('Gebruik: `!wachtkameradd @gebruiker`');

    // User moet in een voicekanaal zitten
    if (!target.voice.channel) {
      return message.reply(`${target} zit niet in een voice kanaal.`);
    }

    try {
      // Sleep naar wachtkamer VC
      await target.voice.setChannel(WACHTKAMER_VC_ID);
      // Spreek-rol toevoegen
      await target.roles.add(WACHTKAMER_ROLE_ID).catch(() => {});
      return message.reply(`${target} is naar de wachtkamer gesleept en kan nu spreken.`);
    } catch (err) {
      console.error('[wachtkameradd] error:', err);
      return message.reply('Kon gebruiker niet naar wachtkamer slepen.');
    }
  }
});


// ==== VOICE STATE UPDATE ====
// Verwijder spreek-rol als iemand de wachtkamer verlaat
client.on('voiceStateUpdate', async (oldState, newState) => {
  // alleen checken als user uit de wachtkamer weggaat
  if (oldState.channelId === WACHTKAMER_VC_ID && newState.channelId !== WACHTKAMER_VC_ID) {
    const member = oldState.member;
    if (member && member.roles.cache.has(WACHTKAMER_ROLE_ID)) {
      await member.roles.remove(WACHTKAMER_ROLE_ID).catch(console.error);
      console.log(`[Wachtkamer] Rol verwijderd bij ${member.user.tag}`);
    }
  }
});


// ==== LOGIN ====
client.login(process.env.TOKEN);
