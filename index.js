const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ================= DATABASE =================
const db = new sqlite3.Database("./scw.db");

db.run(`
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT PRIMARY KEY,
  role_type TEXT
);
`);

db.run(`
CREATE TABLE IF NOT EXISTS transactions_lock (
  id INTEGER PRIMARY KEY,
  locked INTEGER DEFAULT 0
);
`);

db.run(`
INSERT OR IGNORE INTO transactions_lock (id, locked) VALUES (1, 0)
`);

// ================= ANTI ABUSE =================
const cooldowns = new Map();

function isOnCooldown(userId, cmd, ms = 2000) {
  const key = `${userId}-${cmd}`;
  const now = Date.now();

  if (cooldowns.has(key)) {
    const expire = cooldowns.get(key);
    if (now < expire) return true;
  }

  cooldowns.set(key, now + ms);
  return false;
}

// ================= PERMISSION SYSTEM =================
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

// ================= COMMANDS =================
const commands = [
  {
    name: "add-admin-role",
    description: "Add admin role",
    options: [{ name: "role", description: "Role", type: 8, required: true }]
  },
  {
    name: "add-mod-role",
    description: "Add mod role",
    options: [{ name: "role", description: "Role", type: 8, required: true }]
  },
  {
    name: "setup",
    description: "Initialize SCW system"
  },
  {
    name: "addteam",
    description: "Create team",
    options: [{ name: "name", description: "Team name", type: 3, required: true }]
  },
  {
    name: "sign-player",
    description: "Sign a player",
    options: [
      { name: "user", description: "Player", type: 6, required: true },
      { name: "team", description: "Team name", type: 3, required: true }
    ]
  },
  {
    name: "release-player",
    description: "Release player",
    options: [{ name: "user", description: "Player", type: 6, required: true }]
  },
  {
    name: "strike",
    description: "Give strike",
    options: [{ name: "user", description: "Player", type: 6, required: true }]
  },
  {
    name: "warn",
    description: "Warn player",
    options: [{ name: "user", description: "Player", type: 6, required: true }]
  },
  {
    name: "ban",
    description: "Ban player",
    options: [{ name: "user", description: "Player", type: 6, required: true }]
  },
  {
    name: "kick",
    description: "Kick player",
    options: [{ name: "user", description: "Player", type: 6, required: true }]
  },
  {
    name: "mute",
    description: "Mute player",
    options: [{ name: "user", description: "Player", type: 6, required: true }]
  },
  {
    name: "transactions-lock",
    description: "Lock transactions"
  },
  {
    name: "transactions-unlock",
    description: "Unlock transactions"
  }
];

// ================= REGISTER COMMANDS =================
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log("✅ Commands registered");
}

// ================= READY =================
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ================= HANDLER =================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
  const userId = interaction.user.id;

  if (isOnCooldown(userId, cmd)) {
    return interaction.reply({ content: "⏳ Slow down.", ephemeral: true });
  }

  const perm = await getUserPermission(interaction);

  // ================= ADMIN ROLE =================
  if (cmd === "add-admin-role") {
    if (perm < 3)
      return interaction.reply({ content: "❌ No permission", ephemeral: true });

    const role = interaction.options.getRole("role");

    db.run(
      `INSERT OR REPLACE INTO role_permissions (role_id, role_type) VALUES (?, ?)`,
      [role.id, "admin"]
    );

    return interaction.reply({ content: `✅ Admin role set: ${role.name}` });
  }

  // ================= MOD ROLE =================
  if (cmd === "add-mod-role") {
    if (perm < 3)
      return interaction.reply({ content: "❌ No permission", ephemeral: true });

    const role = interaction.options.getRole("role");

    db.run(
      `INSERT OR REPLACE INTO role_permissions (role_id, role_type) VALUES (?, ?)`,
      [role.id, "mod"]
    );

    return interaction.reply({ content: `✅ Mod role set: ${role.name}` });
  }

  // ================= TRANSACTIONS =================
  if (cmd === "transactions-lock") {
    if (perm < 2)
      return interaction.reply({ content: "❌ No permission", ephemeral: true });

    db.run(`UPDATE transactions_lock SET locked = 1 WHERE id = 1`);
    return interaction.reply("🔒 Transactions locked");
  }

  if (cmd === "transactions-unlock") {
    if (perm < 2)
      return interaction.reply({ content: "❌ No permission", ephemeral: true });

    db.run(`UPDATE transactions_lock SET locked = 0 WHERE id = 1`);
    return interaction.reply("🔓 Transactions unlocked");
  }

  // ================= TEAM SYSTEM =================
  if (cmd === "addteam") {
    return interaction.reply(`🏀 Team created: ${interaction.options.getString("name")}`);
  }

  if (cmd === "setup") {
    return interaction.reply("📘 SCW system initialized");
  }

  if (cmd === "sign-player") {
    return interaction.reply("✅ Player signed");
  }

  if (cmd === "release-player") {
    return interaction.reply("📤 Player released");
  }

  // ================= MOD ACTIONS =================
  if (["strike", "warn", "ban", "kick", "mute"].includes(cmd)) {
    if (perm < 1)
      return interaction.reply({ content: "❌ No permission", ephemeral: true });

    const user = interaction.options.getUser("user");
    return interaction.reply(`⚠️ ${cmd} applied to ${user.username}`);
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);