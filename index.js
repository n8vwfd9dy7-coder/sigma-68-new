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

console.log("🚀 SCW v3 FULL BOT STARTING...");

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.log("⚠️ Missing env vars");
}

/* ---------------- CLIENT ---------------- */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

/* ---------------- DB ---------------- */

const db = new sqlite3.Database("./scw.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS config (
    guildId TEXT PRIMARY KEY,
    ownerRole TEXT,
    captainRole TEXT,
    adminRole TEXT,
    modRole TEXT,
    freeAgentRole TEXT,
    scoreChannel TEXT,
    strikeChannel TEXT
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

/* ---------------- SAFE REPLY ---------------- */

async function safe(interaction, msg) {
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

/* ---------------- PERMISSION CHECK ---------------- */

function hasPerm(member, config) {
  if (!config) return false;

  return (
    member.roles.cache.has(config.ownerRole) ||
    member.roles.cache.has(config.captainRole) ||
    member.roles.cache.has(config.adminRole) ||
    member.roles.cache.has(config.modRole)
  );
}

/* ---------------- COMMANDS ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Full SCW setup")
    .addStringOption(o => o.setName("ownerrole").setRequired(true))
    .addStringOption(o => o.setName("captainrole").setRequired(true))
    .addStringOption(o => o.setName("adminrole").setRequired(true))
    .addStringOption(o => o.setName("modrole").setRequired(true))
    .addStringOption(o => o.setName("freeagentrole").setRequired(true))
    .addChannelOption(o => o.setName("scorechannel").setRequired(true))
    .addChannelOption(o => o.setName("strikechannel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("addteam")
    .setDescription("Create team")
    .addStringOption(o => o.setName("name").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sign")
    .setDescription("Sign player (10 max)")
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
    .setDescription("Leaderboard"),
];

/* ---------------- REGISTER ---------------- */

async function register() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Commands registered");
  } catch (err) {
    console.log("Register error:", err.message);
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

  db.get(`SELECT * FROM config WHERE guildId = ?`, [guild.id], async (err, config) => {

    try {

      /* ---------------- SETUP ---------------- */
      if (commandName === "setup") {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
          return safe(interaction, "No permission");

        db.run(
          `INSERT OR REPLACE INTO config VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            guild.id,
            interaction.options.getString("ownerrole"),
            interaction.options.getString("captainrole"),
            interaction.options.getString("adminrole"),
            interaction.options.getString("modrole"),
            interaction.options.getString("freeagentrole"),
            interaction.options.getChannel("scorechannel").id,
            interaction.options.getChannel("strikechannel").id
          ]
        );

        return safe(interaction, "⚙️ SCW FULL SETUP COMPLETE");
      }

      /* ---------------- ADD TEAM ---------------- */
      if (commandName === "addteam") {
        if (!hasPerm(member, config))
          return safe(interaction, "No permission");

        const name = interaction.options.getString("name");

        const role = await guild.roles.create({ name });

        db.run(
          `INSERT INTO teams (guildId, name, roleId) VALUES (?, ?, ?)`,
          [guild.id, name, role.id]
        );

        return safe(interaction, `🏀 Team created: ${name}`);
      }

      /* ---------------- SIGN ---------------- */
      if (commandName === "sign") {
        if (!hasPerm(member, config))
          return safe(interaction, "No permission");

        const user = interaction.options.getUser("user");
        const teamName = interaction.options.getString("team");

        db.get(
          `SELECT * FROM teams WHERE guildId = ? AND name = ?`,
          [guild.id, teamName],
          async (err, team) => {

            if (!team) return safe(interaction, "Team not found");

            db.all(
              `SELECT * FROM players WHERE teamId = ?`,
              [team.id],
              async (err, players) => {

                if (players.length >= 10)
                  return safe(interaction, "❌ Roster full");

                const m = await guild.members.fetch(user.id);

                db.run(
                  `INSERT OR REPLACE INTO players (guildId, userId, teamId) VALUES (?, ?, ?)`,
                  [guild.id, user.id, team.id]
                );

                m.roles.add(team.roleId).catch(() => {});

                return safe(interaction, `✅ ${user.username} signed`);
              }
            );
          }
        );
      }

      /* ---------------- RELEASE ---------------- */
      if (commandName === "release") {
        if (!hasPerm(member, config))
          return safe(interaction, "No permission");

        const user = interaction.options.getUser("user");
        const m = await guild.members.fetch(user.id);

        db.get(`SELECT * FROM players WHERE userId = ?`, [user.id], (err, row) => {
          if (!row) return safe(interaction, "Not found");

          db.get(`SELECT roleId FROM teams WHERE id = ?`, [row.teamId], (err, team) => {
            if (team?.roleId) m.roles.remove(team.roleId).catch(() => {});

            db.run(`DELETE FROM players WHERE userId = ?`, [user.id]);

            return safe(interaction, "📤 Released");
          });
        });
      }

      /* ---------------- STRIKE ---------------- */
      if (commandName === "strike") {
        const user = interaction.options.getUser("user");

        db.run(`UPDATE players SET strikes = strikes + 1 WHERE userId = ?`, [user.id]);

        if (config?.strikeChannel) {
          const ch = guild.channels.cache.get(config.strikeChannel);
          if (ch) ch.send(`⚠️ Strike: <@${user.id}>`);
        }

        return safe(interaction, "⚠️ Strike added");
      }

      /* ---------------- WIN ---------------- */
      if (commandName === "win") {
        const team = interaction.options.getString("team");

        db.run(`UPDATE teams SET wins = wins + 1 WHERE name = ?`, [team]);

        if (config?.scoreChannel) {
          const ch = guild.channels.cache.get(config.scoreChannel);
          if (ch) ch.send(`📊 ${team} got a WIN`);
        }

        return safe(interaction, "🏆 Win added");
      }

      /* ---------------- LOSS ---------------- */
      if (commandName === "loss") {
        const team = interaction.options.getString("team");

        db.run(`UPDATE teams SET losses = losses + 1 WHERE name = ?`, [team]);

        return safe(interaction, "📉 Loss added");
      }

      /* ---------------- STANDINGS ---------------- */
      if (commandName === "standings") {
        db.all(
          `SELECT * FROM teams WHERE guildId = ? ORDER BY wins DESC`,
          [guild.id],
          (err, rows) => {

            if (!rows?.length)
              return safe(interaction, "No teams");

            let msg = "🏆 SCW STANDINGS\n\n";

            rows.forEach((t, i) => {
              msg += `#${i + 1} ${t.name} - ${t.wins}W/${t.losses}L\n`;
            });

            safe(interaction, msg);
          }
        );
      }

    } catch (err) {
      console.log("Crash:", err.message);
      return safe(interaction, "❌ Error occurred");
    }

  });
});

/* ---------------- START ---------------- */

(async () => {
  await register();
  client.login(TOKEN);
})();