import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ROLE_ORDER = [
    { name: 'Boss', emoji: '👑', aliases: ['boss'] },
    { name: 'Underboss', emoji: '💎', aliases: ['underboss', 'under boss'] },
    { name: 'Righthand', emoji: '🤝', aliases: ['righthand', 'right hand', 'right-hand'] },
    { name: 'Lefthand', emoji: '🤝', aliases: ['lefthand', 'left hand', 'left-hand'] },
    { name: 'Headhitman', emoji: '🎯', aliases: ['headh​itman', 'head hitman', 'head-hitman'] },
    { name: 'Hitman', emoji: '🔫', aliases: ['hitman'] },
    { name: 'Full Member', emoji: '⭐', aliases: ['full member', 'fullmember'] },
    { name: 'Member', emoji: '👤', aliases: ['member'] },
    { name: 'Jr. Member', emoji: '🟢', aliases: ['jr member', 'jr. member', 'jr-member', 'jrmember', 'junior member'] },
    { name: 'Hangaround', emoji: '📦', aliases: ['hangaround', 'hang around', 'hang-around'] },
];

const MAIN_ROLE_ALIASES = [
    'white angels',
    'whiteangels',
    'white-angels',
];

let memberFetchPromise = null;
let lastMemberFetch = 0;

function normalizeRoleName(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[^a-z0-9]/g, '');
}

function roleMatches(roleName, aliases) {
    const normalizedRole = normalizeRoleName(roleName);

    return aliases.some(
        alias => normalizeRoleName(alias) === normalizedRole
    );
}

function findRole(guild, aliases) {
    return guild.roles.cache.find(role =>
        roleMatches(role.name, aliases)
    );
}

async function refreshMembers(guild) {
    const now = Date.now();

    // Voorkomt meerdere volledige member fetches kort achter elkaar.
    if (
        memberFetchPromise &&
        now - lastMemberFetch < 60000
    ) {
        return memberFetchPromise;
    }

    lastMemberFetch = now;

    memberFetchPromise = guild.members
        .fetch()
        .then(members => {
            logger.info(
                `Fetched ${members.size} members for White Angels ledenlijst.`
            );

            return members;
        })
        .catch(error => {
            memberFetchPromise = null;

            logger.error(
                'Failed to fetch all guild members:',
                error
            );

            throw error;
        });

    return memberFetchPromise;
}

export default {
    data: new SlashCommandBuilder()
        .setName('ledenlijst')
        .setDescription('Toont de White Angels ledenlijst')
        .setDMPermission(false),

    category: 'Core',

    async execute(interaction) {
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            return;
        }

        try {
            const guild = interaction.guild;

            if (!guild) {
                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        content:
                            '❌ Dit command kan alleen in een server gebruikt worden.',
                    }
                );

                return;
            }

            // Alle leden ophalen, inclusief offline leden.
            await refreshMembers(guild);

            // Rollen verversen.
            await guild.roles.fetch().catch(error => {
                logger.warn(
                    'Could not refresh guild roles:',
                    error.message
                );
            });

            const whiteAngelsRole =
                findRole(guild, MAIN_ROLE_ALIASES);

            if (!whiteAngelsRole) {
                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        content:
                            '❌ Ik kan de **White Angels**-rol niet vinden.',
                    }
                );

                return;
            }

            // Alle menselijke leden met de White Angels hoofdrol.
            const whiteAngelsMembers =
                guild.members.cache.filter(
                    member =>
                        !member.user.bot &&
                        member.roles.cache.has(
                            whiteAngelsRole.id
                        )
                );

            // Zoek alle rangrollen.
            const rankRoles = ROLE_ORDER.map(rank => ({
                ...rank,
                role: findRole(
                    guild,
                    [rank.name, ...rank.aliases]
                ),
            }));

            // Maak per rang een lijst.
            const membersByRank = new Map();

            for (const rank of ROLE_ORDER) {
                membersByRank.set(rank.name, []);
            }

            // Iedere member krijgt alleen de hoogste rang.
            for (
                const member
                of whiteAngelsMembers.values()
            ) {
                for (
                    const rank
                    of rankRoles
                ) {
                    if (
                        rank.role &&
                        member.roles.cache.has(
                            rank.role.id
                        )
                    ) {
                        membersByRank
                            .get(rank.name)
                            .push(member);

                        break;
                    }
                }
            }

            const embed =
                new EmbedBuilder()
                    .setColor(0xFFFFFF)
                    .setTitle(
                        '🤍 WHITE ANGELS — LEDENLIJST'
                    )
                    .setDescription(
                        [
                            '',
                            '',
                            '**🤍 TOTAAL AANTAL LEDEN**',
                            `# ${whiteAngelsMembers.size}`,
                            '',
                            '━━━━━━━━━━━━━━━━━━━━',
                            '',
                        ].join('\n')
                    );

            for (
                const rank
                of ROLE_ORDER
            ) {
                const members =
                    membersByRank.get(
                        rank.name
                    ) || [];

                members.sort((a, b) =>
                    a.displayName.localeCompare(
                        b.displayName,
                        'nl'
                    )
                );

                let value = '*Geen leden*';

                if (members.length > 0) {
                    value = members
                        .map(
                            member =>
                                `**• ${member}**`
                        )
                        .join('\n');
                }

                embed.addFields({
                    name:
                        `**${rank.emoji} ${rank.name.toUpperCase()}**`,
                    value,
                    inline: false,
                });
            }

            embed.setFooter({
                text:
                    'White Angels • Ledenlijst',
                iconURL:
                    interaction.client.user
                        .displayAvatarURL(),
            });

            embed.setTimestamp();

            // Ephemeral bevestiging voor degene die het command uitvoert.
            await InteractionHelper.safeEditReply(
                interaction,
                {
                    content:
                        '✅ De White Angels ledenlijst is geplaatst.',
                }
            );

            // De echte ledenlijst als apart normaal bericht in het kanaal.
            if (interaction.channel?.isTextBased()) {
                await interaction.channel.send({
                    embeds: [embed],
                });
            }

        } catch (error) {
            logger.error(
                'Ledenlijst command error:',
                error
            );

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    content:
                        '❌ Er ging iets mis bij het plaatsen van de ledenlijst.',
                }
            ).catch(() => {});
        }
    },
};
