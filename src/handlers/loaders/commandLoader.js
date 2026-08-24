export async function registerCommands(client, options = {}) {
    const { clientId = null, guildId = null } = options;

    try {
        const { commands, totalSubcommands } = collectCommandPayloads(client);

        validateCommands(commands);

        const commandsToRegister = prepareCommandsForRegistration(commands);

        if (!clientId) {
            throw new Error('CLIENT_ID is required for slash command registration');
        }

        if (!client.rest) {
            throw new Error('Discord REST client is not available');
        }

        // Als een Guild ID aanwezig is:
        // registreer commands direct op die Discord server.
        if (guildId) {
            logger.info(
                `Registering ${commandsToRegister.length} commands to guild ${guildId}...`
            );

            await client.rest.put(
                `/applications/${clientId}/guilds/${guildId}/commands`,
                {
                    body: commandsToRegister,
                }
            );

            logger.info(
                `Successfully registered ${commandsToRegister.length} commands to guild ${guildId}`
            );

            return;
        }

        // Geen Guild ID = oude globale registratie
        await registerGlobalCommands(
            client,
            clientId,
            commands,
            totalSubcommands
        );

    } catch (error) {
        logger.error('Error registering commands:', error);
        throw error;
    }
}
