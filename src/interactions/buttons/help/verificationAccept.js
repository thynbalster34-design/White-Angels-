import {
    MessageFlags,
} from 'discord.js';

import {
    getGuildConfig,
} from '../../services/config/guildConfig.js';

import {
    logger,
} from '../../utils/logger.js';

export default {
    name: 'verification_accept',

    async execute(interaction, client) {
        try {
            if (!interaction.guild) {
                return interaction.reply({
                    content:
                        '❌ Deze knop kan alleen in een server worden gebruikt.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const guild = interaction.guild;
            const member = interaction.member;

            // ========================================================
            // CONFIG
            // ========================================================

            const guildConfig =
                await getGuildConfig(
                    client,
                    guild.id
                );

            const verification =
                guildConfig?.verification;

            if (!verification?.enabled) {
                return interaction.reply({
                    content:
                        '❌ Het verificatiesysteem is momenteel uitgeschakeld.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ========================================================
            // ROLE
            // ========================================================

            const roleId =
                verification.roleId ||
                '1437696432340467779';

            const role =
                await guild.roles
                    .fetch(roleId)
                    .catch(() => null);

            if (!role) {
                logger.error(
                    `[Verification] Role ${roleId} not found in guild ${guild.id}`
                );

                return interaction.reply({
                    content:
                        '❌ De verificatierol kon niet worden gevonden.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ========================================================
            // ALREADY VERIFIED
            // ========================================================

            if (member.roles.cache.has(role.id)) {
                return interaction.reply({
                    content:
                        '✅ Je bent al geverifieerd.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ========================================================
            // BOT ROLE CHECK
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
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (
                !botMember.permissions.has(
                    'ManageRoles'
                )
            ) {
                return interaction.reply({
                    content:
                        '❌ Ik heb de **Rollen beheren** permissie nodig.',
                    flags: MessageFlags.Ephemeral,
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
                        '❌ Ik kan deze rol niet geven.',
                        '',
                        `Mijn hoogste rol: **${botMember.roles.highest.name}**`,
                        `Verificatierol: **${role.name}**`,
                        '',
                        'Zet mijn botrol boven de verificatierol.'
                    ].join('\n'),
                    flags: MessageFlags.Ephemeral,
                });
            }

            // ========================================================
            // ROLE GEVEN
            // ========================================================

            await member.roles.add(
                role,
                'Discord verificatie'
            );

            // ========================================================
            // SUCCESS
            // ========================================================

            logger.info(
                `[Verification] ${member.user.tag} (${member.id}) verified in ${guild.name} and received role ${role.name} (${role.id})`
            );

            return interaction.reply({
                content: [
                    '✅ **Verificatie voltooid!**',
                    '',
                    `Je hebt de rol ${role} gekregen.`,
                    '',
                    'Welkom op de server!'
                ].join('\n'),
                flags: MessageFlags.Ephemeral,
            });

        } catch (error) {
            logger.error(
                '[Verification] Button error:',
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                return interaction.followUp({
                    content:
                        '❌ Er is iets misgegaan tijdens de verificatie.',
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }

            return interaction.reply({
                content:
                    '❌ Er is iets misgegaan tijdens de verificatie.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};
