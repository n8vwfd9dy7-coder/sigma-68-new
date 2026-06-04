const { Client, GatewayIntentBits } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

// ===== DATABASE =====
const db = new sqlite3.Database("./scw.db");

// Create tables
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS warns (userId TEXT, reason TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS teams (name TEXT, owner TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS roster (team TEXT, userId TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS strikes (team TEXT, count INTEGER)");
  db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT, value TEXT)");
});

// ===== BOT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// helper functions
function getSetting(key, cb) {
  db.get("SELECT value FROM settings WHERE key = ?", [key], (err, row) => {
    cb(row ? row.value : null);
  });
}

function setSetting(key, value) {
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  try {

    // ================= WARN SYSTEM =================
    if (cmd === "warn") {
      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason") || "No reason";

      db.run("INSERT INTO warns (userId, reason) VALUES (?, ?)", [user.id, reason]);

      return interaction.reply(`⚠️ ${user.username} warned: ${reason}`);
    }

    if (cmd === "warns") {
      const user = interaction.options.getUser("user");

      db.all("SELECT reason FROM warns WHERE userId = ?", [user.id], (err, rows) => {
        const list = rows.map(r => `• ${r.reason}`).join("\n") || "No warnings";

        interaction.reply(`📄 Warnings for ${user.username}:\n${list}`);
      });

      return;
    }

    // ================= TEAM SYSTEM =================
    if (cmd === "addteam") {
      const name = interaction.options.getString("name");

      db.run("INSERT INTO teams (name, owner) VALUES (?, ?)", [
        name,
        interaction.user.id
      ]);

      return interaction.reply(`➕ Team **${name}** created.`);
    }

    if (cmd === "roster") {
      const team = interaction.options.getString("team");

      db.all("SELECT userId FROM roster WHERE team = ?", [team], (err, rows) => {
        const list = rows.map(r => `<@${r.userId}>`).join("\n") || "Empty team";

        interaction.reply(`📋 Roster for ${team}:\n${list}`);
      });

      return;
    }

    // ================= STRIKES =================
    if (cmd === "strike") {
      const team = interaction.options.getString("team");

      db.get("SELECT count FROM strikes WHERE team = ?", [team], (err, row) => {
        let count = row ? row.count + 1 : 1;

        db.run("INSERT OR REPLACE INTO strikes (team, count) VALUES (?, ?)", [team, count]);

        if (count >= 3) {
          db.run("DELETE FROM strikes WHERE team = ?", [team]);
          return interaction.reply(`🚨 ${team} reached 3 strikes and was penalized.`);
        }

        interaction.reply(`⚠️ ${team} now has ${count} strike(s).`);
      });

      return;
    }

    // ================= TRANSACTIONS =================
    if (cmd === "transactions lock") {
      setSetting("transactions", "locked");
      return interaction.reply("🔒 Transactions LOCKED.");
    }

    if (cmd === "transactions unlock") {
      setSetting("transactions", "unlocked");
      return interaction.reply("🔓 Transactions UNLOCKED.");
    }

    // ================= DEFAULT =================
    return interaction.reply(`❓ Unknown command: /${cmd}`);

  } catch (err) {
    console.error(err);

    if (!interaction.replied) {
      interaction.reply("❌ Error running command.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);