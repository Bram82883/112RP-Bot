const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// === CONFIG ===
const ADMIN_ROLE_ID = '1388216679066243252';
const STAFF_ROLE_ID = '1388111236511568003';
const TICKET_CATEGORY_ID = '1390451461539758090'; // Ticketcategorie waar !claim werkt

// ================= HELPER FUNCTIES VOOR TICKET CLAIMS =================
// We bewaren metadata in het channel topic zodat het blijft bestaan na een bot restart.
// Formaat: |CLAIM:<userId>:staff| of |CLAIM:<userId>:admin|
// (case-insensitive regex)
const CLAIM_REGEX = /\|CLAIM:(\d+):(staff|admin)\|/i;

function parseClaimFromTopic(topic) {
  if (!topic) return null;
  const m = topic.match(CLAIM_REGEX);
  if (!m) return null;
  return { userId: m[1], roleType: m[2].toLowerCase() };
}

async function setClaimInTopic(channel, userId, roleType) {
  const oldTopic = channel.topic || '';
  const cleaned = oldTopic.replace(CLAIM_REGEX, '').trim();
  const nieuwTopic = `${cleaned}${cleaned.length ? ' ' : ''}|CLAIM:${userId}:${roleType}|`;
  try {
    await channel.setTopic(nieuwTopic);
  } catch (err) {
    console.warn(`[setClaimInTopic] kon topic niet zetten in #${channel.name}:`, err.message);
  }
}

function isInTicketCategory(channel) {
  return channel.parentId === TICKET_CATEGORY_ID;
}

function hasAdmin(member) {
  return member.roles.cache.has(ADMIN_ROLE_ID);
}

function hasStaff(member) {
  return member.roles.cache.has(STAFF_ROLE_ID);
}

// Ticketstarter bepalen? Jij gaf aan dat "degene die de channel heeft aangemaakt" ook mag typen.
// We proberen dit uit de kanaalnaam te halen: laatste reeks cijfers (Discord userId) aan het eind.
// Voorbeeldnaam: ticket-123456789012345678 -> openerId = 123456789012345678
function getOpenerIdFromChannelName(name) {
  if (!name) return null;
  const m = name.match(/(\d{15,})$/); // pak lange reeks digits aan het eind
  return m ? m[1] : null;
}

// Permissions toepassen wanneer ticket geclaimd wordt.
// Regels (zoals jij wilde):
// - Iedereen kan blijven ZIEN.
// - Niemand kan typen behalve:
//   * Claimer.
//   * Ticketstarter (als gevonden).
//   * Als STAFF claimt -> Admin role mag OOK typen.
//   * Als ADMIN claimt -> niemand extra typen.
// Extra users via !memberticket krijgen individueel SendMessages.
async function applyClaimPermissions(channel, { claimerMember, roleType }) {
  const guild = channel.guild;
  const everyoneRole = guild.roles.everyone;
  const staffRole = guild.roles.cache.get(STAFF_ROLE_ID);
  const adminRole = guild.roles.cache.get(ADMIN_ROLE_ID);

  // BASIS: iedereen zien, niet typen
  await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false, SendMessages: false }).catch(console.error);

  // STAFF role: zien, niet typen
  if (staffRole) {
    await channel.permissionOverwrites.edit(staffRole, { ViewChannel: true, SendMessages: false }).catch(console.error);
  }

  // ADMIN role: zien, niet typen (mogelijk straks overschreven)
  if (adminRole) {
    await channel.permissionOverwrites.edit(adminRole, { ViewChannel: true, SendMessages: false }).catch(console.error);
  }

  // Ticketstarter allow (indien gevonden en niet claimer zelf)
  const openerId = getOpenerIdFromChannelName(channel.name);
  if (openerId && openerId !== claimerMember.id) {
    await channel.permissionOverwrites.edit(openerId, { ViewChannel: true, SendMessages: true }).catch(console.error);
  }

  // Claimer allow
  await channel.permissionOverwrites.edit(claimerMember.id, { ViewChannel: true, SendMessages: true }).catch(console.error);

  // STAFF claimt -> Admin role mag typen
  if (roleType === 'staff' && adminRole) {
    await channel.permissionOverwrites.edit(adminRole, { ViewChannel: true, SendMessages: true }).catch(console.error);
  }
}

// Voeg extra persoon toe aan ticket (mag typen)
async function addMemberToTicket(channel, memberId) {
  await channel.permissionOverwrites.edit(memberId, { ViewChannel: true, SendMessages: true }).catch(console.error);
}

client.once('ready', () => {
  console.log(`Bot is ingelogd als ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // === JOINCODE (voor iedereen) ===
  if (command === 'joincode') {
    return message.reply('De servercode van 112RP is **wrfj91jj**');
  }

  // === STAFFAANVRAAG ===
  if (command === 'staffaanvraag') {
    const aangewezenUser = message.mentions.members.first();
    const beslisser = message.member;
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
        const bericht = `📝 **Staff Aanvraag Log** 📝\n\n📅 Datum: ${datum}\n👤 Aanvrager: ${aangewezenUser}\n🎭 Aangevraagde Rol: ${rol.name}\n🛠️ Beslissing door: ${beslisser}\n📜 Status: ✅ Goedgekeurd\n\n✅ ${aangewezenUser} is **${rol.name}** geworden! Welkom in het team!`;
        logKanaal.send(bericht);
      }

      return message.reply(`${aangewezenUser} is succesvol toegevoegd aan de rol ${rol.name}.`);
    } catch (err) {
      console.error(err);
      return message.reply('Kon de rol niet toekennen.');
    }
  }

  // === CHECK PERMISSIES VOOR MOD-COMMANDS ===
  const isMod = message.member.roles.cache.has(ADMIN_ROLE_ID) || message.member.roles.cache.has(STAFF_ROLE_ID);

  // === MOD COMMANDS ===
  if (command === 'ban') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const user = message.mentions.members.first();
    if (!user) return message.reply('Geef een gebruiker om te bannen.');
    if (!user.bannable) return message.reply('Ik kan deze gebruiker niet bannen.');
    await user.ban();
    return message.reply(`${user.user.tag} is geband.`);
  }

  if (command === 'kick') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const user = message.mentions.members.first();
    if (!user) return message.reply('Geef een gebruiker om te kicken.');
    if (!user.kickable) return message.reply('Ik kan deze gebruiker niet kicken.');
    await user.kick();
    return message.reply(`${user.user.tag} is gekickt.`);
  }

  if (command === 'timeout') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const user = message.mentions.members.first();
    const tijd = parseInt(args[1]) || 600;
    if (!user || !user.moderatable) return message.reply('Kan gebruiker geen timeout geven.');
    await user.timeout(tijd * 1000);
    return message.reply(`${user.user.tag} heeft een timeout van ${tijd} seconden.`);
  }

  if (command === 'deletechannel') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const channel = message.mentions.channels.first() || message.channel;
    message.reply(`Kanaal ${channel.name} wordt verwijderd over 60 minuten.`);
    setTimeout(() => {
      channel.delete().catch(console.error);
    }, 60 * 60 * 1000);
  }

  if (command === 'purge') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const user = message.mentions.users.first();
    const channel = message.channel;
    if (!channel.permissionsFor(message.member).has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply('Geen permissie om berichten te verwijderen.');
    }

    let fetched;
    do {
      fetched = await channel.messages.fetch({ limit: 100 });
      const messagesToDelete = fetched.filter(m => user ? m.author.id === user.id : true);
      if (messagesToDelete.size > 0) {
        await channel.bulkDelete(messagesToDelete, true);
      }
    } while (fetched.size >= 2);

    return message.reply('Berichten verwijderd.');
  }

  if (command === 'invite') {
    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    return message.reply(`Voeg de bot toe met deze link:\n${inviteLink}`);
  }

  // ===================== NIEUW: !claim =====================
  if (command === 'claim') {
    if (!isInTicketCategory(message.channel)) {
      return message.reply('Dit command kan alleen in ticket-kanalen.');
    }

    const member = message.member;
    const roleType = hasAdmin(member) ? 'admin' : hasStaff(member) ? 'staff' : null;
    if (!roleType) {
      return message.reply('Je hebt geen rechten om dit ticket te claimen.');
    }

    // Check of al geclaimd door dezelfde
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

  // ===================== NIEUW: !memberticket @user =====================
  if (command === 'memberticket') {
    if (!isInTicketCategory(message.channel)) {
      return message.reply('Dit command kan alleen in ticket-kanalen.');
    }

    const execMember = message.member;
    const claimInfo = parseClaimFromTopic(message.channel.topic);
    const isClaimer = claimInfo && claimInfo.userId === execMember.id;
    const mag = isClaimer || hasAdmin(execMember) || hasStaff(execMember); // <-- staff mag ook
    if (!mag) {
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
});

client.login(process.env.TOKEN);
