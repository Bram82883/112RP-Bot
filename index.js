const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const express = require('express');
const app = express();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Simpele webserver voor uptime monitor
app.get('/', (req, res) => {
  res.send('Bot is online!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webserver draait op poort ${PORT}`);
});

client.once('ready', () => {
  console.log(`Bot is ingelogd als ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Controleer permissies
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
      message.reply(`Channel ${channel.name} wordt verwijderd over 60 minuten.`);

      setTimeout(() => {
        channel.delete().catch(console.error);
      }, 60 * 60 * 1000); // 60 minuten
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
      const roleName = args.join(' ');
      if (!user) return message.reply('Geef een gebruiker om de rol aan te geven.');
      if (!roleName) return message.reply('Geef een rolename om toe te voegen.');

      const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
      if (!role) return message.reply('Rol niet gevonden.');

      await user.roles.add(role);
      message.reply(`${user.user.tag} heeft de rol ${role.name} gekregen.`);
    }

    else if (command === 'roleremove') {
      const user = message.mentions.members.first();
      const roleName = args.join(' ');
      if (!user) return message.reply('Geef een gebruiker om de rol te verwijderen.');
      if (!roleName) return message.reply('Geef een rolename om te verwijderen.');

      const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
      if (!role) return message.reply('Rol niet gevonden.');

      await user.roles.remove(role);
      message.reply(`${user.user.tag} is de rol ${role.name} kwijt.`);
    }

    else if (command === 'invite') {
      message.reply('Hier is de invite link: https://discord.com/oauth2/authorize?client_id=1392443181395738735&permissions=8&integration_type=0&scope=bot');
    }

    else if (command === 'staffaanvraag') {
      const staffUser = message.mentions.members.first();
      const roleName = args[1];
      const beslisser = message.author;
      const datum = new Date().toLocaleString('nl-NL');

      if (!staffUser) return message.reply('Geef een gebruiker op voor de staff aanvraag.');
      if (!roleName) return message.reply('Geef een rolnaam op.');
      const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
      if (!role) return message.reply('Rol niet gevonden.');

      // Bericht opmaken
      const aanvraagBericht = `
@everyone

📝 **Staff Aanvraag Log** 📝

📅 Datum: ${datum}
👤 Aanvrager: ${staffUser}
🎭 Aangevraagde Rol: ${role.name}
🛠️ Beslissing door: ${beslisser}
📜 Status: ✅ Goedgekeurd
📌 Reden: Is een goeie Kmar agent en kent de regels uit zn hoofd!

👉 Tekst van Beslissing:

✅ Goedgekeurd:
🎉 ${staffUser} is ${role.name} geworden! Welkom in het team!
      `;

      message.channel.send(aanvraagBericht);

      await staffUser.roles.add(role);
    }

  } catch (err) {
    console.error(err);
    message.reply('Er ging iets mis met het uitvoeren van het command.');
  }
});

client.login(process.env.TOKEN);
