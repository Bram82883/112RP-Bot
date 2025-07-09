const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
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

  // Check permissies voor commands die dat nodig hebben
  const member = message.member;

  try {
    if (command === 'ban') {
      if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
        return message.reply('Je hebt geen permissies voor dit command.');

      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om te bannen.');
      if (!user.bannable) return message.reply('Ik kan deze gebruiker niet bannen.');

      await user.ban();
      message.reply(`${user.user.tag} is geband.`);
    }

    else if (command === 'kick') {
      if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
        return message.reply('Je hebt geen permissies voor dit command.');

      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om te kicken.');
      if (!user.kickable) return message.reply('Ik kan deze gebruiker niet kicken.');

      await user.kick();
      message.reply(`${user.user.tag} is gekickt.`);
    }

    else if (command === 'softban') {
      if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
        return message.reply('Je hebt geen permissies voor dit command.');

      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om te softbannen.');
      if (!user.bannable) return message.reply('Ik kan deze gebruiker niet bannen.');

      await user.ban({ deleteMessageDays: 7 });
      await message.guild.members.unban(user.id);
      message.reply(`${user.user.tag} is softgebanned.`);
    }

    else if (command === 'timeout') {
      if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
        return message.reply('Je hebt geen permissies voor dit command.');

      const user = message.mentions.members.first();
      if (!user) return message.reply('Geef een gebruiker om een time-out te geven.');
      if (!user.moderatable) return message.reply('Ik kan deze gebruiker geen time-out geven.');

      const tijd = parseInt(args[1]) || 600; // in seconden, default 10 min
      await user.timeout(tijd * 1000);
      message.reply(`${user.user.tag} heeft een time-out gekregen van ${tijd} seconden.`);
    }

    else if (command === 'deletechannel') {
      if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels))
        return message.reply('Je hebt geen permissies om kanalen te verwijderen.');

      const channel = message.mentions.channels.first() || message.channel;
      message.reply(`Kanaal ${channel.name} wordt verwijderd over 60 minuten.`);

      setTimeout(() => {
        channel.delete().catch(console.error);
      }, 60 * 60 * 1000);
    }

    else if (command === 'purge') {
      if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages))
        return message.reply('Je hebt geen permissies om berichten te verwijderen.');

      const user = message.mentions.users.first();
      const channel = message.channel;

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
      if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles))
        return message.reply('Je hebt geen permissies om rollen toe te voegen.');

      const user = message.mentions.members.first();
      const role = message.mentions.roles.first();
      if (!user || !role) return message.reply('Gebruik: !addrole @gebruiker @rol');

      if (message.guild.members.me.roles.highest.position <= role.position) {
        return message.reply('Ik kan deze rol niet toevoegen, hij staat boven mijn hoogste rol.');
      }

      await user.roles.add(role);
      message.reply(`Rol ${role.name} is toegevoegd aan ${user.user.tag}.`);
    }

    else if (command === 'removerole') {
      if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles))
        return message.reply('Je hebt geen permissies om rollen te verwijderen.');

      const user = message.mentions.members.first();
      const role = message.mentions.roles.first();
      if (!user || !role) return message.reply('Gebruik: !removerole @gebruiker @rol');

      if (message.guild.members.me.roles.highest.position <= role.position) {
        return message.reply('Ik kan deze rol niet verwijderen, hij staat boven mijn hoogste rol.');
      }

      await user.roles.remove(role);
      message.reply(`Rol ${role.name} is verwijderd van ${user.user.tag}.`);
    }

    else if (command === 'invite') {
      if (!member.permissions.has(PermissionsBitField.Flags.CreateInstantInvite))
        return message.reply('Je hebt geen permissies om invites te maken.');

      const invite = await message.channel.createInvite({
        maxAge: 3600,
        maxUses: 1,
        unique: true
      });
      message.reply(`Hier is je invite link: ${invite.url}`);
    }

    else if (command === 'staffgoedkeuring') {
      // args: @user @role beslisserNaam (laatste woord)
      const user = message.mentions.members.first();
      const role = message.mentions.roles.first();
      const beslisser = args[args.length - 1];

      if (!user || !role || !beslisser) {
        return message.reply('Gebruik: !staffgoedkeuring @gebruiker @rol beslisser_naam');
      }

      if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return message.reply('Je hebt geen permissies om dit te doen.');
      }

      // Datum en tijd
      const now = new Date();
      const formattedDate = now.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

      const logbericht = `@everyone

📝 Staff Aanvraag Log 📝

📅 Datum: ${formattedDate}
👤 Aanvrager: ${user}
🎭 Aangevraagde Rol: ${role}
🛠️ Beslissing door: ${beslisser}
📜 Status: ✅ Goedgekeurd
📌 Reden: Is een goeie Kmar agent en kent de regels uit zn hoofd!

👉 Tekst van Beslissing:

✅ Goedgekeurd:
🎉 ${user} is ${role} geworden! Welkom in het team!`;

      await message.channel.send(logbericht);
    }

  } catch (error) {
    console.error(error);
    message.reply('Er ging iets mis bij het uitvoeren van het command.');
  }
});

client.login(process.env.TOKEN);
