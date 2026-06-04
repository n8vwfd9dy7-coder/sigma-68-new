const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    // THIS STOPS "APPLICATION DID NOT RESPOND"
    await interaction.reply({
      content: `Command received: /${interaction.commandName}`,
      ephemeral: true
    });
  } catch (err) {
    console.error("Error handling command:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);