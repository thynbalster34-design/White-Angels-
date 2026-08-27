import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

const VERIFICATION_ROLE_ID =
    '1437696432340467779';

export default {
    data: new SlashCommandBuilder()
        .setName('verification')
        .setDescription('Beheer het verificatiesysteem')

        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription(
                    'Maak het verificatiepaneel aan'
                )

                .addChannelOption(option =>
                    option
                        .setName('kanaal')
                        .setDescription(
                            'Het tekstkanaal waarin het verificatiepaneel moet komen'
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
        ),

    async execute(interaction) {
        try {
            /*
             * =====================================================
             * SETUP
             * =====================================================
             */

            if (
                interaction.options.getSubcommand() ===
                'setup'
            ) {
                /*
                 * Haal het kanaal DIRECT uit de slash command.
                 *
                 * Belangrijk:
                 * We gebruiken hier:
                 *
                 * getChannel('kanaal')
                 *
                 * en NIET:
                 *
                 * getString('kanaal')
                 */

                const channel =
                    interaction.options.getChannel(
                        'kanaal'
                    );

                const role =
                    interaction.options.getRole(
                        'rol'
                    );

                /*
                 * =================================================
                 * CONTROLE KANAAL
                 * =================================================
                 */

                if (!channel) {
                    return interaction.reply({
                        content:
                            '❌ Discord heeft geen kanaal ontvangen.\n\n' +
                            'Gebruik `/verification setup` opnieuw en selecteer een tekstkanaal.',
                        ephemeral: true,
                    });
                }

                if (
                    channel.type !==
                    ChannelType.GuildText
                ) {
                    return interaction.reply({
                        content:
                            '❌ Het geselecteerde kanaal is geen tekstkanaal.\n\n' +
                            'Selecteer een normaal tekstkanaal.',
                        ephemeral: true,
                    });
                }

                /*
                 * =================================================
                 * CONTROLE ROL
                 * =================================================
                 */

                if (!role) {
                    return interaction.reply({
                        content:
                            '❌ Discord heeft geen rol ontvangen.\n\n' +
                            'Gebruik `/verification setup` opnieuw en selecteer een rol.',
                        ephemeral: true,
                    });
                }

                /*
                 * =================================================
                 * CONTROLE BOT PERMISSIONS
                 * =================================================
                 */

                const botMember =
                    interaction.guild.members.me;

                if (!botMember) {
                    return interaction.reply({
                        content:
                            '❌ Ik kon mijn eigen bot-lid niet vinden.',
                        ephemeral: true,
                    });
                }

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
                            '❌ Ik kan het geselecteerde kanaal niet bekijken.\n\n' +
                            'Geef de bot de permissie **Kanaal bekijken**.',
                        ephemeral: true,
                    });
                }

                if (
                    !permissions?.has(
                        PermissionFlagsBits.SendMessages
                    )
                ) {
                    return interaction.reply({
                        content:
                            '❌ Ik kan niet in het geselecteerde kanaal berichten sturen.\n\n' +
                            'Geef de bot de permissie **Berichten verzenden**.',
                        ephemeral: true,
                    });
                }

                /*
                 * =================================================
                 * CONTROLE ROL POSITIE
                 * =================================================
                 */

                if (
                    role.position >=
                    botMember.roles.highest.position
                ) {
                    return interaction.reply({
                        content:
                            '❌ Ik kan de rol **' +
                            role.name +
                            '** niet geven.\n\n' +
                            'Zet mijn botrol boven deze rol in de Discord-rollenlijst.',
                        ephemeral: true,
                    });
                }

                /*
                 * =================================================
                 * VERIFICATION EMBED
                 * =================================================
                 */

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '🔐 Verificatie'
                        )
                        .setDescription(
                            'Welkom bij **White Angels**.\n\n' +
                            'Klik hieronder op de knop **Verifiëren** om toegang te krijgen tot de server.\n\n' +
                            'Na verificatie ontvang je automatisch de juiste rol.'
                        )
                        .setColor(
                            0x2b2d31
                        )
                        .setFooter({
                            text:
                                'White Angels • Verificatie',
                        })
                        .setTimestamp();

                /*
                 * =================================================
                 * BUTTON
                 * =================================================
                 */

                const button =
                    new ButtonBuilder()
                        .setCustomId(
                            'verification_verify'
                        )
                        .setLabel(
                            'Verifiëren'
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

                /*
                 * =================================================
                 * SEND PANEL
                 * =================================================
                 */

                await channel.send({
                    embeds: [
                        embed,
                    ],
                    components: [
                        row,
                    ],
                });

                /*
                 * =================================================
                 * SUCCESS
                 * =================================================
                 */

                return interaction.reply({
                    content:
                        '✅ Het verificatiepaneel is succesvol geplaatst in ' +
                        channel +
                        '!\n\n' +
                        '🎭 Verificatierol: ' +
                        role +
                        '\n\n' +
                        '🔐 Rol-ID: `' +
                        role.id +
                        '`',
                    ephemeral: true,
                });
            }
        } catch (error) {
            console.error(
                'Verification setup error:',
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                return interaction.followUp({
                    content:
                        '❌ Er ging iets fout bij het instellen van het verificatiesysteem.\n\n' +
                        'Fout: `' +
                        error.message +
                        '`',
                    ephemeral: true,
                });
            }

            return interaction.reply({
                content:
                    '❌ Er ging iets fout bij het instellen van het verificatiesysteem.\n\n' +
                    'Fout: `' +
                    error.message +
                    '`',
                ephemeral: true,
            });
        }
    },
};
