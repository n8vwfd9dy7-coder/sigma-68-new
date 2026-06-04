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
// COMMAND HANDLER
// =====================
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    console.log("CMD:", cmd);

    // =====================
    // HELP
    // =====================
    if (cmd === "help") {
      return interaction.reply("📘 SCW v2 System Online (Database + Locks Enabled)");
    }

    // =====================
    // SETUP LOCK SYSTEM
    // =====================
    if (cmd === "setup") {
      setSetting("transaction_lock", "off");
      return interaction.reply("⚙️ SCW v2 Setup Complete (Locks OFF)");
    }

    // =====================
    // TRANSACTION LOCK (NEW)
    // =====================
    if (cmd === "transactions") {
      const action = interaction.options.getString("action"); // lock/unlock

      if (action === "lock") {
        setSetting("transaction_lock", "on");
        return interaction.reply("🔒 Transactions LOCKED");
      }

      if (action === "unlock") {
        setSetting("transaction_lock", "off");
        return interaction.reply("🔓 Transactions UNLOCKED");
      }

      return interaction.reply("❓ Use lock or unlock");
    }

    // =====================
    // ADD TEAM
    // =====================
    if (cmd === "addteam") {
      const name = interaction.options.getString("name");

      db.run(`INSERT OR IGNORE INTO teams(name) VALUES (?)`, [name]);

      return interaction.reply(`➕ Team **${name}** added.`);
    }

    // =====================
    // SIGN PLAYER (LOCK CHECK)
    // =====================
    if (cmd === "sign-player") {
      const player = interaction.options.getString("player");
      const team = interaction.options.getString("team");

      getSetting("transaction_lock", (lock) => {
        if (lock === "on") {
          return interaction.reply("🔒 Transactions are locked");
        }

        db.run(`INSERT INTO roster(player, team) VALUES (?, ?)`, [player, team]);
        return interaction.reply(`📝 ${player} signed to **${team}**`);
      });

      return;
    }

    // =====================
    // RELEASE PLAYER (LOCK CHECK)
    // =====================
    if (cmd === "release-player") {
      const player = interaction.options.getString("player");

      getSetting("transaction_lock", (lock) => {
        if (lock === "on") {
          return interaction.reply("🔒 Transactions are locked");
        }

        db.run(`DELETE FROM roster WHERE player = ?`, [player]);
        return interaction.reply(`📤 ${player} released`);
      });

      return;
    }

    // =====================
    // ROSTER
    // =====================
    if (cmd === "roster") {
      db.all(`SELECT * FROM roster`, [], (err, rows) => {
        if (err) return interaction.reply("❌ Error");

        if (!rows.length) return interaction.reply("📋 Empty roster");

        const list = rows.map(r => `👤 ${r.player} → ${r.team}`).join("\n");

        return interaction.reply(`📋 SCW Roster:\n${list}`);
      });

      return;
    }

    // =====================
    // WARN SYSTEM
    // =====================
    if (cmd === "warn") {
      const player = interaction.options.getString("player");
      const reason = interaction.options.getString("reason");

      db.run(`INSERT INTO warns(player, reason) VALUES (?, ?)`, [player, reason]);

      return interaction.reply(`⚠️ ${player} warned`);
    }

    // =====================
    // STRIKE SYSTEM
    // =====================
    if (cmd === "strike") {
      const player = interaction.options.getString("player");

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

    // =====================
    // DEFAULT
    // =====================
    return interaction.reply({
      content: `❓ Unknown command: /${cmd}`,
      ephemeral: true
    });

  } catch (err) {
    console.error(err);
    return interaction.reply("❌ SCW v2 error");
  }
});

client.login(process.env.DISCORD_TOKEN);