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
  db.run(`CREATE TABLE IF NOT EXISTS teams (name TEXT PRIMARY KEY)`);

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

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
});

// =====================
// SETTINGS HELPERS
// =====================
function setSetting(key, value) {
  db.run(
    `INSERT INTO settings(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

function getSetting(key, cb) {
  db.get(`SELECT value FROM settings WHERE key = ?`, [key], (err, row) => {
    cb(row ? row.value : null);
  });
}

// =====================
// BOT READY
// =====================
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("SCW V2 CORE ONLINE");
});

// =====================
// COMMAND SYSTEM
// =====================
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    console.log("CMD:", cmd);

    // -----------------
    // HELP
    // -----------------
    if (cmd === "help") {
      return interaction.reply("📘 SCW v2 System Online");
    }

    // -----------------
    // ADD TEAM
    // -----------------
    if (cmd === "addteam") {
      const name = interaction.options.getString("name") || "Team1";

      db.run(`INSERT OR IGNORE INTO teams(name) VALUES (?)`, [name]);

      return interaction.reply(`➕ Team added: ${name}`);
    }

    // -----------------
    // ROSTER
    // -----------------
    if (cmd === "roster") {
      db.all(`SELECT * FROM roster`, [], (err, rows) => {
        if (err) return interaction.reply("❌ Error loading roster");

        if (!rows.length) return interaction.reply("📋 No players found");

        const list = rows.map(r => `👤 ${r.player} → ${r.team}`).join("\n");

        return interaction.reply(`📋 SCW Roster:\n${list}`);
      });

      return;
    }

    // -----------------
    // SIGN PLAYER
    // -----------------
    if (cmd === "sign-player") {
      const player = interaction.options.getString("player") || "Player1";
      const team = interaction.options.getString("team") || "Free Agents";

      db.run(`INSERT INTO roster(player, team) VALUES (?, ?)`, [player, team]);

      return interaction.reply(`📝 ${player} signed to ${team}`);
    }

    // -----------------
    // RELEASE PLAYER
    // -----------------
    if (cmd === "release-player") {
      const player = interaction.options.getString("player");

      if (!player) return interaction.reply("❌ Provide player name");

      db.run(`DELETE FROM roster WHERE player = ?`, [player]);

      return interaction.reply(`📤 ${player} released`);
    }

    // -----------------
    // WARN SYSTEM
    // -----------------
    if (cmd === "warn") {
      const player = interaction.options.getString("player") || "Player";
      const reason = interaction.options.getString("reason") || "No reason";

      db.run(`INSERT INTO warns(player, reason) VALUES (?, ?)`, [player, reason]);

      return interaction.reply(`⚠️ ${player} warned: ${reason}`);
    }

    // -----------------
    // STRIKE SYSTEM
    // -----------------
    if (cmd === "strike") {
      const player = interaction.options.getString("player") || "Player";

      db.get(`SELECT count FROM strikes WHERE player = ?`, [player], (err, row) => {
        let count = row ? row.count + 1 : 1;

        db.run(
          `INSERT INTO strikes(player, count) VALUES (?, ?)
           ON CONFLICT(player) DO UPDATE SET count = excluded.count`,
          [player, count]
        );

        return interaction.reply(`💥 ${player} now has ${count} strike(s)`);
      });

      return;
    }

    // -----------------
    // TRANSACTIONS LOCK
    // -----------------
    if (cmd === "transactions") {
      const action = interaction.options.getString("action");

      if (!action) return interaction.reply("❌ Use: lock or unlock");

      if (action === "lock") {
        setSetting("transaction_lock", "on");
        return interaction.reply("🔒 Transactions LOCKED");
      }

      if (action === "unlock") {
        setSetting("transaction_lock", "off");
        return interaction.reply("🔓 Transactions UNLOCKED");
      }

      return interaction.reply("❓ Invalid action");
    }

    // -----------------
    // DEFAULT
    // -----------------
    return interaction.reply(`❓ Unknown command: /${cmd}`);

  } catch (err) {
    console.error(err);
    return interaction.reply("❌ SCW error occurred");
  }
});

// =====================
client.login(process.env.DISCORD_TOKEN);