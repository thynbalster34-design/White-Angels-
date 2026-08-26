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
   KOMPANIYA / WHITE ANGELS
   ============================================================ */

const WHITE_ANGELS_ROLE_ID =
    '1437696432340467786';

/*
 * ALLEEN DEZE DISCORD USER MAG
 * /ticket dashboard GEBRUIKEN
 */
const AUTHORIZED_USER_ID =
    '708290114760998993';

const PANEL_UPDATE_INTERVAL =
    30_000;

const panelUpdateIntervals =
    new Map();

/* ============================================================
   WHITE ANGELS LEDEN TELLEN
   ============================================================ */

async function getWhiteAngelsMemberCount(guild) {
    try {
        const members =
            await guild.members.list({
                limit: 1000,
            });

        const whiteAngelsMembers =
            members.filter(
                member =>
                    !member.user.bot &&
                    member.roles.cache.has(
                        WHITE_ANGELS_ROLE_ID
                    )
            );

        const count =
            whiteAngelsMembers.size;

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

function getApplicationStatus(
    memberCount
) {
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
            'Kompaniya'
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

    await setGuildConfig(
        client,
        guildId,
        guildConfig
    );
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
       1. OPGESLAGEN MESSAGE ID
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
       3. CREATE_TICKET BUTTON
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
       4. WHITE ANGELS / SUPPORT TICKETS
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
       5. FALLBACK: BOT EMBED
       -------------------------------------------------------- */

    if (!panelMessage) {
        panelMessage =
            botMessages.find(
                message =>
                    message.embeds?.length > 0
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

    updateExistingTicketPanel(
        client,
        guild
    ).catch(
        () => {}
    );

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
        throw new TitanBotError(
            'Panel channel missing',
            ErrorTypes.CONFIGURATION,
            'The configured ticket panel channel no longer exists.'
        );
    }

    const sentPanel =
        await channel.send({
            embeds: [
                await buildPanelEmbed(
                    guildConfig,
                    guild
                ),
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
   CLOSE DURATION
   ============================================================ */

function formatCloseDuration(ms) {
    if (ms == null) {
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

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
}

/* ============================================================
   DASHBOARD EMBED
   ============================================================ */

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
                    'Change the extra message displayed on the ticket panel'
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
                    'Change the label on the ticket button'
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
                    'Category where new tickets are created'
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
                    'Category where closed tickets are moved'
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
                    'Limit how many open tickets one user can have'
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
                    'Channel to receive ticket lifecycle logs'
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
                    'Channel to receive ticket transcripts'
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
   PANEL MESSAGE HANDLER
   ============================================================ */

async function handlePanelMessage(
    selectInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    const modal =
        new ModalBuilder()
            .setCustomId(
                'ticket_cfg_panel_msg'
            )
            .setTitle(
                '📝 Edit Panel Message'
            )
            .addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId(
                                'panel_msg_input'
                            )
                            .setLabel(
                                'Extra Panel Message'
                            )
                            .setStyle(
                                TextInputStyle.Paragraph
                            )
                            .setValue(
                                guildConfig.ticketPanelMessage ||
                                    ''
                            )
                            .setMaxLength(
                                2000
                            )
                            .setMinLength(
                                1
                            )
                            .setRequired(
                                true
                            )
                            .setPlaceholder(
                                'Extra tekst onder de sollicitatiestatus'
                            )
                    )
            );

    await selectInteraction.showModal(
        modal
    );

    const submitted =
        await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId ===
                        'ticket_cfg_panel_msg' &&
                    i.user.id ===
                        selectInteraction.user.id,
                time: 120_000,
            })
            .catch(
                () => null
            );

    if (!submitted) {
        return;
    }

    const newMessage =
        submitted.fields
            .getTextInputValue(
                'panel_msg_input'
            )
            .trim();

    guildConfig.ticketPanelMessage =
        newMessage;

    await setGuildConfig(
        client,
        guildId,
        guildConfig
    );

    const panelUpdated =
        await updateExistingTicketPanel(
            client,
            rootInteraction.guild
        );

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Panel Message Updated',
                panelUpdated
                    ? 'The ticket panel has been updated.'
                    : 'The ticket panel could not be located.'
            ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        guildConfig,
        guildId,
        client
    );
}

/* ============================================================
   BUTTON LABEL
   ============================================================ */

async function handleButtonLabel(
    selectInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    const modal =
        new ModalBuilder()
            .setCustomId(
                'ticket_cfg_btn_label'
            )
            .setTitle(
                '🏷️ Edit Button Label'
            )
            .addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId(
                                'btn_label_input'
                            )
                            .setLabel(
                                'Button Label'
                            )
                            .setStyle(
                                TextInputStyle.Short
                            )
                            .setValue(
                                'Sollicitatie'
                            )
                            .setMaxLength(
                                80
                            )
                            .setMinLength(
                                1
                            )
                            .setRequired(
                                true
                            )
                            .setPlaceholder(
                                'Sollicitatie'
                            )
                    )
            );

    await selectInteraction.showModal(
        modal
    );

    const submitted =
        await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId ===
                        'ticket_cfg_btn_label' &&
                    i.user.id ===
                        selectInteraction.user.id,
                time: 120_000,
            })
            .catch(
                () => null
            );

    if (!submitted) {
        return;
    }

    const newLabel =
        submitted.fields
            .getTextInputValue(
                'btn_label_input'
            )
            .trim();

    guildConfig.ticketButtonLabel =
        newLabel;

    await setGuildConfig(
        client,
        guildId,
        guildConfig
    );

    const panelUpdated =
        await updateExistingTicketPanel(
            client,
            rootInteraction.guild
        );

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Button Label Updated',
                `Button label changed to \`${newLabel}\`.`
            ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        guildConfig,
        guildId,
        client
    );
}

/* ============================================================
   STAFF ROLE
   ============================================================ */

async function handleStaffRole(
    selectInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    await selectInteraction.deferUpdate();

    const roleSelect =
        new RoleSelectMenuBuilder()
            .setCustomId(
                'ticket_cfg_staff_role'
            )
            .setPlaceholder(
                'Select the staff role...'
            )
            .setMaxValues(
                1
            );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    '🛡️ Change Staff Role'
                )
                .setDescription(
                    `**Current:** ${
                        guildConfig.ticketStaffRoleId
                            ? `<@&${guildConfig.ticketStaffRoleId}>`
                            : '`Not set`'
                    }\n\nSelect the role that should have staff access to manage tickets.`
                )
                .setColor(
                    getColor('info')
                ),
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    roleSelect
                ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.RoleSelect,

            filter: i =>
                i.user.id ===
                    selectInteraction.user.id &&
                i.customId ===
                    'ticket_cfg_staff_role',

            time: 60_000,
            max: 1,
        });

    collector.on(
        'collect',
        async roleInteraction => {
            await roleInteraction.deferUpdate();

            const role =
                roleInteraction.roles.first();

            if (!role) {
                return;
            }

            guildConfig.ticketStaffRoleId =
                role.id;

            await setGuildConfig(
                client,
                guildId,
                guildConfig
            );

            await roleInteraction.followUp({
                embeds: [
                    successEmbed(
                        'Staff Role Updated',
                        `Staff role set to ${role}.`
                    ),
                ],
                flags:
                    MessageFlags.Ephemeral,
            });

            await refreshDashboard(
                rootInteraction,
                guildConfig,
                guildId,
                client
            );
        }
    );
}

/* ============================================================
   OPEN CATEGORY
   ============================================================ */

async function handleOpenCategory(
    selectInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    await selectInteraction.deferUpdate();

    const channelSelect =
        new ChannelSelectMenuBuilder()
            .setCustomId(
                'ticket_cfg_open_cat'
            )
            .setPlaceholder(
                'Select a category...'
            )
            .addChannelTypes(
                ChannelType.GuildCategory
            )
            .setMaxValues(
                1
            );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    '📁 Change Open Tickets Category'
                )
                .setDescription(
                    `**Current:** ${
                        guildConfig.ticketCategoryId
                            ? `<#${guildConfig.ticketCategoryId}>`
                            : '`Not set`'
                    }\n\nSelect the category where new tickets will be created.`
                )
                .setColor(
                    getColor('info')
                ),
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    channelSelect
                ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.ChannelSelect,

            filter: i =>
                i.user.id ===
                    selectInteraction.user.id &&
                i.customId ===
                    'ticket_cfg_open_cat',

            time: 60_000,
            max: 1,
        });

    collector.on(
        'collect',
        async channelInteraction => {
            await channelInteraction.deferUpdate();

            const category =
                channelInteraction.channels.first();

            if (!category) {
                return;
            }

            guildConfig.ticketCategoryId =
                category.id;

            await setGuildConfig(
                client,
                guildId,
                guildConfig
            );

            await channelInteraction.followUp({
                embeds: [
                    successEmbed(
                        'Open Category Updated',
                        `New tickets will now be created in **${category.name}**.`
                    ),
                ],
                flags:
                    MessageFlags.Ephemeral,
            });

            await refreshDashboard(
                rootInteraction,
                guildConfig,
                guildId,
                client
            );
        }
    );
}

/* ============================================================
   CLOSED CATEGORY
   ============================================================ */

async function handleClosedCategory(
    selectInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    await selectInteraction.deferUpdate();

    const channelSelect =
        new ChannelSelectMenuBuilder()
            .setCustomId(
                'ticket_cfg_closed_cat'
            )
            .setPlaceholder(
                'Select a category...'
            )
            .addChannelTypes(
                ChannelType.GuildCategory
            )
            .setMaxValues(
                1
            );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    '📂 Change Closed Tickets Category'
                )
                .setDescription(
                    `**Current:** ${
                        guildConfig.ticketClosedCategoryId
                            ? `<#${guildConfig.ticketClosedCategoryId}>`
                            : '`Not set`'
                    }\n\nSelect the category where closed tickets will be moved.`
                )
                .setColor(
                    getColor('info')
                ),
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    channelSelect
                ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.ChannelSelect,

            filter: i =>
                i.user.id ===
                    selectInteraction.user.id &&
                i.customId ===
                    'ticket_cfg_closed_cat',

            time: 60_000,
            max: 1,
        });

    collector.on(
        'collect',
        async channelInteraction => {
            await channelInteraction.deferUpdate();

            const category =
                channelInteraction.channels.first();

            if (!category) {
                return;
            }

            guildConfig.ticketClosedCategoryId =
                category.id;

            await setGuildConfig(
                client,
                guildId,
                guildConfig
            );

            await channelInteraction.followUp({
                embeds: [
                    successEmbed(
                        'Closed Category Updated',
                        `Closed tickets will now be moved to **${category.name}**.`
                    ),
                ],
                flags:
                    MessageFlags.Ephemeral,
            });

            await refreshDashboard(
                rootInteraction,
                guildConfig,
                guildId,
                client
            );
        }
    );
}

/* ============================================================
   MAX TICKETS
   ============================================================ */

async function handleMaxTickets(
    selectInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    const modal =
        new ModalBuilder()
            .setCustomId(
                'ticket_cfg_max_tickets'
            )
            .setTitle(
                'Set Max Tickets per User'
            )
            .addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId(
                                'max_tickets_input'
                            )
                            .setLabel(
                                'Max Open Tickets (1–10)'
                            )
                            .setStyle(
                                TextInputStyle.Short
                            )
                            .setValue(
                                String(
                                    guildConfig.maxTicketsPerUser ||
                                    3
                                )
                            )
                            .setMaxLength(
                                2
                            )
                            .setMinLength(
                                1
                            )
                            .setRequired(
                                true
                            )
                            .setPlaceholder(
                                '3'
                            )
                    )
            );

    await selectInteraction.showModal(
        modal
    );

    const submitted =
        await selectInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId ===
                        'ticket_cfg_max_tickets' &&
                    i.user.id ===
                        selectInteraction.user.id,

                time: 120_000,
            })
            .catch(
                () => null
            );

    if (!submitted) {
        return;
    }

    const raw =
        submitted.fields
            .getTextInputValue(
                'max_tickets_input'
            )
            .trim();

    const newMax =
        Number.parseInt(
            raw,
            10
        );

    if (
        Number.isNaN(
            newMax
        ) ||
        newMax < 1 ||
        newMax > 10
    ) {
        await replyUserError(
            submitted,
            {
                type:
                    ErrorTypes.VALIDATION,
                message:
                    'Max tickets must be a whole number between **1** and **10**.',
            }
        );

        return;
    }

    guildConfig.maxTicketsPerUser =
        newMax;

    await setGuildConfig(
        client,
        guildId,
        guildConfig
    );

    await submitted.reply({
        embeds: [
            successEmbed(
                'Max Tickets Updated',
                `Users can now have at most **${newMax}** open tickets.`
            ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        guildConfig,
        guildId,
        client
    );
}

/* ============================================================
   DM ON CLOSE
   ============================================================ */

async function handleDmOnClose(
    btnInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    await btnInteraction.deferUpdate();

    const newState =
        guildConfig.dmOnClose === false;

    guildConfig.dmOnClose =
        newState;

    await setGuildConfig(
        client,
        guildId,
        guildConfig
    );

    await btnInteraction.followUp({
        embeds: [
            successEmbed(
                'DM on Close Updated',
                `Users will **${
                    newState
                        ? 'now'
                        : 'no longer'
                }** receive a DM when their ticket is closed.`
            ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        guildConfig,
        guildId,
        client
    );
}

/* ============================================================
   LOGS CHANNEL
   ============================================================ */

async function handleLogsChannel(
    selectInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    await selectInteraction.deferUpdate();

    const channelSelect =
        new ChannelSelectMenuBuilder()
            .setCustomId(
                'ticket_cfg_logs_channel'
            )
            .setPlaceholder(
                'Select a channel...'
            )
            .addChannelTypes(
                ChannelType.GuildText
            )
            .setMaxValues(
                1
            );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    '🎫 Select Ticket Logs Channel'
                )
                .setDescription(
                    'Choose where ticket feedback, lifecycle events, and logs will be sent.'
                )
                .setColor(
                    getColor('info')
                ),
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    channelSelect
                ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.ChannelSelect,

            filter: i =>
                i.user.id ===
                    selectInteraction.user.id &&
                i.customId ===
                    'ticket_cfg_logs_channel',

            time: 60_000,
            max: 1,
        });

    collector.on(
        'collect',
        async channelInteraction => {
            await channelInteraction.deferUpdate();

            const channel =
                channelInteraction.channels.first();

            if (!channel) {
                return;
            }

            guildConfig.ticketLogsChannelId =
                channel.id;

            await setGuildConfig(
                client,
                guildId,
                guildConfig
            );

            await channelInteraction.followUp({
                embeds: [
                    successEmbed(
                        'Logs Channel Updated',
                        `Ticket logs will be sent to ${channel}.`
                    ),
                ],
                flags:
                    MessageFlags.Ephemeral,
            });

            await refreshDashboard(
                rootInteraction,
                guildConfig,
                guildId,
                client
            );
        }
    );
}

/* ============================================================
   TRANSCRIPT CHANNEL
   ============================================================ */

async function handleTranscriptChannel(
    selectInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    await selectInteraction.deferUpdate();

    const channelSelect =
        new ChannelSelectMenuBuilder()
            .setCustomId(
                'ticket_cfg_transcript_channel'
            )
            .setPlaceholder(
                'Select a channel...'
            )
            .addChannelTypes(
                ChannelType.GuildText
            )
            .setMaxValues(
                1
            );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle(
                    '📜 Select Transcript Channel'
                )
                .setDescription(
                    'Choose where auto-generated transcripts will be sent when tickets are deleted.'
                )
                .setColor(
                    getColor('info')
                ),
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    channelSelect
                ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    const collector =
        rootInteraction.channel.createMessageComponentCollector({
            componentType:
                ComponentType.ChannelSelect,

            filter: i =>
                i.user.id ===
                    selectInteraction.user.id &&
                i.customId ===
                    'ticket_cfg_transcript_channel',

            time: 60_000,
            max: 1,
        });

    collector.on(
        'collect',
        async channelInteraction => {
            await channelInteraction.deferUpdate();

            const channel =
                channelInteraction.channels.first();

            if (!channel) {
                return;
            }

            guildConfig.ticketTranscriptChannelId =
                channel.id;

            await setGuildConfig(
                client,
                guildId,
                guildConfig
            );

            await channelInteraction.followUp({
                embeds: [
                    successEmbed(
                        'Transcript Channel Updated',
                        `Transcripts will be sent to ${channel}.`
                    ),
                ],
                flags:
                    MessageFlags.Ephemeral,
            });

            await refreshDashboard(
                rootInteraction,
                guildConfig,
                guildId,
                client
            );
        }
    );
}

/* ============================================================
   REPOST PANEL
   ============================================================ */

async function handleRepostPanel(
    btnInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    await btnInteraction.deferUpdate();

    const panelStatus =
        await getTicketPanelStatus(
            client,
            rootInteraction.guild,
            guildConfig
        );

    if (panelStatus.exists) {
        await btnInteraction.followUp({
            embeds: [
                infoEmbed(
                    'Panel Already Active',
                    'The ticket panel is already posted in the configured channel.'
                ),
            ],
            flags:
                MessageFlags.Ephemeral,
        });

        await refreshDashboard(
            rootInteraction,
            guildConfig,
            guildId,
            client
        );

        return;
    }

    const sentPanel =
        await repostTicketPanel(
            client,
            rootInteraction.guild,
            guildConfig,
            guildId
        );

    await btnInteraction.followUp({
        embeds: [
            successEmbed(
                'Panel Reposted',
                `A new ticket panel was posted in <#${guildConfig.ticketPanelChannelId}>.${
                    sentPanel.url
                        ? `\n[Open panel message](${sentPanel.url})`
                        : ''
                }`
            ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    await refreshDashboard(
        rootInteraction,
        guildConfig,
        guildId,
        client
    );
}

/* ============================================================
   DELETE SYSTEM
   ============================================================ */

async function handleDeleteSystem(
    btnInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client
) {
    const deleteModal =
        new ModalBuilder()
            .setCustomId(
                'ticket_delete_confirm_modal'
            )
            .setTitle(
                'Delete Ticket System'
            )
            .addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId(
                                'delete_confirmation'
                            )
                            .setLabel(
                                'Type "DELETE" to confirm'
                            )
                            .setStyle(
                                TextInputStyle.Short
                            )
                            .setPlaceholder(
                                'DELETE'
                            )
                            .setMaxLength(
                                6
                            )
                            .setMinLength(
                                6
                            )
                            .setRequired(
                                true
                            )
                    )
            );

    await btnInteraction.showModal(
        deleteModal
    );

    const submitted =
        await btnInteraction
            .awaitModalSubmit({
                filter: i =>
                    i.customId ===
                        'ticket_delete_confirm_modal' &&
                    i.user.id ===
                        btnInteraction.user.id,

                time: 120_000,
            })
            .catch(
                () => null
            );

    if (!submitted) {
        return;
    }

    const confirmation =
        submitted.fields
            .getTextInputValue(
                'delete_confirmation'
            )
            .trim();

    if (
        confirmation !== 'DELETE'
    ) {
        await replyUserError(
            submitted,
            {
                type:
                    ErrorTypes.UNKNOWN,
                message:
                    'You must type "DELETE" exactly to confirm deletion.',
            }
        );

        return;
    }

    await submitted.deferUpdate();

    stopTicketPanelAutoUpdate(
        guildId
    );

    const keysToDelete = [
        'ticketPanelChannelId',
        'ticketPanelMessageId',
        'ticketStaffRoleId',
        'ticketCategoryId',
        'ticketClosedCategoryId',
        'ticketPanelMessage',
        'ticketButtonLabel',
        'maxTicketsPerUser',
        'dmOnClose',
    ];

    if (
        guildConfig.ticketPanelChannelId
    ) {
        try {
            const guild =
                client.guilds.cache.get(
                    guildId
                );

            const panelChannel =
                await guild?.channels
                    .fetch(
                        guildConfig.ticketPanelChannelId
                    )
                    .catch(
                        () => null
                    );

            if (panelChannel) {
                if (
                    guildConfig.ticketPanelMessageId
                ) {
                    const panelMessage =
                        await panelChannel.messages
                            .fetch(
                                guildConfig.ticketPanelMessageId
                            )
                            .catch(
                                () => null
                            );

                    if (panelMessage) {
                        await panelMessage
                            .delete()
                            .catch(
                                () => {}
                            );
                    }
                } else {
                    const messages =
                        await panelChannel.messages
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
                                    message.author.id ===
                                        client.user.id &&
                                    (
                                        messageHasButtonCustomId(
                                            message,
                                            'create_ticket'
                                        ) ||
                                        message.embeds?.some(
                                            embed =>
                                                embed.title
                                                    ?.toLowerCase()
                                                    .includes(
                                                        'white angels'
                                                    ) ||
                                                embed.title
                                                    ?.toLowerCase()
                                                    .includes(
                                                        'support tickets'
                                                    )
                                        )
                                    )
                            );

                        if (found) {
                            await found
                                .delete()
                                .catch(
                                    () => {}
                                );
                        }
                    }
                }
            }
        } catch (error) {
            logger.warn(
                'Could not delete ticket panel message:',
                error.message
            );
        }
    }

    for (
        const key
        of keysToDelete
    ) {
        delete guildConfig[key];
    }

    await setGuildConfig(
        client,
        guildId,
        guildConfig
    );

    await submitted.followUp({
        embeds: [
            successEmbed(
                '✅ Ticket System Deleted',
                'All ticket system configuration has been cleared. Run `/ticket setup` to set it up again.'
            ),
        ],
        flags:
            MessageFlags.Ephemeral,
    });

    await InteractionHelper.safeEditReply(
        rootInteraction,
        {
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        'Ticket System Deleted'
                    )
                    .setDescription(
                        'The ticket system configuration has been cleared.'
                    )
                    .setColor(
                        getColor('error')
                    )
                    .setTimestamp(),
            ],
            components: [],
        }
    ).catch(
        () => {}
    );
}

/* ============================================================
   DASHBOARD
   ============================================================ */

export default {
    prefixOnly: false,

    async execute(
        interaction,
        config,
        client
    ) {
        /*
         * ====================================================
         * ALLEEN USER 708290114760998993
         * ====================================================
         */

        if (
            interaction.user.id !==
            AUTHORIZED_USER_ID
        ) {
            return interaction.reply({
                content:
                    '❌ Je hebt geen toestemming om het ticket dashboard te gebruiken.',
                flags:
                    MessageFlags.Ephemeral,
            });
        }

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
                    'The ticket system has not been set up yet. Run `/ticket setup` first to configure it.'
                );
            }

            /*
             * Achtergrond updater starten.
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

            const ticketStats =
                await getGuildTicketStats(
                    guildId
                );

            const buttonRow =
                buildButtonRow(
                    guildConfig,
                    guildId,
                    false,
                    panelStatus
                );

            const selectRow =
                new ActionRowBuilder()
                    .addComponents(
                        buildSelectMenu(
                            guildId
                        )
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
                    buttonRow,
                    selectRow,
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
                        const selectedOption =
                            selectInteraction
                                .values[0];

                        switch (
                            selectedOption
                        ) {
                            case 'panel_message':
                                await handlePanelMessage(
                                    selectInteraction,
                                    interaction,
                                    guildConfig,
                                    guildId,
                                    client
                                );
                                break;

                            case 'button_label':
                                await handleButtonLabel(
                                    selectInteraction,
                                    interaction,
                                    guildConfig,
                                    guildId,
                                    client
                                );
                                break;

                            case 'staff_role':
                                await handleStaffRole(
                                    selectInteraction,
                                    interaction,
                                    guildConfig,
                                    guildId,
                                    client
                                );
                                break;

                            case 'open_category':
                                await handleOpenCategory(
                                    selectInteraction,
                                    interaction,
                                    guildConfig,
                                    guildId,
                                    client
                                );
                                break;

                            case 'closed_category':
                                await handleClosedCategory(
                                    selectInteraction,
                                    interaction,
                                    guildConfig,
                                    guildId,
                                    client
                                );
                                break;

                            case 'max_tickets':
                                await handleMaxTickets(
                                    selectInteraction,
                                    interaction,
                                    guildConfig,
                                    guildId,
                                    client
                                );
                                break;

                            case 'logs_channel':
                                await handleLogsChannel(
                                    selectInteraction,
                                    interaction,
                                    guildConfig,
                                    guildId,
                                    client
                                );
                                break;

                            case 'transcript_channel':
                                await handleTranscriptChannel(
                                    selectInteraction,
                                    interaction,
                                    guildConfig,
                                    guildId,
                                    client
                                );
                                break;

                            default:
                                await selectInteraction.reply({
                                    content:
                                        '❌ Onbekende dashboardoptie.',
                                    flags:
                                        MessageFlags.Ephemeral,
                                });
                        }
                    },

                onButton:
                    async btnInteraction => {
                        if (
                            btnInteraction.customId ===
                            `ticket_cfg_repost_${guildId}`
                        ) {
                            await handleRepostPanel(
                                btnInteraction,
                                interaction,
                                guildConfig,
                                guildId,
                                client
                            );

                        } else if (
                            btnInteraction.customId ===
                            `ticket_cfg_dm_toggle_${guildId}`
                        ) {
                            await handleDmOnClose(
                                btnInteraction,
                                interaction,
                                guildConfig,
                                guildId,
                                client
                            );

                        } else if (
                            btnInteraction.customId ===
                            `ticket_cfg_staff_role_btn_${guildId}`
                        ) {
                            await handleStaffRole(
                                btnInteraction,
                                interaction,
                                guildConfig,
                                guildId,
                                client
                            );

                        } else if (
                            btnInteraction.customId ===
                            `ticket_cfg_delete_${guildId}`
                        ) {
                            await handleDeleteSystem(
                                btnInteraction,
                                interaction,
                                guildConfig,
                                guildId,
                                client
                            );
                        }
                    },
            });

        } catch (error) {
            logger.error(
                'Unexpected error in ticket dashboard:',
                error
            );

            if (
                error instanceof
                TitanBotError
            ) {
                throw error;
            }

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
    getWhiteAngelsMemberCount,
    buildPanelEmbed,
    startTicketPanelAutoUpdate,
    stopTicketPanelAutoUpdate,
    updateExistingTicketPanel,
    startAllTicketPanelAutoUpdates,
    repostTicketPanel,
};
