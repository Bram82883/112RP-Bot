const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// IDs, pas aan naar jouw server:
const ADMIN_ROLE_ID = '1388216679066243252';
const STAFF_ROLE_ID = '1388111236511568003';
const TICKET_CATEGORY_ID = '1390451461539758090';

// Helpers (kopieer deze functies van je oude bot)
function parseClaimFromTopic(topic) {
  if (!topic) return null;
  const match = topic.match(/Claimed by: <@!?(\d+)>/);
  return match ? match[1] : null;
}

// Event: Bot is ready
client.once('ready', () => {
  console.log(`Bot is ingelogd als ${client.user.tag}`);
});

// Slash command handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options, member, guild, channel } = interaction;
  const isMod = member.roles.cache.has(ADMIN_ROLE_ID) || member.roles.cache.has(STAFF_ROLE_ID);

  try {
    // --- joincode ---
    if (commandName === 'joincode') {
      return interaction.reply('De servercode van 112RP is **wrfj91jj**');
    }

    // --- staffaanvraag ---
    if (commandName === 'staffaanvraag') {
      if (!isMod) return interaction.reply({ content: 'Geen permissie.', ephemeral: true });

      const user = options.getUser('gebruiker');
      const rolNaam = options.getString('rolnaam');
      const memberToAdd = guild.members.cache.get(user.id);
      const rol = guild.roles.cache.find(r => r.name.toLowerCase() === rolNaam.toLowerCase());

      if (!rol) return interaction.reply({ content: 'Rol niet gevonden.', ephemeral: true });

      await memberToAdd.roles.add(rol);

      const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
      const logKanaal = guild.channels.cache.find(c => c.name === 'staff-aanvragen-log');
      if (logKanaal) {
        logKanaal.send(`📝 **Staff Aanvraag Log**\n📅 ${datum}\n👤 Aanvrager: ${user}\n🎭 Rol: ${rol.name}\n🛠️ Door: ${member}\n✅ Rol toegevoegd!`);
      }

      return interaction.reply(`${user} is succesvol toegevoegd aan ${rol.name}.`);
    }

    // --- ban ---
    if (commandName === 'ban') {
      if (!isMod) return interaction.reply({ content: 'Geen permissie.', ephemeral: true });

      const user = options.getUser('gebruiker');
      const memberToBan = guild.members.cache.get(user.id);
      if (!memberToBan.bannable) return interaction.reply({ content: 'Kan deze gebruiker niet bannen.', ephemeral: true });

      await memberToBan.ban();
      return interaction.reply(`${user.tag} is geband.`);
    }

    // --- kick ---
    if (commandName === 'kick') {
      if (!isMod) return interaction.reply({ content: 'Geen permissie.', ephemeral: true });

      const user = options.getUser('gebruiker');
      const memberToKick = guild.members.cache.get(user.id);
      if (!memberToKick.kickable) return interaction.reply({ content: 'Kan deze gebruiker niet kicken.', ephemeral: true });

      await memberToKick.kick();
      return interaction.reply(`${user.tag} is gekickt.`);
    }

    // --- timeout ---
    if (commandName === 'timeout') {
      if (!isMod) return interaction.reply({ content: 'Geen permissie.', ephemeral: true });

      const user = options.getUser('gebruiker');
      const tijd = options.getInteger('tijd') || 600; // 10 minuten standaard
      const memberToTimeout = guild.members.cache.get(user.id);
      if (!memberToTimeout.moderatable) return interaction.reply({ content: 'Kan geen timeout geven.', ephemeral: true });

      await memberToTimeout.timeout(tijd * 1000);
      return interaction.reply(`${user.tag} heeft een timeout van ${tijd} seconden gekregen.`);
    }

    // --- deletechannel ---
    if (commandName === 'deletechannel') {
      if (!isMod) return interaction.reply({ content: 'Geen permissie.', ephemeral: true });

      const kanaal = options.getChannel('kanaal') || channel;
      await interaction.reply(`Kanaal ${kanaal.name} wordt verwijderd over 60 minuten.`);
      setTimeout(() => {
        kanaal.delete().catch(console.error);
      }, 60 * 60 * 1000);
    }

    // --- purge ---
    if (commandName === 'purge') {
      if (!isMod) return interaction.reply({ content: 'Geen permissie.', ephemeral: true });

      const user = options.getUser('gebruiker');
      let fetched;
      if (user) {
        // delete laatste 50 berichten van user in dit kanaal
        fetched = await channel.messages.fetch({ limit: 50 });
        const messagesToDelete = fetched.filter(m => m.author.id === user.id);
        await channel.bulkDelete(messagesToDelete);
        return interaction.reply({ content: `Verwijderde berichten van ${user.tag}`, ephemeral: true });
      } else {
        // delete laatste 50 berichten
        await channel.bulkDelete(50);
        return interaction.reply({ content: 'Laatste 50 berichten verwijderd.', ephemeral: true });
      }
    }

    // --- invite ---
    if (commandName === 'invite') {
      return interaction.reply('Hier is de invite link: https://discord.gg/invitecode');
    }

    // --- claim ticket ---
    if (commandName === 'claim') {
      if (!channel.parentId || channel.parentId !== TICKET_CATEGORY_ID) {
        return interaction.reply({ content: 'Dit commando werkt alleen in ticketkanalen.', ephemeral: true });
      }
      const claimer = member.id;
      const oldClaimer = parseClaimFromTopic(channel.topic);
      if (oldClaimer) {
        return interaction.reply({ content: `Ticket is al geclaimd door <@${oldClaimer}>`, ephemeral: true });
      }
      await channel.setTopic(`${channel.topic || ''}\nClaimed by: <@${claimer}>`);
      return interaction.reply(`Ticket succesvol geclaimd door <@${claimer}>`);
    }

    // --- memberticket ---
    if (commandName === 'memberticket') {
      if (!channel.parentId || channel.parentId !== TICKET_CATEGORY_ID) {
        return interaction.reply({ content: 'Dit commando werkt alleen in ticketkanalen.', ephemeral: true });
      }
      if (!isMod) return interaction.reply({ content: 'Geen permissie.', ephemeral: true });

      const user = options.getUser('gebruiker');
      const permOverwrites = channel.permissionOverwrites;

      await channel.permissionOverwrites.edit(user, { ViewChannel: true, SendMessages: true });
      return interaction.reply(`${user} is toegevoegd aan het ticket.`);
    }

  } catch (err) {
    console.error(err);
    return interaction.reply({ content: 'Er is iets fout gegaan.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
