import { Client, GatewayIntentBits } from "discord.js";

// === CONFIG ===
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN; // token privé
const CHANNEL_ID = "850782034497896468"; // là où envoyer le message

// === BOT INIT ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("ready", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  // Envoi du message de test
  const channel = await client.channels.fetch(CHANNEL_ID);
  channel.send("Coucou, je suis vivant !");
});

client.login(TOKEN);
