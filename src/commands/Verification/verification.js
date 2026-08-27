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

        // ============================================================
        // SETUP
        // ============================================================

        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Stel het verificatiesysteem in')

                .addChannelOption(option =>
                    option
                        .setName('kanaal')
                        .setDescription('Het kanaal waar de verificatie komt')
                        .addChannelTypes(
                            ChannelType.GuildText,
                            ChannelType.GuildAnnouncement
                        )
                        .setRequired(true)
                )

                .addRoleOption(option =>
                    option
                        .setName('rol')
                        .setDescription('De rol die iemand krijgt na verificatie')
                        .setRequired(true)
                )
        )

        // ============================================================
        // DISABLE
        // ============================================================

        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Schakel het verificatiesysteem uit')
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;

        // ============================================================
        // SERVER CHECK
        // ============================================================

        if (!guild) {
            return interaction.reply({
                content: '❌ Dit commando kan alleen in een server worden gebruikt.',
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
                content: '❌ Je hebt de **Server beheren** permissie nodig.',
                flags: MessageFlags.Ephemeral
            });
        }

        // ============================================================
        // SETUP
        // ============================================================

        if (subcommand === 'setup') {
            /*
             * We proberen eerst "kanaal".
             *
             * De fallback naar "channel" is expres toegevoegd.
             * Als Discord nog een oudere versie van het slash command
             * gebruikt waarin de optie "channel" heette, werkt het
             * daardoor ook.
             */
            const channel =
                interaction.options.getChannel('kanaal') ??
                interaction.options.getChannel('channel');

            const role = interaction.options.getRole('rol');

            // ========================================================
            // CHANNEL CHECK
            // ========================================================

            if (!channel) {
                logger.error('[Verification] Geen kanaal ontvangen', {
                    guildId: guild.id,
                    userId: interaction.user.id,
                    commandOptions: interaction.options.data
                });

                return interaction.reply({
                    content:
                        '❌ Geen geldig kanaal geselecteerd.\n\n' +
                        'Probeer het opnieuw en selecteer een tekstkanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // CHANNEL TYPE CHECK
            // ========================================================

            if (
                channel.type !== ChannelType.GuildText &&
                channel.type !== ChannelType.GuildAnnouncement
            ) {
                return interaction.reply({
                    content:
                        '❌ Dit is geen geldig tekstkanaal.\n\n' +
                        'Selecteer een normaal tekstkanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // ROLE CHECK
            // ========================================================

            if (!role) {
                return interaction.reply({
                    content: '❌ Geen geldige rol geselecteerd.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // EVERYONE CHECK
            // ========================================================

            if (role.id === guild.id) {
                return interaction.reply({
                    content:
                        '❌ Je kunt de **@everyone** rol niet gebruiken.',
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

            const botMember = guild.members.me;

            if (!botMember) {
                return interaction.reply({
                    content:
                        '❌ Ik kan mijn serverpermissies momenteel niet controleren.',
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
            // BOT ROLE HIERARCHY
            // ========================================================

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

            // ========================================================
            // CHANNEL PERMISSIONS
            // ========================================================

            const channelPermissions =
                channel.permissionsFor(botMember);

            if (
                !channelPermissions?.has(
                    PermissionFlagsBits.ViewChannel
                )
            ) {
                return interaction.reply({
                    content:
                        `❌ Ik kan het kanaal ${channel} niet bekijken.\n\n` +
                        'Geef mij de **Kanaal bekijken** permissie.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                !channelPermissions?.has(
                    PermissionFlagsBits.SendMessages
                )
            ) {
                return interaction.reply({
                    content:
                        `❌ Ik kan geen berichten sturen in ${channel}.\n\n` +
                        'Geef mij de **Berichten sturen** permissie.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                !channelPermissions?.has(
                    PermissionFlagsBits.EmbedLinks
                )
            ) {
                return interaction.reply({
                    content:
                        `❌ Ik kan geen embeds sturen in ${channel}.\n\n` +
                        'Geef mij de **Links insluiten** permissie.',
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
                // LOAD CONFIG
                // ====================================================

                const guildConfig = await getGuildConfig(
                    client,
                    guild.id
                );

                if (!guildConfig.verification) {
                    guildConfig.verification = {};
                }

                /*
                 * Bewaar het oude message ID voordat we het overschrijven.
                 */
                const oldMessageId =
                    guildConfig.verification.messageId;

                const oldChannelId =
                    guildConfig.verification.channelId;

                // ====================================================
                // DELETE OLD VERIFICATION MESSAGE
                // ====================================================

                if (oldMessageId && oldChannelId) {
                    try {
                        const oldChannel =
                            guild.channels.cache.get(oldChannelId);

                        if (oldChannel) {
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
                            '[Verification] Kon oud verificatiebericht niet verwijderen',
                            {
                                error: error.message
                            }
                        );
                    }
                }

                // ====================================================
                // SAVE INITIAL CONFIG
                // ====================================================

                guildConfig.verification.enabled = true;

                guildConfig.verification.channelId =
                    channel.id;

                guildConfig.verification.roleId =
                    role.id;

                guildConfig.verification.messageId = null;

                // AutoVerify bewust uit
                guildConfig.verification.autoVerify = {
                    enabled: false
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    guildConfig
                );

                // ====================================================
                // VERIFICATION EMBED
                // ====================================================

                const embed = new EmbedBuilder()
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
                            '5. Houd je aan de regels van de server.',
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

                // ====================================================
                // VERIFICATION BUTTON
                // ====================================================

                /*
                 * BELANGRIJK:
                 *
                 * De button-handler die je eerder stuurde heeft:
                 *
                 * customId: "verify_user"
                 *
                 * Daarom moet de button hiermee beginnen.
                 *
                 * De guild ID wordt erachter gezet zodat de button
                 * uniek blijft.
                 */

                const button = new ButtonBuilder()
                    .setCustomId(
                        `verify_user:${guild.id}`
                    )
                    .setLabel('Regels accepteren')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success);

                const row = new ActionRowBuilder()
                    .addComponents(button);

                // ====================================================
                // SEND VERIFICATION MESSAGE
                // ====================================================

                const verificationMessage =
                    await channel.send({
                        embeds: [embed],
                        components: [row]
                    });

                // ====================================================
                // SAVE MESSAGE ID
                // ====================================================

                const updatedConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                if (!updatedConfig.verification) {
                    updatedConfig.verification = {};
                }

                updatedConfig.verification.enabled = true;

                updatedConfig.verification.channelId =
                    channel.id;

                updatedConfig.verification.roleId =
                    role.id;

                updatedConfig.verification.messageId =
                    verificationMessage.id;

                updatedConfig.verification.autoVerify = {
                    enabled: false
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    updatedConfig
                );

                // ====================================================
                // LOG
                // ====================================================

                logger.info(
                    '[Verification] Verification setup completed',
                    {
                        guildId: guild.id,
                        guildName: guild.name,
                        channelId: channel.id,
                        roleId: role.id,
                        messageId: verificationMessage.id,
                        userId: interaction.user.id
                    }
                );

                // ====================================================
                // SUCCESS
                // ====================================================

                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('success'))
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
                                    `**Bericht:** [Klik hier om het verificatiebericht te bekijken](${verificationMessage.url})`,
                                    '',
                                    'Nieuwe leden kunnen de regels accepteren met de knop in het verificatiebericht.',
                                    '',
                                    '⚠️ Automatische rol bij join is uitgeschakeld.'
                                ].join('\n')
                            )
                    ]
                });

            } catch (error) {
                logger.error(
                    '[Verification] Setup error',
                    {
                        error: error.message,
                        stack: error.stack,
                        guildId: guild.id,
                        channelId: channel?.id,
                        roleId: role?.id
                    }
                );

                if (interaction.deferred) {
                    await interaction.editReply({
                        content:
                            '❌ Er ging iets mis bij het instellen van de verificatie.\n\n' +
                            `\`${error.message}\``
                    }).catch(() => {});
                }
            }

            return;
        }

        // ============================================================
        // DISABLE
        // ============================================================

        if (subcommand === 'disable') {
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            try {
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

                await interaction.editReply({
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

                logger.info(
                    '[Verification] Verification disabled',
                    {
                        guildId: guild.id,
                        guildName: guild.name
                    }
                );

            } catch (error) {
                logger.error(
                    '[Verification] Disable error',
                    {
                        error: error.message,
                        stack: error.stack,
                        guildId: guild.id
                    }
                );

                await interaction.editReply({
                    content:
                        '❌ Er ging iets mis bij het uitschakelen van de verificatie.'
                }).catch(() => {});
            }
        }
    }
};
