const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const prefix = '!';

client.once('ready', () => {
  console.log(`Bot is ingelogd als ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Check of gebruiker moderator permissies heeft
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

      const tijd = parseInt(args[0]) || 600; // tijd in seconden, standaard 10 minuten
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

    else if (command === 'addrole') {
      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om de rol aan toe te voegen.');

      const roleName = args.slice(1).join(' ');
      if (!roleName) return message.reply('Geef een rolnaam op.');

      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (!role) return message.reply('Rol niet gevonden.');

      await user.roles.add(role);
      message.reply(`${role.name} is toegevoegd aan ${user.user.tag}.`);
    }

    else if (command === 'removerole') {
      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om de rol van te verwijderen.');

      const roleName = args.slice(1).join(' ');
      if (!roleName) return message.reply('Geef een rolnaam op.');

      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (!role) return message.reply('Rol niet gevonden.');

      await user.roles.remove(role);
      message.reply(`${role.name} is verwijderd van ${user.user.tag}.`);
    }

    else if (command === 'staffaanvraag') {
      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef de gebruiker aan die de rol moet krijgen.');

      const roleName = args[1];
      if (!roleName) return message.reply('Geef een rolnaam op.');

      const beslisser = message.mentions.members.last();
      if (!beslisser) return message.reply('Geef aan wie de beslissing heeft genomen.');

      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (!role) return message.reply('Rol niet gevonden.');

      // Voeg de rol toe
      await user.roles.add(role);

      // Maak embed bericht
      const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

      const embed = {
        color: 0x0099ff,
        title: '📝 Staff Aanvraag Log 📝',
        fields: [
          { name: '📅 Datum', value: datum },
          { name: '👤 Aanvrager', value: `<@${user.id}>` },
          { name: '🎭 Aangevraagde Rol', value: role.name },
          { name: '🛠️ Beslissing door', value: `<@${beslisser.id}>` },
          { name: '📜 Status', value: '✅ Goedgekeurd' },
          { name: '📌 Reden', value: 'Is een goeie Kmar agent en kent de regels uit zn hoofd!' },
          { name: '👉 Tekst van Beslissing', value: `✅ <@${user.id}> is ${role.name} geworden! Welkom in het team!` },
        ],
        timestamp: new Date(),
      };

      message.channel.send({ embeds: [embed] });
      message.reply(`${user.user.tag} heeft de rol ${role.name} gekregen.`);
    }

    else if (command === 'invite') {
      message.channel.send('Hier is de invite link voor de bot:\nhttps://discord.com/oauth2/authorize?client_id=1392443181395738735&permissions=8&integration_type=0&scope=bot');
    }

  } catch (err) {
    console.error(err);
    message.reply('Er ging iets mis met het uitvoeren van het command.');
  }
});

client.login(process.env.TOKEN);
