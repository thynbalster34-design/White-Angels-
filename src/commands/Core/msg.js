import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('msg')
        .setDescription('Stuur een bericht namens Kompaniya')
        .addStringOption(option =>
            option
                .setName('tekst')
                .setDescription('Het bericht dat de bot moet sturen')
                .setRequired(true)
        )
        .setDMPermission(false),

    category: 'Core',

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            return;
        }

        try {
            const tekst = interaction.options.getString('tekst');

            const embed = createEmbed({
                title: '🤍 KOMPANIYA',
                description: tekst,
                color: '#FFFFFF',
            });

            embed.setFooter({
                text: 'Kompaniya',
                iconURL: interaction.client.user.displayAvatarURL(),
            });

            embed.setTimestamp();

            await interaction.channel.send({
                embeds: [embed],
            });

            await InteractionHelper.safeEditReply(interaction, {
                content: '✅ Bericht geplaatst.',
            });

        } catch (error) {
            logger.error('Msg command error:', error);

            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ Er ging iets mis bij het plaatsen van het bericht.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};
