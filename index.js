const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// DATABASE
const db = new sqlite3.Database("./scw.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS teams (name TEXT PRIMARY KEY)`);
  db.run(`CREATE TABLE IF NOT EXISTS players (player TEXT, team TEXT)`);
});

// COMMANDS (CLEAN LIST)
const commands = [
  { name: "help", description: "SCW help menu" },
  { name: "setup", description: "Setup SCW system" },

  {
    name: "addteam",
    description: "Add a team",
    options: [
      {
        name: "name",
        type: 3,
        required: true,
        description: "Team name",
      },
    ],
  },

  {
    name: "sign-player",
    description: "Sign player",
    options: [
      {
        name: "player",
        type: 3,
        required: true,
        description: "Player name",
      },
      {
        name: "team",
        type: 3,
        required: true,
        description: "Team name",
      },
    ],
  },

  {
    name: "release-player",
    description: "Release player",
    options: [
      {
        name: "player",
        type: 3,
        required: true,
      },
    ],
  },

  {
    name: "roster",
    description: "Show team roster",
    options: [
      {
        name: "team",
        type: 3,
        required: true,
      },
    ],
  },
];

// REST
const rest = new REST({ version: "10" }).setToken(TOKEN);

// 🔥 CLEAN + FORCE SYNC (THIS FIXES DUPLICATES)
async function registerCommands() {
  try {
    console.log("🧹 Clearing old slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: [] }
    );

    console.log("🚀 Registering fresh commands...");

    const result = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Sync complete");
    console.log("Commands registered:", result.map(c => c.name));
  } catch (err) {
    console.log("❌ Command sync error:", err);
  }
}

// READY
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("SCW V2 ONLINE");

  await registerCommands();
});

// HANDLER
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  try {
    if (cmd === "help") {
      return interaction.reply("📘 SCW v2 System Online");
    }

    if (cmd === "setup") {
      return interaction.reply("✅ System ready");
    }

    if (cmd === "addteam") {
      const name = interaction.options.getString("name");

      db.run("INSERT INTO teams (name) VALUES (?)", [name]);

      return interaction.reply(`✅ Team ${name} created`);
    }

    if (cmd === "sign-player") {
      const player = interaction.options.getString("player");
      const team = interaction.options.getString("team");

      db.run("INSERT INTO players (player, team) VALUES (?, ?)", [
        player,
        team,
      ]);

      return interaction.reply(`✅ ${player} signed to ${team}`);
    }

    if (cmd === "release-player") {
      const player = interaction.options.getString("player");

      db.run("DELETE FROM players WHERE player = ?", [player]);

      return interaction.reply(`🗑️ ${player} released`);
    }

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
    }
  } catch (err) {
    console.log(err);

    if (!interaction.replied) {
      return interaction.reply("❌ Error occurred");
    }
  }
});

// LOGIN
client.login(TOKEN);