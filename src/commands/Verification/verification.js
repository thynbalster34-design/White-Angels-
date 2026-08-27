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

        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Schakel het verificatiesysteem uit')
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

        const subcommand = interaction.options.getSubcommand();

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

        // ============================================================
        // SETUP
        // ============================================================

        if (subcommand === 'setup') {

            /*
             * Gebruik bewust false bij getChannel/getRole.
             * Hierdoor wordt niet meteen een exception gegooid
             * als Discord de optie niet doorgeeft.
             */

            const channel = interaction.options.getChannel(
                'kanaal',
                false
            );

            const role = interaction.options.getRole(
                'rol',
                false
            );

            // ========================================================
            // DEBUG
            // ========================================================

            logger.info('[Verification] Setup command received', {
                guildId: guild.id,
                guildName: guild.name,
                userId: interaction.user.id,
                subcommand,
                channelId: channel?.id ?? null,
                channelName: channel?.name ?? null,
                channelType: channel?.type ?? null,
                roleId: role?.id ?? null,
                roleName: role?.name ?? null,
                rawOptions: interaction.options.data
            });

            // ========================================================
            // KANAAL CONTROLEREN
            // ========================================================

            if (!channel) {
                return interaction.reply({
                    content:
                        '❌ Geen geldig kanaal geselecteerd.\n\n' +
                        'Selecteer bij **kanaal** een tekstkanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

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
            // ROL CONTROLEREN
            // ========================================================

            if (!role) {
                return interaction.reply({
                    content:
                        '❌ Geen geldige rol geselecteerd.\n\n' +
                        'Selecteer bij **rol** de verificatierol.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // @everyone
            if (role.id === guild.id) {
                return interaction.reply({
                    content:
                        '❌ Je kunt de **@everyone** rol niet gebruiken.',
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

            // ========================================================
            // BOT MEMBER
            // ========================================================

            const botMember = guild.members.me;

            if (!botMember) {
                return interaction.reply({
                    content:
                        '❌ Ik kan mijn servergegevens momenteel niet ophalen.',
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
                    content:
                        '❌ Mijn hoogste rol moet **boven de verificatierol** staan.\n\n' +
                        'Ga naar **Serverinstellingen → Rollen** en zet de botrol boven de verificatierol.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========================================================
            // CHANNEL PERMISSIONS
            // ========================================================

            const permissions =
                channel.permissionsFor(botMember);

            if (
                !permissions?.has(
                    PermissionFlagsBits.ViewChannel
                )
            ) {
                return interaction.reply({
                    content:
                        `❌ Ik kan ${channel} niet zien.\n\n` +
                        'Geef mij **Kanaal bekijken** permissie.',
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
                        `❌ Ik kan geen berichten sturen in ${channel}.\n\n` +
                        'Geef mij **Berichten sturen** permissie.',
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

                logger.info(
                    `[Verification] Starting setup in ${guild.name} (${guild.id})`
                );

                // ====================================================
                // CONFIG OPHALEN
                // ====================================================

                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );

                if (!guildConfig.verification) {
                    guildConfig.verification = {};
                }

                // ====================================================
                // OUDE VERIFICATIE GEGEVENS
                // ====================================================

                const oldChannelId =
                    guildConfig.verification.channelId;

                const oldMessageId =
                    guildConfig.verification.messageId;

                // ====================================================
                // OUD BERICHT VERWIJDEREN
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

                        if (oldChannel) {

                            const oldMessage =
                                await oldChannel.messages
                                    .fetch(oldMessageId)
                                    .catch(() => null);

                            if (oldMessage) {

                                await oldMessage
                                    .delete()
                                    .catch(() => {});

                                logger.info(
                                    '[Verification] Old verification message deleted'
                                );
                            }
                        }

                    } catch (error) {

                        logger.warn(
                            '[Verification] Could not delete old verification message',
                            error
                        );

                    }
                }

                // ====================================================
                // CONFIG OPSLAAN
                // ====================================================

                guildConfig.verification.enabled =
                    true;

                guildConfig.verification.channelId =
                    channel.id;

                guildConfig.verification.roleId =
                    role.id;

                guildConfig.verification.messageId =
                    null;

                /*
                 * AutoVerify staat bewust UIT.
                 */

                guildConfig.verification.autoVerify = {
                    enabled: false
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    guildConfig
                );

                // ====================================================
                // VERIFICATIE EMBED
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
                        .addComponents(button);

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

                guildConfig.verification.messageId =
                    verificationMessage.id;

                await setGuildConfig(
                    client,
                    guild.id,
                    guildConfig
                );

                // ====================================================
                // LOG
                // ====================================================

                logger.info(
                    `[Verification] Setup completed successfully in ${guild.name} (${guild.id})`
                );

                logger.info(
                    `[Verification] Channel: ${channel.id}`
                );

                logger.info(
                    `[Verification] Role: ${role.id}`
                );

                logger.info(
                    `[Verification] Message: ${verificationMessage.id}`
                );

                // ====================================================
                // SUCCESS
                // ====================================================

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
                                    '⚠️ Automatische verificatie bij het joinen is uitgeschakeld.'
                                ].join('\n')
                            )
                    ]
                });

            } catch (error) {

                logger.error(
                    '[Verification] Setup error:',
                    error
                );

                await interaction.editReply({
                    content:
                        '❌ Er ging iets mis bij het instellen van de verificatie.\n\n' +
                        `Fout: \`${error.message || 'Onbekende fout'}\``
                });
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

                guildConfig.verification.enabled =
                    false;

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

                logger.info(
                    `[Verification] Verification disabled in ${guild.name} (${guild.id})`
                );

            } catch (error) {

                logger.error(
                    '[Verification] Disable error:',
                    error
                );

                await interaction.editReply({
                    content:
                        '❌ Er ging iets mis bij het uitschakelen van de verificatie.\n\n' +
                        `Fout: \`${error.message || 'Onbekende fout'}\``
                });
            }
        }
    }
};
