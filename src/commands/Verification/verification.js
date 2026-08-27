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
                        .setDescription('Het kanaal voor de verificatie')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )

                .addRoleOption(option =>
                    option
                        .setName('rol')
                        .setDescription('De rol die leden krijgen na verificatie')
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
            const guild = interaction.guild;

            if (!guild) {
                return interaction.reply({
                    content:
                        '❌ Dit commando kan alleen in een server worden gebruikt.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ============================================================
            // PERMISSIE
            // ============================================================

            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {
                return interaction.reply({
                    content:
                        '❌ Je hebt de **Server beheren** permissie nodig.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const subcommand =
                interaction.options.getSubcommand();

            // ============================================================
            // DISABLE
            // ============================================================

            if (subcommand === 'disable') {
                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                if (!guildConfig.verification) {
                    guildConfig.verification = {};
                }

                guildConfig.verification.enabled = false;

                guildConfig.verification.autoVerify = {
                    enabled: false
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    guildConfig
                );

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('success'))
                            .setTitle(
                                '✅ Verificatie uitgeschakeld'
                            )
                            .setDescription(
                                'Het verificatiesysteem is uitgeschakeld.'
                            )
                    ]
                });
            }

            // ============================================================
            // SETUP
            // ============================================================

            if (subcommand !== 'setup') {
                return;
            }

            // ============================================================
            // OPTIES OPHALEN
            // ============================================================

            const channelOption =
                interaction.options.get('kanaal');

            const roleOption =
                interaction.options.get('rol');

            logger.info(
                `[Verification] kanaal option: ${JSON.stringify(
                    channelOption
                        ? {
                              name: channelOption.name,
                              type: channelOption.type,
                              value: channelOption.value
                          }
                        : null
                )}`
            );

            logger.info(
                `[Verification] rol option: ${JSON.stringify(
                    roleOption
                        ? {
                              name: roleOption.name,
                              type: roleOption.type,
                              value: roleOption.value
                          }
                        : null
                )}`
            );

            // ============================================================
            // KANAAL ID
            // ============================================================

            if (!channelOption?.value) {
                return interaction.reply({
                    content:
                        '❌ Geen geldig kanaal geselecteerd.\n\nSelecteer bij **kanaal** een tekstkanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const channelId =
                channelOption.value;

            // ============================================================
            // KANAAL OPNIEUW OPHALEN UIT DISCORD
            // ============================================================

            const channel =
                await guild.channels.fetch(channelId)
                    .catch(() => null);

            if (!channel) {
                return interaction.reply({
                    content:
                        '❌ Het geselecteerde kanaal kon niet worden gevonden.',
                    flags: MessageFlags.Ephemeral
                });
            }

            logger.info(
                `[Verification] Channel gevonden: ${channel.name} (${channel.id}) type=${channel.type}`
            );

            // ============================================================
            // ALLEEN TEKSTKANALEN
            // ============================================================

            if (
                channel.type !== ChannelType.GuildText &&
                channel.type !== ChannelType.GuildAnnouncement
            ) {
                return interaction.reply({
                    content:
                        '❌ Selecteer een normaal tekstkanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ============================================================
            // ROL
            // ============================================================

            if (!roleOption?.value) {
                return interaction.reply({
                    content:
                        '❌ Geen geldige rol geselecteerd.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const role =
                await guild.roles.fetch(roleOption.value)
                    .catch(() => null);

            if (!role) {
                return interaction.reply({
                    content:
                        '❌ De geselecteerde rol kon niet worden gevonden.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ============================================================
            // @EVERYONE
            // ============================================================

            if (role.id === guild.id) {
                return interaction.reply({
                    content:
                        '❌ Je kunt de @everyone rol niet gebruiken.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ============================================================
            // MANAGED ROLE
            // ============================================================

            if (role.managed) {
                return interaction.reply({
                    content:
                        '❌ Deze rol wordt beheerd door een integratie en kan niet worden gebruikt.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ============================================================
            // BOT MEMBER
            // ============================================================

            const botMember =
                guild.members.me ||
                await guild.members.fetchMe()
                    .catch(() => null);

            if (!botMember) {
                return interaction.reply({
                    content:
                        '❌ Ik kan mijn eigen bot-lid niet vinden.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ============================================================
            // MANAGE ROLES
            // ============================================================

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

            // ============================================================
            // ROLE HIERARCHY
            // ============================================================

            if (
                role.position >=
                botMember.roles.highest.position
            ) {
                return interaction.reply({
                    content:
                        '❌ Mijn hoogste rol moet **boven de verificatierol** staan.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ============================================================
            // KANAAL PERMISSIES
            // ============================================================

            const channelPermissions =
                channel.permissionsFor(botMember);

            if (!channelPermissions) {
                return interaction.reply({
                    content:
                        '❌ Ik kan mijn permissies voor dit kanaal niet controleren.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                !channelPermissions.has(
                    PermissionFlagsBits.ViewChannel
                )
            ) {
                return interaction.reply({
                    content:
                        '❌ Ik heb **Kanaal bekijken** nodig in dit kanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                !channelPermissions.has(
                    PermissionFlagsBits.SendMessages
                )
            ) {
                return interaction.reply({
                    content:
                        '❌ Ik heb **Berichten sturen** nodig in dit kanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                !channelPermissions.has(
                    PermissionFlagsBits.EmbedLinks
                )
            ) {
                return interaction.reply({
                    content:
                        '❌ Ik heb **Links insluiten** nodig in dit kanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ============================================================
            // DEFER
            // ============================================================

            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            // ============================================================
            // CONFIG
            // ============================================================

            const guildConfig =
                await getGuildConfig(
                    client,
                    guild.id
                );

            if (!guildConfig.verification) {
                guildConfig.verification = {};
            }

            // ============================================================
            // OUD VERIFICATIEBERICHT
            // ============================================================

            const oldChannelId =
                guildConfig.verification.channelId;

            const oldMessageId =
                guildConfig.verification.messageId;

            if (
                oldChannelId &&
                oldMessageId
            ) {
                try {
                    const oldChannel =
                        await guild.channels
                            .fetch(oldChannelId)
                            .catch(() => null);

                    if (oldChannel?.messages) {
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
                } catch (error) {
                    logger.warn(
                        `[Verification] Oud bericht kon niet verwijderd worden: ${error.message}`
                    );
                }
            }

            // ============================================================
            // EMBED
            // ============================================================

            const embed =
                new EmbedBuilder()
                    .setColor(getColor('primary'))
                    .setTitle('📜 Regels & Verificatie')
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
                        text: `${guild.name} • Verificatie`
                    })
                    .setTimestamp();

            // ============================================================
            // BUTTON
            // ============================================================

            const button =
                new ButtonBuilder()
                    .setCustomId(
                        `verification_accept_${guild.id}`
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

            // ============================================================
            // VERIFICATIEBERICHT STUREN
            // ============================================================

            const verificationMessage =
                await channel.send({
                    embeds: [embed],
                    components: [row]
                });

            // ============================================================
            // CONFIG OPSLAAN
            // ============================================================

            guildConfig.verification.enabled =
                true;

            guildConfig.verification.channelId =
                channel.id;

            guildConfig.verification.roleId =
                role.id;

            guildConfig.verification.messageId =
                verificationMessage.id;

            guildConfig.verification.autoVerify = {
                enabled: false
            };

            await setGuildConfig(
                client,
                guild.id,
                guildConfig
            );

            // ============================================================
            // SUCCES
            // ============================================================

            logger.info(
                `[Verification] Setup completed in ${guild.name} (${guild.id})`
            );

            await interaction.editReply({
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
                                'Nieuwe leden kunnen de regels accepteren met de knop in het verificatiebericht.',
                                '',
                                '⚠️ Automatische verificatie bij join staat uit.'
                            ].join('\n')
                        )
                ]
            });

        } catch (error) {

            logger.error(
                '[Verification] Setup error:',
                error
            );

            if (
                interaction.deferred ||
                interaction.replied
            ) {
                await interaction.editReply({
                    content:
                        '❌ Er ging iets mis bij het instellen van de verificatie.\n\n' +
                        `Fout: ${error.message}`
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content:
                        '❌ Er ging iets mis bij het instellen van de verificatie.\n\n' +
                        `Fout: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }
};
