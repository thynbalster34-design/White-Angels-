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

        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Stel het verificatiesysteem in')
                .addChannelOption(option =>
                    option
                        .setName('kanaal')
                        .setDescription(
                            'Kanaal voor het verificatiebericht'
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
                            'Rol die leden krijgen na verificatie'
                        )
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription(
                    'Schakel verificatie uit'
                )
        ),

    async execute(interaction, config, client) {

        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content:
                    '❌ Dit commando kan alleen in een server worden gebruikt.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand =
            interaction.options.getSubcommand();

        if (subcommand === 'setup') {

            const channel =
                interaction.options.getChannel(
                    'kanaal'
                );

            const role =
                interaction.options.getRole(
                    'rol'
                );

            logger.info(
                '[Verification] Setup ontvangen',
                {
                    guildId: guild.id,
                    channelId: channel?.id,
                    roleId: role?.id
                }
            );

            if (!channel) {
                return interaction.reply({
                    content:
                        '❌ Geen kanaal ontvangen. De `/verification` command is waarschijnlijk nog oud geregistreerd.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!role) {
                return interaction.reply({
                    content:
                        '❌ Geen rol ontvangen. De `/verification` command is waarschijnlijk nog oud geregistreerd.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                channel.type !==
                ChannelType.GuildText
            ) {
                return interaction.reply({
                    content:
                        '❌ Selecteer een tekstkanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (role.id === guild.id) {
                return interaction.reply({
                    content:
                        '❌ @everyone kan niet gebruikt worden.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (role.managed) {
                return interaction.reply({
                    content:
                        '❌ Deze rol wordt beheerd door een integratie.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const botMember =
                guild.members.me ||
                await guild.members
                    .fetch(client.user.id)
                    .catch(() => null);

            if (!botMember) {
                return interaction.reply({
                    content:
                        '❌ Ik kan mijn bot-lid niet vinden.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                return interaction.reply({
                    content:
                        '❌ Ik heb Rollen beheren nodig.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                role.position >=
                botMember.roles.highest.position
            ) {
                return interaction.reply({
                    content:
                        '❌ Mijn botrol moet boven de verificatierol staan.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const permissions =
                channel.permissionsFor(botMember);

            if (
                !permissions?.has(
                    PermissionFlagsBits.ViewChannel
                ) ||
                !permissions?.has(
                    PermissionFlagsBits.SendMessages
                ) ||
                !permissions?.has(
                    PermissionFlagsBits.EmbedLinks
                )
            ) {
                return interaction.reply({
                    content:
                        `❌ Ik heb View Channel, Send Messages en Embed Links nodig in ${channel}.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            const guildConfig =
                await getGuildConfig(
                    client,
                    guild.id
                );

            const oldChannelId =
                guildConfig?.verification?.channelId;

            const oldMessageId =
                guildConfig?.verification?.messageId;

            if (
                oldChannelId &&
                oldMessageId
            ) {
                const oldChannel =
                    await guild.channels
                        .fetch(oldChannelId)
                        .catch(() => null);

                if (oldChannel?.isTextBased()) {
                    const oldMessage =
                        await oldChannel.messages
                            .fetch(oldMessageId)
                            .catch(() => null);

                    if (oldMessage) {
                        await oldMessage
                            .delete()
                            .catch(() => {});
                    }
                }
            }

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
                            'Lees de regels en accepteer ze met de knop hieronder.',
                            '',
                            '**📋 Serverregels**',
                            '',
                            '1. Behandel iedereen met respect.',
                            '2. Geen spam.',
                            '3. Geen reclame zonder toestemming.',
                            '4. Houd je aan de Discord regels.',
                            '5. Houd je aan de serverregels.',
                            '',
                            `Na verificatie krijg je automatisch de rol ${role}.`
                        ].join('\n')
                    )
                    .setFooter({
                        text:
                            `${guild.name} • Verificatie`
                    })
                    .setTimestamp();

            const button =
                new ButtonBuilder()
                    .setCustomId(
                        'verification_accept'
                    )
                    .setLabel(
                        'Regels accepteren'
                    )
                    .setEmoji('✅')
                    .setStyle(
                        ButtonStyle.Success
                    );

            const row =
                new ActionRowBuilder()
                    .addComponents(button);

            const message =
                await channel.send({
                    embeds: [embed],
                    components: [row]
                });

            await setGuildConfig(
                client,
                guild.id,
                {
                    ...(guildConfig || {}),

                    verification: {
                        enabled: true,
                        channelId: channel.id,
                        roleId: role.id,
                        messageId: message.id,

                        autoVerify: {
                            enabled: false
                        }
                    }
                }
            );

            logger.info(
                '[Verification] Setup succesvol',
                {
                    guildId: guild.id,
                    channelId: channel.id,
                    roleId: role.id,
                    messageId: message.id
                }
            );

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
                                `**Kanaal:** ${channel}`,
                                `**Rol:** ${role}`,
                                '',
                                `[Bekijk verificatiebericht](${message.url})`
                            ].join('\n')
                        )
                ]
            });
        }

        if (subcommand === 'disable') {

            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
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

                        enabled: false,

                        autoVerify: {
                            enabled: false
                        }
                    }
                }
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
    }
};
