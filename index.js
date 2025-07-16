const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// === CONFIG ===
const ADMIN_ROLE_ID = '1388216679066243252';
const STAFF_ROLE_ID = '1388111236511568003';

client.once('ready', () => {
  console.log(`Bot is ingelogd als ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // === JOINCODE (voor iedereen) ===
  if (command === 'joincode') {
    return message.reply('De servercode van 112RP is **wrfj91jj**');
  }

  // === STAFFAANVRAAG ===
  if (command === 'staffaanvraag') {
    const aangewezenUser = message.mentions.members.first();
    const beslisser = message.member;
    const rolNaam = args[1];

    if (!aangewezenUser || !rolNaam) {
      return message.reply('Gebruik: `!staffaanvraag @gebruiker RolNaam`');
    }

    const rol = message.guild.roles.cache.find(r => r.name.toLowerCase() === rolNaam.toLowerCase());
    if (!rol) return message.reply('Rol niet gevonden.');

    const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

    try {
      await aangewezenUser.roles.add(rol);

      const logKanaal = message.guild.channels.cache.find(c => c.name === 'staff-aanvragen-log');
      if (logKanaal) {
        const bericht = `📝 **Staff Aanvraag Log** 📝

📅 Datum: ${datum}
👤 Aanvrager: ${aangewezenUser}
🎭 Aangevraagde Rol: ${rol.name}
🛠️ Beslissing door: ${beslisser}
📜 Status: ✅ Goedgekeurd

✅ ${aangewezenUser} is **${rol.name}** geworden! Welkom in het team!`;
        logKanaal.send(bericht);
      }

      return message.reply(`${aangewezenUser} is succesvol toegevoegd aan de rol ${rol.name}.`);
    } catch (err) {
      console.error(err);
      return message.reply('Kon de rol niet toekennen.');
    }
  }

  // === CHECK PERMISSIES VOOR MOD-COMMANDS ===
  const isMod = message.member.roles.cache.has(ADMIN_ROLE_ID) || message.member.roles.cache.has(STAFF_ROLE_ID);

  // === MOD COMMANDS ===
  if (command === 'ban') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const user = message.mentions.members.first();
    if (!user) return message.reply('Geef een gebruiker om te bannen.');
    if (!user.bannable) return message.reply('Ik kan deze gebruiker niet bannen.');
    await user.ban();
    return message.reply(`${user.user.tag} is geband.`);
  }

  if (command === 'kick') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const user = message.mentions.members.first();
    if (!user) return message.reply('Geef een gebruiker om te kicken.');
    if (!user.kickable) return message.reply('Ik kan deze gebruiker niet kicken.');
    await user.kick();
    return message.reply(`${user.user.tag} is gekickt.`);
  }

  if (command === 'timeout') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const user = message.mentions.members.first();
    const tijd = parseInt(args[1]) || 600;
    if (!user || !user.moderatable) return message.reply('Kan gebruiker geen timeout geven.');
    await user.timeout(tijd * 1000);
    return message.reply(`${user.user.tag} heeft een timeout van ${tijd} seconden.`);
  }

  if (command === 'deletechannel') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const channel = message.mentions.channels.first() || message.channel;
    message.reply(`Kanaal ${channel.name} wordt verwijderd over 60 minuten.`);
    setTimeout(() => {
      channel.delete().catch(console.error);
    }, 60 * 60 * 1000);
  }

  if (command === 'purge') {
    if (!isMod) return message.reply('Je hebt geen permissies voor dit command.');
    const user = message.mentions.users.first();
    const channel = message.channel;
    if (!channel.permissionsFor(message.member).has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply('Geen permissie om berichten te verwijderen.');
    }

    let fetched;
    do {
      fetched = await channel.messages.fetch({ limit: 100 });
      const messagesToDelete = fetched.filter(m => user ? m.author.id === user.id : true);
      if (messagesToDelete.size > 0) {
        await channel.bulkDelete(messagesToDelete, true);
      }
    } while (fetched.size >= 2);

    return message.reply('Berichten verwijderd.');
  }

  if (command === 'invite') {
    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
    return message.reply(`Voeg de bot toe met deze link:\n${inviteLink}`);
  }
});

client.login(process.env.TOKEN);
