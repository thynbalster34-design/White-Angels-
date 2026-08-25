import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

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

// Eén actieve automatische lijst per guild.
const activeLists = new Map();

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

async function buildMemberListEmbed(guild, client) {
    // Rollen uit de cache gebruiken.
    // GuildMemberUpdate houdt de member/rol-cache actueel.
    const whiteAngelsRole = findRole(
        guild,
        MAIN_ROLE_ALIASES
    );

    if (!whiteAngelsRole) {
        throw new Error(
            'De White Angels-rol kon niet worden gevonden.'
        );
    }

    // Alle leden met de White Angels-hoofdrol.
    // Offline leden worden meegenomen zolang de member-cache gevuld is.
    const whiteAngelsMembers =
        guild.members.cache.filter(
            member =>
                !member.user.bot &&
                member.roles.cache.has(
                    whiteAngelsRole.id
                )
        );

    const rankRoles = ROLE_ORDER.map(rank => ({
        ...rank,
        role: findRole(
            guild,
            [rank.name, ...rank.aliases]
        ),
    }));

    const membersByRank = new Map();

    for (const rank of ROLE_ORDER) {
        membersByRank.set(rank.name, []);
    }

    // Ieder lid krijgt alleen de hoogste rang.
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
                    '**🤍 TOTAAL AANTAL LEDEN**',
                    `# ${whiteAngelsMembers.size}`,
                    '',
                    '━━━━━━━━━━━━━━━━━━━━',
                    '',
                ].join('\n')
            );

    for (
        const rank
        of ROLE_ORDER
    ) {
        const members =
            membersByRank.get(
                rank.name
            ) || [];

        members.sort((a, b) =>
            a.displayName.localeCompare(
                b.displayName,
                'nl'
            )
        );

        let value = '*Geen leden*';

        if (members.length > 0) {
            value = members
                .map(
                    member =>
                        `**• ${member}**`
                )
                .join('\n');
        }

        embed.addFields({
            name:
                `**${rank.emoji} ${rank.name.toUpperCase()}**`,
            value,
            inline: false,
        });
    }

    embed.setFooter({
        text:
            'White Angels • Automatisch bijgewerkt',
        iconURL:
            client.user.displayAvatarURL(),
    });

    embed.setTimestamp();

    return embed;
}

function stopExistingList(guildId) {
    const existing = activeLists.get(guildId);

    if (!existing) {
        return;
    }

    clearInterval(existing.interval);
    activeLists.delete(guildId);
}

export default {
    data: new SlashCommandBuilder()
        .setName('ledenlijst')
        .setDescription(
            'Toont de White Angels ledenlijst'
        )
        .setDMPermission(false),

    category: 'Core',

    async execute(interaction) {
        const deferSuccess =
            await InteractionHelper.safeDefer(
                interaction
            );

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

            // Eén volledige member fetch bij het plaatsen
            // van de lijst zodat offline leden beschikbaar zijn.
            try {
                await guild.members.fetch();
            } catch (error) {
                logger.error(
                    'Failed to fetch guild members:',
                    error
                );
            }

            // Eerst een eventueel oude automatische lijst stoppen.
            stopExistingList(guild.id);

            const embed =
                await buildMemberListEmbed(
                    guild,
                    interaction.client
                );

            if (
                !interaction.channel ||
                !interaction.channel.isTextBased()
            ) {
                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        content:
                            '❌ Dit kanaal ondersteunt geen berichten.',
                    }
                );

                return;
            }

            // Ephemeral bevestiging.
            await InteractionHelper.safeEditReply(
                interaction,
                {
                    content:
                        '✅ De White Angels ledenlijst is geplaatst en wordt automatisch elke 30 seconden bijgewerkt.',
                }
            );

            // Normaal bericht in het kanaal.
            const listMessage =
                await interaction.channel.send({
                    embeds: [embed],
                });

            // Automatisch iedere 30 seconden vernieuwen.
            const interval = setInterval(
                async () => {
                    try {
                        // Controleer of het bericht nog bestaat.
                        const currentMessage =
                            await interaction.channel.messages
                                .fetch(listMessage.id)
                                .catch(() => null);

                        if (!currentMessage) {
                            stopExistingList(
                                guild.id
                            );
                            return;
                        }

                        const updatedEmbed =
                            await buildMemberListEmbed(
                                guild,
                                interaction.client
                            );

                        await currentMessage.edit({
                            embeds: [
                                updatedEmbed,
                            ],
                        });
                    } catch (error) {
                        logger.warn(
                            `Failed to update White Angels ledenlijst in guild ${guild.id}:`,
                            error.message
                        );
                    }
                },
                30000
            );

            activeLists.set(
                guild.id,
                {
                    messageId:
                        listMessage.id,
                    channelId:
                        interaction.channel.id,
                    interval,
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
                        '❌ Er ging iets mis bij het plaatsen van de ledenlijst.',
                }
            ).catch(() => {});
        }
    },
};
