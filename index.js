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

// Webserver voor Render keep-alive
app.get('/', (req, res) => res.send('Bot is online!'));
app.listen(3000, () => console.log('Webserver draait op poort 3000 (keep-alive)'));

client.once('ready', () => {
  console.log(`✅ Bot is ingelogd als ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return message.reply('⛔ Je hebt geen permissies voor dit command.');
  }

  try {
    if (command === 'ban') {
      const user = message.mentions.members.first();
      if (!user || !user.bannable) return message.reply('⛔ Kan deze gebruiker niet bannen.');
      await user.ban();
      message.reply(`${user.user.tag} is geband.`);
    }

    else if (command === 'kick') {
      const user = message.mentions.members.first();
      if (!user || !user.kickable) return message.reply('⛔ Kan deze gebruiker niet kicken.');
      await user.kick();
      message.reply(`${user.user.tag} is gekickt.`);
    }

    else if (command === 'softban') {
      const user = message.mentions.members.first();
      if (!user || !user.bannable) return message.reply('⛔ Kan deze gebruiker niet softbannen.');
      await user.ban({ deleteMessageDays: 7 });
      await message.guild.members.unban(user.id);
      message.reply(`${user.user.tag} is softgebanned.`);
    }

    else if (command === 'timeout') {
      const user = message.mentions.members.first();
      const tijd = parseInt(args[1]) || 600;
      if (!user || !user.moderatable) return message.reply('⛔ Kan deze gebruiker geen timeout geven.');
      await user.timeout(tijd * 1000);
      message.reply(`${user.user.tag} heeft een timeout van ${tijd} seconden.`);
    }

    else if (command === 'deletechannel') {
      const channel = message.mentions.channels.first() || message.channel;
      message.reply(`⏳ Channel ${channel.name} wordt verwijderd over 60 minuten.`);
      setTimeout(() => {
        channel.delete().catch(console.error);
      }, 60 * 60 * 1000);
    }

    else if (command === 'purge') {
      const user = message.mentions.users.first();
      const channel = message.channel;
      if (!channel.permissionsFor(message.member).has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply('⛔ Je hebt geen permissie om berichten te verwijderen.');
      }

      let fetched;
      do {
        fetched = await channel.messages.fetch({ limit: 100 });
        const messagesToDelete = fetched.filter(m => user ? m.author.id === user.id : true);
        if (messagesToDelete.size > 0) {
          await channel.bulkDelete(messagesToDelete, true);
        }
      } while (fetched.size >= 2);

      message.reply('🧹 Berichten verwijderd.');
    }

    else if (command === 'addrole') {
      const user = message.mentions.members.first();
      const roleName = args.slice(1).join(' ');
      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (!user || !role) return message.reply('⛔ Gebruiker of rol niet gevonden.');
      await user.roles.add(role);
      message.reply(`${role.name} toegevoegd aan ${user.user.tag}`);
    }

    else if (command === 'removerole') {
      const user = message.mentions.members.first();
      const roleName = args.slice(1).join(' ');
      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (!user || !role) return message.reply('⛔ Gebruiker of rol niet gevonden.');
      await user.roles.remove(role);
      message.reply(`${role.name} verwijderd van ${user.user.tag}`);
    }

    else if (command === 'invite') {
      const invite = await message.channel.createInvite({ maxAge: 0, maxUses: 0 });
      message.reply(`🔗 Server invite: ${invite.url}`);
    }

    else if (command === 'staffaanvraag') {
      const target = message.mentions.members.first();
      const roleName = args[1];
      const beslisser = message.member;
      const role = message.guild.roles.cache.find(r => r.name === roleName);
      if (!target || !role) return message.reply('⛔ Gebruiker of rol niet gevonden.');

      const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

      const log = `📝 **Staff Aanvraag Log** 📝

📅 **Datum:** ${datum}
👤 **Aanvrager:** ${target}
🎭 **Aangevraagde Rol:** ${role.name}
🛠️ **Beslissing door:** ${beslisser}
📜 **Status:** ✅ Goedgekeurd

✅ **Goedgekeurd:**
🎉 ${target} is **${role.name}** geworden! Welkom in het team!`;

      await target.roles.add(role);
      message.channel.send(log);
    }

  } catch (err) {
    console.error(err);
    message.reply('⛔ Er ging iets mis bij het uitvoeren van het command.');
  }
});

// Zorg dat je je token goed instelt via Render dashboard als environment variable!
client.login(process.env.TOKEN);
