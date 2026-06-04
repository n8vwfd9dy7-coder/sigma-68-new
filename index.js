const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// DATABASE
const db = new sqlite3.Database("./scw.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS teams (name TEXT PRIMARY KEY)`);
  db.run(`CREATE TABLE IF NOT EXISTS players (player TEXT, team TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
});

// COMMANDS (THIS IS WHY YOU ONLY SAW 2 BEFORE)
const commands = [
  { name: "help", description: "SCW help menu" },

  {
    name: "setup",
    description: "Initialize SCW system",
  },

  {
    name: "addteam",
    description: "Create a team",
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
    description: "Sign player",
    options: [
      { name: "player", type: 3, required: true, description: "Player name" },
      { name: "team", type: 3, required: true, description: "Team name" },
    ],
  },

  {
    name: "release-player",
    description: "Release player",
    options: [
      { name: "player", type: 3, required: true },
    ],
  },

  {
    name: "roster",
    description: "Show team roster",
    options: [
      { name: "team", type: 3, required: true },
    ],
  },
];

// REGISTER SLASH COMMANDS
const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands,
    });
    console.log("Slash commands registered.");
  } catch (err) {
    console.log("Command register error:", err);
  }
}

// READY EVENT
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("SCW V2 CORE ONLINE");

  await registerCommands();
});

// INTERACTION HANDLER (THIS WAS YOUR MAIN ISSUE)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  try {
    // HELP
    if (cmd === "help") {
      return interaction.reply("📘 SCW v2 System Online");
    }

    // SETUP
    if (cmd === "setup") {
      return interaction.reply("✅ SCW system is already running on Railway");
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

      return interaction.reply(`✅ ${player} signed to **${team}**`);
    }

    // RELEASE PLAYER
    if (cmd === "release-player") {
      const player = interaction.options.getString("player");

      db.run("DELETE FROM players WHERE player = ?", [player]);

      return interaction.reply(`🗑️ ${player} released`);
    }

    // ROSTER
    if (cmd === "roster") {
      const team = interaction.options.getString("team");

      db.all(
        "SELECT player FROM players WHERE team = ?",
        [team],
        (err, rows) => {
          if (err) return interaction.reply("❌ DB error");

          const list = rows.map(r => r.player).join(", ") || "No players";

          interaction.reply(`📋 ${team} roster:\n${list}`);
        }
      );

      return;
    }
  } catch (err) {
    console.log(err);

    if (!interaction.replied) {
      return interaction.reply("❌ Command error");
    }
  }
});

// LOGIN
client.login(TOKEN);