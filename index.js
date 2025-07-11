const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

client.once('ready', () => {
  console.log(`Bot is ingelogd als ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Alleen mensen met ModerateMembers kunnen deze commands gebruiken
  if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return message.reply('Je hebt geen permissies voor dit command.');
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
      message.reply(`Channel ${channel.name} wordt verwijderd over 60 minuten.`);
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

    else if (command === 'roleadd') {
      const user = message.mentions.members.first();
      const roleName = args.slice(1).join(' ');
      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (!user || !role) return message.reply('Gebruik: `!roleadd @gebruiker RolNaam`');
      await user.roles.add(role);
      message.reply(`${role.name} toegevoegd aan ${user.user.tag}`);
    }

    else if (command === 'roleremove') {
      const user = message.mentions.members.first();
      const roleName = args.slice(1).join(' ');
      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (!user || !role) return message.reply('Gebruik: `!roleremove @gebruiker RolNaam`');
      await user.roles.remove(role);
      message.reply(`${role.name} verwijderd van ${user.user.tag}`);
    }

    else if (command === 'invite') {
      message.reply('Gebruik deze link om de bot toe te voegen:\nhttps://discord.com/oauth2/authorize?client_id=1392443181395738735&permissions=8&integration_type=0&scope=bot');
    }

    else if (command === 'staffaanvraag') {
      const kandidaat = message.mentions.members.first();
      const rolNaam = args[1];
      const beslisser = message.member;

      if (!kandidaat || !rolNaam) {
        return message.reply('Gebruik: `!staffaanvraag @gebruiker RolNaam`');
      }

      const rol = message.guild.roles.cache.find(r => r.name === rolNaam);
      if (!rol) return message.reply('Rol niet gevonden.');

      const datum = new Date().toLocaleString('nl-NL');

      const embed = {
        title: '📝 Staff Aanvraag Log 📝',
        color: 0x00ff00,
        fields: [
          { name: '📅 Datum', value: datum },
          { name: '👤 Aanvrager', value: `${kandidaat}` },
          { name: '🎭 Aangevraagde Rol', value: `${rol.name}` },
          { name: '🛠️ Beslissing door', value: `${beslisser}` },
          { name: '📜 Status', value: '✅ Goedgekeurd' },
          { name: '👉 Tekst van Beslissing', value: `🎉 ${kandidaat} is **${rol.name}** geworden! Welkom in het team!` }
        ]
      };

      kandidaat.roles.add(rol).catch(console.error);
      message.channel.send({ content: '@everyone', embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
    message.reply('Er ging iets mis met het uitvoeren van het command.');
  }
});

client.login(process.env.TOKEN);
