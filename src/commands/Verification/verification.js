console.log('🔥 VERIFICATION.JS WORDT GELADEN 🔥');

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
                            'Het kanaal waar het verificatiebericht komt'
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

        /*
        ============================================================
        DEBUG
        ============================================================

        Deze logs laten precies zien wat Discord naar jouw bot stuurt.

        ============================================================
        */

        console.log(
            '[VERIFICATION] COMMAND ONTVANGEN'
        );

        console.log(
            '[VERIFICATION] COMMAND:',
            interaction.commandName
        );

        console.log(
            '[VERIFICATION] USER:',
            interaction.user?.tag,
            interaction.user?.id
        );

        console.log(
            '[VERIFICATION] GUILD:',
            interaction.guild?.name,
            interaction.guild?.id
        );

        console.log(
            '[VERIFICATION] RAW OPTIONS:',
            JSON.stringify(
                interaction.options.data,
                null,
                2
            )
        );


        const guild = interaction.guild;

        // ============================================================
        // SERVER CHECK
        // ============================================================

        if (!guild) {
            return interaction.reply({
                content:
                    '❌ Dit commando kan alleen in een server worden gebruikt.',
                flags:
                    MessageFlags.Ephemeral
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
                flags:
                    MessageFlags.Ephemeral
            });
        }

        // ============================================================
        // SUBCOMMAND
        // ============================================================

        let subcommand;

        try {

            subcommand =
                interaction.options.getSubcommand();

        } catch (error) {

            logger.error(
                '[Verification] Kon subcommand niet uitlezen:',
                error
            );

            return interaction.reply({
                content:
                    '❌ Kon de verificatie-subcommand niet uitlezen.',
                flags:
                    MessageFlags.Ephemeral
            });
        }

        // ============================================================
        // SETUP
        // ============================================================

        if (subcommand === 'setup') {

            /*
            ========================================================
            RAW OPTIONS UITLEZEN
            ========================================================
            */

            const rawOptions =
                interaction.options.data;

            console.log(
                '[VERIFICATION] SUBCOMMAND DATA:',
                JSON.stringify(
                    rawOptions,
                    null,
                    2
                )
            );


            /*
            ========================================================
            KANAAL OPTIE
            ========================================================
            */

            let channel = null;

            let channelOption = null;

            try {

                channelOption =
                    interaction.options.get(
                        'kanaal',
                        false
                    );

            } catch (error) {

                console.log(
                    '[VERIFICATION] FOUT BIJ channelOption:',
                    error
                );
            }


            console.log(
                '[VERIFICATION] CHANNEL OPTION:',
                channelOption
                    ? JSON.stringify(
                        {
                            name:
                                channelOption.name,

                            type:
                                channelOption.type,

                            value:
                                channelOption.value
                        },
                        null,
                        2
                    )
                    : 'NULL'
            );


            /*
            ========================================================
            KANAAL OPHALEN
            ========================================================
            */

            try {

                channel =
                    interaction.options.getChannel(
                        'kanaal',
                        false
                    );

            } catch (error) {

                console.log(
                    '[VERIFICATION] getChannel ERROR:',
                    error
                );

            }


            /*
            ========================================================
            FALLBACK VIA ID
            ========================================================
            */

            if (
                !channel &&
                channelOption?.value
            ) {

                console.log(
                    '[VERIFICATION] Probeer kanaal via ID op te halen:',
                    channelOption.value
                );

                channel =
                    await guild.channels
                        .fetch(
                            String(
                                channelOption.value
                            )
                        )
                        .catch(
                            error => {

                                console.log(
                                    '[VERIFICATION] Kanaal fetch error:',
                                    error?.message ||
                                        error
                                );

                                return null;
                            }
                        );
            }


            /*
            ========================================================
            ROLE OPTION
            ========================================================
            */

            let role = null;

            let roleOption = null;

            try {

                roleOption =
                    interaction.options.get(
                        'rol',
                        false
                    );

            } catch (error) {

                console.log(
                    '[VERIFICATION] FOUT BIJ roleOption:',
                    error
                );
            }


            console.log(
                '[VERIFICATION] ROLE OPTION:',
                roleOption
                    ? JSON.stringify(
                        {
                            name:
                                roleOption.name,

                            type:
                                roleOption.type,

                            value:
                                roleOption.value
                        },
                        null,
                        2
                    )
                    : 'NULL'
            );


            try {

                role =
                    interaction.options.getRole(
                        'rol',
                        false
                    );

            } catch (error) {

                console.log(
                    '[VERIFICATION] getRole ERROR:',
                    error
                );

            }


            /*
            ========================================================
            FALLBACK ROLE VIA ID
            ========================================================
            */

            if (
                !role &&
                roleOption?.value
            ) {

                console.log(
                    '[VERIFICATION] Probeer rol via ID op te halen:',
                    roleOption.value
                );

                role =
                    await guild.roles
                        .fetch(
                            String(
                                roleOption.value
                            )
                        )
                        .catch(
                            error => {

                                console.log(
                                    '[VERIFICATION] Role fetch error:',
                                    error?.message ||
                                        error
                                );

                                return null;
                            }
                        );
            }


            /*
            ========================================================
            RESULTAAT LOGGEN
            ========================================================
            */

            console.log(
                '[VERIFICATION] CHANNEL RESULT:',
                channel
                    ? {
                        id:
                            channel.id,

                        name:
                            channel.name,

                        type:
                            channel.type
                    }
                    : 'NULL'
            );

            console.log(
                '[VERIFICATION] ROLE RESULT:',
                role
                    ? {
                        id:
                            role.id,

                        name:
                            role.name,

                        position:
                            role.position
                    }
                    : 'NULL'
            );


            logger.info(
                `[Verification] Setup request - channel=${channel?.id ?? 'NULL'} role=${role?.id ?? 'NULL'}`
            );


            // ========================================================
            // CHANNEL CHECK
            // ========================================================

            if (!channel) {

                return interaction.reply({
                    content: [
                        '❌ Discord heeft geen kanaal ontvangen.',
                        '',
                        'Het geselecteerde kanaal is niet correct doorgegeven aan de bot.',
                        '',
                        'De Railway-log bevat nu extra informatie onder **[VERIFICATION]**.'
                    ].join('\n'),
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            // ========================================================
            // CHANNEL TYPE CHECK
            // ========================================================

            if (
                channel.type !==
                    ChannelType.GuildText &&
                channel.type !==
                    ChannelType.GuildAnnouncement
            ) {

                return interaction.reply({
                    content:
                        '❌ Selecteer een normaal tekstkanaal.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            // ========================================================
            // ROLE CHECK
            // ========================================================

            if (!role) {

                return interaction.reply({
                    content:
                        '❌ Discord heeft geen rol ontvangen.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            // ========================================================
            // @EVERYONE
            // ========================================================

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


            // ========================================================
            // MANAGED ROLE
            // ========================================================

            if (role.managed) {

                return interaction.reply({
                    content:
                        '❌ Deze rol wordt beheerd door een integratie en kan niet worden gebruikt.',
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            // ========================================================
            // BOT MEMBER
            // ========================================================

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
                    flags:
                        MessageFlags.Ephemeral
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
                        `Verificatierol: **${role.name}`
                    ].join('\n'),
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            // ========================================================
            // CHANNEL PERMISSIONS
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
                        `❌ Ik kan geen embeds sturen in ${channel}. Geef mij de permissie **Links insluiten**.`,
                    flags:
                        MessageFlags.Ephemeral
                });
            }


            // ========================================================
            // DEFER
            // ========================================================

            await interaction.deferReply({
                flags:
                    MessageFlags.Ephemeral
            });


            try {

                // ====================================================
                // CONFIG
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


                /*
                Oude gegevens bewaren.
                */

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
                                    '[Verification] Oud verificatiebericht verwijderd.'
                                );
                            }
                        }

                    } catch (error) {

                        logger.warn(
                            '[Verification] Oud bericht verwijderen mislukt:',
                            error
                        );
                    }
                }


                // ====================================================
                // CONFIG OPSLAAN
                // ====================================================

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


                // ====================================================
                // EMBED
                // ====================================================

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


                // ====================================================
                // BERICHT STUREN
                // ====================================================

                const verificationMessage =
                    await channel.send({
                        embeds: [
                            embed
                        ],
                        components: [
                            row
                        ]
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
                        enabled:
                            false
                    };


                await setGuildConfig(
                    client,
                    guild.id,
                    finalConfig
                );


                // ====================================================
                // SUCCESS LOG
                // ====================================================

                logger.info(
                    '[Verification] Setup succesvol afgerond',
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


                // ====================================================
                // SUCCESS RESPONSE
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
                        error:
                            error?.message ||
                            error,

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

        // ============================================================
        // ONBEKENDE SUBCOMMAND
        // ============================================================

        return interaction.reply({
            content:
                '❌ Onbekende verification actie.',
            flags:
                MessageFlags.Ephemeral
        });
    }
};
