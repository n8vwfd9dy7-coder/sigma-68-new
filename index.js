const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ================= DB =================
const db = new sqlite3.Database("./scw.db");

db.run(`CREATE TABLE IF NOT EXISTS setup (guild_id TEXT PRIMARY KEY, completed INTEGER DEFAULT 0)`);
db.run(`CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS players (user_id TEXT, team TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS logs (action TEXT, user_id TEXT, time INTEGER)`);
db.run(`CREATE TABLE IF NOT EXISTS role_permissions (role_id TEXT PRIMARY KEY, role_type TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS transactions_lock (id INTEGER PRIMARY KEY, locked INTEGER DEFAULT 0)`);

db.run(`INSERT OR IGNORE INTO transactions_lock (id, locked) VALUES (1, 0)`);

// ================= ACTION STYLE RESPONSES =================
function action(interaction, text) {
  return interaction.reply({
    content: `⚙️ SCW SYSTEM → ${text}`,
    ephemeral: true
  });
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
  { name: "setup", description: "Initialize SCW system" },
  {
    name: "addteam",
    description: "Create team",
    options: [{ name: "name", description: "Team name", type: 3, required: true }]
  },
  {
    name: "sign-player",
    description: "Sign player",
    options: [
      { name: "user", description: "Player", type: 6, required: true },
      { name: "team", description: "Team", type: 3, required: true }
    ]
  },
  {
    name: "release-player",
    description: "Release player",
    options: [{ name: "user", description: "Player", type: 6, required: true }]
  },
  {
    name: "strike",
    description: "Strike player",
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
    name: "add-admin-role",
    description: "Set admin role",
    options: [{ name: "role", description: "Role", type: 8, required: true }]
  },
  {
    name: "add-mod-role",
    description: "Set mod role",
    options: [{ name: "role", description: "Role", type: 8, required: true }]
  },
  { name: "transactions-lock", description: "Lock trades" },
  { name: "transactions-unlock", description: "Unlock trades" }
];

// ================= REGISTER =================
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function register() {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log("✅ Commands registered");
}

// ================= READY =================
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await register();
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
  const perm = await getUserPermission(interaction);

  // ================= SETUP =================
  if (cmd === "setup") {
    db.get(`SELECT * FROM setup WHERE guild_id = ?`, [interaction.guild.id], (err, row) => {
      if (err) return action(interaction, "Database error");

      if (row?.completed === 1) {
        return action(interaction, "Server already initialized");
      }

      db.run(
        `INSERT OR REPLACE INTO setup (guild_id, completed) VALUES (?, 1)`,
        [interaction.guild.id]
      );

      return action(interaction, "System initialized successfully");
    });
  }

  // ================= ADD TEAM =================
  if (cmd === "addteam") {
    const name = interaction.options.getString("name");

    db.run(`INSERT INTO teams (name) VALUES (?)`, [name], (err) => {
      if (err) return action(interaction, "Failed to create team");

      return action(interaction, `Team created → ${name}`);
    });
  }

  // ================= SIGN PLAYER =================
  if (cmd === "sign-player") {
    const user = interaction.options.getUser("user");
    const team = interaction.options.getString("team");

    db.run(
      `INSERT INTO players (user_id, team) VALUES (?, ?)`,
      [user.id, team],
      (err) => {
        if (err) return action(interaction, "Sign failed");

        return action(interaction, `${user.username} signed → ${team}`);
      }
    );
  }

  // ================= RELEASE =================
  if (cmd === "release-player") {
    const user = interaction.options.getUser("user");

    db.run(`DELETE FROM players WHERE user_id = ?`, [user.id], (err) => {
      if (err) return action(interaction, "Release failed");

      return action(interaction, `${user.username} released`);
    });
  }

  // ================= MOD ACTIONS =================
  const mods = ["strike", "warn", "ban", "kick", "mute"];

  if (mods.includes(cmd)) {
    if (perm < 1) return action(interaction, "No permission");

    const user = interaction.options.getUser("user");

    db.run(
      `INSERT INTO logs (action, user_id, time) VALUES (?, ?, ?)`,
      [cmd, user.id, Date.now()]
    );

    return action(interaction, `${cmd.toUpperCase()} → ${user.username}`);
  }

  // ================= ROLES =================
  if (cmd === "add-admin-role") {
    if (perm < 3) return action(interaction, "No permission");

    const role = interaction.options.getRole("role");

    db.run(
      `INSERT OR REPLACE INTO role_permissions (role_id, role_type) VALUES (?, ?)`,
      [role.id, "admin"]
    );

    return action(interaction, `Admin role set → ${role.name}`);
  }

  if (cmd === "add-mod-role") {
    if (perm < 3) return action(interaction, "No permission");

    const role = interaction.options.getRole("role");

    db.run(
      `INSERT OR REPLACE INTO role_permissions (role_id, role_type) VALUES (?, ?)`,
      [role.id, "mod"]
    );

    return action(interaction, `Mod role set → ${role.name}`);
  }

  // ================= TRANSACTIONS =================
  if (cmd === "transactions-lock") {
    if (perm < 2) return action(interaction, "No permission");

    db.run(`UPDATE transactions_lock SET locked = 1 WHERE id = 1`);
    return action(interaction, "Transactions locked");
  }

  if (cmd === "transactions-unlock") {
    if (perm < 2) return action(interaction, "No permission");

    db.run(`UPDATE transactions_lock SET locked = 0 WHERE id = 1`);
    return action(interaction, "Transactions unlocked");
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);