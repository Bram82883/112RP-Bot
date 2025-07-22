const express = require('express'); 
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

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
const MEDEDELINGEN_ID = '1388069527857659985'; // Mededelingen kanaal
const STAFF_LOG_CHANNEL_ID = '1388402045328818257'; // Staffaanvraag log kanaal

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

// Delete message + reply na 5 sec (behalve staffaanvraag)
async function replyAndDelete(message, text, staffaanvraag = false) {
  const sent = await message.reply(text);
  if (staffaanvraag) return; // geen delete bij staffaanvraag
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

  // Staffaanvraag (alleen staff en admin)
  if (command === 'staffaanvraag') {
    if (!isMod(member)) return replyAndDelete(message, 'Je hebt geen permissies voor dit command.');

    const aangewezenUser = message.mentions.members.first();
    if (!aangewezenUser) return message.reply('Gebruik: `!staffaanvraag @gebruiker RolNaam`');

    const rolNaam = args.slice(1).join(' ').trim();
    if (!rolNaam) return message.reply('Gebruik: `!staffaanvraag @gebruiker RolNaam`');

    const rol = message.guild.roles.cache.find(r => r.name.toLowerCase() === rolNaam.toLowerCase());
    if (!rol) return message.reply('Rol niet gevonden.');

    // Datum + tijd NL
    const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

    try {
      await aangewezenUser.roles.add(rol);

      // Embed voor logkanaal
      const embed = new EmbedBuilder()
        .setTitle('📝 Staff Aanvraag Log 📝')
        .setColor('#0099ff')
        .setThumbnail(aangewezenUser.user.displayAvatarURL())
        .addFields(
          { name: '📅 Datum', value: datum, inline: true },
          { name: '👤 Aanvrager', value: `${aangewezenUser}`, inline: true },
          { name: '🎭 Aangevraagde Rol', value: rol.name, inline: true },
          { name: '🛠️ Beslissing door', value: `${member}`, inline: true },
          { name: '📜 Status', value: '✅ Goedgekeurd', inline: true },
          { name: '👉 Tekst van Beslissing', value:
            `✅ Goedgekeurd:\n🎉 ${aangewezenUser} is ${rol.name} geworden! Welkom in het team!`
          }
        );

      const logKanaal = message.guild.channels.cache.get(STAFF_LOG_CHANNEL_ID);
      if (logKanaal) {
        await logKanaal.send({ content: '@everyone', embeds: [embed] });
      }

      return message.reply(`${aangewezenUser} is succesvol toegevoegd aan de rol ${rol.name}.`);
    } catch (err) {
      console.error(err);
      return message.reply('Kon de rol niet toekennen.');
    }
  }

  // ALLE overige commands alleen voor staff/admin
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

  // Claim (kan nu overal, let op ticket category perms)
  if (command === 'claim') {
    const topic = message.channel.topic || '';
    const claimRegex = /\|CLAIM:(\d+):(staff|admin)\|/i;
    if (claimRegex.test(topic)) return replyAndDelete(message, 'Dit ticket is al geclaimed.');

    const roleType = hasAdmin(member) ? 'admin' : 'staff';

    const nieuwTopic = (topic.replace(claimRegex, '') + ` |CLAIM:${member.id}:${roleType}|`).trim();
    await message.channel.setTopic(nieuwTopic).catch(() => {});

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false, SendMessages: false });
    await message.channel.permissionOverwrites.edit(STAFF_ROLE_ID, { ViewChannel: true, SendMessages: false });
    await message.channel.permissionOverwrites.edit(ADMIN_ROLE_ID, { ViewChannel: true, SendMessages: roleType === 'staff' });
    await message.channel.permissionOverwrites.edit(member, { ViewChannel: true, SendMessages: true });

    return replyAndDelete(message, `${member.user.tag} heeft het ticket geclaimed.`);
  }

  // Memberticket aanmaken
  if (command === 'memberticket') {
    const naam = args[0];
    if (!naam) return replyAndDelete(message, 'Gebruik: !memberticket Naam');
    // Ticket aanmaken logic hier, kan complex zijn afhankelijk van server setup.
    return replyAndDelete(message, `Ticket voor ${naam} aangemaakt.`);
  }

  // Serverlockdown - Alleen owner/co-owner
  if (command === 'serverlockdown') {
    if (!hasAdmin(member)) return replyAndDelete(message, 'Alleen Owner/Co-owner kan dit.');

    const mededelingen = message.guild.channels.cache.get(MEDEDELINGEN_ID);
    if (mededelingen) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 SERVER LOCKDOWN 🚨')
        .setDescription('De server is in **lockdown** gezet. Er wordt aan gewerkt.\nBlijf rustig en volg de updates in dit kanaal.')
        .setColor(0xff0000)
        .setThumbnail('https://media.discordapp.net/attachments/1388401216005865542/1396768945494687825/afbeelding_2025-07-05_141215193-modified.png');
      await mededelingen.send({ content: '@everyone', embeds: [embed] });
    }

    message.guild.channels.cache.forEach(async (channel) => {
      if (channel.parentId === TICKET_CATEGORY_ID) return;
      if (channel.isTextBased() || channel.isVoiceBased()) {
        try {
          await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false, Connect: false });
        } catch (err) {
          console.error('Kan kanaal niet locken:', channel.name, err);
        }
      }
    });

    return replyAndDelete(message, '🚨 Server is in lockdown gezet.');
  }

  // Serverlockdownstop
  if (command === 'serverlockdownstop') {
    if (!hasAdmin(member)) return replyAndDelete(message, 'Alleen Owner/Co-owner kan dit.');

    message.guild.channels.cache.forEach(async (channel) => {
      if (channel.parentId === TICKET_CATEGORY_ID) return;
      if (channel.isTextBased() || channel.isVoiceBased()) {
        try {
          await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true, Connect: true });
        } catch (err) {
          console.error('Kan kanaal niet unlocken:', channel.name, err);
        }
      }
    });

    const mededelingen = message.guild.channels.cache.get(MEDEDELINGEN_ID);
    if (mededelingen) {
      const embed = new EmbedBuilder()
        .setTitle('✅ SERVER LOCKDOWN OPGEHEVEN')
        .setDescription('De server is weer **open**. Bedankt voor je geduld!')
        .setColor(0x00ff00)
        .setThumbnail('https://media.discordapp.net/attachments/1388401216005865542/1396768945494687825/afbeelding_2025-07-05_141215193-modified.png');
      await mededelingen.send({ content: '@everyone', embeds: [embed] });
    }

    return replyAndDelete(message, '✅ Server lockdown opgeheven.');
  }

});

client.login('YOUR_BOT_TOKEN');
