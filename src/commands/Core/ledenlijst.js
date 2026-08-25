import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ROLE_ORDER = [
    { name: 'Boss', emoji: '👑' },
    { name: 'Underboss', emoji: '💎' },
    { name: 'Righthand', emoji: '🤝' },
    { name: 'Lefthand', emoji: '🤝' },
    { name: 'Headhitman', emoji: '🎯' },
    { name: 'Hitman', emoji: '🔫' },
    { name: 'Full Member', emoji: '⭐' },
    { name: 'Member', emoji: '👤' },
    { name: 'Jr. Member', emoji: '🟢' },
    { name: 'Hangaround', emoji: '📦' },
];

const MAIN_ROLE = 'White Angels';

function normalizeRoleName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[\s._-]/g, '');
}

function findRole(guild, wantedName) {
    const normalizedWanted = normalizeRoleName(wantedName);

    return guild.roles.cache.find(
        role =>
            normalizeRoleName(role.name) === normalizedWanted
    );
}

export default {
    data: new SlashCommandBuilder()
        .setName('ledenlijst')
        .setDescription('Toont de White Angels ledenlijst')
        .setDMPermission(false),

    category: 'Core',

    async execute(interaction) {
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            return;
        }

        try {
            const guild = interaction.guild;

            if (!guild) {
                await InteractionHelper.safeEditReply(interaction, {
                    content:
                        '❌ Dit command kan alleen in een server gebruikt worden.',
                });
                return;
            }

            // Gebruik de bestaande cache.
            // Alleen fetchen als de cache leeg is.
            if (guild.members.cache.size === 0) {
                try {
                    await guild.members.fetch();
                } catch (error) {
                    logger.error(
                        'Failed to fetch guild members:',
                        error
                    );
                }
            }

            const whiteAngelsRole =
                findRole(guild, MAIN_ROLE);

            if (!whiteAngelsRole) {
                await InteractionHelper.safeEditReply(interaction, {
                    content:
                        `❌ De rol **${MAIN_ROLE}** bestaat niet.`,
                });
                return;
            }

            const whiteAngelsMembers =
                guild.members.cache.filter(
                    member =>
                        !member.user.bot &&
                        member.roles.cache.has(
                            whiteAngelsRole.id
                        )
                );

            const fields = [];

            for (const roleInfo of ROLE_ORDER) {
                const role =
                    findRole(guild, roleInfo.name);

                if (!role) {
                    fields.push({
                        name: `${roleInfo.emoji} ${roleInfo.name}`,
                        value: '⚠️ Rol niet gevonden',
                        inline: false,
                    });

                    continue;
                }

                const roleMembers =
                    whiteAngelsMembers
                        .filter(member =>
                            member.roles.cache.has(role.id)
                        )
                        .sort((a, b) =>
                            a.displayName.localeCompare(
                                b.displayName,
                                'nl'
                            )
                        );

                const value =
                    roleMembers.size > 0
                        ? roleMembers
                              .map(member => `• ${member}`)
                              .join('\n')
                        : '*Geen leden*';

                fields.push({
                    name: `${roleInfo.emoji} ${roleInfo.name}`,
                    value,
                    inline: false,
                });
            }

            // Gebruik de EmbedBuilder-constructor rechtstreeks.
            // Hierdoor worden de globale sanitize-functies uit embeds.js
            // niet aangeroepen en blijven de emoji's behouden.
            const embed = new EmbedBuilder({
                title: '🤍 WHITE ANGELS — LEDENLIJST',
description: `\n\n**🤍 Totaal aantal leden: ${whiteAngelsMembers.size}**\n`,                color: 0xFFFFFF,
                fields,
                footer: {
                    text: 'White Angels • Ledenlijst',
                    icon_url:
                        interaction.client.user.displayAvatarURL(),
                },
                timestamp: new Date().toISOString(),
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });

        } catch (error) {
            logger.error(
                'Ledenlijst command error:',
                error
            );

            await InteractionHelper.safeEditReply(interaction, {
                content:
                    '❌ Er ging iets mis bij het ophalen van de ledenlijst.',
            }).catch(() => {});
        }
    },
};
