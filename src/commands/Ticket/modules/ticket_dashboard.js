import { getColor } from '../../../config/bot.js';

import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import {
    successEmbed,
    infoEmbed,
} from '../../../utils/embeds.js';

import { logger } from '../../../utils/logger.js';

import {
    TitanBotError,
    ErrorTypes,
    replyUserError,
} from '../../../utils/errorHandler.js';

import {
    getGuildConfig,
    setGuildConfig,
} from '../../../services/config/guildConfig.js';

import {
    getGuildTicketStats,
} from '../../../utils/database/tickets.js';

import {
    getTicketPanelStatus,
    messageHasButtonCustomId,
    formatPanelStatusField,
} from '../../../utils/panelStatus.js';

import {
    startDashboardSession,
} from '../../../utils/dashboardSession.js';

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
         * Gebruik de huidige member-cache.
         *
         * De clientReady code vult deze cache bij het opstarten
         * en GuildMember events houden wijzigingen bij.
         */
        const count =
            guild.members.cache.filter(
                member =>
                    !member.user.bot &&
                    member.roles.cache.has(
                        WHITE_ANGELS_ROLE_ID
                    )
            ).size;

        logger.info(
            `White Angels member count in ${guild.name}: ${count}`
        );

        return count;
    } catch (error) {
        logger.error(
            `Failed to count White Angels members in guild ${guild.id}:`,
            error
        );

        return 0;
    }
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

    let statusEmoji = '🟢';

    /*
     * 0 t/m 16 = groen
     * 17 t/m 19 = oranje
     * 20+ = rood
     */
    if (memberCount >= 20) {
        statusEmoji = '🔴';
    } else if (memberCount >= 17) {
        statusEmoji = '🟠';
    }

    const descriptionLines = [
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

    const extraMessage =
        config.ticketPanelMessage?.trim() || '';

    if (extraMessage) {
        descriptionLines.push(
            '',
            extraMessage
        );
    }

    return new EmbedBuilder()
        .setTitle(
            'White Angels'
        )
        .setDescription(
            descriptionLines.join('\n')
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
   BESTAAND PANEEL VINDEN
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
            `Ticket panel channel could not be loaded for guild ${guild.id}: ${guildConfig.ticketPanelChannelId}`
        );

        return null;
    }

    /* --------------------------------------------------------
       1. OPGESLAGEN MESSAGE-ID
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
            logger.info(
                `✅ Ticket panel found using saved message ID ${savedMessage.id}`
            );

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
       2. LAATSTE 100 BERICHTEN
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
        logger.warn(
            `Could not fetch messages from ticket panel channel ${channel.id}`
        );

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

    let panelMessage = null;

    /* --------------------------------------------------------
       3. ZOEK OP CREATE_TICKET KNOP
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
       4. ZOEK OP TITEL WHITE ANGELS / SUPPORT TICKETS
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
       5. LAATSTE FALLBACK: BOTBERICHT MET EMBED
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
   LIVE PANEL UPDATEN
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
   AUTO UPDATE STARTEN
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
     * Meteen één keer uitvoeren.
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
   ALLE GUILDS STARTEN
   ============================================================ */

async function startAllTicketPanelAutoUpdates(
    client
) {
    if (
        !client?.guilds
    ) {
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

    logger.info(
        `Ticket panel auto-update stopped for guild ${guildId}`
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
        throw new TitanBotError(
            'Panel channel missing',
            ErrorTypes.CONFIGURATION,
            'The configured ticket panel channel no longer exists.'
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
   DASHBOARD BUTTON ROW
   ============================================================ */

function buildButtonRow(
    guildConfig,
    guildId,
    disabled = false,
    panelStatus = null
) {
    const dmEnabled =
        guildConfig.dmOnClose !== false;

    const showRepost =
        panelStatus?.exists === false &&
        panelStatus?.reason ===
            'panel_deleted';

    const buttons = [];

    if (showRepost) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(
                    `ticket_cfg_repost_${guildId}`
                )
                .setLabel(
                    'Repost Panel'
                )
                .setStyle(
                    ButtonStyle.Primary
                )
                .setEmoji(
                    '📌'
                )
                .setDisabled(
                    disabled
                )
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(
                `ticket_cfg_dm_toggle_${guildId}`
            )
            .setLabel(
                'DM on Close'
            )
            .setStyle(
                dmEnabled
                    ? ButtonStyle.Success
                    : ButtonStyle.Danger
            )
            .setEmoji(
                dmEnabled
                    ? '📬'
                    : '📭'
            )
            .setDisabled(
                disabled
            ),

        new ButtonBuilder()
            .setCustomId(
                `ticket_cfg_staff_role_btn_${guildId}`
            )
            .setLabel(
                'Staff Role'
            )
            .setStyle(
                ButtonStyle.Secondary
            )
            .setEmoji(
                '🛡️'
            )
            .setDisabled(
                disabled
            ),

        new ButtonBuilder()
            .setCustomId(
                `ticket_cfg_delete_${guildId}`
            )
            .setLabel(
                'Delete System'
            )
            .setStyle(
                ButtonStyle.Danger
            )
            .setEmoji(
                '🗑️'
            )
            .setDisabled(
                disabled
            )
    );

    return new ActionRowBuilder().addComponents(
        buttons
    );
}

/* ============================================================
   DASHBOARD HELPERS
   ============================================================ */

function formatCloseDuration(
    ms
) {
    if (
        ms == null
    ) {
        return '`N/A`';
    }

    const hours =
        Math.floor(
            ms / 3_600_000
        );

    const minutes =
        Math.floor(
            (ms % 3_600_000) /
                60_000
        );

    if (
        hours > 0
    ) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
}

function buildDashboardEmbed(
    config,
    guild,
    panelStatus = null,
    ticketStats = null
) {
    const panelChannel =
        config.ticketPanelChannelId
            ? `<#${config.ticketPanelChannelId}>`
            : '`Not set`';

    const staffRole =
        config.ticketStaffRoleId
            ? `<@&${config.ticketStaffRoleId}>`
            : '`Not set`';

    const ticketLogsChannel =
        config.ticketLogsChannelId
            ? `<#${config.ticketLogsChannelId}>`
            : '`Not set`';

    const transcriptChannel =
        config.ticketTranscriptChannelId
            ? `<#${config.ticketTranscriptChannelId}>`
            : '`Not set`';

    const openCategory =
        config.ticketCategoryId
            ? `<#${config.ticketCategoryId}>`
            : '`Not set`';

    const closedCategory =
        config.ticketClosedCategoryId
            ? `<#${config.ticketClosedCategoryId}>`
            : '`Not set`';

    const rawMsg =
        config.ticketPanelMessage ||
        '`Geen extra bericht ingesteld.`';

    const panelMsg =
        `\`${rawMsg.length > 60
            ? rawMsg.substring(
                0,
                60
            ) + '…'
            : rawMsg}\``;

    const panelStatusValue =
        formatPanelStatusField(
            panelStatus
        );

    const openTickets =
        ticketStats
            ? String(
                ticketStats.openCount
            )
            : '`—`';

    const avgCloseTime =
        ticketStats
            ? formatCloseDuration(
                ticketStats.avgCloseTimeMs
            )
            : '`—`';

    const feedbackSummary =
        ticketStats?.feedbackCount
            ? `${ticketStats.avgRating}/5 (${ticketStats.feedbackCount} rating${
                ticketStats.feedbackCount !== 1
                    ? 's'
                    : ''
            })`
            : '`No ratings yet`';

    return new EmbedBuilder()
        .setTitle(
            '🎫 Ticket System Dashboard'
        )
        .setDescription(
            `Manage ticket system settings for **${guild.name}**.\nSelect an option below to modify a setting.`
        )
        .setColor(
            getColor('info')
        )
        .addFields(
            {
                name:
                    'Panel Status',
                value:
                    panelStatusValue,
                inline:
                    false,
            },
            {
                name:
                    'Panel Channel',
                value:
                    panelChannel,
                inline:
                    true,
            },
            {
                name:
                    'Staff Role',
                value:
                    staffRole,
                inline:
                    true,
            },
            {
                name:
                    '\u200B',
                value:
                    '\u200B',
                inline:
                    true,
            },
            {
                name:
                    'Open Tickets Category',
                value:
                    openCategory,
                inline:
                    true,
            },
            {
                name:
                    'Closed Tickets Category',
                value:
                    closedCategory,
                inline:
                    true,
            },
            {
                name:
                    '\u200B',
                value:
                    '\u200B',
                inline:
                    true,
            },
            {
                name:
                    'Panel Message',
                value:
                    panelMsg,
                inline:
                    false,
            },
            {
                name:
                    'Button Label',
                value:
                    '`Sollicitatie`',
                inline:
                    true,
            },
            {
                name:
                    'Max Tickets/User',
                value:
                    String(
                        config.maxTicketsPerUser ||
                        3
                    ),
                inline:
                    true,
            },
            {
                name:
                    'DM on Close',
                value:
                    config.dmOnClose !== false
                        ? 'Enabled'
                        : 'Disabled',
                inline:
                    true,
            },
            {
                name:
                    'Ticket Logs Channel',
                value:
                    ticketLogsChannel,
                inline:
                    true,
            },
            {
                name:
                    'Transcript Channel',
                value:
                    transcriptChannel,
                inline:
                    true,
            },
            {
                name:
                    '\u200B',
                value:
                    '\u200B',
                inline:
                    true,
            },
            {
                name:
                    'Open Tickets',
                value:
                    openTickets,
                inline:
                    true,
            },
            {
                name:
                    'Avg Close Time',
                value:
                    avgCloseTime,
                inline:
                    true,
            },
            {
                name:
                    'Feedback Rating',
                value:
                    feedbackSummary,
                inline:
                    true,
            }
        )
        .setFooter({
            text:
                'Select an option below • Dashboard closes after 10 minutes of inactivity',
        })
        .setTimestamp();
}

/* ============================================================
   SELECT MENU
   ============================================================ */

function buildSelectMenu(
    guildId
) {
    return new StringSelectMenuBuilder()
        .setCustomId(
            `ticket_config_${guildId}`
        )
        .setPlaceholder(
            'Select a setting to configure...'
        )
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    'Edit Panel Message'
                )
                .setDescription(
                    'Change the extra panel message'
                )
                .setValue(
                    'panel_message'
                )
                .setEmoji(
                    '📝'
                ),

            new StringSelectMenuOptionBuilder()
                .setLabel(
                    'Edit Button Label'
                )
                .setDescription(
                    'Change the ticket button label'
                )
                .setValue(
                    'button_label'
                )
                .setEmoji(
                    '🏷️'
                ),

            new StringSelectMenuOptionBuilder()
                .setLabel(
                    'Change Open Tickets Category'
                )
                .setDescription(
                    'Category for new tickets'
                )
                .setValue(
                    'open_category'
                )
                .setEmoji(
                    '📁'
                ),

            new StringSelectMenuOptionBuilder()
                .setLabel(
                    'Change Closed Tickets Category'
                )
                .setDescription(
                    'Category for closed tickets'
                )
                .setValue(
                    'closed_category'
                )
                .setEmoji(
                    '📂'
                ),

            new StringSelectMenuOptionBuilder()
                .setLabel(
                    'Set Max Tickets per User'
                )
                .setDescription(
                    'Limit open tickets per user'
                )
                .setValue(
                    'max_tickets'
                )
                .setEmoji(
                    '🔢'
                ),

            new StringSelectMenuOptionBuilder()
                .setLabel(
                    'Set Ticket Logs Channel'
                )
                .setDescription(
                    'Channel for ticket logs'
                )
                .setValue(
                    'logs_channel'
                )
                .setEmoji(
                    '🎫'
                ),

            new StringSelectMenuOptionBuilder()
                .setLabel(
                    'Set Transcript Channel'
                )
                .setDescription(
                    'Channel for transcripts'
                )
                .setValue(
                    'transcript_channel'
                )
                .setEmoji(
                    '📜'
                )
        );
}

/* ============================================================
   REFRESH DASHBOARD
   ============================================================ */

async function refreshDashboard(
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    const panelStatus =
        await getTicketPanelStatus(
            client,
            rootInteraction.guild,
            guildConfig
        );

    const ticketStats =
        await getGuildTicketStats(
            guildId
        );

    if (
        panelStatus?.recoveredId
    ) {
        await persistPanelMessageId(
            client,
            guildId,
            guildConfig,
            panelStatus.recoveredId
        );
    }

    await InteractionHelper.safeEditReply(
        rootInteraction,
        {
            embeds: [
                buildDashboardEmbed(
                    guildConfig,
                    rootInteraction.guild,
                    panelStatus,
                    ticketStats
                ),
            ],
            components: [
                buildButtonRow(
                    guildConfig,
                    guildId,
                    false,
                    panelStatus
                ),
                new ActionRowBuilder().addComponents(
                    buildSelectMenu(
                        guildId
                    )
                ),
            ],
        }
    ).catch(
        () => {}
    );
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
                throw new TitanBotError(
                    'Ticket system not configured',
                    ErrorTypes.CONFIGURATION,
                    'The ticket system has not been set up yet. Run `/ticket setup` first.'
                );
            }

            /*
             * Zorg dat de updater ook draait wanneer
             * iemand het dashboard opent.
             */
            startTicketPanelAutoUpdate(
                client,
                interaction.guild
            );

            const panelStatus =
                await getTicketPanelStatus(
                    client,
                    interaction.guild,
                    guildConfig
                );

            const ticketStats =
                await getGuildTicketStats(
                    guildId
                );

            await startDashboardSession({
                interaction,

                embeds: [
                    buildDashboardEmbed(
                        guildConfig,
                        interaction.guild,
                        panelStatus,
                        ticketStats
                    ),
                ],

                components: [
                    buildButtonRow(
                        guildConfig,
                        guildId,
                        false,
                        panelStatus
                    ),
                    new ActionRowBuilder().addComponents(
                        buildSelectMenu(
                            guildId
                        )
                    ),
                ],

                selectMenuId:
                    `ticket_config_${guildId}`,

                buttonMatcher:
                    customId =>
                        customId ===
                            `ticket_cfg_repost_${guildId}` ||
                        customId ===
                            `ticket_cfg_dm_toggle_${guildId}` ||
                        customId ===
                            `ticket_cfg_staff_role_btn_${guildId}` ||
                        customId ===
                            `ticket_cfg_delete_${guildId}`,

                onSelect:
                    async selectInteraction => {
                        /*
                         * Je bestaande dashboard handlers kunnen
                         * hier later weer aangesloten worden.
                         */
                        await selectInteraction.reply({
                            content:
                                'Deze instelling wordt door het bestaande ticket-dashboard afgehandeld.',
                            flags:
                                MessageFlags.Ephemeral,
                        });
                    },

                onButton:
                    async btnInteraction => {
                        if (
                            btnInteraction.customId ===
                            `ticket_cfg_repost_${guildId}`
                        ) {
                            await btnInteraction.deferUpdate();

                            await repostTicketPanel(
                                client,
                                interaction.guild,
                                guildConfig,
                                guildId
                            );

                            await refreshDashboard(
                                interaction,
                                guildConfig,
                                guildId,
                                client
                            );
                        }
                    },
            });

        } catch (error) {
            if (
                error instanceof
                TitanBotError
            ) {
                throw error;
            }

            logger.error(
                'Unexpected error in ticket dashboard:',
                error
            );

            throw new TitanBotError(
                `Ticket dashboard failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Failed to open the ticket configuration dashboard.'
            );
        }
    },
};

/* ============================================================
   EXPORTS
   ============================================================ */

export {
    startTicketPanelAutoUpdate,
    stopTicketPanelAutoUpdate,
    updateExistingTicketPanel,
    startAllTicketPanelAutoUpdates,
};
