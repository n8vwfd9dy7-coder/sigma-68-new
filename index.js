const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ENV
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// DATABASE
const db = new sqlite3.Database("./scw.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS teams (
    name TEXT PRIMARY KEY
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS players (
    player TEXT,
    team TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
});

// SLASH COMMANDS
const commands = [
  {
    name: "help",
    description: "Show help menu",
  },
  {
    name: "addteam",
    description: "Add a team",
    options: [
      {
        name: "name",
        type: 3,
        description: "Team name",
        required: true,
      },
    ],
  },
  {
    name: "sign-player",
    description: "Sign player to team",
    options: [
      { name: "player", type: 3, required: true, description: "Player name" },
      { name: "team", type: 3, required: true, description: "Team name" },
    ],
  },
];

// REGISTER COMMANDS
const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands,
    });
    console.log("Slash commands registered.");
  } catch (err) {
    console.log(err);
  }
}

// BOT READY
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("SCW V2 CORE ONLINE");

  await registerCommands();
});

// INTERACTION HANDLER (THIS FIXES YOUR ISSUE)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  try {
    // HELP
    if (cmd === "help") {
      return interaction.reply(
        "📘 SCW Commands:\n/help\n/addteam\n/sign-player"
      );
    }

    // ADD TEAM
    if (cmd === "addteam") {
      const name = interaction.options.getString("name");

      db.run("INSERT INTO teams (name) VALUES (?)", [name]);

      return interaction.reply(`✅ Team **${name}** created`);
    }

    // SIGN PLAYER
    if (cmd === "sign-player") {
      const player = interaction.options.getString("player");
      const team = interaction.options.getString("team");

      db.run("INSERT INTO players (player, team) VALUES (?, ?)", [
        player,
        team,
      ]);

      return interaction.reply(
        `✅ ${player} signed to **${team}**`
      );
    }
  } catch (err) {
    console.log(err);

    if (!interaction.replied) {
      return interaction.reply("❌ Command error occurred");
    }
  }
});

// LOGIN
client.login(TOKEN);