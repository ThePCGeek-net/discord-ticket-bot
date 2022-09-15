# discord-ticket-bot

A ticket bot for discord written in nodejs using sequelize for db storage

You need a db server, in my testing I used postgres

for running locally set up a .env file in the root of the cloned repo with the following env variables:

```text
BOT_TOKEN=<discord bot token>
DB_NAME=
DB_USER=
DB_PASS=
DB_HOST=
```

alternatively if you build the docker image add those variables using -e in your docker run command

Once running and joined to a server, type a message in a read-only channel for the server members to react to to open a ticket

in that channel run ?ticketsetup command. bot will prompt for the ID's of  the message, admin/mod roles id's (comma separated), ticket category and archive category as well as an activity log channel ID.

once it is completed setup you can remove the setup messages from that channel leaving only the 'react to this post' message.
