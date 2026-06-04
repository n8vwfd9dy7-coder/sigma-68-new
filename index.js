const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ================= DATABASE =================
const db = new sqlite3.Database("./scw.db");

db.run(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS players (user_id TEXT, team TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS logs (action TEXT, user_id TEXT, time INTEGER)`);
db.run(`CREATE TABLE IF NOT EXISTS role_permissions (role_id TEXT PRIMARY KEY, role_type TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS transactions_lock (id INTEGER PRIMARY KEY, locked INTEGER DEFAULT 0)`);

db.run(`INSERT OR IGNORE INTO transactions_lock (id, locked) VALUES (1, 0)`);

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
    name: "setup",
    description: "Initialize SCW system"
  },
  {
    name: "addteam",
    description: "Create a team",
    options: [
      {
        name: "name",
        description: "Team name",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: "sign-player",
    description: "Sign a player",
    options: [
      {
        name: "user",
        description: "Player",
        type: 6,
        required: true
      },
      {
        name: "team",
        description: "Team name",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: "release-player",
    description: "Release a player",
    options: [
      {
        name: "user",
        description: "Player",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "strike",
    description: "Give strike",
    options: [
      {
        name: "user",
        description: "Player",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "warn",
    description: "Warn player",
    options: [
      {
        name: "user",
        description: "Player",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "ban",
    description: "Ban player",
    options: [
      {
        name: "user",
        description: "Player",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "kick",
    description: "Kick player",
    options: [
      {
        name: "user",
        description: "Player",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "mute",
    description: "Mute player",
    options: [
      {
        name: "user",
        description: "Player",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "add-admin-role",
    description: "Add admin role",
    options: [
      {
        name: "role",
        description: "Role",
        type: 8,
        required: true
      }
    ]
  },
  {
    name: "add-mod-role",
    description: "Add mod role",
    options: [
      {
        name: "role",
        description: "Role",
        type: 8,
        required: true
      }
    ]
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

  console.log("✅ Slash commands registered");
}

// ================= READY =================
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  const reply = async (msg) => {
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, ephemeral: true });
    }
    return interaction.reply({ content: msg, ephemeral: true });
  };

  const perm = await getUserPermission(interaction);

  // ================= SETUP =================
  if (cmd === "setup") {
    db.run(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS players (user_id TEXT, team TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (action TEXT, user_id TEXT, time INTEGER)`);

    return reply("📘 SCW system initialized");
  }

  // ================= ADD TEAM =================
  if (cmd === "addteam") {
    const name = interaction.options.getString("name");

    db.run(`INSERT INTO teams (name) VALUES (?)`, [name], function (err) {
      if (err) return reply("❌ DB error");

      return reply(`🏀 Team created: ${name}`);
    });
  }

  // ================= SIGN PLAYER =================
  if (cmd === "sign-player") {
    const user = interaction.options.getUser("user");
    const team = interaction.options.getString("team");

    db.run(
      `INSERT INTO players (user_id, team) VALUES (?, ?)`,
      [user.id, team],
      function (err) {
        if (err) return reply("❌ Failed to sign player");

        return reply(`✅ ${user.username} signed to ${team}`);
      }
    );
  }

  // ================= RELEASE PLAYER =================
  if (cmd === "release-player") {
    const user = interaction.options.getUser("user");

    db.run(`DELETE FROM players WHERE user_id = ?`, [user.id], function (err) {
      if (err) return reply("❌ Failed to release player");

      return reply(`📤 ${user.username} released`);
    });
  }

  // ================= MOD ACTIONS =================
  const mod = ["strike", "warn", "ban", "kick", "mute"];

  if (mod.includes(cmd)) {
    if (perm < 1) return reply("❌ No permission");

    const user = interaction.options.getUser("user");

    db.run(
      `INSERT INTO logs (action, user_id, time) VALUES (?, ?, ?)`,
      [cmd, user.id, Date.now()]
    );

    return reply(`⚠️ ${cmd} applied to ${user.username}`);
  }

  // ================= ROLES =================
  if (cmd === "add-admin-role") {
    if (perm < 3) return reply("❌ No permission");

    const role = interaction.options.getRole("role");

    db.run(
      `INSERT OR REPLACE INTO role_permissions (role_id, role_type) VALUES (?, ?)`,
      [role.id, "admin"]
    );

    return reply(`✅ Admin role added: ${role.name}`);
  }

  if (cmd === "add-mod-role") {
    if (perm < 3) return reply("❌ No permission");

    const role = interaction.options.getRole("role");

    db.run(
      `INSERT OR REPLACE INTO role_permissions (role_id, role_type) VALUES (?, ?)`,
      [role.id, "mod"]
    );

    return reply(`✅ Mod role added: ${role.name}`);
  }

  // ================= TRANSACTIONS =================
  if (cmd === "transactions-lock") {
    if (perm < 2) return reply("❌ No permission");

    db.run(`UPDATE transactions_lock SET locked = 1 WHERE id = 1`);

    return reply("🔒 Transactions locked");
  }

  if (cmd === "transactions-unlock") {
    if (perm < 2) return reply("❌ No permission");

    db.run(`UPDATE transactions_lock SET locked = 0 WHERE id = 1`);

    return reply("🔓 Transactions unlocked");
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);