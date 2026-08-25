async function buildPanelEmbed(config, guild) {
    let memberCount = 0;
    let statusEmoji = '🟢';

    try {
        // Alle leden ophalen, inclusief offline leden.
        await guild.members.fetch();

        // Zoek specifiek de White Angels-rol.
        const whiteAngelsRole = guild.roles.cache.find(
            role =>
                role.name.trim().toLowerCase() ===
                'white angels'
        );

        if (whiteAngelsRole) {
            // Alleen mensen met de White Angels-rol tellen.
            // Bots worden niet meegerekend.
            memberCount = guild.members.cache.filter(
                member =>
                    !member.user.bot &&
                    member.roles.cache.has(
                        whiteAngelsRole.id
                    )
            ).size;
        }

        // Status bepalen op basis van het aantal White Angels.
        if (memberCount >= 20) {
            statusEmoji = '🔴';
        } else if (memberCount >= 17) {
            statusEmoji = '🟠';
        } else {
            statusEmoji = '🟢';
        }

    } catch (error) {
        logger.warn(
            `Could not count White Angels members in guild ${guild.id}:`,
            error.message
        );
    }

    return new EmbedBuilder()
        .setTitle('White Angels')
        .setDescription(
            `__**Sollicitatie status:**__\n\n` +
            `🟢 Sollicitatie staat open\n` +
            `🟠 Sollicitatie staan open, maar met een kleine wachtrij of weinig plekken nog beschikbaar\n` +
            `🔴 Sollicitatie is gesloten met een korte/lange wachtrij\n\n` +
            `**SOLLICITATIE STATUS: ${statusEmoji}**\n\n` +
            `**__*Aantal leden: ${memberCount}*__**`
        )
        .setColor(getColor('info'));
}
