const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

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
const TICKET_CATEGORY_ID = '1390451461539758090'; // Ticketcategorie waar !claim werkt

// EXPRESS SERVER VOOR UPTIME BOT
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`Express draait op poort ${PORT}`));

// === HELPER FUNCTIES (je eigen code) ===
const CLAIM_REGEX = /\|CLAIM:(\d+):(staff|admin)\|/i;

function parseClaimFromTopic(topic) {
  if (!topic) return null;
  const m = topic.match(CLAIM_REGEX);
  if (!m) return null;
  return { userId: m[1], roleType: m[2].toLowerCase() };
}

async function setClaimInTopic(channel, userId, roleType) {
  const oldTopic = channel.topic || '';
  const cleaned = oldTopic.replace(CLAIM_REGEX, '').trim();
  const nieuwTopic = `${cleaned}${cleaned.length ? ' ' : ''}|CLAIM:${userId}:${roleType}|`;
  try {
    await channel.setTopic(nieuwTopic);
  } catch (err) {
    console.warn(`[setClaimInTopic] kon topic niet zetten in #${channel.name}:`, err.message);
  }
}

function isInTicketCategory(channel) {
  return channel.parentId === TICKET_CATEGORY_ID;
}

function hasAdmin(member) {
  return member.roles.cache.has(ADMIN_ROLE_ID);
}

function hasStaff(member) {
  return member.roles.cache.has(STAFF_ROLE_ID);
}

function getOpenerIdFromChannelName(name) {
  if (!name) return null;
  const m = name.match(/(\d{15,})$/);
  return m ? m[1] : null;
}

async function applyClaimPermissions(channel, { claimerMember, roleType }) {
  const guild = channel.guild;
  const everyoneRole = guild.roles.everyone;
  const staffRole = guild.roles.cache.get(STAFF_ROLE_ID);
  const adminRole = guild.roles.cache.get(ADMIN_ROLE_ID);

  await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false, SendMessages: false }).catch(console.error);

  if (staffRole) {
    await channel.permissionOverwrites.edit(staffRole, { ViewChannel: true, SendMessages: false }).catch(console.error);
  }

  if (adminRole) {
    await channel.permissionOverwrites.edit(adminRole, { ViewChannel: true, SendMessages: false }).catch(console.error);
  }

  const openerId = getOpenerIdFromChannelName(channel.name);
  if (openerId && openerId !== claimerMember.id) {
    await channel.permissionOverwrites.edit(openerId, { ViewChannel: true, SendMessages: true }).catch(console.error);
  }

  await channel.permissionOverwrites.edit(claimerMember.id, { ViewChannel: true, SendMessages: true }).catch(console.error);

  if (roleType === 'staff' && adminRole) {
    await channel.permissionOverwrites.edit(adminRole, { ViewChannel: true, SendMessages: true }).catch(console.error);
  }
}

async function addMemberToTicket(channel, memberId) {
  await channel.permissionOverwrites.edit(memberId, { ViewChannel: true, SendMessages: true }).catch(console.error);
}

// === SLASH COMMAND DEFINITIES ===
const commands = [
  new SlashCommandBuilder()
    .setName('joincode')
    .setDescription('Geef de servercode van 112RP'),
  new SlashCommandBuilder()
    .setName('staffaanvraag')
    .setDescription('Vraag een staff rol aan')
    .addUserOption(option => option.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
    .addStringOption(option => option.setName('rolnaam').setDescription('De rolnaam').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban een gebruiker')
    .addUserOption(option => option.setName('gebruiker').setDescription('De gebruiker om te bannen').setRequired(true)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick een gebruiker')
    .addUserOption(option => option.setName('gebruiker').setDescription('De gebruiker om te kicken').setRequired(true)),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout een gebruiker')
    .addUserOption(option => option.setName('gebruiker').setDescription('De gebruiker').setRequired(true))
    .addIntegerOption(option => option.setName('tijd').setDescription('Tijd in seconden (default 600)')),
  new SlashCommandBuilder()
    .setName('deletechannel')
    .setDescription('Verwijder een kanaal over 60 minuten')
    .addChannelOption(option => option.setName('kanaal').setDescription('Kanaal om te verwijderen')),
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Verwijder berichten (optioneel van gebruiker)')
    .addUserOption(option => option.setName('gebruiker').setDescription('Gebruiker om berichten van te verwijderen')),
  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Geef de invite link van de bot'),
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim een ticket kanaal'),
  new SlashCommandBuilder()
    .setName('memberticket')
    .setDescription('Voeg een lid toe aan het ticket kanaal')
    .addUserOption(option => option.setName('gebruiker').setDescription('Gebruiker om toe te voegen').setRequired(true))
];

// Register slash commands bij Discord (globaal)
client.once('ready', async () => {
  console.log(`Bot is ingelogd als ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    console.log('Slash commands registreren...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log('Slash commands geregistreerd!');
  } catch (err) {
    console.error('Fout bij registreren slash commands:', err);
  }
});

// Event handler voor slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const member = interaction.member;
  const isMod = hasAdmin(member) || hasStaff(member);

  switch(interaction.commandName) {
    case 'joincode':
      return interaction.reply('De servercode van 112RP is **wrfj91jj**');

    case 'staffaanvraag': {
      if (!isMod) return interaction.reply({ content: 'Je hebt geen permissies voor dit command.', ephemeral: true });
      const target = interaction.options.getUser('gebruiker');
      const rolnaam = interaction.options.getString('rolnaam');
      const rol = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === rolnaam.toLowerCase());
      if (!rol) return interaction.reply({ content: 'Rol niet gevonden.', ephemeral: true });

      try {
        const guildMember = await interaction.guild.members.fetch(target.id);
        await guildMember.roles.add(rol);
        const logKanaal = interaction.guild.channels.cache.find(c => c.name === 'staff-aanvragen-log');
        const datum = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

        if (logKanaal) {
          logKanaal.send(`📝 **Staff Aanvraag Log** 📝\n\n📅 Datum: ${datum}\n👤 Aanvrager: ${target}\n🎭 Aangevraagde Rol: ${rol.name}\n🛠️ Beslissing door: ${interaction.user}\n📜 Status: ✅ Goedgekeurd\n\n✅ ${target} is **${rol.name}** geworden! Welkom in het team!`);
        }

        return interaction.reply(`${target} is succesvol toegevoegd aan de rol ${rol.name}.`);
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: 'Kon de rol niet toekennen.', ephemeral: true });
      }
    }

    case 'ban': {
      if (!isMod) return interaction.reply({ content: 'Je hebt geen permissies voor dit command.', ephemeral: true });
      const target = interaction.options.getMember('gebruiker');
      if (!target) return interaction.reply({ content: 'Gebruiker niet gevonden.', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: 'Ik kan deze gebruiker niet bannen.', ephemeral: true });

      await target.ban();
      return interaction.reply(`${target.user.tag} is geband.`);
    }

    case 'kick': {
      if (!isMod) return interaction.reply({ content: 'Je hebt geen permissies voor dit command.', ephemeral: true });
      const target = interaction.options.getMember('gebruiker');
      if (!target) return interaction.reply({ content: 'Gebruiker niet gevonden.', ephemeral: true });
      if (!target.kickable) return interaction.reply({ content: 'Ik kan deze gebruiker niet kicken.', ephemeral: true });

      await target.kick();
      return interaction.reply(`${target.user.tag} is gekickt.`);
    }

    case 'timeout': {
      if (!isMod) return interaction.reply({ content: 'Je hebt geen permissies voor dit command.', ephemeral: true });
      const target = interaction.options.getMember('gebruiker');
      if (!target || !target.moderatable) return interaction.reply({ content: 'Kan gebruiker geen timeout geven.', ephemeral: true });
      const tijd = interaction.options.getInteger('tijd') || 600;
      await target.timeout(tijd * 1000);
      return interaction.reply(`${target.user.tag} heeft een timeout van ${tijd} seconden.`);
    }

    case 'deletechannel': {
      if (!isMod) return interaction.reply({ content: 'Je hebt geen permissies voor dit command.', ephemeral: true });
      const kanaal = interaction.options.getChannel('kanaal') || interaction.channel;
      interaction.reply(`Kanaal ${kanaal.name} wordt verwijderd over 60 minuten.`);
      setTimeout(() => {
        kanaal.delete().catch(console.error);
      }, 60 * 60 * 1000);
      break;
    }

    case 'purge': {
      if (!isMod) return interaction.reply({ content: 'Je hebt geen permissies voor dit command.', ephemeral: true });
      const target = interaction.options.getUser('gebruiker');
      const channel = interaction.channel;
      if (!channel.permissionsFor(interaction.member).has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({ content: 'Geen permissie om berichten te verwijderen.', ephemeral: true });
      }

      let fetched;
      do {
        fetched = await channel.messages.fetch({ limit: 100 });
        const messagesToDelete = fetched.filter(m => target ? m.author.id === target.id : true);
        if (messagesToDelete.size > 0) {
          await channel.bulkDelete(messagesToDelete, true);
        }
      } while (fetched.size >= 2);

      return interaction.reply('Berichten verwijderd.');
    }

    case 'invite': {
      const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot`;
      return interaction.reply(`Voeg de bot toe met deze link:\n${inviteLink}`);
    }

    case 'claim': {
      if (!isInTicketCategory(interaction.channel)) {
        return interaction.reply({ content: 'Dit command kan alleen in ticket-kanalen.', ephemeral: true });
      }

      const member = interaction.member;
      const roleType = hasAdmin(member) ? 'admin' : hasStaff(member) ? 'staff' : null;
      if (!roleType) {
        return interaction.reply({ content: 'Je hebt geen rechten om dit ticket te claimen.', ephemeral: true });
      }

      const claimInfo = parseClaimFromTopic(interaction.channel.topic);
      if (claimInfo && claimInfo.userId === member.id) {
        return interaction.reply({ content: 'Je hebt dit ticket al geclaimd.', ephemeral: true });
      }

      try {
        await applyClaimPermissions(interaction.channel, { claimerMember: member, roleType });
        await setClaimInTopic(interaction.channel, member.id, roleType);
        return interaction.reply(`Ticket geclaimd door ${member}.`);
      } catch (err) {
        console.error('[claim] error:', err);
        return interaction.reply({ content: 'Kon ticket niet claimen (permissions?).', ephemeral: true });
      }
    }

    case 'memberticket': {
      if (!isInTicketCategory(interaction.channel)) {
        return interaction.reply({ content: 'Dit command kan alleen in ticket-kanalen.', ephemeral: true });
      }

      const execMember = interaction.member;
      const claimInfo = parseClaimFromTopic(interaction.channel.topic);
      const isClaimer = claimInfo && claimInfo.userId === execMember.id;
      const mag = isClaimer || hasAdmin(execMember) || hasStaff(execMember);
      if (!mag) {
        return interaction.reply({ content: 'Je hebt geen rechten om iemand toe te voegen aan dit ticket.', ephemeral: true });
      }

      const target = interaction.options.getMember('gebruiker');
      if (!target) {
        return interaction.reply({ content: 'Gebruik: /memberticket gebruiker', ephemeral: true });
      }

      try {
        await addMemberToTicket(interaction.channel, target.id);
        return interaction.reply(`${target} is toegevoegd aan dit ticket (mag typen).`);
      } catch (err) {
        console.error('[memberticket] error:', err);
        return interaction.reply({ content: 'Kon gebruiker niet toevoegen.', ephemeral: true });
      }
    }

    default:
      return interaction.reply({ content: 'Onbekend command.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
