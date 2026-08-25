import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ROLE_ORDER = [
    { name: 'Boss', emoji: '👑', aliases: ['boss'] },
    { name: 'Underboss', emoji: '💎', aliases: ['underboss', 'under boss'] },
    { name: 'Righthand', emoji: '🤝', aliases: ['righthand', 'right hand', 'right-hand'] },
    { name: 'Lefthand', emoji: '🤝', aliases: ['lefthand', 'left hand', 'left-hand'] },
    { name: 'Headhitman', emoji: '🎯', aliases: ['headh​itman', 'head hitman', 'head-hitman'] },
    { name: 'Hitman', emoji: '🔫', aliases: ['hitman'] },
    { name: 'Full Member', emoji: '⭐', aliases: ['full member', 'fullmember'] },
    { name: 'Member', emoji: '👤', aliases: ['member'] },
    { name: 'Jr. Member', emoji: '🟢', aliases: ['jr member', 'jr. member', 'jr-member', 'jrmember', 'junior member'] },
    { name: 'Hangaround', emoji: '📦', aliases: ['hangaround', 'hang around', 'hang-around'] },
];

const MAIN_ROLE_ALIASES = [
    'white angels',
    'whiteangels',
    'white-angels',
];

let memberFetchPromise = null;
let lastMemberFetch = 0;

function normalizeRoleName(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[^a-z0-9]/g, '');
}

function roleMatches(roleName, aliases) {
    const normalizedRole = normalizeRoleName(roleName);

    return aliases.some(
        alias => normalizeRoleName(alias) === normalizedRole
    );
}

function findRole(guild, aliases) {
    return guild.roles.cache.find(role =>
        roleMatches(role.name, aliases)
    );
}

async function refreshMembers(guild) {
    const now = Date.now();

    // Niet iedere keer opnieuw alle leden ophalen.
    // Maximaal één volledige fetch per 60 seconden.
    if (
        memberFetchPromise &&
        now - lastMemberFetch < 60000
    ) {
        return memberFetchPromise;
    }

    lastMemberFetch = now;

    memberFetchPromise = guild.members
        .fetch()
        .then(members => {
            logger.info(
                `Fetched ${members.size} members for White Angels ledenlijst.`
            );

            return members;
        })
        .catch(error => {
            memberFetchPromise = null;

            logger.error(
                'Failed to fetch all guild members:',
                error
            );

            throw error;
        });

    return memberFetchPromise;
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

            // Alle leden ophalen, inclusief offline leden.
            await refreshMembers(guild);

            // Rollen verversen.
            await guild.roles.fetch().catch(error => {
                logger.warn(
                    'Could not refresh guild roles:',
                    error.message
                );
            });

            const whiteAngelsRole =
                findRole(
                    guild,
                    MAIN_ROLE_ALIASES
                );

            if (!whiteAngelsRole) {
                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        content:
                            '❌ Ik kan de **White Angels**-rol niet vinden.',
                    }
                );

                return;
            }

            // Alle mensen met de White Angels hoofdrol.
            const whiteAngelsMembers =
                guild.members.cache.filter(
                    member =>
                        !member.user.bot &&
                        member.roles.cache.has(
                            whiteAngelsRole.id
                        )
                );

            // Rangrollen zoeken.
            const rankRoles =
                ROLE_ORDER.map(rank => ({
                    ...rank,
                    role: findRole(
                        guild,
                        [
                            rank.name,
                            ...rank.aliases,
                        ]
                    ),
                }));

            // Leden per rang.
            const membersByRank =
                new Map();

            for (const rank of ROLE_ORDER) {
                membersByRank.set(
                    rank.name,
                    []
                );
            }

            // Ieder lid krijgt alleen zijn hoogste rang.
            for (
                const member
                of whiteAngelsMembers.values()
            ) {
                for (
                    const rank
                    of rankRoles
                ) {
                    if (
                        rank.role &&
                        member.roles.cache.has(
                            rank.role.id
                        )
                    ) {
                        membersByRank
                            .get(rank.name)
                            .push(member);

                        break;
                    }
                }
            }

            // Maak de embed.
            const embed =
                new EmbedBuilder()
                    .setColor(0xFFFFFF)
                    .setTitle(
                        '🤍 WHITE ANGELS — LEDENLIJST'
                    )
                    .setDescription(
                        [
                            '',
                            '',
                            `## 🤍 TOTAAL AANTAL LEDEN`,
                            `# ${whiteAngelsMembers.size}`,
                            '',
                            '━━━━━━━━━━━━━━━━━━━━',
                            '',
                        ].join('\n')
                    );

            // Elke rang groot en duidelijk.
            for (
                const rank
                of ROLE_ORDER
            ) {
                const members =
                    membersByRank.get(
                        rank.name
                    ) || [];

                const memberLines =
                    members
                        .sort((a, b) =>
                            a.displayName.localeCompare(
                                b.displayName,
                                'nl'
                            )
                        )
                        .map(
                            member =>
                                `• ${member}`
                        );

                let value =
                    '*Geen leden*';

                if (
                    memberLines.length > 0
                ) {
                    value =
                        memberLines.join(
                            '\n'
                        );
                }

                embed.addFields({
                    name:
                        `## ${rank.emoji} ${rank.name.toUpperCase()}`,
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
