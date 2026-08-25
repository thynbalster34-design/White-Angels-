import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    EmbedBuilder,
} from 'discord.js';

import {
    createEmbed,
    successEmbed,
} from '../../utils/embeds.js';

import {
    getGuildConfig,
    setGuildConfig,
} from '../../services/config/guildConfig.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

import {
    handleInteractionError,
    replyUserError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

/* ============================================================
   WHITE ANGELS PANEL
   ============================================================ */

async function getWhiteAngelsMemberCount(guild) {
    try {
        // Alle leden ophalen, inclusief offline leden.
        await guild.members.fetch();

        const whiteAngelsRole =
            guild.roles.cache.find(
                role =>
                    role.name.trim().toLowerCase() ===
                    'white angels'
            );

        if (!whiteAngelsRole) {
            logger.warn(
                `White Angels role not found in guild ${guild.id}`
            );

            return 0;
        }

        return guild.members.cache.filter(
            member =>
                !member.user.bot &&
                member.roles.cache.has(
                    whiteAngelsRole.id
                )
        ).size;
    } catch (error) {
        logger.warn(
            `Could not count White Angels members in guild ${guild.id}:`,
            error.message
        );

        return 0;
    }
}

async function buildWhiteAngelsPanelEmbed(
    guild,
    panelMessage
) {
    const memberCount =
        await getWhiteAngelsMemberCount(
            guild
        );

    let statusEmoji = '🟢';

    if (memberCount >= 20) {
        statusEmoji = '🔴';
    } else if (memberCount >= 17) {
        statusEmoji = '🟠';
    }

    const customMessage =
        panelMessage ||
        'Klik hieronder op de knop om een sollicitatie te starten.';

    return new EmbedBuilder()
        .setTitle('White Angels')
        .setDescription(
            `__**Sollicitatie status:**__\n\n` +
            `🟢 Sollicitatie staat open\n` +
            `🟠 Sollicitatie staan open, maar met een kleine wachtrij of weinig plekken nog beschikbaar\n` +
            `🔴 Sollicitatie is gesloten met een korte/lange wachtrij\n\n` +
            `**SOLLICITATIE STATUS: ${statusEmoji}**\n\n` +
            `**__*Aantal leden: ${memberCount}*__**\n\n` +
            `${customMessage}`
        )
        .setColor(getColor('info'));
}

/* ============================================================
   PANEL BUTTON
   ============================================================ */

function buildTicketButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('Solicitate')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩')
    );
}

/* ============================================================
   AUTOMATIC PANEL UPDATE
   ============================================================ */

const ticketPanelIntervals = new Map();

function startPanelAutoUpdate(
    client,
    guild,
    guildConfig
) {
    if (!guildConfig?.ticketPanelChannelId) {
        return;
    }

    // Voorkom meerdere timers voor dezelfde server.
    if (
        ticketPanelIntervals.has(
            guild.id
        )
    ) {
        return;
    }

    const interval = setInterval(
        async () => {
            try {
                const currentConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                if (
                    !currentConfig.ticketPanelChannelId ||
                    !currentConfig.ticketPanelMessageId
                ) {
                    return;
                }

                const channel =
                    await guild.channels.fetch(
                        currentConfig.ticketPanelChannelId
                    ).catch(
                        () => null
                    );

                if (!channel) {
                    return;
                }

                const message =
                    await channel.messages.fetch(
                        currentConfig.ticketPanelMessageId
                    ).catch(
                        () => null
                    );

                if (!message) {
                    return;
                }

                const embed =
                    await buildWhiteAngelsPanelEmbed(
                        guild,
                        currentConfig.ticketPanelMessage
                    );

                await message.edit({
                    embeds: [embed],
                    components: [
                        buildTicketButtonRow(),
                    ],
                });

            } catch (error) {
                logger.warn(
                    `Failed to auto-update ticket panel for guild ${guild.id}:`,
                    error.message
                );
            }
        },
        30000
    );

    ticketPanelIntervals.set(
        guild.id,
        interval
    );

    logger.info(
        `✅ White Angels ticket panel auto-update started for guild ${guild.id}`
    );
}

function stopPanelAutoUpdate(
    guildId
) {
    const interval =
        ticketPanelIntervals.get(
            guildId
        );

    if (interval) {
        clearInterval(interval);

        ticketPanelIntervals.delete(
            guildId
        );
    }
}

/* ============================================================
   COMMAND
   ============================================================ */

export default {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription(
            "Manages the server's ticket system."
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageChannels
        )

        /* =========================
           SETUP
           ========================= */

        .addSubcommand(
            subcommand =>
                subcommand
                    .setName('setup')
                    .setDescription(
                        'Sets up the ticket creation panel.'
                    )

                    .addChannelOption(
                        option =>
                            option
                                .setName(
                                    'panel_channel'
                                )
                                .setDescription(
                                    'The channel where the ticket panel will be sent.'
                                )
                                .addChannelTypes(
                                    ChannelType.GuildText
                                )
                                .setRequired(
                                    true
                                )
                    )

                    .addStringOption(
                        option =>
                            option
                                .setName(
                                    'panel_message'
                                )
                                .setDescription(
                                    'Optional text shown below the White Angels status.'
                                )
                                .setRequired(
                                    false
                                )
                    )

                    .addStringOption(
                        option =>
                            option
                                .setName(
                                    'button_label'
                                )
                                .setDescription(
                                    'Ticket button label. Default: Solicitate'
                                )
                                .setRequired(
                                    false
                                )
                    )

                    .addChannelOption(
                        option =>
                            option
                                .setName(
                                    'category'
                                )
                                .setDescription(
                                    'Category where new tickets will be created.'
                                )
                                .addChannelTypes(
                                    ChannelType.GuildCategory
                                )
                                .setRequired(
                                    false
                                )
                    )

                    .addChannelOption(
                        option =>
                            option
                                .setName(
                                    'closed_category'
                                )
                                .setDescription(
                                    'Category where closed tickets will be moved.'
                                )
                                .addChannelTypes(
                                    ChannelType.GuildCategory
                                )
                                .setRequired(
                                    false
                                )
                    )

                    .addRoleOption(
                        option =>
                            option
                                .setName(
                                    'staff_role'
                                )
                                .setDescription(
                                    'Role that can access tickets.'
                                )
                                .setRequired(
                                    false
                                )
                    )

                    .addIntegerOption(
                        option =>
                            option
                                .setName(
                                    'max_tickets_per_user'
                                )
                                .setDescription(
                                    'Maximum open tickets per user.'
                                )
                                .setMinValue(
                                    1
                                )
                                .setMaxValue(
                                    10
                                )
                                .setRequired(
                                    false
                                )
                    )

                    .addBooleanOption(
                        option =>
                            option
                                .setName(
                                    'dm_on_close'
                                )
                                .setDescription(
                                    'Send a DM when a ticket is closed.'
                                )
                                .setRequired(
                                    false
                                )
                    )
        )

        /* =========================
           DASHBOARD
           ========================= */

        .addSubcommand(
            subcommand =>
                subcommand
                    .setName(
                        'dashboard'
                    )
                    .setDescription(
                        'Open the interactive ticket system dashboard.'
                    )
        ),

    category: 'ticket',

    async execute(
        interaction,
        config,
        client
    ) {
        const deferred =
            await InteractionHelper.safeDefer(
                interaction,
                {
                    flags:
                        MessageFlags.Ephemeral,
                }
            );

        if (!deferred) {
            return;
        }

        try {
            /* =========================
               PERMISSION CHECK
               ========================= */

            if (
                !interaction.member.permissions.has(
                    PermissionFlagsBits.ManageChannels
                )
            ) {
                logger.warn(
                    'Ticket command permission denied',
                    {
                        userId:
                            interaction.user.id,
                        guildId:
                            interaction.guildId,
                        commandName:
                            'ticket',
                    }
                );

                return await replyUserError(
                    interaction,
                    {
                        type:
                            ErrorTypes.PERMISSION,
                        message:
                            'You need the `Manage Channels` permission for this action.',
                    }
                );
            }

            const subcommand =
                interaction.options.getSubcommand();

            /* =========================
               DASHBOARD
               ========================= */

            if (
                subcommand ===
                'dashboard'
            ) {
                return ticketConfig.execute(
                    interaction,
                    config,
                    client
                );
            }

            /* =========================
               SETUP
               ========================= */

            if (
                subcommand ===
                'setup'
            ) {
                const existingConfig =
                    await getGuildConfig(
                        client,
                        interaction.guildId
                    );

                if (
                    existingConfig?.ticketPanelChannelId
                ) {
                    return await replyUserError(
                        interaction,
                        {
                            type:
                                ErrorTypes.UNKNOWN,

                            message:
                                `This server already has a ticket system set up (panel in <#${existingConfig.ticketPanelChannelId}>).\n\n` +
                                'Use `/ticket dashboard` to edit it, or choose **Delete System** from the dashboard to remove it first.',
                        }
                    );
                }

                const panelChannel =
                    interaction.options.getChannel(
                        'panel_channel'
                    );

                const categoryChannel =
                    interaction.options.getChannel(
                        'category'
                    );

                const closedCategoryChannel =
                    interaction.options.getChannel(
                        'closed_category'
                    );

                const staffRole =
                    interaction.options.getRole(
                        'staff_role'
                    );

                /*
                 * Default White Angels panel message.
                 */
                const panelMessage =
                    interaction.options.getString(
                        'panel_message'
                    ) ||
                    'Klik hieronder op de knop om een sollicitatie te starten.';

                /*
                 * Always Solicitate unless manually changed.
                 */
                const buttonLabel =
                    interaction.options.getString(
                        'button_label'
                    ) ||
                    'Solicitate';

                const maxTicketsPerUser =
                    interaction.options.getInteger(
                        'max_tickets_per_user'
                    ) || 3;

                const dmOnClose =
                    interaction.options.getBoolean(
                        'dm_on_close'
                    ) !== false;

                /* =========================
                   CREATE PANEL EMBED
                   ========================= */

                const setupEmbed =
                    await buildWhiteAngelsPanelEmbed(
                        interaction.guild,
                        panelMessage
                    );

                const ticketButton =
                    buildTicketButtonRow();

                try {
                    const sentPanel =
                        await panelChannel.send({
                            embeds: [
                                setupEmbed,
                            ],
                            components: [
                                ticketButton,
                            ],
                        });

                    /* =========================
                       SAVE CONFIG
                       ========================= */

                    if (
                        client.db &&
                        interaction.guildId
                    ) {
                        const currentConfig =
                            existingConfig;

                        currentConfig.ticketCategoryId =
                            categoryChannel
                                ? categoryChannel.id
                                : null;

                        currentConfig.ticketClosedCategoryId =
                            closedCategoryChannel
                                ? closedCategoryChannel.id
                                : null;

                        currentConfig.ticketStaffRoleId =
                            staffRole
                                ? staffRole.id
                                : null;

                        currentConfig.ticketPanelChannelId =
                            panelChannel.id;

                        currentConfig.ticketPanelMessageId =
                            sentPanel.id;

                        currentConfig.ticketPanelMessage =
                            panelMessage;

                        currentConfig.ticketButtonLabel =
                            buttonLabel;

                        currentConfig.maxTicketsPerUser =
                            maxTicketsPerUser;

                        currentConfig.dmOnClose =
                            dmOnClose;

                        await setGuildConfig(
                            client,
                            interaction.guildId,
                            currentConfig
                        );

                        logger.info(
                            'Ticket configuration saved',
                            {
                                guildId:
                                    interaction.guildId,

                                categoryId:
                                    categoryChannel?.id,

                                closedCategoryId:
                                    closedCategoryChannel?.id,

                                staffRoleId:
                                    staffRole?.id,

                                maxTickets:
                                    maxTicketsPerUser,

                                dmOnClose:
                                    dmOnClose,
                            }
                        );

                        /*
                         * Start automatic 30 second updates.
                         */
                        startPanelAutoUpdate(
                            client,
                            interaction.guild,
                            currentConfig
                        );
                    } else {
                        logger.error(
                            'Ticket setup: database unavailable, panel sent but configuration was NOT saved',
                            {
                                guildId:
                                    interaction.guildId,
                            }
                        );
                    }

                    let successMessage =
                        `The White Angels sollicitatiepaneel has been sent to ${panelChannel}.\n`;

                    if (
                        categoryChannel
                    ) {
                        successMessage +=
                            `New tickets will be created in **${categoryChannel.name}**.\n`;
                    } else {
                        successMessage +=
                            'New tickets will be created in a new "Tickets" category.\n';
                    }

                    if (
                        closedCategoryChannel
                    ) {
                        successMessage +=
                            `Closed tickets will be moved to **${closedCategoryChannel.name}**.\n`;
                    }

                    if (staffRole) {
                        successMessage +=
                            `**${staffRole.name}** will have access to tickets.\n`;
                    }

                    successMessage +=
                        `\n**Button:** Solicitate\n` +
                        `**Max Tickets Per User:** ${maxTicketsPerUser}\n` +
                        `**DM on Close:** ${
                            dmOnClose
                                ? 'Enabled'
                                : 'Disabled'
                        }`;

                    await InteractionHelper.safeEditReply(
                        interaction,
                        {
                            embeds: [
                                successEmbed(
                                    'Ticket Panel Set Up',
                                    successMessage
                                ),
                            ],
                        }
                    );

                    logger.info(
                        'Ticket panel setup completed',
                        {
                            userId:
                                interaction.user.id,

                            userTag:
                                interaction.user.tag,

                            guildId:
                                interaction.guildId,

                            panelChannelId:
                                panelChannel.id,

                            categoryId:
                                categoryChannel?.id,

                            closedCategoryId:
                                closedCategoryChannel?.id,

                            staffRoleId:
                                staffRole?.id,

                            maxTickets:
                                maxTicketsPerUser,

                            dmOnClose:
                                dmOnClose,

                            commandName:
                                'ticket_setup',
                        }
                    );

                } catch (error) {
                    logger.error(
                        'Ticket setup error',
                        {
                            error:
                                error.message,

                            stack:
                                error.stack,

                            userId:
                                interaction.user.id,

                            guildId:
                                interaction.guildId,

                            commandName:
                                'ticket_setup',
                        }
                    );

                    if (
                        interaction.deferred ||
                        interaction.replied
                    ) {
                        await replyUserError(
                            interaction,
                            {
                                type:
                                    ErrorTypes.UNKNOWN,

                                message:
                                    'Could not send the ticket panel or save configuration. Check the bot permissions and database connection.',
                            }
                        ).catch(
                            () => {}
                        );
                    } else {
                        await handleInteractionError(
                            interaction,
                            error,
                            {
                                commandName:
                                    'ticket_setup',

                                source:
                                    'ticket_setup_command',
                            }
                        );
                    }
                }
            }
        } catch (error) {
            logger.error(
                'Ticket command error:',
                error
            );

            await handleInteractionError(
                interaction,
                error,
                {
                    commandName:
                        'ticket',
                    source:
                        'ticket_command',
                }
            );
        }
    },
};
