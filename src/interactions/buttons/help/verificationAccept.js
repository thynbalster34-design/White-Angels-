import {
    PermissionFlagsBits,
    MessageFlags
} from 'discord.js';

const VERIFICATION_ROLE_ID = '1437696432340467779';

export default {
    name: 'verification_accept',

    async execute(interaction) {
        try {
            if (!interaction.guild) {
                return interaction.reply({
                    content:
                        '❌ Deze knop kan alleen in een server worden gebruikt.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const guild = interaction.guild;

            const member =
                await guild.members.fetch(
                    interaction.user.id
                );

            const role =
                await guild.roles.fetch(
                    VERIFICATION_ROLE_ID
                ).catch(() => null);

            if (!role) {
                return interaction.reply({
                    content:
                        '❌ De verificatierol kon niet worden gevonden.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const botMember =
                guild.members.me ||
                await guild.members.fetchMe().catch(() => null);

            if (!botMember) {
                return interaction.reply({
                    content:
                        '❌ Ik kan mijn eigen bot-lid niet vinden.',
                    flags: MessageFlags.Ephemeral
                });
            }

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

            if (
                role.position >=
                botMember.roles.highest.position
            ) {
                return interaction.reply({
                    content:
                        '❌ Mijn botrol moet boven de verificatierol staan.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (
                member.roles.cache.has(
                    VERIFICATION_ROLE_ID
                )
            ) {
                return interaction.reply({
                    content:
                        `ℹ️ Je hebt de rol **${role.name}** al.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            await member.roles.add(
                role,
                'Verification button'
            );

            return interaction.reply({
                content:
                    `✅ **Verificatie voltooid!**\n\nJe hebt de rol **${role.name}** gekregen.\nWelkom bij de server! 🎉`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error(
                '[Verification Button Error]',
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                return interaction.followUp({
                    content:
                        '❌ Er ging iets mis tijdens de verificatie.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }

            return interaction.reply({
                content:
                    '❌ Er ging iets mis tijdens de verificatie.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
};
