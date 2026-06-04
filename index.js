const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // TEST COMMAND (to confirm bot works)
  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }

  // 🔥 ADD YOUR SCW COMMANDS BELOW THIS LINE
  // Example:
  // if (interaction.commandName === "sign-player") {
  //   await interaction.reply("Player signed!");
  // }
});

client.login(process.env.DISCORD_TOKEN);