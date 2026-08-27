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
   COMMAND
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

        try {

            const guild =
                interaction.guild;

            if (!guild) {
                return interaction.reply({
                    content:
                        '❌ Dit commando kan alleen in een server worden gebruikt.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            const subcommand =
                interaction.options.getSubcommand();


            /* ==================================================
               SETUP
               ================================================== */

            if (subcommand === 'setup') {

                /*
                ==================================================
                RAW SUBCOMMAND DATA
                ==================================================

                We zoeken zelf naar:

                setup
                  ├── kanaal
                  └── rol

                Hierdoor gebruiken we niet de resolver die eerder
                "Required option kanaal not found" veroorzaakte.
                ==================================================
                */

                const setupOption =
                    interaction.options.data.find(
                        option =>
                            option.name === 'setup'
                    );


                logger.info(
                    '[Verification] Raw interaction options',
                    {
                        guildId:
                            guild.id,

                        options:
                            interaction.options.data
                    }
                );


                if (!setupOption) {

                    return interaction.reply({
                        content:
                            '❌ De `/verification setup` gegevens konden niet worden uitgelezen.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                /*
                ==================================================
                KANAAL ID
                ==================================================
                */

                const channelOption =
                    setupOption.options?.find(
                        option =>
                            option.name === 'kanaal'
                    );


                const channelId =
                    channelOption?.value
                        ? String(
                            channelOption.value
                        )
                        : null;


                logger.info(
                    `[Verification] Channel option ID: ${channelId ?? 'NULL'}`
                );


                if (!channelId) {

                    return interaction.reply({
                        content: [
                            '❌ Discord heeft geen kanaal-ID meegestuurd.',
                            '',
                            'Selecteer opnieuw een kanaal bij **kanaal**.'
                        ].join('\n'),
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                /*
                ==================================================
                KANAAL OPHALEN
                ==================================================
                */

                const channel =
                    await guild.channels
                        .fetch(channelId)
                        .catch(
                            error => {

                                logger.error(
                                    '[Verification] Kanaal ophalen mislukt:',
                                    error
                                );

                                return null;
                            }
                        );


                if (!channel) {

                    return interaction.reply({
                        content:
                            '❌ Het geselecteerde kanaal kon niet worden gevonden.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                /*
                ==================================================
                ROLE ID
                ==================================================
                */

                const roleOption =
                    setupOption.options?.find(
                        option =>
                            option.name === 'rol'
                    );


                const roleId =
                    roleOption?.value
                        ? String(
                            roleOption.value
                        )
                        : null;


                logger.info(
                    `[Verification] Role option ID: ${roleId ?? 'NULL'}`
                );


                if (!roleId) {

                    return interaction.reply({
                        content: [
                            '❌ Discord heeft geen rol-ID meegestuurd.',
                            '',
                            'Selecteer opnieuw een rol bij **rol**.'
                        ].join('\n'),
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                /*
                ==================================================
                ROLE OPHALEN
                ==================================================
                */

                const role =
                    await guild.roles
                        .fetch(roleId)
                        .catch(
                            error => {

                                logger.error(
                                    '[Verification] Rol ophalen mislukt:',
                                    error
                                );

                                return null;
                            }
                        );


                if (!role) {

                    return interaction.reply({
                        content:
                            '❌ De geselecteerde rol kon niet worden gevonden.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                logger.info(
                    '[Verification] Kanaal en rol succesvol ontvangen',
                    {
                        channelId:
                            channel.id,

                        channelName:
                            channel.name,

                        channelType:
                            channel.type,

                        roleId:
                            role.id,

                        roleName:
                            role.name
                    }
                );


                /*
                ==================================================
                CHANNEL TYPE
                ==================================================
                */

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


                /*
                ==================================================
                ROLE CHECKS
                ==================================================
                */

                if (
                    role.id ===
                    guild.id
                ) {

                    return interaction.reply({
                        content:
                            '❌ Je kunt de @everyone rol niet gebruiken.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                if (role.managed) {

                    return interaction.reply({
                        content:
                            '❌ Deze rol wordt door een integratie beheerd en kan niet worden gebruikt.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                /*
                ==================================================
                BOT MEMBER
                ==================================================
                */

                const botMember =
                    guild.members.me ||
                    await guild.members
                        .fetch(
                            client.user.id
                        )
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


                /*
                ==================================================
                MANAGE ROLES
                ==================================================
                */

                if (
                    !botMember.permissions.has(
                        PermissionFlagsBits.ManageRoles
                    )
                ) {

                    return interaction.reply({
                        content:
                            '❌ Ik heb **Rollen beheren** nodig.',
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                /*
                ==================================================
                ROLE HIERARCHY
                ==================================================
                */

                if (
                    role.position >=
                    botMember.roles.highest.position
                ) {

                    return interaction.reply({
                        content: [
                            '❌ Mijn botrol moet boven de verificatierol staan.',
                            '',
                            `Mijn hoogste rol: **${botMember.roles.highest.name}**`,
                            `Verificatierol: **${role.name}**`
                        ].join('\n'),
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                /*
                ==================================================
                CHANNEL PERMISSIONS
                ==================================================
                */

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
                            `❌ Ik heb **Links insluiten** nodig in ${channel}.`,
                        flags:
                            MessageFlags.Ephemeral
                    });
                }


                /*
                ==================================================
                DEFER
                ==================================================
                */

                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral
                });


                /*
                ==================================================
                CONFIG
                ==================================================
                */

                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );


                /*
                ==================================================
                OUD BERICHT
                ==================================================
                */

                const oldChannelId =
                    guildConfig?.verification?.channelId;

                const oldMessageId =
                    guildConfig?.verification?.messageId;


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

                    } catch (
                        error
                    ) {

                        logger.warn(
                            '[Verification] Oud verificatiebericht kon niet worden verwijderd:',
                            error
                        );
                    }
                }


                /*
                ==================================================
                VERIFICATION EMBED
                ==================================================
                */

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
                                '5. Houd je aan de serverregels.',
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


                /*
                ==================================================
                BUTTON
                ==================================================
                */

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


                /*
                ==================================================
                SEND MESSAGE
                ==================================================
                */

                const verificationMessage =
                    await channel.send({
                        embeds: [
                            embed
                        ],
                        components: [
                            row
                        ]
                    });


                /*
                ==================================================
                SAVE CONFIG
                ==================================================
                */

                const updatedGuildConfig = {
                    ...(guildConfig || {}),

                    verification: {
                        enabled:
                            true,

                        channelId:
                            channel.id,

                        roleId:
                            role.id,

                        messageId:
                            verificationMessage.id,

                        autoVerify: {
                            enabled:
                                false
                        }
                    }
                };


                await setGuildConfig(
                    client,
                    guild.id,
                    updatedGuildConfig
                );


                /*
                ==================================================
                SUCCESS
                ==================================================
                */

                logger.info(
                    '[Verification] Setup succesvol afgerond',
                    {
                        guildId:
                            guild.id,

                        channelId:
                            channel.id,

                        roleId:
                            role.id,

                        messageId:
                            verificationMessage.id
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
                                    'Het verificatiesysteem is succesvol ingesteld.',
                                    '',
                                    `**Kanaal:** ${channel}`,
                                    `**Verificatierol:** ${role}`,
                                    '',
                                    `[Klik hier om het verificatiebericht te bekijken](${verificationMessage.url})`,
                                    '',
                                    'Leden kunnen nu op **✅ Regels accepteren** klikken.',
                                    '',
                                    '⚠️ Automatische verificatie bij join staat uit.'
                                ].join('\n')
                            )
                    ]
                });

            }


            /* ==================================================
               DISABLE
               ================================================== */

            if (subcommand === 'disable') {

                await interaction.deferReply({
                    flags:
                        MessageFlags.Ephemeral
                });


                const guildConfig =
                    await getGuildConfig(
                        client,
                        guild.id
                    );


                const updatedGuildConfig = {
                    ...(guildConfig || {}),

                    verification: {
                        ...(guildConfig?.verification || {}),

                        enabled:
                            false,

                        autoVerify: {
                            enabled:
                                false
                        }
                    }
                };


                await setGuildConfig(
                    client,
                    guild.id,
                    updatedGuildConfig
                );


                logger.info(
                    `[Verification] Verificatie uitgeschakeld in ${guild.name} (${guild.id})`
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


            return interaction.reply({
                content:
                    '❌ Onbekende verification actie.',
                flags:
                    MessageFlags.Ephemeral
            });

        } catch (error) {

            logger.error(
                '[Verification] Onverwachte fout:',
                {
                    message:
                        error?.message,

                    stack:
                        error?.stack,

                    guildId:
                        interaction.guildId,

                    userId:
                        interaction.user?.id
                }
            );


            if (
                interaction.deferred ||
                interaction.replied
            ) {

                return interaction.editReply({
                    content:
                        `❌ Er is een fout opgetreden bij het instellen van verificatie.\n\n\`${error?.message || 'Onbekende fout'}\``
                }).catch(
                    () => {}
                );
            }


            return interaction.reply({
                content:
                    `❌ Er is een fout opgetreden bij het instellen van verificatie.\n\n\`${error?.message || 'Onbekende fout'}\``,
                flags:
                    MessageFlags.Ephemeral
            }).catch(
                () => {}
            );
        }
    }
};
