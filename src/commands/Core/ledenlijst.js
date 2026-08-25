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
                await InteractionHelper.safeEditReply(interaction, {
                    content: '❌ Dit command kan alleen in een server gebruikt worden.',
                });
                return;
            }

            // Zorg ervoor dat de leden beschikbaar zijn.
            await guild.members.fetch();

            const whiteAngelsRole = guild.roles.cache.find(
                role => role.name.toLowerCase() === MAIN_ROLE.toLowerCase()
            );

            if (!whiteAngelsRole) {
                await InteractionHelper.safeEditReply(interaction, {
                    content: `❌ De rol **@${MAIN_ROLE}** bestaat niet.`,
                });
                return;
            }

            // Alle leden met de White Angels-rol
            const whiteAngelsMembers = guild.members.cache.filter(
                member =>
                    !member.user.bot &&
                    member.roles.cache.has(whiteAngelsRole.id)
            );

            const sections = [];

            for (const roleName of ROLE_ORDER) {
                const role = guild.roles.cache.find(
                    r =>
                        r.name.toLowerCase() ===
                        roleName.toLowerCase()
                );

                if (!role) {
                    continue;
                }

                const members = whiteAngelsMembers
                    .filter(member =>
                        member.roles.cache.has(role.id)
                    )
                    .sort((a, b) =>
                        a.displayName.localeCompare(
                            b.displayName,
                            'nl'
                        )
                    );

                if (members.size === 0) {
                    sections.push(
                        `**${roleName}**\n*Geen leden*`
                    );
                    continue;
                }

                const memberList = members
                    .map(member => `• ${member}`)
                    .join('\n');

                sections.push(
                    `**${roleName}**\n${memberList}`
                );
            }

            const embed = createEmbed({
                title: '🤍 WHITE ANGELS — LEDENLIJST',
                description:
                    `**Totaal aantal leden:** ${whiteAngelsMembers.size}\n\n` +
                    sections.join('\n\n'),
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
