const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ENV
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// DB
const db = new sqlite3.Database("./scw.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS teams (name TEXT PRIMARY KEY)`);
  db.run(`CREATE TABLE IF NOT EXISTS players (player TEXT, team TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS permissions (user TEXT PRIMARY KEY, role TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS strikes (player TEXT, count INTEGER DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS warns (user TEXT, count INTEGER DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
});

// ROLES
const ROLE = { owner: 3, admin: 2, mod: 1, user: 0 };

function getRole(userId) {
  return new Promise(res => {
    db.get("SELECT role FROM permissions WHERE user = ?", [userId], (err, row) => {
      if (!row) return res("user");
      res(row.role);
    });
  });
}

async function has(userId, role) {
  const r = await getRole(userId);
  return ROLE[r] >= ROLE[role];
}

// COMMANDS (ALL FIXED FOR DISCORD)
const commands = [
  { name: "help", description: "View all commands" },
  { name: "setup", description: "Configure system (Admin)" },

  {
    name: "addteam",
    description: "Create a new team",
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
    name: "appoint",
    description: "Set user role (Owner only)",
    options: [
      { name: "user", description: "User", type: 6, required: true },
      { name: "role", description: "owner/admin/mod", type: 3, required: true },
    ],
  },

  {
    name: "sign-player",
    description: "Sign player to team",
    options: [
      { name: "player", description: "Player", type: 3, required: true },
      { name: "team", description: "Team", type: 3, required: true },
    ],
  },

  {
    name: "release",
    description: "Release player",
    options: [
      { name: "player", description: "Player", type: 3, required: true },
    ],
  },

  {
    name: "roster",
    description: "View team roster",
    options: [
      { name: "team", description: "Team", type: 3, required: true },
    ],
  },

  {
    name: "strike",
    description: "Give player strike",
    options: [
      { name: "player", description: "Player", type: 3, required: true },
    ],
  },

  {
    name: "warn",
    description: "Warn a user",
    options: [
      { name: "user", description: "User", type: 6, required: true },
    ],
  },

  {
    name: "warns",
    description: "Check warnings",
    options: [
      { name: "user", description: "User", type: 6, required: true },
    ],
  },

  { name: "transactions-lock", description: "Lock signings" },
  { name: "transactions-unlock", description: "Unlock signings" },

  {
    name: "clearstrike",
    description: "Clear strikes",
    options: [
      { name: "player", description: "Player", type: 3, required: true },
    ],
  },

  {
    name: "clearwarn",
    description: "Clear warns",
    options: [
      { name: "user", description: "User", type: 6, required: true },
    ],
  },

  {
    name: "ban",
    description: "Ban user (Admin)",
    options: [
      { name: "user", description: "User", type: 6, required: true },
    ],
  },

  {
    name: "kick",
    description: "Kick user (Mod+)",
    options: [
      { name: "user", description: "User", type: 6, required: true },
    ],
  },

  {
    name: "mute",
    description: "Timeout user",
    options: [
      { name: "user", description: "User", type: 6, required: true },
    ],
  },
];

// REST
const rest = new REST({ version: "10" }).setToken(TOKEN);

// REGISTER COMMANDS
async function registerCommands() {
  try {
    console.log("🔥 Registering SCW commands...");
    console.log("Total:", commands.length);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Commands registered");
  } catch (err) {
    console.log(err);
  }
}

// READY
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// HANDLER
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  const cmd = i.commandName;

  try {
    if (cmd === "help") return i.reply("📘 SCW Bot Online");

    if (cmd === "setup") {
      if (!(await has(i.user.id, "admin"))) return i.reply("❌ Admin only");
      return i.reply("✅ Setup complete");
    }

    if (cmd === "addteam") {
      if (!(await has(i.user.id, "admin"))) return i.reply("❌ Admin only");

      const name = i.options.getString("name");
      db.run("INSERT INTO teams VALUES (?)", [name]);
      return i.reply(`✅ Team ${name} created`);
    }

    if (cmd === "appoint") {
      if (!(await has(i.user.id, "owner"))) return i.reply("❌ Owner only");

      const user = i.options.getUser("user");
      const role = i.options.getString("role");

      db.run(
        "INSERT OR REPLACE INTO permissions VALUES (?, ?)",
        [user.id, role]
      );

      return i.reply(`✅ ${user.username} = ${role}`);
    }

    if (cmd === "sign-player") {
      const p = i.options.getString("player");
      const t = i.options.getString("team");

      db.run("INSERT INTO players VALUES (?, ?)", [p, t]);
      return i.reply(`✅ ${p} signed to ${t}`);
    }

    if (cmd === "release") {
      const p = i.options.getString("player");
      db.run("DELETE FROM players WHERE player = ?", [p]);
      return i.reply(`🗑️ Released ${p}`);
    }

    if (cmd === "roster") {
      const t = i.options.getString("team");

      db.all("SELECT player FROM players WHERE team = ?", [t], (err, rows) => {
        const list = rows.map(r => r.player).join(", ") || "No players";
        i.reply(`📋 ${t}: ${list}`);
      });
    }

    if (cmd === "strike") {
      const p = i.options.getString("player");

      db.run(
        `INSERT INTO strikes(player,count)
         VALUES(?,1)
         ON CONFLICT(player) DO UPDATE SET count=count+1`,
        [p]
      );

      return i.reply(`⚠️ Strike added to ${p}`);
    }

    if (cmd === "transactions-lock") {
      db.run("INSERT OR REPLACE INTO settings VALUES ('lock','true')");
      return i.reply("🔒 Transactions locked");
    }

    if (cmd === "transactions-unlock") {
      db.run("INSERT OR REPLACE INTO settings VALUES ('lock','false')");
      return i.reply("🔓 Transactions unlocked");
    }

    if (cmd === "kick") {
      if (!(await has(i.user.id, "mod"))) return i.reply("❌ Mod only");
      const user = i.options.getUser("user");
      const member = await i.guild.members.fetch(user.id);
      await member.kick();
      return i.reply("👢 Kicked user");
    }

    if (cmd === "ban") {
      if (!(await has(i.user.id, "admin"))) return i.reply("❌ Admin only");
      const user = i.options.getUser("user");
      const member = await i.guild.members.fetch(user.id);
      await member.ban();
      return i.reply("🔨 Banned user");
    }

    if (cmd === "mute") {
      if (!(await has(i.user.id, "mod"))) return i.reply("❌ Mod only");
      const user = i.options.getUser("user");
      const member = await i.guild.members.fetch(user.id);
      await member.timeout(60_000 * 10);
      return i.reply("🔇 Muted user");
    }

  } catch (e) {
    console.log(e);
    if (!i.replied) i.reply("❌ Error");
  }
});

client.login(TOKEN);