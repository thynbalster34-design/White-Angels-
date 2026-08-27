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
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Stel het verificatiesysteem in')
                .addChannelOption(option =>
                    option
                        .setName('kanaal')
                        .setDescription('Tekstkanaal voor het verificatiebericht')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('rol')
                        .setDescription('Rol die leden krijgen na verificatie')
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Schakel het verificatiesysteem uit')
        ),

    async execute(interaction, config, client) {
        try {
            if (!interaction.guild) {
                return interaction.reply({
                    content: '❌ Dit commando kan alleen in een server worden gebruikt.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const guild = interaction.guild;
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'setup') {

                // NIET "true" gebruiken.
                const channel = interaction.options.getChannel('kanaal', false);
                const role = interaction.options.getRole('rol', false);

                logger.info('[Verification] Setup ontvangen', {
                    guildId: guild.id,
                    channelId: channel?.id ?? null,
                    channelName: channel?.name ?? null,
                    roleId: role?.id ?? null,
                    roleName: role?.name ?? null,
                    options: interaction.options.data
                });

                if (!channel) {
                    return interaction.reply({
                        content: '❌ Geen geldig kanaal ontvangen.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (channel.type !== ChannelType.GuildText) {
                    return interaction.reply({
                        content: '❌ Selecteer een normaal tekstkanaal.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!role) {
                    return interaction.reply({
                        content: '❌ Geen geldige rol ontvangen.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (role.id === guild.id) {
                    return interaction.reply({
                        content: '❌ Je kunt @everyone niet gebruiken.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (role.managed) {
                    return interaction.reply({
                        content: '❌ Deze rol wordt beheerd door een integratie.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const botMember =
                    guild.members.me ||
                    await guild.members.fetch(client.user.id).catch(() => null);

                if (!botMember) {
                    return interaction.reply({
                        content: '❌ Ik kan mijn bot-lid niet vinden.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return interaction.reply({
                        content: '❌ Ik heb **Rollen beheren** nodig.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (role.position >= botMember.roles.highest.position) {
                    return interaction.reply({
                        content: '❌ Mijn botrol moet boven de verificatierol staan.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const permissions = channel.permissionsFor(botMember);

                if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
                    return interaction.reply({
                        content: `❌ Ik kan ${channel} niet bekijken.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
                    return interaction.reply({
                        content: `❌ Ik kan geen berichten sturen in ${channel}.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!permissions?.has(PermissionFlagsBits.EmbedLinks)) {
                    return interaction.reply({
                        content: `❌ Ik heb **Links insluiten** nodig in ${channel}.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                const guildConfig =
                    await getGuildConfig(client, guild.id);

                const oldChannelId =
                    guildConfig?.verification?.channelId;

                const oldMessageId =
                    guildConfig?.verification?.messageId;

                if (oldChannelId && oldMessageId) {
                    const oldChannel =
                        await guild.channels.fetch(oldChannelId).catch(() => null);

                    if (oldChannel?.isTextBased()) {
                        const oldMessage =
                            await oldChannel.messages
                                .fetch(oldMessageId)
                                .catch(() => null);

                        if (oldMessage) {
                            await oldMessage.delete().catch(() => {});
                        }
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor(getColor('primary'))
                    .setTitle('📜 Regels & Verificatie')
                    .setDescription([
                        `Welkom bij **${guild.name}**!`,
                        '',
                        'Lees de regels en accepteer ze met de knop hieronder.',
                        '',
                        '**📋 Serverregels**',
                        '',
                        '1. Behandel iedereen met respect.',
                        '2. Geen spam of onnodige berichten.',
                        '3. Geen reclame zonder toestemming.',
                        '4. Houd je aan de Discord regels.',
                        '5. Houd je aan de serverregels.',
                        '',
                        'Door op **✅ Regels accepteren** te klikken ga je akkoord met de regels.',
                        '',
                        `Na verificatie krijg je automatisch de rol ${role}.`
                    ].join('\n'))
                    .setFooter({
                        text: `${guild.name} • Verificatie`
                    })
                    .setTimestamp();

                const button = new ButtonBuilder()
                    .setCustomId('verification_accept')
                    .setLabel('Regels accepteren')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success);

                const row = new ActionRowBuilder()
                    .addComponents(button);

                const verificationMessage =
                    await channel.send({
                        embeds: [embed],
                        components: [row]
                    });

                const updatedConfig = {
                    ...(guildConfig || {}),
                    verification: {
                        enabled: true,
                        channelId: channel.id,
                        roleId: role.id,
                        messageId: verificationMessage.id,
                        autoVerify: {
                            enabled: false
                        }
                    }
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    updatedConfig
                );

                logger.info('[Verification] Setup succesvol', {
                    guildId: guild.id,
                    channelId: channel.id,
                    roleId: role.id,
                    messageId: verificationMessage.id
                });

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('success'))
                            .setTitle('✅ Verificatie ingesteld')
                            .setDescription([
                                `**Kanaal:** ${channel}`,
                                `**Rol:** ${role}`,
                                '',
                                `[Klik hier om het verificatiebericht te bekijken](${verificationMessage.url})`
                            ].join('\n'))
                    ]
                });
            }

            if (subcommand === 'disable') {
                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                const guildConfig =
                    await getGuildConfig(client, guild.id);

                await setGuildConfig(client, guild.id, {
                    ...(guildConfig || {}),
                    verification: {
                        ...(guildConfig?.verification || {}),
                        enabled: false,
                        autoVerify: {
                            enabled: false
                        }
                    }
                });

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('success'))
                            .setTitle('✅ Verificatie uitgeschakeld')
                            .setDescription(
                                'Het verificatiesysteem is uitgeschakeld.'
                            )
                    ]
                });
            }

        } catch (error) {
            logger.error('[Verification] Error:', {
                message: error?.message,
                stack: error?.stack,
                guildId: interaction.guildId
            });

            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({
                    content:
                        `❌ Er ging iets mis.\n\n\`${error?.message || 'Onbekende fout'}\``
                }).catch(() => {});
            }

            return interaction.reply({
                content:
                    `❌ Er ging iets mis.\n\n\`${error?.message || 'Onbekende fout'}\``,
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
};
