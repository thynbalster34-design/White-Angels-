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
                        .setDescription('Het kanaal waar het verificatiebericht komt')
                        .addChannelTypes(ChannelType.GuildText)
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
                content: '❌ Dit commando kan alleen in een server worden gebruikt.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ Je hebt de **Server beheren** permissie nodig.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // ============================================================
        // SETUP
        // ============================================================

        if (subcommand === 'setup') {

            /*
             * BELANGRIJK:
             * We gebruiken hier expliciet getChannel().
             * Hierdoor wordt het kanaal uit /verification setup
             * correct uitgelezen.
             */

            const channel = interaction.options.getChannel('kanaal', true);
            const role = interaction.options.getRole('rol', true);

            // Controle kanaal
            if (
                !channel ||
                channel.type !== ChannelType.GuildText
            ) {
                return interaction.reply({
                    content: '❌ Selecteer een normaal tekstkanaal.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Controle rol
            if (!role) {
                return interaction.reply({
                    content: '❌ Selecteer een geldige rol.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // @everyone
            if (role.id === guild.id) {
                return interaction.reply({
                    content: '❌ Je kunt de @everyone rol niet gebruiken.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Managed role
            if (role.managed) {
                return interaction.reply({
                    content: '❌ Deze rol wordt beheerd door een integratie en kan niet worden gebruikt.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Bot member
            const botMember = guild.members.me;

            if (!botMember) {
                return interaction.reply({
                    content: '❌ Ik kan mijn bot-account momenteel niet vinden.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Manage Roles
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.reply({
                    content: '❌ Ik heb de **Rollen beheren** permissie nodig.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Bot role moet boven verification role staan
            if (role.position >= botMember.roles.highest.position) {
                return interaction.reply({
                    content:
                        '❌ Mijn hoogste rol moet **boven de verificatierol** staan.\n\n' +
                        `Mijn hoogste rol: **${botMember.roles.highest.name}**\n` +
                        `Verificatierol: **${role.name}**`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // Defer
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            try {

                // ====================================================
                // CONFIG OPHALEN
                // ====================================================

                const guildConfig = await getGuildConfig(
                    client,
                    guild.id
                );

                if (!guildConfig.verification) {
                    guildConfig.verification = {};
                }

                // Oude gegevens bewaren voordat we ze overschrijven
                const oldChannelId =
                    guildConfig.verification.channelId;

                const oldMessageId =
                    guildConfig.verification.messageId;

                // ====================================================
                // OUD VERIFICATIEBERICHT VERWIJDEREN
                // ====================================================

                if (oldChannelId && oldMessageId) {

                    try {

                        const oldChannel =
                            await guild.channels.fetch(oldChannelId);

                        if (oldChannel?.isTextBased()) {

                            const oldMessage =
                                await oldChannel.messages.fetch(oldMessageId)
                                    .catch(() => null);

                            if (oldMessage) {
                                await oldMessage.delete().catch(() => {});
                            }
                        }

                    } catch (error) {
                        logger.warn(
                            `[Verification] Kon oud verificatiebericht niet verwijderen: ${error.message}`
                        );
                    }
                }

                // ====================================================
                // CONFIG OPSLAAN
                // ====================================================

                guildConfig.verification.enabled = true;
                guildConfig.verification.channelId = channel.id;
                guildConfig.verification.roleId = role.id;

                // Auto verify UIT
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
                // EMBED
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
                // BUTTON
                // ====================================================

                const button = new ButtonBuilder()
                    .setCustomId('verify_user')
                    .setLabel('Regels accepteren')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success);

                const row = new ActionRowBuilder()
                    .addComponents(button);

                // ====================================================
                // BERICHT VERSTUREN
                // ====================================================

                const verificationMessage = await channel.send({
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
                // SUCCES
                // ====================================================

                logger.info(
                    `[Verification] Setup completed in ${guild.name} (${guild.id})`
                );

                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(getColor('success'))
                            .setTitle('✅ Verificatie ingesteld')
                            .setDescription(
                                [
                                    'Het verificatiesysteem is succesvol ingesteld.',
                                    '',
                                    `**Kanaal:** ${channel}`,
                                    `**Verificatierol:** ${role}`,
                                    '',
                                    'Nieuwe leden kunnen op de knop **Regels accepteren** klikken.',
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

                await interaction.editReply({
                    content:
                        `❌ Er ging iets mis bij het instellen van de verificatie.\n\n` +
                        `Fout: \`${error.message}\``
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
                    `[Verification] Disabled in ${guild.name} (${guild.id})`
                );

            } catch (error) {

                logger.error(
                    '[Verification] Disable error:',
                    error
                );

                await interaction.editReply({
                    content:
                        `❌ Er ging iets mis bij het uitschakelen.\n\n` +
                        `Fout: \`${error.message}\``
                });
            }
        }
    }
};
