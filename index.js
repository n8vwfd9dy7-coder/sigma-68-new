const { Client, GatewayIntentBits } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./scw.db");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// =====================
// DATABASE SETUP
// =====================
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS teams (
    name TEXT PRIMARY KEY
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS roster (
    player TEXT,
    team TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS warns (
    player TEXT,
    reason TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS strikes (
    player TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0
  )`);
});

// =====================
// BOT READY
// =====================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("SCW DATABASE CORE ONLINE");
});

// =====================
// COMMAND HANDLER
// =====================
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    console.log("CMD:", cmd);

    // HELP
    if (cmd === "help") {
      return interaction.reply("📘 SCW Database System Online");
    }

    // ADD TEAM
    if (cmd === "addteam") {
      const name = interaction.options.getString("name") || "Team A";

      db.run(`INSERT OR IGNORE INTO teams(name) VALUES (?)`, [name]);

      return interaction.reply(`➕ Team **${name}** added.`);
    }

    // ROSTER
    if (cmd === "roster") {
      db.all(`SELECT * FROM roster`, [], (err, rows) => {
        if (err) return interaction.reply("❌ Error loading roster");

        if (!rows.length) return interaction.reply("📋 No players found");

        const list = rows.map(r => `👤 ${r.player} → ${r.team}`).join("\n");

        return interaction.reply(`📋 **SCW Roster:**\n${list}`);
      });

      return;
    }

    // SIGN PLAYER
    if (cmd === "sign-player") {
      const player = interaction.options.getString("player") || "Player";
      const team = interaction.options.getString("team") || "Free Agents";

      db.run(`INSERT INTO roster(player, team) VALUES (?, ?)`, [player, team]);

      return interaction.reply(`📝 ${player} signed to **${team}**`);
    }

    // RELEASE PLAYER
    if (cmd === "release-player") {
      const player = interaction.options.getString("player");

      db.run(`DELETE FROM roster WHERE player = ?`, [player]);

      return interaction.reply(`📤 ${player} released`);
    }

    // WARN SYSTEM
    if (cmd === "warn") {
      const player = interaction.options.getString("player");
      const reason = interaction.options.getString("reason");

      db.run(`INSERT INTO warns(player, reason) VALUES (?, ?)`, [player, reason]);

      return interaction.reply(`⚠️ ${player} warned: ${reason}`);
    }

    // STRIKE SYSTEM
    if (cmd === "strike") {
      const player = interaction.options.getString("player");

      db.get(`SELECT count FROM strikes WHERE player = ?`, [player], (err, row) => {
        let newCount = 1;

        if (row) {
          newCount = row.count + 1;
          db.run(`UPDATE strikes SET count = ? WHERE player = ?`, [newCount, player]);
        } else {
          db.run(`INSERT INTO strikes(player, count) VALUES (?, ?)`, [player, newCount]);
        }

        return interaction.reply(`💥 ${player} now has **${newCount} strike(s)**`);
      });

      return;
    }

    // UNKNOWN COMMAND
    return interaction.reply({
      content: `❓ Unknown command: /${cmd}`,
      ephemeral: true
    });

  } catch (err) {
    console.error(err);

    if (interaction.replied) return;

    return interaction.reply("❌ Database error occurred");
  }
});

client.login(process.env.DISCORD_TOKEN);