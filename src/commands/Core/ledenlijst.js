import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ROLE_ORDER = [
    'Boss',
    'Underboss',
    'Righthand',
    'Lefthand',
    'Headhitman',
    'Hitman',
    'Full Member',
    'Member',
    'Jr. Member',
    'Hangaround',
];

const MAIN_ROLE = 'White Angels';

export default {
    data: new SlashCommandBuilder()
        .setName('ledenlijst')
        .setDescription('Toont de White Angels ledenlijst')
        .setDMPermission(false),

    category: 'Core',

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            return;
        }

        try {
            const guild = interaction.guild;

            if (!guild) {
                return InteractionHelper.safeEditReply(interaction, {
                    content: '❌ Dit command kan alleen in een server gebruikt worden.',
                });
            }

            await guild.members.fetch();

            const whiteAngelsRole = guild.roles.cache.find(
                role =>
                    role.name.trim().toLowerCase() ===
                    MAIN_ROLE.toLowerCase()
            );

            if (!whiteAngelsRole) {
                return InteractionHelper.safeEditReply(interaction, {
                    content: `❌ De rol **${MAIN_ROLE}** bestaat niet.`,
                });
            }

            const members = guild.members.cache.filter(
                member =>
                    !member.user.bot &&
                    member.roles.cache.has(whiteAngelsRole.id)
            );

            const lines = [];

            lines.push(
                `**Totaal aantal leden:** ${members.size}`,
                ''
            );

            for (const roleName of ROLE_ORDER) {
                const role = guild.roles.cache.find(
                    r =>
                        r.name.trim().toLowerCase() ===
                        roleName.toLowerCase()
                );

                lines.push(`**${roleName}**`);

                if (!role) {
                    lines.push('*Rol niet gevonden*', '');
                    continue;
                }

                const roleMembers = members
                    .filter(member =>
                        member.roles.cache.has(role.id)
                    )
                    .sort((a, b) =>
                        a.displayName.localeCompare(
                            b.displayName,
                            'nl'
                        )
                    );

                if (roleMembers.size === 0) {
                    lines.push('*Geen leden*', '');
                } else {
                    for (const member of roleMembers.values()) {
                        lines.push(`• ${member}`);
                    }

                    lines.push('');
                }
            }

            const description = lines.join('\n');

            const embed = createEmbed({
                title: '🤍 WHITE ANGELS — LEDENLIJST',
                description,
                color: '#FFFFFF',
            });

            embed.setFooter({
                text: 'White Angels • Ledenlijst',
                iconURL: interaction.client.user.displayAvatarURL(),
            });

            embed.setTimestamp();

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });

        } catch (error) {
            logger.error(
                'Ledenlijst command error:',
                error
            );

            await InteractionHelper.safeEditReply(interaction, {
                content:
                    '❌ Er ging iets mis bij het ophalen van de ledenlijst.',
            }).catch(() => {});
        }
    },
};
