const { Client, GatewayIntentBits } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ================= DATABASE =================
const db = new sqlite3.Database("./scw.db");

// your tables here
db.run(`CREATE TABLE IF NOT EXISTS role_permissions (role_id TEXT PRIMARY KEY, role_type TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS transactions_lock (id INTEGER PRIMARY KEY, locked INTEGER DEFAULT 0)`);
db.run(`INSERT OR IGNORE INTO transactions_lock (id, locked) VALUES (1, 0)`);

// ================= FUNCTIONS =================
function isOnCooldown(userId, cmd) {
  // (keep your cooldown system here)
  return false;
}

async function getUserPermission(interaction) {
  const roles = interaction.member.roles.cache.map(r => r.id);

  return new Promise((resolve) => {
    db.all(`SELECT * FROM role_permissions`, [], (err, rows) => {
      if (err) return resolve(0);

      let level = 0;

      for (const r of rows) {
        if (roles.includes(r.role_id)) {
          if (r.role_type === "owner") level = Math.max(level, 3);
          if (r.role_type === "admin") level = Math.max(level, 2);
          if (r.role_type === "mod") level = Math.max(level, 1);
        }
      }

      resolve(level);
    });
  });
}

// ================= IMPORTANT SECTION =================
// 🔥 THIS IS WHERE YOUR COMMAND CODE GOES

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  const safeReply = async (text) => {
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: text, ephemeral: true });
    }
    return interaction.reply({ content: text, ephemeral: true });
  };

  const perm = await getUserPermission(interaction);

  // ================= EXAMPLE COMMANDS =================

  if (cmd === "setup") {
    db.run(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS players (user_id TEXT, team TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (action TEXT, user_id TEXT, time INTEGER)`);

    return safeReply("📘 SCW system fully initialized");
  }

  if (cmd === "addteam") {
    const name = interaction.options.getString("name");
    db.run(`INSERT INTO teams (name) VALUES (?)`, [name]);

    return safeReply(`🏀 Team created: ${name}`);
  }

  if (cmd === "add-admin-role") {
    if (perm < 3) return safeReply("❌ No permission");

    const role = interaction.options.getRole("role");

    db.run(
      `INSERT OR REPLACE INTO role_permissions (role_id, role_type) VALUES (?, ?)`,
      [role.id, "admin"]
    );

    return safeReply(`✅ Admin role added: ${role.name}`);
  }

  if (cmd === "add-mod-role") {
    if (perm < 3) return safeReply("❌ No permission");

    const role = interaction.options.getRole("role");

    db.run(
      `INSERT OR REPLACE INTO role_permissions (role_id, role_type) VALUES (?, ?)`,
      [role.id, "mod"]
    );

    return safeReply(`✅ Mod role added: ${role.name}`);
  }

  return safeReply("❌ Unknown command");
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);