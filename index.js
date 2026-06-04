require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const db = new sqlite3.Database("./scw.db");

// ================= DATABASE =================
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS setup (
    guildId TEXT,
    ownerRole TEXT,
    adminRole TEXT,
    modRole TEXT,
    transactionsLock INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS teams (
    guildId TEXT,
    teamName TEXT,
    ownerId TEXT,
    roleId TEXT,
    roster TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS players (
    guildId TEXT,
    userId TEXT,
    team TEXT,
    strikes INTEGER DEFAULT 0,
    suspended INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0
  )`);
});

// ================= SYSTEM MESSAGE =================
function systemReply(interaction, msg) {
  return interaction.reply({
    content: `⚙️ SCW SYSTEM → ${msg}`,
    ephemeral: true
  });
}

// ================= PLAYER INIT =================
function ensurePlayer(guildId, userId) {
  db.run(
    `INSERT OR IGNORE INTO players VALUES (?,?,?,?,0,0,0,0)`,
    [guildId, userId, null, 0, 0, 0, 0]
  );
}

// ================= PERMISSIONS =================
function getPerm(member, roles) {
  if (!roles) return 0;
  if (member.roles.cache.has(roles.ownerRole)) return 3;
  if (member.roles.cache.has(roles.adminRole)) return 2;
  if (member.roles.cache.has(roles.modRole)) return 1;
  return 0;
}

// ================= READY =================
client.once("ready", () => {
  console.log(`🔥 SCW FJX PRO ONLINE AS ${client.user.tag}`);
});

// ================= COMMAND HANDLER =================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;

  db.get(`SELECT * FROM setup WHERE guildId=?`, [guild.id], async (err, roles) => {

    // ================= SETUP =================
    if (commandName === "setup") {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
        return systemReply(interaction, "Admin required.");

      const ownerRole = await guild.roles.create({ name: "SCW Owner" });
      const adminRole = await guild.roles.create({ name: "SCW Admin" });
      const modRole = await guild.roles.create({ name: "SCW Mod" });

      await member.roles.add(ownerRole);

      db.run(
        `INSERT INTO setup VALUES (?,?,?,?,0)`,
        [guild.id, ownerRole.id, adminRole.id, modRole.id]
      );

      return systemReply(interaction, "Setup complete. Roles created.");
    }

    if (!roles)
      return systemReply(interaction, "System not initialized. Run /setup");

    const perm = getPerm(member, roles);

    // ================= ADD TEAM =================
    if (commandName === "addteam") {
      if (perm < 2) return systemReply(interaction, "Admin required.");

      const name = interaction.options.getString("name");

      const role = await guild.roles.create({
        name: `Crew: ${name}`
      });

      db.run(
        `INSERT INTO teams VALUES (?,?,?,?,?)`,
        [guild.id, name, member.id, role.id, JSON.stringify([member.id])]
      );

      await member.roles.add(role);

      return systemReply(interaction, `Team ${name} created.`);
    }

    // ================= SIGN PLAYER =================
    if (commandName === "sign-player") {
      const team = interaction.options.getString("team");
      const user = interaction.options.getUser("user");

      ensurePlayer(guild.id, user.id);

      db.get(
        `SELECT * FROM teams WHERE guildId=? AND teamName=?`,
        [guild.id, team],
        async (err, t) => {
          if (!t) return systemReply(interaction, "Team not found.");

          let roster = JSON.parse(t.roster);

          if (roster.length >= 10)
            return systemReply(interaction, "Roster full (10 max).");

          roster.push(user.id);

          db.run(
            `UPDATE teams SET roster=? WHERE teamName=?`,
            [JSON.stringify(roster), team]
          );

          const role = guild.roles.cache.get(t.roleId);
          const mem = await guild.members.fetch(user.id);

          await mem.roles.add(role);

          db.run(
            `UPDATE players SET team=? WHERE userId=?`,
            [team, user.id]
          );

          return systemReply(interaction, `${user.username} signed.`);
        }
      );
    }

    // ================= RELEASE PLAYER =================
    if (commandName === "release-player") {
      const team = interaction.options.getString("team");
      const user = interaction.options.getUser("user");

      ensurePlayer(guild.id, user.id);

      db.get(
        `SELECT * FROM teams WHERE guildId=? AND teamName=?`,
        [guild.id, team],
        async (err, t) => {
          if (!t) return systemReply(interaction, "Team not found.");

          let roster = JSON.parse(t.roster);
          roster = roster.filter(id => id !== user.id);

          db.run(
            `UPDATE teams SET roster=? WHERE teamName=?`,
            [JSON.stringify(roster), team]
          );

          const role = guild.roles.cache.get(t.roleId);
          const mem = await guild.members.fetch(user.id);

          await mem.roles.remove(role);

          db.run(
            `UPDATE players SET team=NULL WHERE userId=?`,
            [user.id]
          );

          return systemReply(interaction, `${user.username} released.`);
        }
      );
    }

    // ================= STRIKE =================
    if (commandName === "strike") {
      if (perm < 1) return systemReply(interaction, "Mod required.");

      const user = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");

      ensurePlayer(guild.id, user.id);

      db.run(
        `UPDATE players SET strikes = strikes + 1 WHERE userId=?`,
        [user.id]
      );

      return systemReply(interaction, `${user.username} +1 strike (${reason})`);
    }

    // ================= SUSPEND =================
    if (commandName === "suspend") {
      if (perm < 2) return systemReply(interaction, "Admin required.");

      const user = interaction.options.getUser("user");
      const minutes = interaction.options.getInteger("minutes");

      ensurePlayer(guild.id, user.id);

      const until = Date.now() + minutes * 60000;

      db.run(
        `UPDATE players SET suspended=? WHERE userId=?`,
        [until, user.id]
      );

      return systemReply(interaction, `${user.username} suspended ${minutes}m`);
    }

    // ================= WIN =================
    if (commandName === "win") {
      const user = interaction.options.getUser("user");

      ensurePlayer(guild.id, user.id);

      db.run(
        `UPDATE players SET wins = wins + 1 WHERE userId=?`,
        [user.id]
      );

      return systemReply(interaction, `${user.username} +1 WIN`);
    }

    // ================= LOSS =================
    if (commandName === "loss") {
      const user = interaction.options.getUser("user");

      ensurePlayer(guild.id, user.id);

      db.run(
        `UPDATE players SET losses = losses + 1 WHERE userId=?`,
        [user.id]
      );

      return systemReply(interaction, `${user.username} +1 LOSS`);
    }
  });
});

// ================= COMMAND REGISTRATION =================
const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Initialize system"),

  new SlashCommandBuilder()
    .setName("addteam")
    .setDescription("Create team")
    .addStringOption(o => o.setName("name").setRequired(true)),

  new SlashCommandBuilder()
    .setName("sign-player")
    .setDescription("Sign player")
    .addStringOption(o => o.setName("team").setRequired(true))
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("release-player")
    .setDescription("Release player")
    .addStringOption(o => o.setName("team").setRequired(true))
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("strike")
    .setDescription("Give strike")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addStringOption(o => o.setName("reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("suspend")
    .setDescription("Suspend player")
    .addUserOption(o => o.setName("user").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setRequired(true)),

  new SlashCommandBuilder()
    .setName("win")
    .setDescription("Add win")
    .addUserOption(o => o.setName("user").setRequired(true)),

  new SlashCommandBuilder()
    .setName("loss")
    .setDescription("Add loss")
    .addUserOption(o => o.setName("user").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log("⚙️ Commands registered");
});

client.login(process.env.DISCORD_TOKEN);