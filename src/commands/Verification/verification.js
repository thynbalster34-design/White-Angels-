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
                        .setDescription('Het kanaal waar de regels/verificatie komt')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )

                .addRoleOption(option =>
                    option
                        .setName('rol')
                        .setDescription('De rol die iemand krijgt na het accepteren van de regels')
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Schakel het verificatiesysteem uit')
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content: '❌ Dit commando kan alleen in een server worden gebruikt.',
                flags: MessageFlags.Ephemeral
            });
        }

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
            const channel = interaction.options.getChannel('kanaal');
            const role = interaction.options.getRole('rol');

            if (!channel) {
                return interaction.reply({
                    content: '❌ Geen geldig kanaal geselecteerd.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!role) {
                return interaction.reply({
                    content: '❌ Geen geldige rol geselecteerd.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // @everyone mag niet gebruikt worden
            if (role.id === guild.id) {
                return interaction.reply({
                    content: '❌ Je kunt de @everyone rol niet gebruiken.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Managed/integratie-rollen mogen niet gebruikt worden
            if (role.managed) {
                return interaction.reply({
                    content: '❌ Deze rol wordt beheerd door een integratie en kan niet worden gebruikt.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const botMember = guild.members.me;

            if (!botMember) {
                return interaction.reply({
                    content: '❌ Ik kan mijn serverpermissies momenteel niet controleren.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                return interaction.reply({
                    content: '❌ Ik heb de **Rollen beheren** permissie nodig.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Bot moet boven de verificatierol staan
            if (role.position >= botMember.roles.highest.position) {
                return interaction.reply({
                    content:
                        '❌ Mijn hoogste rol moet **boven de verificatierol** staan.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            try {
                const guildConfig = await getGuildConfig(
                    client,
                    guild.id
                );

                if (!guildConfig.verification) {
                    guildConfig.verification = {};
                }

                guildConfig.verification.enabled = true;

                guildConfig.verification.channelId = channel.id;

                guildConfig.verification.roleId = role.id;

                // Heel belangrijk:
                // AutoVerify bij join uitschakelen.
                guildConfig.verification.autoVerify = {
                    enabled: false
                };

                guildConfig.verification.messageId = null;

                await setGuildConfig(
                    client,
                    guild.id,
                    guildConfig
                );

                // ====================================================
                // OUD VERIFICATIEBERICHT ZOEKEN
                // ====================================================

                let oldMessage = null;

                if (guildConfig.verification.messageId) {
                    oldMessage = await channel.messages
                        .fetch(guildConfig.verification.messageId)
                        .catch(() => null);
                }

                if (oldMessage) {
                    await oldMessage.delete().catch(() => {});
                }

                // ====================================================
                // VERIFICATIE EMBED
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
                // VERIFICATIE BUTTON
                // ====================================================

                const button = new ButtonBuilder()
                    .setCustomId(
                        `verification_accept_${guild.id}`
                    )
                    .setLabel('Regels accepteren')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success);

                const row = new ActionRowBuilder()
                    .addComponents(button);

                // ====================================================
                // BERICHT PLAATSEN
                // ====================================================

                const verificationMessage = await channel.send({
                    embeds: [embed],
                    components: [row]
                });

                // ====================================================
                // MESSAGE ID OPSLAAN
                // ====================================================

                const updatedConfig = await getGuildConfig(
                    client,
                    guild.id
                );

                if (!updatedConfig.verification) {
                    updatedConfig.verification = {};
                }

                updatedConfig.verification.enabled = true;
                updatedConfig.verification.channelId = channel.id;
                updatedConfig.verification.roleId = role.id;
                updatedConfig.verification.messageId =
                    verificationMessage.id;

                // AutoVerify bewust UIT
                updatedConfig.verification.autoVerify = {
                    enabled: false
                };

                await setGuildConfig(
                    client,
                    guild.id,
                    updatedConfig
                );

                logger.info(
                    `[Verification] Verification setup completed in ${guild.name} (${guild.id})`
                );

                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('success'))
                            .setTitle('✅ Verificatie ingesteld')
                            .setDescription(
                                [
                                    `Het verificatiesysteem is succesvol ingesteld.`,
                                    '',
                                    `**Kanaal:** ${channel}`,
                                    `**Verificatierol:** ${role}`,
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
                    '[Verification] Setup error:',
                    error
                );

                await interaction.editReply({
                    content:
                        '❌ Er ging iets mis bij het instellen van de verificatie.'
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
                const guildConfig = await getGuildConfig(
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
                            .setTitle('✅ Verificatie uitgeschakeld')
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
                        '❌ Er ging iets mis bij het uitschakelen van de verificatie.'
                });
            }
        }
    }
};
