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
                            'Het kanaal voor het verificatiebericht'
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

    async execute(interaction, config, client) {
        const guild = interaction.guild;

        // ============================================================
        // SERVER CHECK
        // ============================================================

        if (!guild) {
            return interaction.reply({
                content:
                    '❌ Dit commando kan alleen in een server worden gebruikt.',
                flags: MessageFlags.Ephemeral
            });
        }

        // ============================================================
        // PERMISSION CHECK
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

        let subcommand;

        try {
            subcommand =
                interaction.options.getSubcommand();
        } catch (error) {
            logger.error(
                '[Verification] Could not read subcommand:',
                error
            );

            return interaction.reply({
                content:
                    '❌ Kon de verificatie-subcommand niet uitlezen.',
                flags: MessageFlags.Ephemeral
            });
        }

        // ============================================================
        // SETUP
        // ============================================================

        if (subcommand === 'setup') {
            /*
             * Discord zou hier normaal altijd een Channel-object
             * moeten teruggeven.
             *
             * We proberen eerst de normale manier.
             */

            let channel =
                interaction.options.getChannel(
                    'kanaal'
                );

            /*
             * Extra beveiliging:
             *
             * Als je huidige command-handler om wat voor reden dan
             * ook geen Channel-object teruggeeft, proberen we het
             * ID rechtstreeks uit de interaction options te halen.
             */

            if (!channel) {
                try {
                    const rawChannelOption =
                        interaction.options.get(
                            'kanaal',
                            false
                        );

                    if (
                        rawChannelOption?.value
                    ) {
                        const channelId =
                            rawChannelOption.value;

                        channel =
                            await guild.channels
                                .fetch(channelId)
                                .catch(() => null);
                    }
                } catch (error) {
                    logger.error(
                        '[Verification] Error reading channel option:',
                        error
                    );
                }
            }

            // ========================================================
            // ROLE
            // ========================================================

            const role =
                interaction.options.getRole(
                    'rol'
                );

            // ========================================================
            // DEBUG LOG
            // ========================================================

            logger.info(
                `[Verification] Setup request in ${guild.name} (${guild.id})`
            );

            logger.info(
                `[Verification] Channel: ${
                    channel
                        ? `${channel.name} (${channel.id})`
                        : 'NULL'
                }`
            );

            logger.info(
                `[Verification] Role: ${
                    role
                        ? `${role.name} (${role.id})`
                        : 'NULL'
                }`
            );

            // ========================================================
            // CHANNEL CHECK
            // ========================================================

            if (!channel) {
                return interaction.reply({
                    content: [
                        '❌ Discord heeft geen kanaal ontvangen.',
                        '',
                        'Gebruik `/verification setup` opnieuw.',
                        '',
                        '⚠️ Als je het kanaal wel kunt selecteren maar deze melding blijft krijgen, moet de slash command opnieuw geregistreerd worden.'
                    ].join('\n'),
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // TEXT CHANNEL CHECK
            // ========================================================

            if (
                channel.type !==
                ChannelType.GuildText
            ) {
                return interaction.reply({
                    content:
                        '❌ Selecteer een normaal tekstkanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // ROLE CHECK
            // ========================================================

            if (!role) {
                return interaction.reply({
                    content:
                        '❌ Discord heeft geen rol ontvangen. Selecteer een rol.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // @EVERYONE CHECK
            // ========================================================

            if (role.id === guild.id) {
                return interaction.reply({
                    content:
                        '❌ Je kunt de @everyone rol niet gebruiken.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // MANAGED ROLE CHECK
            // ========================================================

            if (role.managed) {
                return interaction.reply({
                    content:
                        '❌ Deze rol wordt beheerd door een integratie en kan niet worden gebruikt.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // BOT MEMBER
            // ========================================================

            const botMember =
                guild.members.me ||
                await guild.members
                    .fetch(client.user.id)
                    .catch(() => null);

            if (!botMember) {
                return interaction.reply({
                    content:
                        '❌ Ik kan mijn eigen serverlid niet vinden.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // MANAGE ROLES
            // ========================================================

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

            // ========================================================
            // ROLE HIERARCHY
            // ========================================================

            if (
                role.position >=
                botMember.roles.highest.position
            ) {
                return interaction.reply({
                    content: [
                        '❌ Mijn hoogste rol moet **boven de verificatierol** staan.',
                        '',
                        `Mijn hoogste rol: **${botMember.roles.highest.name}**`,
                        `Verificatierol: **${role.name}**`
                    ].join('\n'),
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // BOT SEND PERMISSIONS
            // ========================================================

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
                        `❌ Ik kan het kanaal ${channel} niet bekijken.`,
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
                        `❌ Ik heb de permissie **Links insluiten / Embed Links** nodig in ${channel}.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // DEFER
            // ========================================================

            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            try {
                // ====================================================
                // CONFIG OPHALEN
                // ====================================================

                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                if (
                    !guildConfig.verification
                ) {
                    guildConfig.verification =
                        {};
                }

                // ====================================================
                // OUDE MESSAGE ID OPSLAAN
                // ====================================================

                const oldChannelId =
                    guildConfig.verification.channelId;

                const oldMessageId =
                    guildConfig.verification.messageId;

                // ====================================================
                // OUDE VERIFICATIEBERICHT VERWIJDEREN
                // ====================================================

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
                            oldChannel &&
                            oldChannel.isTextBased()
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
                                    '[Verification] Old verification message deleted.'
                                );
                            }
                        }
                    } catch (error) {
                        logger.warn(
                            '[Verification] Could not delete old verification message:',
                            error
                        );
                    }
                }

                // ====================================================
                // CONFIG OPSLAAN
                // ====================================================

                guildConfig.verification = {
                    enabled: true,
                    channelId: channel.id,
                    roleId: role.id,
                    messageId: null,

                    // Automatisch bij join UIT
                    autoVerify: {
                        enabled: false
                    }
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    guildConfig
                );

                // ====================================================
                // EMBED
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
                                '5. Houd je aan de regels van de server.',
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
                // BUTTON
                // ====================================================

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
                        .addComponents(
                            button
                        );

                // ====================================================
                // BERICHT STUREN
                // ====================================================

                const verificationMessage =
                    await channel.send({
                        embeds: [embed],
                        components: [row]
                    });

                // ====================================================
                // MESSAGE ID OPSLAAN
                // ====================================================

                const finalConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                if (
                    !finalConfig.verification
                ) {
                    finalConfig.verification =
                        {};
                }

                finalConfig.verification.enabled =
                    true;

                finalConfig.verification.channelId =
                    channel.id;

                finalConfig.verification.roleId =
                    role.id;

                finalConfig.verification.messageId =
                    verificationMessage.id;

                finalConfig.verification.autoVerify =
                    {
                        enabled: false
                    };

                await setGuildConfig(
                    client,
                    guild.id,
                    finalConfig
                );

                // ====================================================
                // LOG
                // ====================================================

                logger.info(
                    `[Verification] Setup completed in ${guild.name} (${guild.id})`
                );

                logger.info(
                    `[Verification] Channel ID: ${channel.id}`
                );

                logger.info(
                    `[Verification] Role ID: ${role.id}`
                );

                logger.info(
                    `[Verification] Message ID: ${verificationMessage.id}`
                );

                // ====================================================
                // SUCCES
                // ====================================================

                await interaction.editReply({
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
                                    'Nieuwe leden kunnen de regels accepteren met de knop in het verificatiebericht.',
                                    '',
                                    '⚠️ Automatische rol bij join is uitgeschakeld.'
                                ].join(
                                    '\n'
                                )
                            )
                    ]
                });
            } catch (error) {
                logger.error(
                    '[Verification] Setup error:',
                    error
                );

                const errorMessage =
                    error?.message ||
                    'Onbekende fout';

                await interaction
                    .editReply({
                        content: [
                            '❌ Er ging iets mis bij het instellen van de verificatie.',
                            '',
                            `\`${errorMessage}\``
                        ].join(
                            '\n'
                        )
                    })
                    .catch(
                        () => {}
                    );
            }

            return;
        }

        // ============================================================
        // DISABLE
        // ============================================================

        if (
            subcommand === 'disable'
        ) {
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            try {
                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                if (
                    !guildConfig.verification
                ) {
                    guildConfig.verification =
                        {};
                }

                guildConfig.verification.enabled =
                    false;

                guildConfig.verification.autoVerify =
                    {
                        enabled: false
                    };

                await setGuildConfig(
                    client,
                    guild.id,
                    guildConfig
                );

                await interaction.editReply({
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

                logger.info(
                    `[Verification] Verification disabled in ${guild.name} (${guild.id})`
                );
            } catch (error) {
                logger.error(
                    '[Verification] Disable error:',
                    error
                );

                await interaction
                    .editReply({
                        content:
                            '❌ Er ging iets mis bij het uitschakelen van de verificatie.'
                    })
                    .catch(
                        () => {}
                    );
            }
        }
    }
};
