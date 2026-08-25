import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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
   ACTIEVE LEDENLIJSTEN
   ============================================================ */

const activeLists = new Map();

/* ============================================================
   MEMBERS EENMALIG OPHALEN
   ============================================================ */

async function loadGuildMembers(guild) {
    try {
        /*
         * Eén volledige fetch bij het starten van /ledenlijst.
         * Daarna gebruiken we de cache.
         */
        await guild.members.fetch();

        logger.info(
            `✅ ${guild.members.cache.size} members loaded for ${guild.name}`
        );

        return true;
    } catch (error) {
        logger.error(
            `Failed to fetch members for guild ${guild.id}:`,
            error
        );

        return false;
    }
}

/* ============================================================
   LEDENLIJST EMBED
   ============================================================ */

function buildMemberListEmbed(
    guild,
    client
) {
    /*
     * Alleen mensen met de White Angels-rol.
     *
     * We gebruiken bewust de cache.
     * Je bot heeft al guildMemberUpdate events waardoor
     * rolwijzigingen automatisch in de cache terechtkomen.
     */
    const whiteAngelsMembers =
        guild.members.cache.filter(
            member =>
                !member.user.bot &&
                member.roles.cache.has(
                    WHITE_ANGELS_ROLE_ID
                )
        );

    /*
     * Per rang een lijst maken.
     */
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
     * Ieder lid krijgt alleen zijn hoogste rang.
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

    /* ========================================================
       EMBED
       ======================================================== */

    const embed =
        new EmbedBuilder()
            .setColor(
                0xFFFFFF
            )
            .setTitle(
                '🤍 WHITE ANGELS — LEDENLIJST'
            )
            .setDescription(
                [
                    '',
                    '**🤍 TOTAAL AANTAL LEDEN**',
                    `# ${whiteAngelsMembers.size}`,
                    '',
                    '━━━━━━━━━━━━━━━━━━━━',
                    '',
                ].join('\n')
            );

    /*
     * Elke rang tonen.
     */
    for (
        const rank
        of ROLE_ORDER
    ) {
        const members =
            membersByRank.get(
                rank.id
            ) || [];

        /*
         * Alfabetisch sorteren.
         */
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
   OUDE UPDATER STOPPEN
   ============================================================ */

function stopExistingList(
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

    logger.info(
        `White Angels ledenlijst updater gestopt voor guild ${guildId}`
    );
}

/* ============================================================
   AUTOMATISCHE UPDATER
   ============================================================ */

function startMemberListUpdater(
    guild,
    channel,
    message,
    client
) {
    stopExistingList(
        guild.id
    );

    let updating =
        false;

    /*
     * Meteen één update uitvoeren.
     */
    const updateList =
        async () => {
            if (updating) {
                return;
            }

            updating = true;

            try {
                /*
                 * Controleer of het bericht nog bestaat.
                 */
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
                        `White Angels ledenlijst bestaat niet meer in guild ${guild.id}`
                    );

                    stopExistingList(
                        guild.id
                    );

                    return;
                }

                /*
                 * Cache opnieuw uitlezen.
                 *
                 * Geen guild.members.fetch() hier.
                 * Dat voorkomt onnodige Gateway requests.
                 */
                const updatedEmbed =
                    buildMemberListEmbed(
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
                    `Failed to update White Angels ledenlijst in guild ${guild.id}:`,
                    error.message
                );
            } finally {
                updating = false;
            }
        };

    /*
     * Meteen uitvoeren.
     */
    updateList().catch(() => {});

    /*
     * Daarna iedere 30 seconden.
     */
    const interval =
        setInterval(
            updateList,
            30_000
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
        `✅ White Angels ledenlijst updater gestart voor guild ${guild.id}`
    );
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
             * Één volledige member fetch.
             *
             * Dit vult de cache met offline leden.
             */
            const loaded =
                await loadGuildMembers(
                    guild
                );

            if (!loaded) {
                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        content:
                            '❌ Ik kon de serverleden niet ophalen. Controleer of de bot de juiste intents heeft.',
                    }
                );

                return;
            }

            /*
             * Bestaande updater stoppen.
             */
            stopExistingList(
                guild.id
            );

            /*
             * Eerste embed maken.
             */
            const embed =
                buildMemberListEmbed(
                    guild,
                    interaction.client
                );

            /*
             * Slash command bevestiging.
             */
            await InteractionHelper.safeEditReply(
                interaction,
                {
                    content:
                        '✅ De White Angels ledenlijst is geplaatst en wordt automatisch elke 30 seconden bijgewerkt.',
                }
            );

            /*
             * Normaal bericht in kanaal.
             */
            const listMessage =
                await interaction.channel.send({
                    embeds: [
                        embed,
                    ],
                });

            /*
             * Automatische updater starten.
             */
            startMemberListUpdater(
                guild,
                interaction.channel,
                listMessage,
                interaction.client
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
            ).catch(
                () => {}
            );
        }
    },
};
