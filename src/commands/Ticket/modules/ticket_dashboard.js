import { getColor } from '../../../config/bot.js';

import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} from 'discord.js';

import { logger } from '../../../utils/logger.js';

import {
    getGuildConfig,
    setGuildConfig,
} from '../../../services/config/guildConfig.js';

import {
    messageHasButtonCustomId,
} from '../../../utils/panelStatus.js';

/* ============================================================
   CONFIG
   ============================================================ */

const WHITE_ANGELS_ROLE_ID =
    '1437696432340467786';

const PANEL_UPDATE_INTERVAL =
    30_000;

const panelUpdateIntervals =
    new Map();

/* ============================================================
   WHITE ANGELS LEDEN TELLEN
   ============================================================ */

async function getWhiteAngelsMemberCount(guild) {
    try {
        /*
         * Discord geeft hier rechtstreeks de actuele
         * member count per rol terug.
         *
         * Hierdoor zijn we niet afhankelijk van de
         * guild member cache.
         */
        const roleCounts =
            await guild.roles.fetchMemberCounts();

        const count =
            roleCounts.get(
                WHITE_ANGELS_ROLE_ID
            ) ?? 0;

        logger.info(
            `🤍 White Angels member count in ${guild.name}: ${count}`
        );

        return count;
    } catch (error) {
        logger.error(
            `Failed to get White Angels member count in guild ${guild.id}:`,
            error
        );

        return 0;
    }
}

/* ============================================================
   STATUS
   ============================================================ */

function getApplicationStatus(memberCount) {
    if (memberCount >= 20) {
        return '🔴';
    }

    if (memberCount >= 17) {
        return '🟠';
    }

    return '🟢';
}

/* ============================================================
   PANEL EMBED
   ============================================================ */

async function buildPanelEmbed(
    config,
    guild
) {
    const memberCount =
        await getWhiteAngelsMemberCount(
            guild
        );

    const statusEmoji =
        getApplicationStatus(
            memberCount
        );

    const lines = [
        '__**Sollicitatie status:**__',
        '',
        '🟢 Sollicitatie staat open',
        '🟠 Sollicitatie staan open, maar met een kleine wachtrij of weinig plekken nog beschikbaar',
        '🔴 Sollicitatie is gesloten met een korte/lange wachtrij',
        '',
        `**SOLLICITATIE STATUS: ${statusEmoji}**`,
        '',
        `**__*Aantal leden: ${memberCount}*__**`,
    ];

    /*
     * Eventuele extra tekst uit de ticketconfig.
     */
    const extraMessage =
        config.ticketPanelMessage?.trim() || '';

    if (extraMessage) {
        lines.push(
            '',
            extraMessage
        );
    }

    return new EmbedBuilder()
        .setTitle(
            'White Angels'
        )
        .setDescription(
            lines.join('\n')
        )
        .setColor(
            getColor('info')
        );
}

/* ============================================================
   PANEL BUTTON
   ============================================================ */

function buildPanelButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                'create_ticket'
            )
            .setLabel(
                'Sollicitatie'
            )
            .setStyle(
                ButtonStyle.Primary
            )
            .setEmoji(
                '💪'
            )
    );
}

/* ============================================================
   PANEL MESSAGE ID OPSLAAN
   ============================================================ */

async function persistPanelMessageId(
    client,
    guildId,
    guildConfig,
    messageId
) {
    if (
        !messageId ||
        guildConfig.ticketPanelMessageId ===
            messageId
    ) {
        return;
    }

    guildConfig.ticketPanelMessageId =
        messageId;

    if (client.db) {
        await setGuildConfig(
            client,
            guildId,
            guildConfig
        );
    }
}

/* ============================================================
   BESTAAND PANEL VINDEN
   ============================================================ */

async function findExistingTicketPanel(
    client,
    guild,
    guildConfig
) {
    if (
        !guildConfig.ticketPanelChannelId
    ) {
        logger.warn(
            `No ticket panel channel configured for guild ${guild.id}`
        );

        return null;
    }

    const channel =
        await guild.channels
            .fetch(
                guildConfig.ticketPanelChannelId
            )
            .catch(
                () => null
            );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        logger.warn(
            `Ticket panel channel not found for guild ${guild.id}: ${guildConfig.ticketPanelChannelId}`
        );

        return null;
    }

    /* --------------------------------------------------------
       1. Opgeslagen message ID
       -------------------------------------------------------- */

    if (
        guildConfig.ticketPanelMessageId
    ) {
        const savedMessage =
            await channel.messages
                .fetch(
                    guildConfig.ticketPanelMessageId
                )
                .catch(
                    () => null
                );

        if (savedMessage) {
            return {
                channel,
                message: savedMessage,
            };
        }

        logger.warn(
            `Saved ticket panel message ${guildConfig.ticketPanelMessageId} no longer exists`
        );
    }

    /* --------------------------------------------------------
       2. Laatste 100 berichten
       -------------------------------------------------------- */

    const messages =
        await channel.messages
            .fetch({
                limit: 100,
            })
            .catch(
                () => null
            );

    if (!messages) {
        return null;
    }

    const botMessages =
        messages.filter(
            message =>
                message.author?.id ===
                client.user.id
        );

    logger.info(
        `🔎 Found ${botMessages.size} bot message(s) in ticket panel channel ${channel.id}`
    );

    let panelMessage =
        null;

    /* --------------------------------------------------------
       3. Zoek create_ticket button
       -------------------------------------------------------- */

    panelMessage =
        botMessages.find(
            message =>
                message.components?.some(
                    row =>
                        row.components?.some(
                            component =>
                                component.customId ===
                                'create_ticket'
                        )
                )
        );

    /* --------------------------------------------------------
       4. Zoek White Angels / Support Tickets embed
       -------------------------------------------------------- */

    if (!panelMessage) {
        panelMessage =
            botMessages.find(
                message => {
                    const titles =
                        message.embeds
                            ?.map(
                                embed =>
                                    embed.title
                                        ?.trim()
                                        .toLowerCase()
                            )
                            .filter(
                                Boolean
                            ) || [];

                    return titles.some(
                        title =>
                            title ===
                                'white angels' ||
                            title ===
                                'support tickets' ||
                            title.includes(
                                'white angels'
                            ) ||
                            title.includes(
                                'support tickets'
                            )
                    );
                }
            );
    }

    /* --------------------------------------------------------
       5. Laatste fallback: botbericht met embed
       -------------------------------------------------------- */

    if (!panelMessage) {
        panelMessage =
            botMessages.find(
                message =>
                    message.embeds?.length >
                    0
            );
    }

    if (!panelMessage) {
        logger.warn(
            `❌ No ticket panel message found in channel ${channel.id} for guild ${guild.id}`
        );

        return null;
    }

    await persistPanelMessageId(
        client,
        guild.id,
        guildConfig,
        panelMessage.id
    );

    logger.info(
        `✅ Ticket panel found: ${panelMessage.id}`
    );

    return {
        channel,
        message: panelMessage,
    };
}

/* ============================================================
   PANEL UPDATEN
   ============================================================ */

async function updateExistingTicketPanel(
    client,
    guild
) {
    try {
        const guildConfig =
            await getGuildConfig(
                client,
                guild.id
            );

        if (
            !guildConfig.ticketPanelChannelId
        ) {
            return false;
        }

        const panel =
            await findExistingTicketPanel(
                client,
                guild,
                guildConfig
            );

        if (!panel) {
            return false;
        }

        const updatedEmbed =
            await buildPanelEmbed(
                guildConfig,
                guild
            );

        await panel.message.edit({
            embeds: [
                updatedEmbed,
            ],
            components: [
                buildPanelButtonRow(),
            ],
        });

        logger.info(
            `✅ White Angels ticket panel updated in ${guild.name}`
        );

        return true;
    } catch (error) {
        logger.warn(
            `Failed to update White Angels ticket panel in guild ${guild.id}: ${error.message}`
        );

        return false;
    }
}

/* ============================================================
   AUTO UPDATER
   ============================================================ */

function startTicketPanelAutoUpdate(
    client,
    guild
) {
    if (!guild) {
        return;
    }

    if (
        panelUpdateIntervals.has(
            guild.id
        )
    ) {
        return;
    }

    /*
     * Meteen één update.
     */
    updateExistingTicketPanel(
        client,
        guild
    ).catch(
        () => {}
    );

    /*
     * Daarna iedere 30 seconden.
     */
    const interval =
        setInterval(
            async () => {
                await updateExistingTicketPanel(
                    client,
                    guild
                );
            },
            PANEL_UPDATE_INTERVAL
        );

    panelUpdateIntervals.set(
        guild.id,
        interval
    );

    logger.info(
        `✅ White Angels ticket panel auto-update started for guild ${guild.id}`
    );
}

/* ============================================================
   ALLE SERVERS
   ============================================================ */

async function startAllTicketPanelAutoUpdates(
    client
) {
    if (!client?.guilds) {
        return;
    }

    for (
        const guild
        of client.guilds.cache.values()
    ) {
        startTicketPanelAutoUpdate(
            client,
            guild
        );
    }

    logger.info(
        `✅ Ticket panel auto-updaters started for ${client.guilds.cache.size} guild(s)`
    );
}

/* ============================================================
   AUTO UPDATE STOPPEN
   ============================================================ */

function stopTicketPanelAutoUpdate(
    guildId
) {
    const interval =
        panelUpdateIntervals.get(
            guildId
        );

    if (!interval) {
        return;
    }

    clearInterval(
        interval
    );

    panelUpdateIntervals.delete(
        guildId
    );
}

/* ============================================================
   REPOST PANEL
   ============================================================ */

async function repostTicketPanel(
    client,
    guild,
    guildConfig,
    guildId
) {
    const channel =
        await guild.channels
            .fetch(
                guildConfig.ticketPanelChannelId
            )
            .catch(
                () => null
            );

    if (!channel) {
        throw new Error(
            'Ticket panel channel could not be found.'
        );
    }

    const embed =
        await buildPanelEmbed(
            guildConfig,
            guild
        );

    const sentPanel =
        await channel.send({
            embeds: [
                embed,
            ],
            components: [
                buildPanelButtonRow(),
            ],
        });

    await persistPanelMessageId(
        client,
        guildId,
        guildConfig,
        sentPanel.id
    );

    startTicketPanelAutoUpdate(
        client,
        guild
    );

    return sentPanel;
}

/* ============================================================
   DEFAULT EXPORT
   ============================================================ */

export default {
    prefixOnly: false,

    async execute(
        interaction,
        config,
        client
    ) {
        try {
            const guildId =
                interaction.guild.id;

            const guildConfig =
                await getGuildConfig(
                    client,
                    guildId
                );

            if (
                !guildConfig.ticketPanelChannelId
            ) {
                throw new Error(
                    'Ticket system is not configured.'
                );
            }

            startTicketPanelAutoUpdate(
                client,
                interaction.guild
            );

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            '🎫 Ticket System'
                        )
                        .setDescription(
                            'Ticket panel auto-update is active.'
                        )
                        .setColor(
                            getColor('info')
                        ),
                ],
                ephemeral: true,
            }).catch(
                async () => {
                    if (
                        interaction.deferred ||
                        interaction.replied
                    ) {
                        await interaction.editReply({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle(
                                        '🎫 Ticket System'
                                    )
                                    .setDescription(
                                        'Ticket panel auto-update is active.'
                                    )
                                    .setColor(
                                        getColor('info')
                                    ),
                            ],
                        }).catch(
                            () => {}
                        );
                    }
                }
            );

        } catch (error) {
            logger.error(
                'Ticket dashboard error:',
                error
            );
        }
    },
};

/* ============================================================
   EXPORTS
   ============================================================ */

export {
    getWhiteAngelsMemberCount,
    buildPanelEmbed,
    startTicketPanelAutoUpdate,
    stopTicketPanelAutoUpdate,
    updateExistingTicketPanel,
    startAllTicketPanelAutoUpdates,
    repostTicketPanel,
};
