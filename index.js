const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("SCW CORE ONLINE");
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;
    console.log("COMMAND RECEIVED:", cmd);

    if (cmd === "help") {
      return interaction.reply("📘 SCW Help Menu");
    }

    if (cmd === "setup") {
      return interaction.reply("⚙️ Setup complete.");
    }

    if (cmd === "addteam") {
      return interaction.reply("➕ Team added.");
    }

    if (cmd === "roster") {
      return interaction.reply("📋 Roster displayed.");
    }

    if (cmd === "sign-player") {
      return interaction.reply("📝 Player signed.");
    }

    if (cmd === "release-player") {
      return interaction.reply("📤 Player released.");
    }

    if (cmd === "warn") {
      return interaction.reply("⚠️ Warning issued.");
    }

    if (cmd === "strike") {
      return interaction.reply("💥 Strike issued.");
    }

    return interaction.reply({
      content: `❓ Unknown command: /${cmd}`,
      ephemeral: true
    });

  } catch (err) {
    console.error("ERROR:", err);

    if (interaction.replied || interaction.deferred) return;

    return interaction.reply({
      content: "❌ Something went wrong.",
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);