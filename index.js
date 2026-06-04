async function registerCommands() {
  try {
    console.log("🔥 STARTING FULL COMMAND RESET");

    if (!CLIENT_ID || !GUILD_ID || !TOKEN) {
      console.log("❌ Missing ENV variables!");
      return;
    }

    console.log("Guild:", GUILD_ID);
    console.log("Client:", CLIENT_ID);

    console.log("📦 Commands sending:", commands.length);

    // WIPE GLOBAL + GUILD (IMPORTANT FIX)
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [] }
    );

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: [] }
    );

    console.log("🧹 Old commands wiped");

    await new Promise(res => setTimeout(res, 1500));

    // REGISTER NEW ON GUILD ONLY
    const data = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ REGISTERED COMMANDS SUCCESSFULLY");
    console.log("Expected:", commands.length);
    console.log("Actual:", data.length);

    console.log("Names:", data.map(c => c.name));

  } catch (err) {
    console.log("❌ COMMAND ERROR:");
    console.log(err);
  }
}