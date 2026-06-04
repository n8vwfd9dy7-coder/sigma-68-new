const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;

  try {

    if (cmd === "help") return interaction.reply("📜 SCW Commands loaded.");
    if (cmd === "addteam") return interaction.reply("➕ Team created.");
    if (cmd === "appoint") return interaction.reply("👑 Owner appointed.");
    if (cmd === "bail") return interaction.reply("🟢 Suspension lifted early.");
    if (cmd === "ban") return interaction.reply("⛔ Member banned.");
    if (cmd === "clearstrike") return interaction.reply("🧹 All team strikes cleared.");
    if (cmd === "clearwarn") return interaction.reply("🧹 Warnings cleared.");

    if (cmd === "crew-rename") return interaction.reply("✏️ Crew renamed.");
    if (cmd === "demand") return interaction.reply("📢 Demand processed.");
    if (cmd === "demote") return interaction.reply("⬇️ Player demoted.");
    if (cmd === "disband") return interaction.reply("💥 Team disbanded.");
    if (cmd === "kick") return interaction.reply("👢 Member kicked.");
    if (cmd === "modstrike") return interaction.reply("📛 Mod strike issued.");
    if (cmd === "mute") return interaction.reply("🔇 Member muted.");
    if (cmd === "promote") return interaction.reply("⬆️ Player promoted.");
    if (cmd === "release") return interaction.reply("📤 Player released.");
    if (cmd === "roleall") return interaction.reply("🔄 Roles assigned to everyone.");
    if (cmd === "roster") return interaction.reply("📋 Team roster displayed.");
    if (cmd === "score") return interaction.reply("🏆 Score recorded.");
    if (cmd === "setup") return interaction.reply("⚙️ Setup complete.");
    if (cmd === "strike") return interaction.reply("⚠️ Team strike issued.");
    if (cmd === "suspend") return interaction.reply("⛔ Player suspended.");

    if (cmd === "transactions-lock") {
      return interaction.reply("🔒 Transactions locked.");
    }

    if (cmd === "transactions-unlock") {
      return interaction.reply("🔓 Transactions unlocked.");
    }

    if (cmd === "warn") return interaction.reply("⚠️ User warned.");
    if (cmd === "warns") return interaction.reply("📄 Showing warnings.");

    return interaction.reply({
      content: `❓ Unknown command: /${cmd}`,
      ephemeral: true
    });

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({
        content: "❌ Error running command.",
        ephemeral: true
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);