import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    MessageFlags
} from 'discord.js';

import {
    getGuildConfig,
    setGuildConfig
} from '../../services/config/guildConfig.js';

import { getColor } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verification')
        .setDescription('Beheer de server verificatie')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        )

        // ============================================================
        // /verification setup
        // ============================================================

        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription(
                    'Stel het verificatiesysteem in'
                )

                .addChannelOption(option =>
                    option
                        .setName('kanaal')
                        .setDescription(
                            'Het tekstkanaal voor het verificatiebericht'
                        )
                        .addChannelTypes(
                            ChannelType.GuildText
                        )
                        .setRequired(true)
                )

                .addRoleOption(option =>
                    option
                        .setName('rol')
                        .setDescription(
                            'De rol die leden krijgen na verificatie'
                        )
                        .setRequired(true)
                )
        )

        // ============================================================
        // /verification disable
        // ============================================================

        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription(
                    'Schakel het verificatiesysteem uit'
                )
        ),

    // ================================================================
    // EXECUTE
    // ================================================================

    async execute(interaction, config, client) {
        try {
            /* ========================================================
               SERVER
               ======================================================== */

            const guild = interaction.guild;

            if (!guild) {
                return interaction.reply({
                    content:
                        '❌ Dit commando kan alleen in een server worden gebruikt.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }

            /* ========================================================
               SUBCOMMAND
               ======================================================== */

            const subcommand =
                interaction.options.getSubcommand();

            /* ========================================================
               SETUP
               ======================================================== */

            if (subcommand === 'setup') {

                /*
                 * ======================================================
                 * BELANGRIJK
                 * ======================================================
                 *
                 * We lezen de subcommand-opties rechtstreeks uit
                 * interaction.options.data.
                 *
                 * Hierdoor zijn we niet afhankelijk van
                 * getChannel()/getRole() om de geneste opties te vinden.
                 */

                const setupOption =
                    interaction.options.data.find(
                        option =>
                            option.name === 'setup'
                    );

                logger.info(
                    '[Verification] Raw interaction options',
                    {
                        guildId:
                            guild.id,

                        options:
                            JSON.stringify(
                                interaction.options.data,
                                null,
                                2
                            )
                    }
                );

                if (!setupOption) {
                    return interaction.reply({
                        content:
                            '❌ De `setup` subcommand kon niet worden gevonden.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   KANAAL ID
                   ==================================================== */

                const channelOption =
                    setupOption.options?.find(
                        option =>
                            option.name === 'kanaal'
                    );

                /* ====================================================
                   ROL ID
                   ==================================================== */

                const roleOption =
                    setupOption.options?.find(
                        option =>
                            option.name === 'rol'
                    );

                logger.info(
                    '[Verification] Setup options gevonden',
                    {
                        channelOption:
                            channelOption
                                ? {
                                    name:
                                        channelOption.name,
                                    type:
                                        channelOption.type,
                                    value:
                                        channelOption.value
                                }
                                : null,

                        roleOption:
                            roleOption
                                ? {
                                    name:
                                        roleOption.name,
                                    type:
                                        roleOption.type,
                                    value:
                                        roleOption.value
                                }
                                : null
                    }
                );

                /* ====================================================
                   CHANNEL ID CONTROLEREN
                   ==================================================== */

                const channelId =
                    channelOption?.value;

                if (!channelId) {
                    return interaction.reply({
                        content: [
                            '❌ Discord heeft geen kanaal-ID meegestuurd.',
                            '',
                            'Controleer bij `/verification setup` of je daadwerkelijk een kanaal bij **kanaal** selecteert.'
                        ].join('\n'),
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   ROLE ID CONTROLEREN
                   ==================================================== */

                const roleId =
                    roleOption?.value;

                if (!roleId) {
                    return interaction.reply({
                        content: [
                            '❌ Discord heeft geen rol-ID meegestuurd.',
                            '',
                            'Controleer bij `/verification setup` of je daadwerkelijk een rol bij **rol** selecteert.'
                        ].join('\n'),
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                logger.info(
                    '[Verification] IDs ontvangen',
                    {
                        channelId:
                            String(channelId),

                        roleId:
                            String(roleId)
                    }
                );

                /* ====================================================
                   CHANNEL OPHALEN
                   ==================================================== */

                const channel =
                    await guild.channels
                        .fetch(
                            String(channelId)
                        )
                        .catch(
                            error => {
                                logger.error(
                                    '[Verification] Kanaal ophalen mislukt',
                                    {
                                        channelId:
                                            String(channelId),

                                        error:
                                            error?.message ||
                                            error
                                    }
                                );

                                return null;
                            }
                        );

                if (!channel) {
                    return interaction.reply({
                        content:
                            '❌ Het geselecteerde kanaal kon niet worden gevonden.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   CHANNEL TYPE
                   ==================================================== */

                if (
                    channel.type !==
                    ChannelType.GuildText
                ) {
                    return interaction.reply({
                        content:
                            '❌ Selecteer een normaal tekstkanaal.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   ROLE OPHALEN
                   ==================================================== */

                const role =
                    await guild.roles
                        .fetch(
                            String(roleId)
                        )
                        .catch(
                            error => {
                                logger.error(
                                    '[Verification] Rol ophalen mislukt',
                                    {
                                        roleId:
                                            String(roleId),

                                        error:
                                            error?.message ||
                                            error
                                    }
                                );

                                return null;
                            }
                        );

                if (!role) {
                    return interaction.reply({
                        content:
                            '❌ De geselecteerde rol kon niet worden gevonden.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   @EVERYONE
                   ==================================================== */

                if (
                    role.id ===
                    guild.id
                ) {
                    return interaction.reply({
                        content:
                            '❌ Je kunt de @everyone rol niet gebruiken.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   MANAGED ROLE
                   ==================================================== */

                if (role.managed) {
                    return interaction.reply({
                        content:
                            '❌ Deze rol wordt beheerd door een integratie en kan niet worden gebruikt.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   BOT MEMBER
                   ==================================================== */

                const botMember =
                    guild.members.me ||
                    await guild.members
                        .fetch(
                            client.user.id
                        )
                        .catch(
                            () => null
                        );

                if (!botMember) {
                    return interaction.reply({
                        content:
                            '❌ Ik kan mijn eigen bot-lid niet vinden.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   MANAGE ROLES
                   ==================================================== */

                if (
                    !botMember.permissions.has(
                        PermissionFlagsBits.ManageRoles
                    )
                ) {
                    return interaction.reply({
                        content:
                            '❌ Ik heb de **Rollen beheren** permissie nodig.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   ROLE HIERARCHY
                   ==================================================== */

                if (
                    role.position >=
                    botMember.roles.highest.position
                ) {
                    return interaction.reply({
                        content: [
                            '❌ Mijn botrol moet boven de verificatierol staan.',
                            '',
                            `Mijn hoogste rol: **${botMember.roles.highest.name}**`,
                            `Verificatierol: **${role.name}**`
                        ].join('\n'),
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   CHANNEL PERMISSIONS
                   ==================================================== */

                const permissions =
                    channel.permissionsFor(
                        botMember
                    );

                if (
                    !permissions?.has(
                        PermissionFlagsBits.ViewChannel
                    )
                ) {
                    return interaction.reply({
                        content:
                            `❌ Ik kan ${channel} niet bekijken.`,
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                if (
                    !permissions?.has(
                        PermissionFlagsBits.SendMessages
                    )
                ) {
                    return interaction.reply({
                        content:
                            `❌ Ik kan geen berichten sturen in ${channel}.`,
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                if (
                    !permissions?.has(
                        PermissionFlagsBits.EmbedLinks
                    )
                ) {
                    return interaction.reply({
                        content:
                            `❌ Ik heb **Links insluiten** nodig in ${channel}.`,
                        flags:
                            MessageFlags.Ephemeral
                    });
                }

                /* ====================================================
                   DEFER
                   ==================================================== */

                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral
                });

                /* ====================================================
                   CONFIG OPHALEN
                   ==================================================== */

                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                /* ====================================================
                   OUDE VERIFICATIEBERICHT
                   ==================================================== */

                const oldChannelId =
                    guildConfig?.verification?.channelId;

                const oldMessageId =
                    guildConfig?.verification?.messageId;

                if (
                    oldChannelId &&
                    oldMessageId
                ) {
                    try {
                        const oldChannel =
                            await guild.channels
                                .fetch(
                                    oldChannelId
                                )
                                .catch(
                                    () => null
                                );

                        if (
                            oldChannel?.isTextBased()
                        ) {
                            const oldMessage =
                                await oldChannel.messages
                                    .fetch(
                                        oldMessageId
                                    )
                                    .catch(
                                        () => null
                                    );

                            if (oldMessage) {
                                await oldMessage
                                    .delete()
                                    .catch(
                                        () => {}
                                    );

                                logger.info(
                                    '[Verification] Oud verificatiebericht verwijderd.'
                                );
                            }
                        }
                    } catch (error) {
                        logger.warn(
                            '[Verification] Oud verificatiebericht verwijderen mislukt:',
                            error
                        );
                    }
                }

                /* ====================================================
                   EMBED
                   ==================================================== */

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            getColor(
                                'primary'
                            )
                        )
                        .setTitle(
                            '📜 Regels & Verificatie'
                        )
                        .setDescription(
                            [
                                `Welkom bij **${guild.name}**!`,
                                '',
                                'Voordat je toegang krijgt tot de rest van de server moet je eerst de regels lezen en accepteren.',
                                '',
                                '**📋 Serverregels**',
                                '',
                                '1. Behandel iedereen met respect.',
                                '2. Geen spam of onnodige berichten.',
                                '3. Geen reclame zonder toestemming.',
                                '4. Houd je aan de Discord regels.',
                                '5. Houd je aan de serverregels.',
                                '',
                                'Door hieronder op **✅ Regels accepteren** te klikken verklaar je dat je de regels hebt gelezen en ermee akkoord gaat.',
                                '',
                                `Na verificatie krijg je automatisch de rol ${role}.`
                            ].join(
                                '\n'
                            )
                        )
                        .setFooter({
                            text:
                                `${guild.name} • Verificatie`
                        })
                        .setTimestamp();

                /* ====================================================
                   BUTTON
                   ==================================================== */

                const button =
                    new ButtonBuilder()
                        .setCustomId(
                            'verification_accept'
                        )
                        .setLabel(
                            'Regels accepteren'
                        )
                        .setEmoji(
                            '✅'
                        )
                        .setStyle(
                            ButtonStyle.Success
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            button
                        );

                /* ====================================================
                   BERICHT STUREN
                   ==================================================== */

                const verificationMessage =
                    await channel.send({
                        embeds: [
                            embed
                        ],
                        components: [
                            row
                        ]
                    });

                /* ====================================================
                   CONFIG OPSLAAN
                   ==================================================== */

                const updatedConfig = {
                    ...(guildConfig || {}),

                    verification: {
                        enabled:
                            true,

                        channelId:
                            channel.id,

                        roleId:
                            role.id,

                        messageId:
                            verificationMessage.id,

                        autoVerify: {
                            enabled:
                                false
                        }
                    }
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    updatedConfig
                );

                /* ====================================================
                   SUCCES LOG
                   ==================================================== */

                logger.info(
                    '[Verification] Setup succesvol afgerond',
                    {
                        guildId:
                            guild.id,

                        channelId:
                            channel.id,

                        roleId:
                            role.id,

                        messageId:
                            verificationMessage.id
                    }
                );

                /* ====================================================
                   SUCCES
                   ==================================================== */

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                getColor(
                                    'success'
                                )
                            )
                            .setTitle(
                                '✅ Verificatie ingesteld'
                            )
                            .setDescription(
                                [
                                    'Het verificatiesysteem is succesvol ingesteld.',
                                    '',
                                    `**Kanaal:** ${channel}`,
                                    `**Verificatierol:** ${role}`,
                                    '',
                                    `[Klik hier om het verificatiebericht te bekijken](${verificationMessage.url})`,
                                    '',
                                    'Leden kunnen nu op **✅ Regels accepteren** klikken.'
                                ].join(
                                    '\n'
                                )
                            )
                    ]
                });
            }

            /* ========================================================
               DISABLE
               ======================================================== */

            if (
                subcommand === 'disable'
            ) {
                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral
                });

                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                await setGuildConfig(
                    client,
                    guild.id,
                    {
                        ...(guildConfig || {}),

                        verification: {
                            ...(guildConfig?.verification || {}),

                            enabled:
                                false,

                            autoVerify: {
                                enabled:
                                    false
                            }
                        }
                    }
                );

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                getColor(
                                    'success'
                                )
                            )
                            .setTitle(
                                '✅ Verificatie uitgeschakeld'
                            )
                            .setDescription(
                                'Het verificatiesysteem is uitgeschakeld.'
                            )
                    ]
                });
            }

        } catch (error) {

            logger.error(
                '[Verification] Onverwachte fout:',
                {
                    message:
                        error?.message,

                    stack:
                        error?.stack,

                    guildId:
                        interaction.guildId,

                    userId:
                        interaction.user?.id
                }
            );

            if (
                interaction.deferred ||
                interaction.replied
            ) {
                return interaction.editReply({
                    content:
                        `❌ Er is een fout opgetreden.\n\n\`${error?.message || 'Onbekende fout'}\``
                }).catch(
                    () => {}
                );
            }

            return interaction.reply({
                content:
                    `❌ Er is een fout opgetreden.\n\n\`${error?.message || 'Onbekende fout'}\``,
                flags:
                    MessageFlags.Ephemeral
            }).catch(
                () => {}
            );
        }
    }
};
