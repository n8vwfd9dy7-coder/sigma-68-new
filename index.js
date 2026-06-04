require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

/* ---------------- ENV ---------------- */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

console.log("🚀 SCW BOT STARTING...");

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.log("⚠️ Missing env vars (bot may not fully work)");
}

/* ---------------- CLIENT ---------------- */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

/* ---------------- DATABASE ---------------- */

const db = new sqlite3.Database("./scw.db", (err) => {
  if (err) console.log("DB ERROR:", err.message);
  else console.log("📦 DB connected");
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS setup (
    guildId TEXT PRIMARY KEY,
    ownerRole TEXT,
    adminRole TEXT,
    modRole TEXT,
    freeAgentRole TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    name TEXT,
    roleId TEXT,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    userId TEXT,
    teamId INTEGER,
    strikes INTEGER DEFAULT 0
  )`);
});

/* ---------------- SAFE REPLY (FIX TIMEOUT BUG) ---------------- */

async function safeReply(interaction, msg) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  } catch (err) {
    console.log("Reply error:", err.message);
  }
}

/* ---------------- STAFF CHECK ---------------- */

function isStaff(member, setup) {
  if (!setup) return false;

  return (
    member.roles.cache.has(setup.ownerRole) ||
    member.roles.cache.has(setup.adminRole) ||
    member.roles.cache.has(setup.modRole)
  );
}

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Manual SCW setup (role IDs)")
    .addStringOption(o => o.setName("ownerrole").setRequired(true))
    .addStringOption(o => o.setName("adminrole").setRequired(true))
    .addStringOption(o => o.setName("modrole").setRequired(true))
    .addStringOption(o => o.setName("freeagentrole").setRequired(true)),

  new SlashCommandBuilder()
    .setName("addteam")
    .setDescription("Create team")
    .addStringOption(o => o.setName("name").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sign")
    .setDescription("Sign player")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("team").setRequired(true)),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release player")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("strike")
    .setDescription("Add strike")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("win")
    .setDescription("Add win")
    .addStringOption(o => o.setName("team").setRequired(true)),

  new SlashCommandBuilder()
    .setName("loss")
    .setDescription("Add loss")
    .addStringOption(o => o.setName("team").setRequired(true)),

  new SlashCommandBuilder()
    .setName("standings")
    .setDescription("Show leaderboard"),
];

/* ---------------- REGISTER ---------------- */

async function registerCommands() {
  try {
    if (!TOKEN) return;

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Commands registered");
  } catch (err) {
    console.log("Command error:", err.message);
  }
}

/* ---------------- READY ---------------- */

client.once("ready", () => {
  console.log(`🤖 ONLINE: ${client.user.tag}`);
});

/* ---------------- COMMAND HANDLER ---------------- */

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply({ ephemeral: true });

  const { commandName, guild, member } = interaction;

  db.get(`SELECT * FROM setup WHERE guildId = ?`, [guild.id], async (err, setup) => {

    /* ---------------- SETUP (MANUAL ROLE IDS) ---------------- */
    if (commandName === "setup") {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
        return safeReply(interaction, "No permission");

      const owner = interaction.options.getString("ownerrole");
      const admin = interaction.options.getString("adminrole");
      const mod = interaction.options.getString("modrole");
      const free = interaction.options.getString("freeagentrole");

      db.run(
        `INSERT OR REPLACE INTO setup VALUES (?, ?, ?, ?, ?)`,
        [guild.id, owner, admin, mod, free]
      );

      return safeReply(interaction, "⚙️ Manual setup saved");
    }

    /* ---------------- ADD TEAM ---------------- */
    if (commandName === "addteam") {
      if (!isStaff(member, setup))
        return safeReply(interaction, "No permission");

      const name = interaction.options.getString("name");

      const role = await guild.roles.create({
        name,
        reason: "SCW Team"
      });

      db.run(
        `INSERT INTO teams (guildId, name, roleId) VALUES (?, ?, ?)`,
        [guild.id, name, role.id]
      );

      return safeReply(interaction, `🏀 Team created: ${name}`);
    }

    /* ---------------- SIGN (10 LIMIT + AUTO ROLES) ---------------- */
    if (commandName === "sign") {
      if (!isStaff(member, setup))
        return safeReply(interaction, "No permission");

      const user = interaction.options.getUser("user");
      const teamName = interaction.options.getString("team");

      db.get(
        `SELECT * FROM teams WHERE guildId = ? AND name = ?`,
        [guild.id, teamName],
        async (err, team) => {

          if (!team) return safeReply(interaction, "Team not found");

          db.all(
            `SELECT * FROM players WHERE teamId = ?`,
            [team.id],
            async (err, players) => {

              if (players.length >= 10)
                return safeReply(interaction, "❌ Roster full (10/10)");

              const m = await guild.members.fetch(user.id);

              db.run(
                `INSERT OR REPLACE INTO players (guildId, userId, teamId) VALUES (?, ?, ?)`,
                [guild.id, user.id, team.id]
              );

              if (setup?.freeAgentRole)
                m.roles.remove(setup.freeAgentRole).catch(() => {});

              if (team.roleId)
                m.roles.add(team.roleId).catch(() => {});

              return safeReply(
                interaction,
                `✅ ${user.username} joined ${team.name} (${players.length + 1}/10)`
              );
            }
          );
        }
      );
    }

    /* ---------------- RELEASE ---------------- */
    if (commandName === "release") {
      if (!isStaff(member, setup))
        return safeReply(interaction, "No permission");

      const user = interaction.options.getUser("user");
      const m = await guild.members.fetch(user.id);

      db.get(
        `SELECT freeAgentRole FROM setup WHERE guildId = ?`,
        [guild.id],
        (err, set) => {

          db.get(
            `SELECT teamId FROM players WHERE userId = ?`,
            [user.id],
            (err, row) => {

              if (!row) return safeReply(interaction, "Not found");

              db.get(
                `SELECT roleId FROM teams WHERE id = ?`,
                [row.teamId],
                (err, team) => {

                  if (team?.roleId)
                    m.roles.remove(team.roleId).catch(() => {});

                  if (set?.freeAgentRole)
                    m.roles.add(set.freeAgentRole).catch(() => {});

                  db.run(
                    `DELETE FROM players WHERE userId = ?`,
                    [user.id]
                  );

                  return safeReply(interaction, `📤 Released ${user.username}`);
                }
              );
            }
          );
        }
      );
    }

    /* ---------------- STRIKE ---------------- */
    if (commandName === "strike") {
      if (!isStaff(member, setup))
        return safeReply(interaction, "No permission");

      const user = interaction.options.getUser("user");

      db.run(
        `UPDATE players SET strikes = strikes + 1 WHERE userId = ?`,
        [user.id]
      );

      return safeReply(interaction, `⚠️ Strike added`);
    }

    /* ---------------- WIN ---------------- */
    if (commandName === "win") {
      if (!isStaff(member, setup))
        return safeReply(interaction, "No permission");

      const team = interaction.options.getString("team");

      db.run(
        `UPDATE teams SET wins = wins + 1 WHERE name = ?`,
        [team]
      );

      return safeReply(interaction, `🏆 Win added`);
    }

    /* ---------------- LOSS ---------------- */
    if (commandName === "loss") {
      if (!isStaff(member, setup))
        return safeReply(interaction, "No permission");

      const team = interaction.options.getString("team");

      db.run(
        `UPDATE teams SET losses = losses + 1 WHERE name = ?`,
        [team]
      );

      return safeReply(interaction, `📉 Loss added`);
    }

    /* ---------------- STANDINGS ---------------- */
    if (commandName === "standings") {
      db.all(
        `SELECT * FROM teams WHERE guildId = ? ORDER BY wins DESC`,
        [guild.id],
        (err, rows) => {
          if (!rows?.length) return safeReply(interaction, "No teams");

          let msg = "🏆 SCW STANDINGS\n\n";

          rows.forEach((t, i) => {
            msg += `#${i + 1} ${t.name} - ${t.wins}W/${t.losses}L\n`;
          });

          safeReply(interaction, msg);
        }
      );
    }

  });
});

/* ---------------- START ---------------- */

(async () => {
  await registerCommands();

  if (!TOKEN) return console.log("❌ No token");

  client.login(TOKEN);
})();