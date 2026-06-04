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

// ================= CLIENT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// ================= SAFE ERROR LOGGING =================
process.on("unhandledRejection", err => {
  console.log("⚠️ ERROR:", err);
});

// ================= DATABASE =================
const db = new sqlite3.Database("./scw.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS setup (
    guildId TEXT,
    ownerRole TEXT,
    adminRole TEXT,
    modRole TEXT
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

// ================= SYSTEM REPLY =================
function reply(i, msg) {
  if (!i.replied) {
    return i.reply({
      content: `⚙️ SCW SYSTEM → ${msg}`,
      ephemeral: true
    });
  }
}

// ================= PLAYER INIT =================
function ensurePlayer(guildId, userId) {
  db.run(
    `INSERT OR IGNORE INTO players VALUES (?,?,?,?,0,0,0,0)`,
    [guildId, userId, null, 0, 0, 0, 0]
  );
}

// ================= READY =================
client.once("ready", () => {
  console.log(`🔥 SCW FULL SYSTEM ONLINE AS ${client.user.tag}`);
});

// ================= COMMAND HANDLER =================
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;
  if (!i.guild) return;

  const { commandName, guild, member } = i;

  db.get(`SELECT * FROM setup WHERE guildId=?`, [guild.id], async (err, setup) => {

    // ================= SETUP =================
    if (commandName === "setup") {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
        return reply(i, "Admin required.");

      const owner = await guild.roles.create({ name: "SCW Owner" });
      const admin = await guild.roles.create({ name: "SCW Admin" });
      const mod = await guild.roles.create({ name: "SCW Mod" });

      await member.roles.add(owner);

      db.run(`INSERT INTO setup VALUES (?,?,?,?)`, [
        guild.id,
        owner.id,
        admin.id,
        mod.id
      ]);

      return reply(i, "System initialized.");
    }

    if (!setup) return reply(i, "Run /setup first.");

    // ================= ADD TEAM =================
    if (commandName === "addteam") {
      const name = i.options.getString("name");

      const role = await guild.roles.create({
        name: `Crew ${name}`
      });

      db.run(`INSERT INTO teams VALUES (?,?,?,?,?)`, [
        guild.id,
        name,
        member.id,
        role.id,
        JSON.stringify([member.id])
      ]);

      await member.roles.add(role);

      return reply(i, `Team ${name} created.`);
    }

    // ================= SIGN PLAYER =================
    if (commandName === "sign-player") {
      const team = i.options.getString("team");
      const user = i.options.getUser("user");

      ensurePlayer(guild.id, user.id);

      db.get(`SELECT * FROM teams WHERE teamName=?`, [team], async (e, t) => {
        if (!t) return reply(i, "Team not found.");

        let roster = JSON.parse(t.roster);

        if (roster.length >= 10)
          return reply(i, "Roster full (10 max).");

        roster.push(user.id);

        db.run(`UPDATE teams SET roster=? WHERE teamName=?`, [
          JSON.stringify(roster),
          team
        ]);

        const role = guild.roles.cache.get(t.roleId);
        const mem = await guild.members.fetch(user.id);

        if (role) await mem.roles.add(role);

        return reply(i, `${user.username} signed.`);
      });
    }

    // ================= RELEASE =================
    if (commandName === "release-player") {
      const team = i.options.getString("team");
      const user = i.options.getUser("user");

      ensurePlayer(guild.id, user.id);

      db.get(`SELECT * FROM teams WHERE teamName=?`, [team], async (e, t) => {
        if (!t) return reply(i, "Team not found.");

        let roster = JSON.parse(t.roster);
        roster = roster.filter(id => id !== user.id);

        db.run(`UPDATE teams SET roster=? WHERE teamName=?`, [
          JSON.stringify(roster),
          team
        ]);

        const role = guild.roles.cache.get(t.roleId);
        const mem = await guild.members.fetch(user.id);

        if (role) await mem.roles.remove(role);

        return reply(i, `${user.username} released.`);
      });
    }

    // ================= STRIKE =================
    if (commandName === "strike") {
      const user = i.options.getUser("user");
      ensurePlayer(guild.id, user.id);

      db.run(`UPDATE players SET strikes = strikes + 1 WHERE userId=?`, [
        user.id
      ]);

      return reply(i, `${user.username} got a strike.`);
    }

    // ================= SUSPEND =================
    if (commandName === "suspend") {
      const user = i.options.getUser("user");
      const mins = i.options.getInteger("minutes");

      ensurePlayer(guild.id, user.id);

      const time = Date.now() + mins * 60000;

      db.run(`UPDATE players SET suspended=? WHERE userId=?`, [
        time,
        user.id
      ]);

      return reply(i, `${user.username} suspended.`);
    }

    // ================= WIN =================
    if (commandName === "win") {
      const user = i.options.getUser("user");
      ensurePlayer(guild.id, user.id);

      db.run(`UPDATE players SET wins = wins + 1 WHERE userId=?`, [
        user.id
      ]);

      return reply(i, `${user.username} +1 win.`);
    }

    // ================= LOSS =================
    if (commandName === "loss") {
      const user = i.options.getUser("user");
      ensurePlayer(guild.id, user.id);

      db.run(`UPDATE players SET losses = losses + 1 WHERE userId=?`, [
        user.id
      ]);

      return reply(i, `${user.username} +1 loss.`);
    }
  });
});

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder().setName("setup").setDescription("Init system"),

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
    .addUserOption(o => o.setName("user").setRequired(true)),

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

// ================= REGISTER =================
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("⚙️ Commands registered");
  } catch (err) {
    console.log("COMMAND ERROR:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);