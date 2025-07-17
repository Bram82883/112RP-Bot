const express = require('express');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const app = express();
const PORT = process.env.PORT || 3000;

// === Keep-alive endpoint ===
app.get('/', (req, res) => {
  res.send('Bot is alive!');
});
app.listen(PORT, () => console.log(`Webserver running on port ${PORT}`));

// === DISCORD BOT ===
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
const TICKET_CATEGORY_ID = '1390451461539758090';

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
  await channel.setTopic(nieuwTopic).catch(() => {});
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

  await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false, SendMessages: false });
  if (staffRole) await channel.permissionOverwrites.edit(staffRole, { ViewChannel: true, SendMessages: false });
  if (adminRole) await channel.permissionOverwrites.edit(adminRole, { ViewChannel: true, SendMessages: false });

  const openerId = getOpenerIdFromChannelName(channel.name);
  if (openerId && openerId !== claimerMember.id) {
    await channel.permissionOverwrites.edit(openerId, { ViewChannel: true, SendMessages: true });
  }

  await channel.permissionOverwrites.edit(claimerMember.id, { ViewChannel: true, SendMessages: true });
  if (roleType === 'staff' && adminRole) {
    await channel.permissionOverwrites.edit(adminRole, { ViewChannel: true, SendMessages: true });
  }
}

async function addMemberToTicket(channel, memberId) {
  await channel.permissionOverwrites.edit(memberId, { ViewChannel: true, SendMessages: true });
}

// === BOT READY ===
client.once('ready', () => {
  console.log(`Bot ingelogd als ${client.user.tag}`);
});

// === COMMAND HANDLER ===
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'joincode') {
    return message.reply('De servercode van 112RP is **wrfj91jj**');
  }

  const isMod = message.member.roles.cache.has(ADMIN_ROLE_ID) || message.member.roles.cache.has(STAFF_ROLE_ID);

  if (command === 'ban') {
    if (!isMod) return message.reply('Geen permissie.');
    const user = message.mentions.members.first();
    if (!user) return message.reply('Geef een gebruiker.');
    await user.ban();
    return message.reply(`${user.user.tag} is geband.`);
  }

  if (command === 'kick') {
    if (!isMod) return message.reply('Geen permissie.');
    const user = message.mentions.members.first();
    if (!user) return message.reply('Geef een gebruiker.');
    await user.kick();
    return message.reply(`${user.user.tag} is gekickt.`);
  }

  if (command === 'timeout') {
    if (!isMod) return message.reply('Geen permissie.');
    const user = message.mentions.members.first();
    const tijd = parseInt(args[1]) || 600;
    await user.timeout(tijd * 1000);
    return message.reply(`${user.user.tag} timeout ${tijd} seconden.`);
  }

  if (command === 'claim') {
    if (!isInTicketCategory(message.channel)) return message.reply('Alleen in ticket-kanalen.');
    const member = message.member;
    const roleType = hasAdmin(member) ? 'admin' : hasStaff(member) ? 'staff' : null;
    if (!roleType) return message.reply('Geen rechten om te claimen.');
    await applyClaimPermissions(message.channel, { claimerMember: member, roleType });
    await setClaimInTopic(message.channel, member.id, roleType);
    return message.reply(`Ticket geclaimd door ${member}.`);
  }

  if (command === 'memberticket') {
    if (!isInTicketCategory(message.channel)) return message.reply('Alleen in ticket-kanalen.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('Gebruik: `!memberticket @gebruiker`');
    await addMemberToTicket(message.channel, target.id);
    return message.reply(`${target} toegevoegd aan ticket.`);
  }
});

client.login(process.env.TOKEN);
