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

/* ---------------- SAFE ENV ---------------- */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

console.log("🚀 SCW BOT STARTING...");

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.log("⚠️ Missing env variables (bot may not function fully)");
}

/* ---------------- CLIENT ---------------- */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

/* ---------------- DATABASE ---------------- */

const db = new sqlite3.Database("./scw.db", (err) => {
  if (err) console.log("DB ERROR:", err.message);
  else console.log("📦 Database connected");
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
    CREATE TABLE IF NOT EXISTS settings (
      guildId TEXT PRIMARY KEY,
      freeAgentRole TEXT
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

/* ---------------- HELPERS ---------------- */

function reply(interaction, msg) {
  return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
}

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
    .setDescription("Setup SCW system")
    .addRoleOption(o => o.setName("owner").setRequired(true))
    .addRoleOption(o => o.setName("admin").setRequired(true))
    .addRoleOption(o => o.setName("mod").setRequired(true))
    .addRoleOption(o => o.setName("freeagent").setRequired(true)),

  new SlashCommandBuilder()
    .setName("addteam")
    .setDescription("Create a team")
    .addStringOption(o => o.setName("name").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sign")
    .setDescription("Sign player to team")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("team").setRequired(true)),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release player")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("strike")
    .setDescription("Give strike to player")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("win")
    .setDescription("Add win to team")
    .addStringOption(o => o.setName("team").setRequired(true)),

  new SlashCommandBuilder()
    .setName("loss")
    .setDescription("Add loss to team")
    .addStringOption(o => o.setName("team").setRequired(true)),
];

/* ---------------- REGISTER COMMANDS ---------------- */

async function registerCommands() {
  try {
    if (!TOKEN) return console.log("❌ No token");

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Commands registered");
  } catch (err) {
    console.log("❌ Command register error:", err.message);
  }
}

/* ---------------- READY ---------------- */

client.once("ready", () => {
  console.log(`🤖 ONLINE: ${client.user.tag}`);
});

/* ---------------- COMMAND HANDLER ---------------- */

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;

  db.get(`SELECT * FROM setup WHERE guildId = ?`, [guild.id], async (err, setup) => {

    /* ---------------- SETUP ---------------- */

    if (commandName === "setup") {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
        return reply(interaction, "No permission");

      const owner = interaction.options.getRole("owner");
      const admin = interaction.options.getRole("admin");
      const mod = interaction.options.getRole("mod");
      const free = interaction.options.getRole("freeagent");

      db.run(`INSERT OR REPLACE INTO setup VALUES (?, ?, ?, ?)`,
        [guild.id, owner.id, admin.id, mod.id]);

      db.run(`INSERT OR REPLACE INTO settings VALUES (?, ?)`,
        [guild.id, free.id]);

      return reply(interaction, "⚙️ SCW system setup complete");
    }

    /* ---------------- ADD TEAM ---------------- */

    if (commandName === "addteam") {
      if (!isStaff(member, setup)) return reply(interaction, "No permission");

      const name = interaction.options.getString("name");

      const role = await guild.roles.create({
        name: name,
        reason: "SCW Team Created"
      });

      db.run(
        `INSERT INTO teams (guildId, name, roleId) VALUES (?, ?, ?)`,
        [guild.id, name, role.id]
      );

      return reply(interaction, `🏀 Team created: ${name}`);
    }

    /* ---------------- SIGN (10 PLAYER LIMIT + ROLES) ---------------- */

    if (commandName === "sign") {
      if (!isStaff(member, setup)) return reply(interaction, "No permission");

      const user = interaction.options.getUser("user");
      const teamName = interaction.options.getString("team");

      db.get(
        `SELECT * FROM teams WHERE guildId = ? AND name = ?`,
        [guild.id, teamName],
        async (err, team) => {

          if (!team) return reply(interaction, "Team not found");

          db.all(
            `SELECT * FROM players WHERE teamId = ?`,
            [team.id],
            async (err, players) => {

              if (players.length >= 10) {
                return reply(interaction, "❌ Team roster is FULL (10/10)");
              }

              const memberUser = await guild.members.fetch(user.id);

              db.get(
                `SELECT freeAgentRole FROM settings WHERE guildId = ?`,
                [guild.id],
                (err, set) => {

                  db.run(
                    `INSERT OR REPLACE INTO players (guildId, userId, teamId) VALUES (?, ?, ?)`,
                    [guild.id, user.id, team.id]
                  );

                  if (set?.freeAgentRole) {
                    memberUser.roles.remove(set.freeAgentRole).catch(() => {});
                  }

                  if (team.roleId) {
                    memberUser.roles.add(team.roleId).catch(() => {});
                  }

                  return reply(
                    interaction,
                    `✅ ${user.username} signed to ${team.name} (${players.length + 1}/10)`
                  );
                }
              );
            }
          );
        }
      );
    }

    /* ---------------- RELEASE ---------------- */

    if (commandName === "release") {
      if (!isStaff(member, setup)) return reply(interaction, "No permission");

      const user = interaction.options.getUser("user");
      const memberUser = await guild.members.fetch(user.id);

      db.get(
        `SELECT freeAgentRole FROM settings WHERE guildId = ?`,
        [guild.id],
        (err, set) => {

          db.get(
            `SELECT teamId FROM players WHERE guildId = ? AND userId = ?`,
            [guild.id, user.id],
            (err, row) => {

              if (!row) return reply(interaction, "Player not found");

              db.get(
                `SELECT roleId FROM teams WHERE id = ?`,
                [row.teamId],
                (err, team) => {

                  if (team?.roleId) {
                    memberUser.roles.remove(team.roleId).catch(() => {});
                  }

                  if (set?.freeAgentRole) {
                    memberUser.roles.add(set.freeAgentRole).catch(() => {});
                  }

                  db.run(
                    `DELETE FROM players WHERE guildId = ? AND userId = ?`,
                    [guild.id, user.id]
                  );

                  return reply(interaction, `📤 Released ${user.username}`);
                }
              );
            }
          );
        }
      );
    }

    /* ---------------- STRIKE ---------------- */

    if (commandName === "strike") {
      if (!isStaff(member, setup)) return reply(interaction, "No permission");

      const user = interaction.options.getUser("user");

      db.run(
        `UPDATE players SET strikes = strikes + 1 WHERE guildId = ? AND userId = ?`,
        [guild.id, user.id]
      );

      return reply(interaction, `⚠️ Strike added to ${user.username}`);
    }

    /* ---------------- WIN ---------------- */

    if (commandName === "win") {
      if (!isStaff(member, setup)) return reply(interaction, "No permission");

      const team = interaction.options.getString("team");

      db.run(
        `UPDATE teams SET wins = wins + 1 WHERE guildId = ? AND name = ?`,
        [guild.id, team]
      );

      return reply(interaction, `🏆 Win added to ${team}`);
    }

    /* ---------------- LOSS ---------------- */

    if (commandName === "loss") {
      if (!isStaff(member, setup)) return reply(interaction, "No permission");

      const team = interaction.options.getString("team");

      db.run(
        `UPDATE teams SET losses = losses + 1 WHERE guildId = ? AND name = ?`,
        [guild.id, team]
      );

      return reply(interaction, `📉 Loss added to ${team}`);
    }
  });
});

/* ---------------- START BOT ---------------- */

(async () => {
  await registerCommands();

  if (!TOKEN) {
    console.log("❌ No token, bot not starting");
    return;
  }

  client.login(TOKEN);
})();