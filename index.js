const { Client, GatewayIntentBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const TICKET_MOD_ROLE_ID = '1394002226783191172';
const prefix = '!';

client.once('ready', () => {
  console.log(`Bot is ingelogd als ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const member = message.member;

  // Permissie check voor mod commands (ban/kick/timeout etc)
  const hasModPerms = member.permissions.has(PermissionsBitField.Flags.ModerateMembers);

  // STAFFAANVRAAG
  if (command === 'staffaanvraag') {
    const aangewezenUser = message.mentions.members.first();
    const beslisser = member;
    const rolNaam = args[1];

    if (!aangewezenUser || !rolNaam) {
      return message.reply('Gebruik: `!staffaanvraag @gebruiker RolNaam`');
    }

    const rol = message.guild.roles.cache.find(r => r.name.toLowerCase() === rolNaam.toLowerCase());
    if (!rol) {
      return message.reply('Rol niet gevonden. Let op hoofdletters en spaties.');
    }

    const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

    try {
      await aangewezenUser.roles.add(rol);
    } catch {
      return message.reply('Kon de rol niet toekennen.');
    }

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

  // Mod commands alleen met permissies
  if (!hasModPerms) {
    return message.reply('Je hebt geen permissies voor deze commands.');
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

      const tijd = parseInt(args[0]) || 600; // tijd in seconden, standaard 10 minuten
      await user.timeout(tijd * 1000);
      message.reply(`${user.user.tag} heeft een time-out gekregen van ${tijd} seconden.`);
    }

    else if (command === 'deletechannel') {
      const channel = message.mentions.channels.first() || message.channel;
      message.reply(`Channel ${channel.name} wordt verwijderd over 60 minuten.`);

      setTimeout(() => {
        channel.delete().catch(console.error);
      }, 60 * 60 * 1000);
    }

    else if (command === 'purge') {
      const user = message.mentions.users.first();
      const channel = message.channel;
      if (!channel.permissionsFor(member).has(PermissionsBitField.Flags.ManageMessages)) {
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
  } catch (err) {
    console.error(err);
    message.reply('Er ging iets mis met het uitvoeren van het command.');
  }

  // Invite link voor iedereen
  if (command === 'invite') {
    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    return message.reply(`Voeg de bot toe met deze link:\n${inviteLink}`);
  }

  // TICKET COMMANDS alleen voor ticket mods
  if (member.roles.cache.has(TICKET_MOD_ROLE_ID)) {

    if (command === 'ticket') {
      // Maak een ticket kanaal aan (of check of het al bestaat)
      const existingChannel = message.guild.channels.cache.find(c => c.name === `ticket-${member.user.username.toLowerCase()}`);
      if (existingChannel) return message.reply('Je hebt al een ticket geopend: ' + existingChannel.toString());

      message.guild.channels.create({
        name: `ticket-${member.user.username}`,
        type: 0, // text channel
        permissionOverwrites: [
          {
            id: message.guild.id,
            deny: ['ViewChannel'],
          },
          {
            id: member.id,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
          },
          {
            id: TICKET_MOD_ROLE_ID,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
          }
        ]
      }).then(ch => {
        ch.send(`Ticket geopend door ${member}. Gebruik \`!claim\` om deze te claimen.`);
        message.reply('Ticket is aangemaakt: ' + ch.toString());
      }).catch(err => {
        console.error(err);
        message.reply('Er ging iets mis met het aanmaken van het ticket.');
      });
    }

    else if (command === 'claim') {
      if (!message.channel.name.startsWith('ticket-')) return message.reply('Dit is geen ticket kanaal.');

      // Check of de ticket nog niet geclaimed is (bijvoorbeeld check voor een specifieke rol of bericht)
      await message.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });
      message.reply(`${member} heeft dit ticket geclaimd.`);
    }

    else if (command === 'add') {
      if (!message.channel.name.startsWith('ticket-')) return message.reply('Dit is geen ticket kanaal.');

      const userToAdd = message.mentions.members.first();
      if (!userToAdd) return message.reply('Noem een gebruiker om toe te voegen.');

      await message.channel.permissionOverwrites.edit(userToAdd.id, { ViewChannel: true, SendMessages: true });
      message.reply(`${userToAdd} is toegevoegd aan het ticket.`);
    }
  }
});

client.login(process.env.TOKEN);
