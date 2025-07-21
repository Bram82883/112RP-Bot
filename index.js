const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

// ==== KEEPALIVE WEB SERVER ====
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`✅ Keepalive draait op poort ${PORT}`));

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
const ADMIN_ROLE_ID = '1388216679066243252'; // Owner / Co-owner
const STAFF_ROLE_ID = '1388111236511568003'; // Staff
const WACHTKAMER_VC_ID = '1390460157108158555'; 
const WACHTKAMER_TEXT_ID = '1388401216005865542';
const WACHTKAMER_ROLE_ID = '1396866068064243782';
const TICKET_CATEGORY_ID = '1390451461539758090';

// ==== HELPERS ====
function hasAdmin(member) {
  return member.roles.cache.has(ADMIN_ROLE_ID);
}
function hasStaff(member) {
  return member.roles.cache.has(STAFF_ROLE_ID);
}

function isMod(member) {
  return hasAdmin(member) || hasStaff(member);
}

// Delete message + reply after 5 sec (behalve staffaanvraag)
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

// ==== MESSAGE HANDLER ====
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const member = message.member;

  // Iedereen mag joincode zien
  if (command === 'joincode') {
    return replyAndDelete(message, 'De servercode van 112RP is **wrfj91jj**');
  }

  // Staffaanvraag mag iedereen, geen delete
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

  // ALLE OVERIGE COMMANDS alleen voor staff/admin
  if (!isMod(member)) {
    return replyAndDelete(message, 'Je hebt geen permissies voor dit command.');
  }

  // Ban
  if (command === 'ban') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te bannen.');
    if (!target.bannable) return replyAndDelete(message, 'Ik kan deze gebruiker niet bannen.');
    await target.ban();
    return replyAndDelete(message, `${target.user.tag} is geband.`);
  }

  // Kick
  if (command === 'kick') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te kicken.');
    if (!target.kickable) return replyAndDelete(message, 'Ik kan deze gebruiker niet kicken.');
    await target.kick();
    return replyAndDelete(message, `${target.user.tag} is gekickt.`);
  }

  // Timeout
  if (command === 'timeout') {
    const target = message.mentions.members.first();
    const tijd = parseInt(args[0]) || 600;
    if (!target || !target.moderatable) return replyAndDelete(message, 'Kan gebruiker geen timeout geven.');
    await target.timeout(tijd * 1000);
    return replyAndDelete(message, `${target.user.tag} heeft een timeout van ${tijd} seconden.`);
  }

  // Delete channel
  if (command === 'deletechannel') {
    await message.channel.delete();
  }

  // Purge
  if (command === 'purge') {
    const aantal = parseInt(args[0]) || 10;
    if (aantal > 100) return replyAndDelete(message, 'Max 100 berichten verwijderen.');
    const messages = await message.channel.bulkDelete(aantal, true);
    return replyAndDelete(message, `✅ ${messages.size} berichten verwijderd.`);
  }

  // Invite
  if (command === 'invite') {
    return replyAndDelete(message, 'Hier is je invite link: https://discord.gg/yourserverlink');
  }

  // Wachtkameradd
  if (command === 'wachtkameradd') {
    const mention = message.mentions.members.first();
    if (!mention) return replyAndDelete(message, 'Gebruik: !wachtkameradd @gebruiker');
    try {
      await mention.roles.add(WACHTKAMER_ROLE_ID);
      if (mention.voice.channel && mention.voice.channel.id !== WACHTKAMER_VC_ID) {
        await mention.voice.setChannel(WACHTKAMER_VC_ID);
      }
      return replyAndDelete(message, `${mention.user.tag} is toegevoegd aan de wachtkamer.`);
    } catch (err) {
      console.error(err);
      return replyAndDelete(message, 'Er is iets misgegaan.');
    }
  }

  // Wachtkamerremove
  if (command === 'wachtkamerremove') {
    const mention = message.mentions.members.first();
    if (!mention) return replyAndDelete(message, 'Gebruik: !wachtkamerremove @gebruiker');
    try {
      await mention.roles.remove(WACHTKAMER_ROLE_ID);
      if (mention.voice.channel && mention.voice.channel.id === WACHTKAMER_VC_ID) {
        await mention.voice.setChannel(null);
      }
      return replyAndDelete(message, `${mention.user.tag} is verwijderd uit de wachtkamer.`);
    } catch (err) {
      console.error(err);
      return replyAndDelete(message, 'Er is iets misgegaan.');
    }
  }

  // Claim (kan nu overal, maar let op ticket category permissions!)
  if (command === 'claim') {
    // Claim logica, zonder kanaalcheck
    const topic = message.channel.topic || '';
    const claimRegex = /\|CLAIM:(\d+):(staff|admin)\|/i;
    if (claimRegex.test(topic)) return replyAndDelete(message, 'Dit ticket is al geclaimed.');

    const roleType = hasAdmin(member) ? 'admin' : 'staff';

    // Topic aanpassen met claim
    const nieuwTopic = (topic.replace(claimRegex, '') + ` |CLAIM:${member.id}:${roleType}|`).trim();
    await message.channel.setTopic(nieuwTopic).catch(() => {});

    // Permissions aanpassen (basic)
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false, SendMessages: false });
    await message.channel.permissionOverwrites.edit(STAFF_ROLE_ID, { ViewChannel: true, SendMessages: false });
    await message.channel.permissionOverwrites.edit(ADMIN_ROLE_ID, { ViewChannel: true, SendMessages: roleType === 'staff' });
    await message.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });

    return replyAndDelete(message, `✅ Ticket geclaimed door ${member.user.tag} als ${roleType}`);
  }

  // Memberticket toevoegen
  if (command === 'memberticket') {
    const mention = message.mentions.members.first();
    if (!mention) return replyAndDelete(message, 'Gebruik: !memberticket @gebruiker');
    await message.channel.permissionOverwrites.edit(mention.id, { ViewChannel: true, SendMessages: true });
    return replyAndDelete(message, `${mention.user.tag} is toegevoegd aan dit ticket.`);
  }

});

client.login(process.env.TOKEN);
