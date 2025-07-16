const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});
 
const ADMIN_ROLE_ID = '1388216679066243252';
const STAFF_ROLE_ID = '1388111236511568003';
const JOINCODE_ROLE_ID = '1390446268328972460';
 
client.once('ready', () => {
  console.log(`Bot is ingelogd als ${client.user.tag}`);
});
 
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
 
  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;
 
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
 
  const isAdmin = message.member.roles.cache.has(ADMIN_ROLE_ID);
  const isStaff = message.member.roles.cache.has(STAFF_ROLE_ID);
 
  // JOINCODE COMMAND
  if (command === 'joincode') {
    return message.reply('De servercode van 112RP is **wrfj91jj**');
  }
 
  // STAFFAANVRAAG COMMAND
  if (command === 'staffaanvraag') {
    const aangewezenUser = message.mentions.members.first();
    const beslisser = message.member;
    const rolNaam = args[1];
 
    if (!aangewezenUser || !rolNaam) {
      return message.reply('Gebruik: `!staffaanvraag @gebruiker RolNaam`');
    }
 
    const rol = message.guild.roles.cache.find(r => r.name.toLowerCase() === rolNaam.toLowerCase());
    if (!rol) {
      return message.reply('Rol niet gevonden. Let op hoofdletters en spaties.');
    }
 
    const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
 
    await aangewezenUser.roles.add(rol).catch(err => {
      console.error(err);
      return message.reply('Kon de rol niet toekennen.');
    });
 
    const logKanaal = message.guild.channels.cache.find(c => c.name === 'staff-aanvragen-log');
    if (!logKanaal) return message.reply('Kanaal `staff-aanvragen-log` niet gevonden.');
 
    const bericht = `📝 **Staff Aanvraag Log** 📝
 
📅 Datum: ${datum}
👤 Aanvrager: ${aangewezenUser}
🎭 Aangevraagde Rol: ${rol.name}
🛠️ Beslissing door: ${beslisser}
📜 Status: ✅ Goedgekeurd
 
✅ ${aangewezenUser} is **${rol.name}** geworden! Welkom in het team!`;
 
    logKanaal.send(bericht);
    return message.reply(`${aangewezenUser} is succesvol toegevoegd aan de rol ${rol.name}.`);
  }
 
  // COMMANDS VOOR ADMIN/STAF
  if (['ban', 'kick', 'timeout', 'purge', 'deletechannel'].includes(command)) {
    if (!isAdmin && !isStaff) {
      return message.reply('Je hebt geen toegang tot dit commando.');
    }
  }
 
  try {
    if (command === 'ban') {
      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om te bannen.');
      if (!user.bannable) return message.reply('Ik kan deze gebruiker niet bannen.');
 
      await user.ban();
      message.reply(`${user.user.tag} is geband.`);
    }
 
    else if (command === 'kick') {
      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om te kicken.');
      if (!user.kickable) return message.reply('Ik kan deze gebruiker niet kicken.');
 
      await user.kick();
      message.reply(`${user.user.tag} is gekickt.`);
    }
 
    else if (command === 'softban') {
      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om te softbannen.');
      if (!user.bannable) return message.reply('Ik kan deze gebruiker niet bannen.');
 
      await user.ban({ deleteMessageDays: 7 });
      await message.guild.members.unban(user.id);
      message.reply(`${user.user.tag} is softgebanned.`);
    }
 
    else if (command === 'timeout') {
      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om een time-out te geven.');
      if (!user.moderatable) return message.reply('Ik kan deze gebruiker geen time-out geven.');
 
      const tijd = parseInt(args[1]) || 600;
      await user.timeout(tijd * 1000);
      message.reply(`${user.user.tag} heeft een time-out gekregen van ${tijd} seconden.`);
    }
 
    else if (command === 'deletechannel') {
      const channel = message.mentions.channels.first() || message.channel;
      message.reply(`Kanaal ${channel.name} wordt verwijderd over 60 minuten.`);
 
      setTimeout(() => {
        channel.delete().catch(console.error);
      }, 60 * 60 * 1000);
    }
 
    else if (command === 'purge') {
      const user = message.mentions.users.first();
      const channel = message.channel;
      if (!channel.permissionsFor(message.member).has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply('Je hebt geen permissies om berichten te verwijderen.');
      }
 
      let fetched;
      do {
        fetched = await channel.messages.fetch({ limit: 100 });
        const messagesToDelete = fetched.filter(m => user ? m.author.id === user.id : true);
        if (messagesToDelete.size > 0) {
          await channel.bulkDelete(messagesToDelete, true);
        }
      } while (fetched.size >= 2);
 
      message.reply('Berichten verwijderd.');
    }
 
    else if (command === 'invite') {
      const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
      message.reply(`Voeg de bot toe met deze link:\n${inviteLink}`);
    }
 
  } catch (err) {
    console.error(err);
    message.reply('Er ging iets mis met het uitvoeren van het command.');
  }
});
 
client.login(process.env.TOKEN);
