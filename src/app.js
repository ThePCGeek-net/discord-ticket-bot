require('dotenv').config();
const express = require('express');
const http = require('http');
const app = express();
const router = express.Router();
const db = require('./database');
const Ticket = require('./models/Ticket');
const TicketConfig = require('./models/TicketConfig');

const Discord = require('discord.js');
const { MessageEmbed } = require('discord.js');
const client = new Discord.Client({ partials: ['MESSAGE', 'REACTION'] });

const packageJSON = require("../package.json");
const token = process.env.BOT_TOKEN;

//healthcheck endpoint
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Methods', 'GET');
    next();
  });
  
  router.get('/health', (req, res) => {
    const data = {
      uptime: process.uptime(),
      message: 'Ok',
      date: new Date()
    }
  
    res.status(200).send(data);
  
    //res.status(200).send('Ok');
  });
  
  app.use('/api/v1', router);
  
  const server = http.createServer(app);
  server.listen(3000);
//////////

//bot startup
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity("for tickets", { type: 'WATCHING' })
    db.authenticate()
      .then(() => {
        console.log('Connected to DB');
        Ticket.init(db);
        TicketConfig.init(db);
        Ticket.sync();
        TicketConfig.sync();
      }).catch((err) => console.log(err));
  });
//==============================

client.on('message', async (message) => {
  if(message.author.bot || message.channel.type ==='dm') return;

  if(message.content.toLowerCase() === '?ticketsetup' && message.member.permissionsIn(message.channel).has("ADMINISTRATOR")) {
    try {
      const filter = (m) => m.author.id === message.author.id;
      
      message.channel.send('Please enter message ID of message users will react to to open a ticket');
      const msgId = (await message.channel.awaitMessages(filter, { max: 1 })).first().content;
      const fetchMsg = await message.channel.messages.fetch(msgId);
      
      message.channel.send('Please enter ID of category to hold active ticket channels');
      const categoryId = (await message.channel.awaitMessages(filter, { max: 1 })).first().content;
      const categoryChannel = client.channels.cache.get(categoryId);

      message.channel.send('Please enter the ID of ticket archive category');
      const archiveId = (await message.channel.awaitMessages(filter, { max: 1 })).first().content;
      const archiveCategory = client.channels.cache.get(archiveId);
      
      message.channel.send('Please enter the IDs of all roles who can review tickets (comma separated)');
      const roles = (await message.channel.awaitMessages(filter, { max: 1 })).first().content.split(/,\s*/);
      
      message.channel.send('Please enter the ID of ticket activity log channel');
      const logChannelId = (await message.channel.awaitMessages(filter, { max: 1 })).first().content;
      const logChannel = client.channels.cache.get(logChannelId);


      if (fetchMsg && categoryChannel && logChannel && archiveCategory) {
          for (const roleId of roles) 
            if(!message.guild.roles.cache.get(roleId)) throw new Error('Role does not exist');

          const ticketConfig = await TicketConfig.create({
            messageId: msgId,
            guildId: message.guild.id,
            roles: JSON.stringify(roles),
            parentId: categoryChannel.id,
            logChannelId: logChannel.id,
            archiveId: archiveCategory.id
          });
          message.channel.send('Saved configuration to database!');
          await fetchMsg.react('🎟️');
          client.channels.cache.get(`${logChannel.id}`).send('🎟️ **Ticket-Bot is ready to start accepting tickets. Admins/mods with rights to this channel will be able to view when tickets are created/resolved.**');
        } else throw new Error('Invalid Fields');
    } catch (err) {
        console.log(err);
    }
  }
});


//==============================

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.emoji.name === '🎟️'){
    
    const ticketConfig = await TicketConfig.findOne({ where: { messageId: reaction.message.id }})
    const logChannelId = ticketConfig.logChannelId;
    if(ticketConfig){
        //want to remove the reaction here so user can react again without clicking 2 times
      const userReactions = reaction.message.reactions.cache.filter(reaction => reaction.users.cache.has(user.id));
      
      try {
        for (const reaction of userReactions.values()) {
          await reaction.users.remove(user.id);
        }

      } catch (err) {
        console.log (err);
      }
      const findTicket = await Ticket.findOne({ where: { authorId: user.id, resolved: false }});
      if (findTicket) user.send('You already have a ticket open!');
      else {
        console.log('creating ticket');
        try {
          const roleIdsString = ticketConfig.getDataValue('roles');
          const roleIds = JSON.parse(roleIdsString);
          const permissions = roleIds.map((id) => ({ allow: 'VIEW_CHANNEL', id }));
          const channel = await reaction.message.guild.channels.create('ticket', {
            parent: ticketConfig.getDataValue('parentId'),
            permissionOverwrites: [
              { deny: 'VIEW_CHANNEL', id: reaction.message.guild.id },
              { allow: 'VIEW_CHANNEL', id: user.id },
              { allow: 'VIEW_CHANNEL', id: client.user.id },
              ...permissions
            ]
          });

          channel.send(`<@${user.id}>, Please describe the issue and provide all necessary details.`);
          channel.send('🗒️ *Please note: some issues may take more time to resolve than others .*')
          channel.send('<--**A member of our staff will respond to you shortly**.-->')
          channel.send('====================================');
          const msg = await channel.send('🚨 **React to this message with ✅ to close the ticket** 🚨');
          await msg.react('✅');

          const ticket = await Ticket.create({
            authorId: user.id,
            channelId: channel.id,
            guildId: reaction.message.guild.id,
            resolved: false,
            closedMessageId: msg.id
          });

          const ticketId = String(ticket.getDataValue('ticketId')).padStart(4,0);
          await channel.edit({ name: `ticket--${ticketId}`});
          client.channels.cache.get(`${logChannelId}`).send(`🎟️ @here ${user.tag} created a ticket with ID#-${ticketId}. Click here-> <#${channel.id}> to view ticket.`);
        } catch (err) {
          console.log(err);
        }
      }
    } else {
      console.log('reaction event triggered by ticket emoji but no config found. reaction not on right message.');
    }
  } else if (reaction.emoji.name ==='✅') { 
    const ticket = await Ticket.findOne ({where: { channelId: reaction.message.channel.id }});
    if (ticket) {
      const ticketConfig = await TicketConfig.findOne({ where: { guildId: reaction.message.guild.id }})
      const logChannelId = ticketConfig.logChannelId;
      console.log ('ticket closing');
      //delete channel
      const closedMessageId = ticket.getDataValue('closedMessageId');
      if (reaction.message.id === closedMessageId){
        //this is the right message to close the ticket we found
        const ticketAuthor = ticket.getDataValue('authorId');
        if (user.id === ticketAuthor) {
          await reaction.message.channel.updateOverwrite(ticketAuthor, {
            VIEW_CHANNEL: false
          }).catch((err) => console.log(err));
          //reaction.message.channel.delete();
          ticket.resolved = true;
          await ticket.save();
          reaction.message.channel.send(`User has marked this ticket resolved and can no longer see it, once it is no longer needed react with 🚫 to delete`);
          reaction.message.react('🚫');
          reaction.message.channel.setParent(ticketConfig.archiveId);
          client.channels.cache.get(`${logChannelId}`).send(`✅ ${user.tag} marked <#${ticket.channelId}> as resolved.`);
        } else {
          reaction.message.channel.send(`<@${ticketAuthor}>, This ticket has been resovled by an admin, please react with ✅ to confirm and close the ticket`);
          client.channels.cache.get(`${logChannelId}`).send(`✅ ${user.tag} marked <#${ticket.channelId}> as resolved.`);
        }
      }
    }
  } else if (reaction.emoji.name ==='🚫') {
    const ticket = await Ticket.findOne ({where: { channelId: reaction.message.channel.id }});
    if (ticket) {
      const ticketConfig = await TicketConfig.findOne({ where: { guildId: reaction.message.guild.id }})
      const logChannelId = ticketConfig.logChannelId;
      console.log ('ticket closing');
      //delete channel
      const closedMessageId = ticket.getDataValue('closedMessageId');
      if (reaction.message.id === closedMessageId){
        //this is the right message to close the ticket we found
        reaction.message.channel.delete();
        client.channels.cache.get(`${logChannelId}`).send(`🚫 ${user.tag} closed and removed ticket ID#-${ticket.ticketId}.`);
    }
  }
}
});

//==============================
client.login(token);
