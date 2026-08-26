import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

import {
    logger,
    startupLog,
} from '../../utils/logger.js';

import {
    InteractionHelper,
} from '../../utils/interactionHelper.js';

import {
    getGuildConfig,
    setGuildConfig,
} from '../../services/config/guildConfig.js';

/* ============================================================
   ROL-ID'S
   ============================================================ */

const WHITE_ANGELS_ROLE_ID =
    '1437696432340467786';

const ROLE_ORDER = [
    {
        name: 'Boss',
        emoji: '👑',
        id: '1437696432583868582',
    },
    {
        name: 'Underboss',
        emoji: '💎',
        id: '1437696432583868581',
    },
    {
        name: 'Righthand',
        emoji: '🤝',
        id: '1437696432583868578',
    },
    {
        name: 'Lefthand',
        emoji: '🤝',
        id: '1437696432412033114',
    },
    {
        name: 'Headhitman',
        emoji: '🎯',
        id: '1437696432412033113',
    },
    {
        name: 'Hitman',
        emoji: '🔫',
        id: '1437696432412033112',
    },
    {
        name: 'Full Member',
        emoji: '⭐',
        id: '1437696432412033111',
    },
    {
        name: 'Member',
        emoji: '👤',
        id: '1437696432412033109',
    },
    {
        name: 'Jr. Member',
        emoji: '🟢',
        id: '1437696432412033108',
    },
    {
        name: 'Hangaround',
        emoji: '📦',
        id: '1523068684241735810',
    },
];

/* ============================================================
   CONFIG
   ============================================================ */

const UPDATE_INTERVAL =
    30_000;

/*
 * Deze twee keys worden in guildConfig opgeslagen.
 * Daardoor weten we na een bot-restart welk bericht
 * opnieuw bijgewerkt moet worden.
 */
const MEMBER_LIST_CHANNEL_KEY =
    'whiteAngelsMemberListChannelId';

const MEMBER_LIST_MESSAGE_KEY =
    'whiteAngelsMemberListMessageId';

/* ============================================================
   ACTIEVE UPDATERS
   ============================================================ */

const activeLists =
    new Map();

/* ============================================================
   WHITE ANGELS TELLEN
   ============================================================ */

async function getWhiteAngelsMemberCount(
    guild
) {
    try {
        /*
         * Gebruik Discord's actuele rol-count API.
         */
        if (
            guild.roles &&
            typeof guild.roles.fetchMemberCounts ===
                'function'
        ) {
            const roleCounts =
                await guild.roles.fetchMemberCounts();

            const count =
                Number(
                    roleCounts.get(
                        WHITE_ANGELS_ROLE_ID
                    ) || 0
                );

            return count;
        }

        /*
         * Fallback wanneer fetchMemberCounts niet
         * beschikbaar is.
         */
        const members =
            await guild.members.fetch();

        return members.filter(
            member =>
                !member.user.bot &&
                member.roles.cache.has(
                    WHITE_ANGELS_ROLE_ID
                )
        ).size;

    } catch (error) {
        logger.error(
            `Failed to count White Angels members in ${guild.id}:`,
            error
        );

        return 0;
    }
}

/* ============================================================
   MEMBERS PER RANG
   ============================================================ */

async function getMembersByRank(
    guild
) {
    /*
     * We hebben voor de rangen de daadwerkelijke
     * GuildMember objects nodig.
     */
    let members;

    try {
        /*
         * Forceer een refresh zodat role changes
         * worden meegenomen.
         */
        members =
            await guild.members.fetch({
                force: true,
            });
    } catch (error) {
        logger.warn(
            `Could not fully refresh members for ${guild.name}: ${error.message}`
        );

        members =
            guild.members.cache;
    }

    const whiteAngelsMembers =
        members.filter(
            member =>
                !member.user.bot &&
                member.roles.cache.has(
                    WHITE_ANGELS_ROLE_ID
                )
        );

    const membersByRank =
        new Map();

    for (
        const rank
        of ROLE_ORDER
    ) {
        membersByRank.set(
            rank.id,
            []
        );
    }

    /*
     * Ieder lid komt alleen onder zijn hoogste rang.
     */
    for (
        const member
        of whiteAngelsMembers.values()
    ) {
        for (
            const rank
            of ROLE_ORDER
        ) {
            if (
                member.roles.cache.has(
                    rank.id
                )
            ) {
                membersByRank
                    .get(rank.id)
                    .push(member);

                break;
            }
        }
    }

    return {
        whiteAngelsMembers,
        membersByRank,
    };
}

/* ============================================================
   EMBED MAKEN
   ============================================================ */

async function buildMemberListEmbed(
    guild,
    client
) {
    /*
     * Hoofdtelling via role count.
     */
    const totalCount =
        await getWhiteAngelsMemberCount(
            guild
        );

    /*
     * Rangleden ophalen.
     */
    const {
        whiteAngelsMembers,
        membersByRank,
    } =
        await getMembersByRank(
            guild
        );

    const embed =
        new EmbedBuilder()
            .setColor(
                0xFFFFFF
            )
            .setTitle(
                '🤍 Kompaniya — LEDENLIJST'
            )
            .setDescription(
                [
                    '',
                    '**🤍 TOTAAL AANTAL LEDEN**',
                    `# ${totalCount}`,
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
                rank.id
            ) || [];

        members.sort(
            (a, b) =>
                a.displayName.localeCompare(
                    b.displayName,
                    'nl'
                )
        );

        let value =
            '*Geen leden*';

        if (
            members.length > 0
        ) {
            value =
                members
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
            inline:
                false,
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

/* ============================================================
   CONFIG OPSLAAN
   ============================================================ */

async function saveMemberListLocation(
    client,
    guildId,
    channelId,
    messageId
) {
    try {
        const guildConfig =
            await getGuildConfig(
                client,
                guildId
            );

        guildConfig[
            MEMBER_LIST_CHANNEL_KEY
        ] = channelId;

        guildConfig[
            MEMBER_LIST_MESSAGE_KEY
        ] = messageId;

        await setGuildConfig(
            client,
            guildId,
            guildConfig
        );

    } catch (error) {
        logger.warn(
            `Could not save White Angels member list location for ${guildId}: ${error.message}`
        );
    }
}

/* ============================================================
   CONFIG OPHALEN
   ============================================================ */

async function getSavedMemberList(
    client,
    guildId
) {
    try {
        const guildConfig =
            await getGuildConfig(
                client,
                guildId
            );

        return {
            channelId:
                guildConfig[
                    MEMBER_LIST_CHANNEL_KEY
                ] || null,

            messageId:
                guildConfig[
                    MEMBER_LIST_MESSAGE_KEY
                ] || null,
        };
    } catch (error) {
        logger.warn(
            `Could not load White Angels member list location for ${guildId}: ${error.message}`
        );

        return {
            channelId: null,
            messageId: null,
        };
    }
}

/* ============================================================
   BESTAAND LIJSTBERICHT VINDEN
   ============================================================ */

async function findExistingMemberList(
    client,
    guild
) {
    const saved =
        await getSavedMemberList(
            client,
            guild.id
        );

    /*
     * 1. Opgeslagen channel + message gebruiken.
     */
    if (
        saved.channelId &&
        saved.messageId
    ) {
        const channel =
            await guild.channels
                .fetch(
                    saved.channelId
                )
                .catch(
                    () => null
                );

        if (
            channel &&
            channel.isTextBased()
        ) {
            const message =
                await channel.messages
                    .fetch(
                        saved.messageId
                    )
                    .catch(
                        () => null
                    );

            if (message) {
                return {
                    channel,
                    message,
                };
            }
        }
    }

    /*
     * 2. Zoek in recente berichten wanneer
     * het opgeslagen bericht niet meer bestaat.
     */
    if (
        saved.channelId
    ) {
        const channel =
            await guild.channels
                .fetch(
                    saved.channelId
                )
                .catch(
                    () => null
                );

        if (
            channel &&
            channel.isTextBased()
        ) {
            const messages =
                await channel.messages
                    .fetch({
                        limit: 100,
                    })
                    .catch(
                        () => null
                    );

            if (messages) {
                const found =
                    messages.find(
                        message =>
                            message.author?.id ===
                                client.user.id &&
                            message.embeds?.some(
                                embed =>
                                    embed.title
                                        ?.toLowerCase()
                                        .includes(
                                            'white angels'
                                        ) &&
                                    embed.title
                                        ?.toLowerCase()
                                        .includes(
                                            'ledenlijst'
                                        )
                            )
                    );

                if (found) {
                    await saveMemberListLocation(
                        client,
                        guild.id,
                        channel.id,
                        found.id
                    );

                    return {
                        channel,
                        message: found,
                    };
                }
            }
        }
    }

    return null;
}

/* ============================================================
   UPDATER
   ============================================================ */

function stopMemberListUpdater(
    guildId
) {
    const existing =
        activeLists.get(
            guildId
        );

    if (!existing) {
        return;
    }

    clearInterval(
        existing.interval
    );

    activeLists.delete(
        guildId
    );
}

function startMemberListUpdater(
    guild,
    channel,
    message,
    client
) {
    stopMemberListUpdater(
        guild.id
    );

    let updating =
        false;

    const interval =
        setInterval(
            async () => {
                if (updating) {
                    return;
                }

                updating =
                    true;

                try {
                    const currentMessage =
                        await channel.messages
                            .fetch(
                                message.id
                            )
                            .catch(
                                () => null
                            );

                    if (!currentMessage) {
                        logger.warn(
                            `White Angels ledenlijst bestaat niet meer in guild ${guild.id}.`
                        );

                        stopMemberListUpdater(
                            guild.id
                        );

                        return;
                    }

                    const updatedEmbed =
                        await buildMemberListEmbed(
                            guild,
                            client
                        );

                    await currentMessage.edit({
                        embeds: [
                            updatedEmbed,
                        ],
                    });

                    logger.info(
                        `✅ White Angels ledenlijst bijgewerkt in ${guild.name}`
                    );

                } catch (error) {
                    logger.warn(
                        `Failed to update White Angels ledenlijst in guild ${guild.id}: ${error.message}`
                    );

                } finally {
                    updating =
                        false;
                }
            },
            UPDATE_INTERVAL
        );

    activeLists.set(
        guild.id,
        {
            messageId:
                message.id,

            channelId:
                channel.id,

            interval,
        }
    );

    logger.info(
        `✅ White Angels ledenlijst updater gestart voor ${guild.name}`
    );
}

/* ============================================================
   AUTO START NA BOT RESTART
   ============================================================ */

export async function startSavedMemberListUpdater(
    client
) {
    for (
        const guild
        of client.guilds.cache.values()
    ) {
        try {
            const existing =
                await findExistingMemberList(
                    client,
                    guild
                );

            if (!existing) {
                continue;
            }

            startMemberListUpdater(
                guild,
                existing.channel,
                existing.message,
                client
            );

            startupLog(
                `✅ White Angels ledenlijst updater hersteld voor ${guild.name}`
            );

        } catch (error) {
            logger.warn(
                `Could not restore White Angels ledenlijst for ${guild.name}: ${error.message}`
            );
        }
    }
}

/* ============================================================
   COMMAND
   ============================================================ */

export default {
    data:
        new SlashCommandBuilder()
            .setName(
                'ledenlijst'
            )
            .setDescription(
                'Toont de White Angels ledenlijst'
            )
            .setDMPermission(
                false
            ),

    category:
        'Core',

    async execute(
        interaction
    ) {
        const deferSuccess =
            await InteractionHelper.safeDefer(
                interaction
            );

        if (!deferSuccess) {
            return;
        }

        try {
            const guild =
                interaction.guild;

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

            /*
             * Oude updater stoppen.
             */
            stopMemberListUpdater(
                guild.id
            );

            /*
             * Bestaande lijst proberen te vinden.
             */
            let existing =
                await findExistingMemberList(
                    interaction.client,
                    guild
                );

            if (existing) {
                /*
                 * Bestaande lijst gewoon verversen.
                 */
                const embed =
                    await buildMemberListEmbed(
                        guild,
                        interaction.client
                    );

                await existing.message.edit({
                    embeds: [
                        embed,
                    ],
                });

                await saveMemberListLocation(
                    interaction.client,
                    guild.id,
                    existing.channel.id,
                    existing.message.id
                );

                startMemberListUpdater(
                    guild,
                    existing.channel,
                    existing.message,
                    interaction.client
                );

                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        content:
                            '✅ De bestaande White Angels ledenlijst is bijgewerkt en wordt iedere 30 seconden automatisch vernieuwd.',
                    }
                );

                return;
            }

            /*
             * Nieuwe lijst maken.
             */
            const embed =
                await buildMemberListEmbed(
                    guild,
                    interaction.client
                );

            const listMessage =
                await interaction.channel.send({
                    embeds: [
                        embed,
                    ],
                });

            /*
             * Locatie opslaan.
             */
            await saveMemberListLocation(
                interaction.client,
                guild.id,
                interaction.channel.id,
                listMessage.id
            );

            /*
             * Automatische updater starten.
             */
            startMemberListUpdater(
                guild,
                interaction.channel,
                listMessage,
                interaction.client
            );

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    content:
                        '✅ De White Angels ledenlijst is geplaatst en wordt automatisch iedere 30 seconden bijgewerkt.',
                }
            );

            startupLog(
                `✅ White Angels ledenlijst geplaatst in ${guild.name}`
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
                        '❌ Er ging iets mis bij het plaatsen of bijwerken van de ledenlijst.',
                }
            ).catch(
                () => {}
            );
        }
    },
};
