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
                .setDescription('Stel het verificatiesysteem in')

                .addChannelOption(option =>
                    option
                        .setName('kanaal')
                        .setDescription(
                            'Het tekstkanaal waar het verificatiebericht komt'
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
            if (!interaction.guild) {
                return interaction.reply({
                    content:
                        '❌ Dit commando kan alleen in een server worden gebruikt.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const guild = interaction.guild;
            const subcommand = interaction.options.getSubcommand();

            // ========================================================
            // SETUP
            // ========================================================

            if (subcommand === 'setup') {
                const channel = interaction.options.getChannel(
                    'kanaal',
                    true
                );

                const role = interaction.options.getRole(
                    'rol',
                    true
                );

                logger.info(
                    `[Verification] Setup gestart in ${guild.name} (${guild.id})`,
                    {
                        channelId: channel.id,
                        channelName: channel.name,
                        roleId: role.id,
                        roleName: role.name,
                        userId: interaction.user.id
                    }
                );

                // ====================================================
                // CHANNEL
                // ====================================================

                if (
                    !channel ||
                    channel.type !== ChannelType.GuildText
                ) {
                    return interaction.reply({
                        content:
                            '❌ Selecteer bij **kanaal** een normaal tekstkanaal.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                // ====================================================
                // ROLE
                // ====================================================

                if (!role) {
                    return interaction.reply({
                        content:
                            '❌ Selecteer bij **rol** een geldige rol.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                // @everyone mag niet
                if (role.id === guild.id) {
                    return interaction.reply({
                        content:
                            '❌ Je kunt de @everyone rol niet gebruiken.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                // Managed role
                if (role.managed) {
                    return interaction.reply({
                        content:
                            '❌ Deze rol wordt beheerd door een integratie en kan niet worden gebruikt.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                // ====================================================
                // BOT MEMBER
                // ====================================================

                const botMember =
                    guild.members.me ||
                    await guild.members
                        .fetch(client.user.id)
                        .catch(() => null);

                if (!botMember) {
                    return interaction.reply({
                        content:
                            '❌ Ik kan mijn eigen bot-lid niet vinden.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                // ====================================================
                // BOT PERMISSION
                // ====================================================

                if (
                    !botMember.permissions.has(
                        PermissionFlagsBits.ManageRoles
                    )
                ) {
                    return interaction.reply({
                        content:
                            '❌ Ik heb de **Rollen beheren** permissie nodig.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                // ====================================================
                // ROLE HIERARCHY
                // ====================================================

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
                        flags: MessageFlags.Ephemeral
                    });
                }

                // ====================================================
                // CHANNEL PERMISSIONS
                // ====================================================

                const permissions =
                    channel.permissionsFor(botMember);

                if (
                    !permissions?.has(
                        PermissionFlagsBits.ViewChannel
                    )
                ) {
                    return interaction.reply({
                        content:
                            `❌ Ik kan ${channel} niet bekijken.`,
                        flags: MessageFlags.Ephemeral
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
                        flags: MessageFlags.Ephemeral
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
                        flags: MessageFlags.Ephemeral
                    });
                }

                // ====================================================
                // DEFER
                // ====================================================

                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                // ====================================================
                // CONFIG OPHALEN
                // ====================================================

                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                // ====================================================
                // OUDE VERIFICATION DATA
                // ====================================================

                const oldChannelId =
                    guildConfig?.verification?.channelId;

                const oldMessageId =
                    guildConfig?.verification?.messageId;

                // ====================================================
                // OUD VERIFICATIEBERICHT VERWIJDEREN
                // ====================================================

                if (
                    oldChannelId &&
                    oldMessageId
                ) {
                    try {
                        const oldChannel =
                            await guild.channels
                                .fetch(oldChannelId)
                                .catch(() => null);

                        if (
                            oldChannel?.isTextBased()
                        ) {
                            const oldMessage =
                                await oldChannel.messages
                                    .fetch(oldMessageId)
                                    .catch(() => null);

                            if (oldMessage) {
                                await oldMessage
                                    .delete()
                                    .catch(() => {});

                                logger.info(
                                    '[Verification] Oud verificatiebericht verwijderd.'
                                );
                            }
                        }
                    } catch (error) {
                        logger.warn(
                            '[Verification] Oud verificatiebericht kon niet worden verwijderd:',
                            error
                        );
                    }
                }

                // ====================================================
                // VERIFICATION EMBED
                // ====================================================

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            getColor('primary')
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
                            ].join('\n')
                        )
                        .setFooter({
                            text:
                                `${guild.name} • Verificatie`
                        })
                        .setTimestamp();

                // ====================================================
                // VERIFICATION BUTTON
                // ====================================================

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

                // ====================================================
                // MESSAGE STUREN
                // ====================================================

                const verificationMessage =
                    await channel.send({
                        embeds: [
                            embed
                        ],
                        components: [
                            row
                        ]
                    });

                // ====================================================
                // CONFIG OPSLAAN
                // ====================================================

                const newVerificationConfig = {
                    enabled: true,
                    channelId: channel.id,
                    roleId: role.id,
                    messageId: verificationMessage.id,
                    autoVerify: {
                        enabled: false
                    }
                };

                const updatedGuildConfig = {
                    ...(guildConfig || {}),
                    verification:
                        newVerificationConfig
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    updatedGuildConfig
                );

                logger.info(
                    `[Verification] Setup succesvol in ${guild.name} (${guild.id})`,
                    {
                        channelId: channel.id,
                        roleId: role.id,
                        messageId:
                            verificationMessage.id
                    }
                );

                // ====================================================
                // SUCCES
                // ====================================================

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                getColor('success')
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
                                    'Leden kunnen nu op **✅ Regels accepteren** klikken.',
                                    '',
                                    '⚠️ Automatische verificatie bij join staat uit.'
                                ].join('\n')
                            )
                    ]
                });
            }

            // ========================================================
            // DISABLE
            // ========================================================

            if (subcommand === 'disable') {
                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                const updatedGuildConfig = {
                    ...(guildConfig || {}),
                    verification: {
                        ...(guildConfig?.verification || {}),
                        enabled: false,
                        autoVerify: {
                            enabled: false
                        }
                    }
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    updatedGuildConfig
                );

                logger.info(
                    `[Verification] Uitgeschakeld in ${guild.name} (${guild.id})`
                );

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                getColor('success')
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

            return interaction.reply({
                content:
                    '❌ Onbekende verification actie.',
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {

            logger.error(
                '[Verification] Onverwachte fout:',
                {
                    message:
                        error?.message ||
                        'Onbekende fout',

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
                        `❌ Er is een fout opgetreden bij het instellen van verificatie.\n\n\`${error?.message || 'Onbekende fout'}\``
                }).catch(() => {});
            }

            return interaction.reply({
                content:
                    `❌ Er is een fout opgetreden bij het instellen van verificatie.\n\n\`${error?.message || 'Onbekende fout'}\``,
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
};
