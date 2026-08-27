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


/* ============================================================
   VERIFICATION COMMAND
   ============================================================ */

export default {
    data: new SlashCommandBuilder()
        .setName('verification')
        .setDescription('Beheer de server verificatie')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        )

        /* ======================================================
           SETUP
           ====================================================== */

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
                            'Het kanaal waarin het verificatiebericht komt'
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

        /* ======================================================
           DISABLE
           ====================================================== */

        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription(
                    'Schakel het verificatiesysteem uit'
                )
        ),


    /* ==========================================================
       EXECUTE
       ========================================================== */

    async execute(interaction, config, client) {

        console.log(
            '[VERIFICATION] COMMAND ONTVANGEN'
        );

        console.log(
            '[VERIFICATION] COMMAND:',
            interaction.commandName
        );

        console.log(
            '[VERIFICATION] RAW OPTIONS:',
            JSON.stringify(
                interaction.options.data,
                null,
                2
            )
        );


        /* ======================================================
           SERVER
           ====================================================== */

        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content:
                    '❌ Dit commando kan alleen in een server worden gebruikt.',
                flags:
                    MessageFlags.Ephemeral
            });
        }


        /* ======================================================
           PERMISSION
           ====================================================== */

        if (
            !interaction.memberPermissions?.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            return interaction.reply({
                content:
                    '❌ Je hebt de **Server beheren** permissie nodig.',
                flags:
                    MessageFlags.Ephemeral
            });
        }


        /* ======================================================
           SUBCOMMAND
           ====================================================== */

        let subcommand;

        try {
            subcommand =
                interaction.options.getSubcommand();
        } catch (error) {

            logger.error(
                '[Verification] Subcommand uitlezen mislukt:',
                error
            );

            return interaction.reply({
                content:
                    '❌ Kon de verificatie-subcommand niet uitlezen.',
                flags:
                    MessageFlags.Ephemeral
            });
        }


        /* ======================================================
           SETUP
           ====================================================== */

        if (subcommand === 'setup') {

            console.log(
                '[VERIFICATION] SETUP GESTART'
            );


            /* ==================================================
               CHANNEL
               ================================================== */

            let channel = null;

            try {

                channel =
                    interaction.options.getChannel(
                        'kanaal'
                    );

            } catch (error) {

                console.error(
                    '[VERIFICATION] getChannel error:',
                    error
                );
            }


            /* ==================================================
               ROLE
               ================================================== */

            let role = null;

            try {

                role =
                    interaction.options.getRole(
                        'rol'
                    );

            } catch (error) {

                console.error(
                    '[VERIFICATION] getRole error:',
                    error
                );
            }


            /* ==================================================
               DEBUG
               ================================================== */

            console.log(
                '[VERIFICATION] CHANNEL:',
                channel
                    ? {
                        id:
                            channel.id,
                        name:
                            channel.name,
                        type:
                            channel.type
                    }
                    : null
            );

            console.log(
                '[VERIFICATION] ROLE:',
                role
                    ? {
                        id:
                            role.id,
                        name:
                            role.name,
                        position:
                            role.position
                    }
                    : null
            );


            /* ==================================================
               CHANNEL CHECK
               ================================================== */

            if (!channel) {

                return interaction.reply({
                    content:
                        '❌ Geen geldig kanaal geselecteerd. Selecteer bij **kanaal** een tekstkanaal.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            if (
                channel.type !==
                ChannelType.GuildText
            ) {

                return interaction.reply({
                    content:
                        '❌ Selecteer een normaal tekstkanaal.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            /* ==================================================
               ROLE CHECK
               ================================================== */

            if (!role) {

                return interaction.reply({
                    content:
                        '❌ Geen geldige rol geselecteerd.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            /* ==================================================
               @EVERYONE
               ================================================== */

            if (
                role.id === guild.id
            ) {

                return interaction.reply({
                    content:
                        '❌ De @everyone rol kan niet worden gebruikt.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            /* ==================================================
               MANAGED ROLE
               ================================================== */

            if (role.managed) {

                return interaction.reply({
                    content:
                        '❌ Deze rol wordt beheerd door een integratie en kan niet worden gebruikt.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            /* ==================================================
               BOT MEMBER
               ================================================== */

            const botMember =
                guild.members.me ||
                await guild.members
                    .fetch(client.user.id)
                    .catch(
                        () => null
                    );


            if (!botMember) {

                return interaction.reply({
                    content:
                        '❌ Ik kan mijn eigen bot-lid niet vinden.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            /* ==================================================
               MANAGE ROLES
               ================================================== */

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {

                return interaction.reply({
                    content:
                        '❌ Ik heb de **Rollen beheren** permissie nodig.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            /* ==================================================
               ROLE HIERARCHY
               ================================================== */

            if (
                role.position >=
                botMember.roles.highest.position
            ) {

                return interaction.reply({
                    content: [
                        '❌ Mijn hoogste rol moet boven de verificatierol staan.',
                        '',
                        `Mijn hoogste rol: **${botMember.roles.highest.name}**`,
                        `Verificatierol: **${role.name}**`
                    ].join('\n'),
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            /* ==================================================
               CHANNEL PERMISSIONS
               ================================================== */

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
                        `❌ Ik kan ${channel} niet bekijken.`,
                    flags:
                        MessageFlags.Ephemeral
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
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            if (
                !permissions?.has(
                    PermissionFlagsBits.EmbedLinks
                )
            ) {

                return interaction.reply({
                    content:
                        `❌ Ik kan geen embeds sturen in ${channel}. Geef mij **Links insluiten**.`,
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            /* ==================================================
               DEFER
               ================================================== */

            try {

                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral
                });

            } catch (error) {

                console.error(
                    '[VERIFICATION] deferReply error:',
                    error
                );

                return;
            }


            try {

                /* ==================================================
                   CONFIG OPHALEN
                   ================================================== */

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


                /* ==================================================
                   OUDE CONFIG
                   ================================================== */

                const oldChannelId =
                    guildConfig.verification.channelId;

                const oldMessageId =
                    guildConfig.verification.messageId;


                /* ==================================================
                   OUD VERIFICATIEBERICHT VERWIJDEREN
                   ================================================== */

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
                            oldChannel?.isTextBased()
                        ) {

                            const oldMessage =
                                await oldChannel.messages
                                    .fetch(
                                        oldMessageId
                                    )
                                    .catch(
                                        () => null
                                    );


                            if (
                                oldMessage
                            ) {

                                await oldMessage
                                    .delete()
                                    .catch(
                                        () => {}
                                    );

                                logger.info(
                                    '[Verification] Oud verificatiebericht verwijderd.'
                                );
                            }
                        }

                    } catch (error) {

                        logger.warn(
                            '[Verification] Oud bericht kon niet worden verwijderd:',
                            error
                        );
                    }
                }


                /* ==================================================
                   VERIFICATION CONFIG
                   ================================================== */

                guildConfig.verification = {
                    enabled:
                        true,

                    channelId:
                        channel.id,

                    roleId:
                        role.id,

                    messageId:
                        null,

                    autoVerify: {
                        enabled:
                            false
                    }
                };


                await setGuildConfig(
                    client,
                    guild.id,
                    guildConfig
                );


                /* ==================================================
                   EMBED
                   ================================================== */

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            getColor(
                                'primary'
                            )
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
                            ].join(
                                '\n'
                            )
                        )
                        .setFooter({
                            text:
                                `${guild.name} • Verificatie`
                        })
                        .setTimestamp();


                /* ==================================================
                   BUTTON
                   ================================================== */

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


                /* ==================================================
                   MESSAGE SEND
                   ================================================== */

                const verificationMessage =
                    await channel.send({
                        embeds: [
                            embed
                        ],
                        components: [
                            row
                        ]
                    });


                /* ==================================================
                   MESSAGE ID OPSLAAN
                   ================================================== */

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
                        enabled:
                            false
                    };


                await setGuildConfig(
                    client,
                    guild.id,
                    finalConfig
                );


                /* ==================================================
                   LOG
                   ================================================== */

                logger.info(
                    '[Verification] Setup succesvol',
                    {
                        guildId:
                            guild.id,

                        channelId:
                            channel.id,

                        channelName:
                            channel.name,

                        roleId:
                            role.id,

                        roleName:
                            role.name,

                        messageId:
                            verificationMessage.id
                    }
                );


                /* ==================================================
                   SUCCESS
                   ================================================== */

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
                                    `[Klik hier om het verificatiebericht te bekijken](${verificationMessage.url})`,
                                    '',
                                    'Nieuwe leden kunnen op **✅ Regels accepteren** klikken.',
                                    '',
                                    '⚠️ Automatische verificatie bij join staat uit.'
                                ].join(
                                    '\n'
                                )
                            )
                    ]
                });

            } catch (error) {

                logger.error(
                    '[Verification] Setup error:',
                    {
                        message:
                            error?.message,

                        stack:
                            error?.stack,

                        guildId:
                            guild.id,

                        channelId:
                            channel?.id,

                        roleId:
                            role?.id
                    }
                );


                await interaction
                    .editReply({
                        content:
                            `❌ Er ging iets mis bij het instellen van de verificatie.\n\n\`${error?.message || 'Onbekende fout'}\``
                    })
                    .catch(
                        () => {}
                    );
            }

            return;
        }


        /* ========================================================
           DISABLE
           ======================================================== */

        if (
            subcommand === 'disable'
        ) {

            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral
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
                        enabled:
                            false
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
                    `[Verification] Disabled in ${guild.name} (${guild.id})`
                );

            } catch (error) {

                logger.error(
                    '[Verification] Disable error:',
                    error
                );


                await interaction
                    .editReply({
                        content:
                            `❌ Er ging iets mis bij het uitschakelen van de verificatie.\n\n\`${error?.message || 'Onbekende fout'}\``
                    })
                    .catch(
                        () => {}
                    );
            }

            return;
        }
    }
};
