import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

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
    const wanted = normalizeRoleName(wantedName);

    return guild.roles.cache.find(
        role =>
            normalizeRoleName(role.name) === wanted
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
                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        content:
                            '❌ Dit command kan alleen in een server gebruikt worden.',
                    }
                );
                return;
            }

            // Gebruik de bestaande leden-cache.
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
                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        content:
                            `❌ De rol **${MAIN_ROLE}** bestaat niet.`,
                    }
                );
                return;
            }

            // Alleen niet-bot leden met de White Angels rol.
            const whiteAngelsMembers =
                guild.members.cache.filter(
                    member =>
                        !member.user.bot &&
                        member.roles.cache.has(
                            whiteAngelsRole.id
                        )
                );

            const embed = new EmbedBuilder()
                .setTitle(
                    '🤍 WHITE ANGELS — LEDENLIJST'
                )
                .setDescription(
                    `\n**🤍 Totaal aantal leden: ${whiteAngelsMembers.size}**`
                )
                .setColor('#FFFFFF');

            for (const roleInfo of ROLE_ORDER) {
                const role =
                    findRole(guild, roleInfo.name);

                if (!role) {
                    embed.addFields({
                        name:
                            `${roleInfo.emoji} ${roleInfo.name}`,
                        value:
                            '*Rol niet gevonden*',
                        inline: false,
                    });

                    continue;
                }

                const roleMembers =
                    whiteAngelsMembers
                        .filter(member =>
                            member.roles.cache.has(
                                role.id
                            )
                        )
                        .sort((a, b) =>
                            a.displayName.localeCompare(
                                b.displayName,
                                'nl'
                            )
                        );

                let value;

                if (roleMembers.size === 0) {
                    value = '*Geen leden*';
                } else {
                    value = roleMembers
                        .map(member => `• ${member}`)
                        .join('\n');
                }

                embed.addFields({
                    name:
                        `${roleInfo.emoji} ${roleInfo.name}`,
                    value,
                    inline: false,
                });
            }

            embed.setFooter({
                text:
                    'White Angels • Ledenlijst',
                iconURL:
                    interaction.client.user
                        .displayAvatarURL(),
            });

            embed.setTimestamp();

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [embed],
                }
            );

        } catch (error) {
            logger.error(
                'Ledenlijst command error:',
                error
            );

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    content:
                        '❌ Er ging iets mis bij het ophalen van de ledenlijst.',
                }
            ).catch(() => {});
        }
    },
};
