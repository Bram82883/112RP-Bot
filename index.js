const express = require('express'); 
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');

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

async function replyAndDelete(message, text) {
  const sent = await message.reply(text);
  setTimeout(() => {
    if (!message.deleted) message.delete().catch(() => {});
    if (!sent.deleted) sent.delete().catch(() => {});
  }, 5000);
}

// ==== ERROR HANDLERS ====
client.on('error', (err) => console.error('Bot Error:', err));
client.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

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

  // ====== JOINCODE ======
  if (command === 'joincode') {
    return replyAndDelete(message, 'De servercode van 112RP is **wrfj91jj**');
  }

  // ====== STAFFAANVRAAG (alleen staff/admin) ======
  if (command === 'staffaanvraag') {
    if (!isMod(member)) return replyAndDelete(message, 'Je hebt geen permissies voor dit command.');
    const aangewezenUser = message.mentions.members.first();
    const rolNaam = args[1];
    if (!aangewezenUser || !rolNaam) {
      return message.reply('Gebruik: `!staffaanvraag @gebruiker RolNaam`');
    }
    const rol = message.guild.roles.cache.find(r => r.name.toLowerCase() === rolNaam.toLowerCase());
    if (!rol) return message.reply('Rol niet gevonden.');
    const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

    const embed = new EmbedBuilder()
      .setTitle('📝 Staff Aanvraag Log 📝')
      .setDescription(`**📅 Datum:** ${datum}\n**👤 Aanvrager:** ${aangewezenUser}\n**🎭 Rol:** ${rol.name}\n**🛠️ Beslissing door:** ${member}\n\n**📜 Status:** ✅ Goedgekeurd\n\n**🎉 ${aangewezenUser} is ${rol.name} geworden! Welkom in het team!**`)
      .setColor(0x00ff00)
      .setThumbnail(aangewezenUser.user.displayAvatarURL());

    try {
      await aangewezenUser.roles.add(rol);
      const logKanaal = message.guild.channels.cache.get('1388402045328818257');
      if (logKanaal) {
        logKanaal.send({ content: '@everyone', embeds: [embed] });
      }
      return message.reply(`${aangewezenUser} is succesvol toegevoegd aan de rol ${rol.name}.`);
    } catch (err) {
      console.error(err);
      return message.reply('Kon de rol niet toekennen.');
    }
  }

  // ====== PERMISSION CHECK ======
  if (!isMod(member)) {
    return replyAndDelete(message, 'Je hebt geen permissies voor dit command.');
  }

  // ====== BAN ======
  if (command === 'ban') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te bannen.');
    if (!target.bannable) return replyAndDelete(message, 'Ik kan deze gebruiker niet bannen.');
    await target.ban();
    return replyAndDelete(message, `${target.user.tag} is geband.`);
  }

  // ====== KICK ======
  if (command === 'kick') {
    const target = message.mentions.members.first();
    if (!target) return replyAndDelete(message, 'Geef een gebruiker om te kicken.');
    if (!target.kickable) return replyAndDelete(message, 'Ik kan deze gebruiker niet kicken.');
    await target.kick();
    return replyAndDelete(message, `${target.user.tag} is gekickt.`);
  }

  // ====== TIMEOUT ======
  if (command === 'timeout') {
    const target = message.mentions.members.first();
    const tijd = parseInt(args[0]) || 600;
    if (!target || !target.moderatable) return replyAndDelete(message, 'Kan gebruiker geen timeout geven.');
    await target.timeout(tijd * 1000);
    return replyAndDelete(message, `${target.user.tag} heeft een timeout van ${tijd} seconden.`);
  }

  // ====== DELETECHANNEL ======
  if (command === 'deletechannel') {
    await message.channel.delete();
  }

  // ====== PURGE ======
  if (command === 'purge') {
    const aantal = parseInt(args[0]) || 10;
    if (aantal > 100) return replyAndDelete(message, 'Max 100 berichten verwijderen.');
    const messages = await message.channel.bulkDelete(aantal, true);
    return replyAndDelete(message, `✅ ${messages.size} berichten verwijderd.`);
  }

  // ====== SERVERLOCKDOWN ======
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

    // Lock alle kanalen
    message.guild.channels.cache.forEach(async (channel) => {
      if (channel.isTextBased() || channel.isVoiceBased()) {
        try {
          await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        } catch (err) { console.error('Kan kanaal niet locken:', channel.name, err); }
      }
    });

    return replyAndDelete(message, '🚨 Server is in lockdown gezet.');
  }

  // ====== SERVERLOCKDOWNSTOP ======
  if (command === 'serverlockdownstop') {
    if (!hasAdmin(member)) return replyAndDelete(message, 'Alleen Owner/Co-owner kan dit.');

    // Unlock alle kanalen
    message.guild.channels.cache.forEach(async (channel) => {
      if (channel.isTextBased() || channel.isVoiceBased()) {
        try {
          await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
        } catch (err) { console.error('Kan kanaal niet unlocken:', channel.name, err); }
      }
    });

    return replyAndDelete(message, '✅ Server lockdown opgeheven.');
  }

  // ====== INVITE ======
  if (command === 'invite') {
    return replyAndDelete(message, 'Hier is je invite link: https://discord.gg/yourserverlink');
  }

  // ====== WACHTKAMER ADD ======
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

  // ====== WACHTKAMER REMOVE ======
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

});

client.login(process.env.TOKEN);
