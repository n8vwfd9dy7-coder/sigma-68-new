const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ENV
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// SAFETY CHECK
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.log("❌ Missing ENV variables");
}

// DB
const db = new sqlite3.Database("./scw.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS teams (name TEXT PRIMARY KEY)`);
  db.run(`CREATE TABLE IF NOT EXISTS players (player TEXT, team TEXT)`);
});

// COMMANDS (FIXED + VALID)
const commands = [
  { name: "help", description: "SCW help menu" },

  { name: "setup", description: "Setup SCW system" },

  {
    name: "addteam",
    description: "Add a team",
    options: [
      {
        name: "name",
        description: "Team name",
        type: 3,
        required: true,
      },
    ],
  },

  {
    name: "sign-player",
    description: "Sign player to a team",
    options: [
      {
        name: "player",
        description: "Player name",
        type: 3,
        required: true,
      },
      {
        name: "team",
        description: "Team name",
        type: 3,
        required: true,
      },
    ],
  },

  {
    name: "release-player",
    description: "Release a player",
    options: [
      {
        name: "player",
        description: "Player name",
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
        description: "Team name",
        type: 3,
        required: true,
      },
    ],
  },
];

// REST
const rest = new REST({ version: "10" }).setToken(TOKEN);

// COMMAND DEPLOY
async function registerCommands() {
  try {
    console.log("🔥 STARTING COMMAND DEPLOY");
    console.log("CLIENT_ID:", CLIENT_ID);
    console.log("GUILD_ID:", GUILD_ID);
    console.log("TOTAL COMMANDS:", commands.length);

    console.log("📦 COMMAND LIST:");
    commands.forEach(c => console.log("-", c.name));

    // WIPE GLOBAL + GUILD
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });

    console.log("🧹 CLEARED OLD COMMANDS");

    await new Promise(r => setTimeout(r, 2000));

    // REGISTER
    const response = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ REGISTER COMPLETE");
    console.log("RETURNED COUNT:", response.length);
    console.log("COMMANDS:", response.map(c => c.name));

  } catch (err) {
    console.log("❌ COMMAND ERROR:");
    console.log(err);
  }
}

// READY
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("SCW V2 ONLINE");

  console.log("🚨 ENTERING COMMAND SYNC...");
  await registerCommands();
  console.log("🚨 COMMAND SYNC DONE");
});

// COMMAND HANDLER
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  try {
    if (cmd === "help") return interaction.reply("📘 SCW v2 System Online");
    if (cmd === "setup") return interaction.reply("✅ System ready");

    if (cmd === "addteam") {
      const name = interaction.options.getString("name");
      db.run("INSERT INTO teams (name) VALUES (?)", [name]);
      return interaction.reply(`✅ Team ${name} created`);
    }

    if (cmd === "sign-player") {
      const player = interaction.options.getString("player");
      const team = interaction.options.getString("team");
      db.run("INSERT INTO players (player, team) VALUES (?, ?)", [player, team]);
      return interaction.reply(`✅ ${player} signed to ${team}`);
    }

    if (cmd === "release-player") {
      const player = interaction.options.getString("player");
      db.run("DELETE FROM players WHERE player = ?", [player]);
      return interaction.reply(`🗑️ ${player} released`);
    }

    if (cmd === "roster") {
      const team = interaction.options.getString("team");

      db.all("SELECT player FROM players WHERE team = ?", [team], (err, rows) => {
        if (err) return interaction.reply("❌ DB error");

        const list = rows.map(r => r.player).join(", ") || "No players";
        interaction.reply(`📋 ${team} roster:\n${list}`);
      });
    }

  } catch (err) {
    console.log(err);
    if (!interaction.replied) {
      return interaction.reply("❌ Error occurred");
    }
  }
});

client.login(TOKEN);