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

/* -------------------- SAFE ENV CHECK -------------------- */
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.log("⚠️ Missing env variables!");
  console.log("Make sure DISCORD_TOKEN, CLIENT_ID, GUILD_ID are set.");
}

/* -------------------- BOT CLIENT -------------------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

/* -------------------- DATABASE -------------------- */
const db = new sqlite3.Database("./scw.db", (err) => {
  if (err) return console.error("DB ERROR:", err);
  console.log("📦 SQLite connected");
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS setup (
      guildId TEXT PRIMARY KEY,
      ownerRole TEXT,
      adminRole TEXT,
      modRole TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT,
      name TEXT,
      roleId TEXT,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT,
      userId TEXT,
      teamId INTEGER,
      strikes INTEGER DEFAULT 0
    )
  `);
});

/* -------------------- HELPER -------------------- */
function reply(interaction, msg) {
  return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
}

function isAllowed(member, setupRow) {
  if (!setupRow) return false;

  return (
    member.roles.cache.has(setupRow.ownerRole) ||
    member.roles.cache.has(setupRow.adminRole) ||
    member.roles.cache.has(setupRow.modRole)
  );
}

/* -------------------- COMMANDS -------------------- */
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set SCW roles")
    .addRoleOption(o => o.setName("owner").setDescription("Owner role").setRequired(true))
    .addRoleOption(o => o.setName("admin").setDescription("Admin role").setRequired(true))
    .addRoleOption(o => o.setName("mod").setDescription("Mod role").setRequired(true)),

  new SlashCommandBuilder()
    .setName("addteam")
    .setDescription("Create a team")
    .addStringOption(o => o.setName("name").setDescription("Team name").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sign")
    .setDescription("Sign a player to a team")
    .addUserOption(o => o.setName("user").setDescription("Player").setRequired(true))
    .addStringOption(o => o.setName("team").setDescription("Team name").setRequired(true)),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a player")
    .addUserOption(o => o.setName("user").setDescription("Player").setRequired(true)),

  new SlashCommandBuilder()
    .setName("strike")
    .setDescription("Give a strike")
    .addUserOption(o => o.setName("user").setDescription("Player").setRequired(true)),
];

/* -------------------- REGISTER COMMANDS -------------------- */
async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    console.log("📡 Registering slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Commands registered");
  } catch (err) {
    console.error("COMMAND ERROR:", err);
  }
}

/* -------------------- EVENTS -------------------- */
client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

/* -------------------- COMMAND HANDLER -------------------- */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;

  db.get(
    `SELECT * FROM setup WHERE guildId = ?`,
    [guild.id],
    async (err, setupRow) => {
      if (err) return reply(interaction, "DB error.");

      /* ---------------- SETUP ---------------- */
      if (commandName === "setup") {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
          return reply(interaction, "No permission.");

        const owner = interaction.options.getRole("owner");
        const admin = interaction.options.getRole("admin");
        const mod = interaction.options.getRole("mod");

        db.run(
          `INSERT OR REPLACE INTO setup VALUES (?, ?, ?, ?)`,
          [guild.id, owner.id, admin.id, mod.id]
        );

        return reply(interaction, "⚙️ SCW setup saved.");
      }

      /* ---------------- ADD TEAM ---------------- */
      if (commandName === "addteam") {
        if (!isAllowed(member, setupRow))
          return reply(interaction, "No permission.");

        const name = interaction.options.getString("name");

        db.run(
          `INSERT INTO teams (guildId, name) VALUES (?, ?)`,
          [guild.id, name]
        );

        return reply(interaction, `🏀 Team created: ${name}`);
      }

      /* ---------------- SIGN ---------------- */
      if (commandName === "sign") {
        if (!isAllowed(member, setupRow))
          return reply(interaction, "No permission.");

        const user = interaction.options.getUser("user");
        const teamName = interaction.options.getString("team");

        db.get(
          `SELECT * FROM teams WHERE guildId = ? AND name = ?`,
          [guild.id, teamName],
          (err, team) => {
            if (!team) return reply(interaction, "Team not found.");

            db.run(
              `INSERT OR REPLACE INTO players (guildId, userId, teamId) VALUES (?, ?, ?)`,
              [guild.id, user.id, team.id]
            );

            reply(interaction, `✅ Signed ${user.username} to ${teamName}`);
          }
        );
      }

      /* ---------------- RELEASE ---------------- */
      if (commandName === "release") {
        if (!isAllowed(member, setupRow))
          return reply(interaction, "No permission.");

        const user = interaction.options.getUser("user");

        db.run(
          `DELETE FROM players WHERE guildId = ? AND userId = ?`,
          [guild.id, user.id]
        );

        return reply(interaction, `📤 Released ${user.username}`);
      }

      /* ---------------- STRIKE ---------------- */
      if (commandName === "strike") {
        if (!isAllowed(member, setupRow))
          return reply(interaction, "No permission.");

        const user = interaction.options.getUser("user");

        db.run(
          `UPDATE players SET strikes = strikes + 1 WHERE guildId = ? AND userId = ?`,
          [guild.id, user.id]
        );

        return reply(interaction, `⚠️ Strike given to ${user.username}`);
      }
    }
  );
});

/* -------------------- LOGIN SAFE -------------------- */
(async () => {
  try {
    await registerCommands();
    if (!TOKEN) return console.log("❌ No token found, bot not starting.");
    client.login(TOKEN);
  } catch (err) {
    console.error("BOOT ERROR:", err);
  }
})();