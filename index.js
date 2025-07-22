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
    GatewayIntentBits.GuildVoiceStates,
  ]
});

// ==== CONFIG ====
const PREFIX = '!';
const TOKEN = 'JOUW_DISCORD_BOT_TOKEN_HIER'; // <-- Vul hier je token in (nooit delen)
const ADMIN_ROLE_ID = '1388216679066243252'; // Owner / Co-owner
const STAFF_ROLE_ID = '1388111236511568003'; // Staff
const WACHTKAMER_VC_ID = '1390460157108158555'; 
const WACHTKAMER_TEXT_ID = '1388401216005865542';
const WACHTKAMER_ROLE_ID = '1396866068064243782';
const TICKET_CATEGORY_ID = '1390451461539758090';

const LOCKDOWN_ANNOUNCE_CHANNEL = '1388069527857659985';
const STAFFAANVRAAG_LOG_CHANNEL = '1388402045328818257';

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

client.once('ready', () => {
  console.log(`✅ Bot ingelogd als ${client.user.tag}`);
});

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

  // Staffaanvraag alleen voor staff/admin
  if (command === 'staffaanvraag') {
    if (!isMod(member)) return replyAndDelete(message, 'Je hebt geen permissies voor dit command.');

    const aangewezenUser = message.mentions.members.first();
    const rolNaam = args[1];
    if (!aangewezenUser || !rolNaam) {
      return replyAndDelete(message, 'Gebruik: `!staffaanvraag @gebruiker RolNaam`');
    }
    const rol = message.guild.roles.cache.find(r => r.name.toLowerCase() === rolNaam.toLowerCase());
    if (!rol) return replyAndDelete(message, 'Rol niet gevonden.');

    const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
    
    try {
      await aangewezenUser.roles.add(rol);

      const logKanaal = message.guild.channels.cache.get(STAFFAANVRAAG_LOG_CHANNEL);
      if (logKanaal) {
        const embed = new EmbedBuilder()
          .setColor('#2f3136')
          .setTitle('📝 Staff Aanvraag Log 📝')
          .setDescription(`@everyone`)
          .addFields(
            { name: '📅 Datum', value: datum, inline: true },
            { name: '👤 Aanvrager', value: `${aangewezenUser}`, inline: true },
            { name: '🎭 Aangevraagde Rol', value: rol.name, inline: true },
            { name: '🛠️ Beslissing door', value: `${member}`, inline: true },
            { name: '📜 Status', value: '✅ Goedgekeurd', inline: true },
            { name: '👉 Tekst van Beslissing', value: `✅ Goedgekeurd:\n🎉 ${aangewezenUser} is ${rol.name} geworden! Welkom in het team!` }
          )
          .setTimestamp();

        await logKanaal.send({ content: '@everyone', embeds: [embed] });
      }

      return message.reply(`${aangewezenUser} is succesvol toegevoegd aan de rol ${rol.name}.`);
    } catch (err) {
      console.error(err);
      return replyAndDelete(message, 'Kon de rol niet toekennen.');
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

  // Claim (kan nu overal, let op ticket category permissions!)
  if (command === 'claim') {
    const topic = message.channel.topic || '';
    const claimRegex = /\|CLAIM:(\d+):(staff|admin)\|/i;
    if (claimRegex.test(topic)) return replyAndDelete(message, 'Dit ticket is al geclaimed.');

    const roleType = args[0] === 'admin' ? 'admin' : 'staff';
    const claimId = Date.now();

    const newTopic = `${topic} |CLAIM:${claimId}:${roleType}|`;
    await message.channel.setTopic(newTopic);
    return replyAndDelete(message, `${member.user.tag} heeft dit ticket geclaimed als ${roleType}.`);
  }

  // Memberticket
  if (command === 'memberticket') {
    return replyAndDelete(message, 'Maak een ticket via het ticketkanaal!');
  }

  // Serverlockdown (alleen owner/co-owner)
  if (command === 'serverlockdown') {
    if (!hasAdmin(member)) return replyAndDelete(message, 'Alleen co-owner of owner kan dit.');

    const announceChannel = message.guild.channels.cache.get(LOCKDOWN_ANNOUNCE_CHANNEL);
    if (!announceChannel) return replyAndDelete(message, 'Kanaal niet gevonden.');

    // Lock alle kanalen
    for (const [channelId, channel] of message.guild.channels.cache) {
      try {
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false, Connect: false });
      } catch {}
    }

    // Demote co-owner en owner
    for (const [memberId, m] of message.guild.members.cache) {
      if (m.roles.cache.has(ADMIN_ROLE_ID)) {
        try {
          await m.roles.set([]); // verwijder ALLE rollen, je kan dit aanpassen als je wil
          await m.roles.add(ADMIN_ROLE_ID); // als je ze wilt behouden moet je anders doen
        } catch {}
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🔒 Server Lockdown Actief')
      .setDescription(`Deze server zit nu in lockdown.\n\nEr wordt hard aan gewerkt om het probleem op te lossen.\n\nLockdown gestart door: ${member.user.tag}`)
      .setColor('#ff0000')
      .setImage('https://media.discordapp.net/attachments/1388401216005865542/1396768945494687825/afbeelding_2025-07-05_141215193-modified.png?ex=68814433&is=687ff2b3&hm=0abcaddf6910fe3edc79eff9e42907b4debf6941aacb415257d0ccafc414182e&=&format=webp&quality=lossless&width=563&height=563')
      .setTimestamp();

    announceChannel.send({ content: '@everyone', embeds: [embed] });
    return replyAndDelete(message, 'Server is nu in lockdown.');
  }

  // Serverlockdownstop (alleen owner/co-owner)
  if (command === 'serverlockdownstop') {
    if (!hasAdmin(member)) return replyAndDelete(message, 'Alleen co-owner of owner kan dit.');

    const announceChannel = message.guild.channels.cache.get(LOCKDOWN_ANNOUNCE_CHANNEL);
    if (!announceChannel) return replyAndDelete(message, 'Kanaal niet gevonden.');

    // Unlock alle kanalen
    for (const [channelId, channel] of message.guild.channels.cache) {
      try {
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null, Connect: null });
      } catch {}
    }

    // Herstel rollen? (Zet ze terug zoals je wil)
    // Hier kan je custom logic toevoegen om rollen terug te geven

    const embed = new EmbedBuilder()
      .setTitle('🔓 Server Lockdown Gestopt')
      .setDescription(`De server is weer open voor iedereen.\n\nLockdown gestopt door: ${member.user.tag}`)
      .setColor('#00ff00')
      .setTimestamp();

    announceChannel.send({ content: '@everyone', embeds: [embed] });
    return replyAndDelete(message, 'Lockdown is gestopt.');
  }
});

client.login(TOKEN);
