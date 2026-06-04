const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

console.log("🚨 BOOT FILE LOADED");

console.log("ENV CHECK:");
console.log("TOKEN:", !!TOKEN);
console.log("CLIENT_ID:", CLIENT_ID);
console.log("GUILD_ID:", GUILD_ID);

// DATABASE
const db = new sqlite3.Database("./scw.db");

// 🔥 VERY IMPORTANT DEBUG
const commands = [
  { name: "help", description: "help" },
  { name: "setup", description: "setup" },
  { name: "addteam", description: "add team" },
  { name: "sign-player", description: "sign player" },
  { name: "release-player", description: "release player" },
  { name: "roster", description: "roster" },
];

console.log("COMMANDS IN FILE:");
commands.forEach(c => console.log("-", c.name));

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log("🔥 SENDING TO DISCORD...");

    const response = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("🔥 DISCORD RESPONSE:");
    console.log("COUNT:", response.length);
    console.log(response.map(c => c.name));
  } catch (err) {
    console.log("❌ FAILED TO REGISTER:");
    console.log(err);
  }
}

client.once("ready", async () => {
  console.log("LOGGED IN:", client.user.tag);
  await registerCommands();
});

client.login(TOKEN);