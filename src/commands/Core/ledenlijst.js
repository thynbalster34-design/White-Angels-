import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ROLE_ORDER = [
    {
        name: 'Boss',
        emoji: '👑',
        aliases: ['boss'],
    },
    {
        name: 'Underboss',
        emoji: '💎',
        aliases: ['underboss', 'under boss'],
    },
    {
        name: 'Righthand',
        emoji: '🤝',
        aliases: ['righthand', 'right hand', 'right-hand'],
    },
    {
        name: 'Lefthand',
        emoji: '🤝',
        aliases: ['lefthand', 'left hand', 'left-hand'],
    },
    {
        name: 'Headhitman',
        emoji: '🎯',
        aliases: ['headh​itman', 'head hitman', 'head-hitman'],
    },
    {
        name: 'Hitman',
        emoji: '🔫',
        aliases: ['hitman'],
    },
    {
        name: 'Full Member',
        emoji: '⭐',
        aliases: ['full member', 'fullmember'],
    },
    {
        name: 'Member',
        emoji: '👤',
        aliases: ['member'],
    },
    {
        name: 'Jr. Member',
        emoji: '🟢',
        aliases: [
            'jr. member',
            'jr member',
            'jr-member',
            'jrmember',
            'junior member',
            'juniormember',
        ],
    },
    {
        name: 'Hangaround',
        emoji: '📦',
        aliases: [
            'hangaround',
            'hang around',
            'hang-around',
        ],
    },
];

const MAIN_ROLE_ALIASES = [
    'white angels',
    'whiteangels',
    'white-angels',
];

function normalizeRoleName(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[^a-z0-9]/g, '');
}

function roleMatches(roleName, aliases) {
    const normalizedRole = normalizeRoleName(roleName);

    return aliases.some(
        alias =>
            normalizeRoleName(alias) ===
            normalizedRole
    );
}

async function getAllRoles(guild) {
    try {
        await guild.roles.fetch();
    } catch (error) {
        logger.warn(
            'Could not refresh guild roles, using cached roles instead:',
            error.message
        );
    }

    return guild.roles.cache;
}

function findRole(roles, aliases) {
    return roles.find(role =>
        roleMatches(role.name, aliases)
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

            const roles = await getAllRoles(guild);

            // Zoek de hoofdrol White Angels
            const whiteAngelsRole = findRole(
                roles,
                MAIN_ROLE_ALIASES
            );

            if (!whiteAngelsRole) {
                logger.warn(
                    `White Angels role not found. Available roles: ${roles.map(r => r.name).join(', ')}`
                );

                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        content:
                            '❌ Ik kan de **White Angels**-rol niet vinden. Controleer of de rol exact op de server aanwezig is.',
                    }
                );

                return;
            }

            // Gebruik de bestaande member cache.
            // Alleen fetchen als deze leeg is.
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

            // Alle menselijke leden met de White Angels hoofdrol.
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
                const aliases = [
                    roleInfo.name,
                    ...roleInfo.aliases,
                ];

                const role = findRole(
                    roles,
                    aliases
                );

                if (!role) {
                    fields.push({
                        name:
                            `${roleInfo.emoji} ${roleInfo.name}`,
                        value:
                            '⚠️ Rol niet gevonden',
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

                const value =
                    roleMembers.size > 0
                        ? roleMembers
                              .map(
                                  member =>
                                      `• ${member}`
                              )
                              .join('\n')
                        : '*Geen leden*';

                fields.push({
                    name:
                        `${roleInfo.emoji} ${roleInfo.name}`,
                    value,
                    inline: false,
                });
            }

            const embed = new EmbedBuilder({
                title:
                    '🤍 WHITE ANGELS — LEDENLIJST',

                description:
                    `\n\n**🤍 Totaal aantal leden: ${whiteAngelsMembers.size}**\n`,

                color: 0xFFFFFF,

                fields,

                footer: {
                    text:
                        'White Angels • Ledenlijst',
                    icon_url:
                        interaction.client.user
                            .displayAvatarURL(),
                },

                timestamp:
                    new Date().toISOString(),
            });

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
