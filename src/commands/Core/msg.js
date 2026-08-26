import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ALLOWED_USER_ID = '708290114760998993';

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

        // Controleer of de gebruiker toestemming heeft
        if (interaction.user.id !== ALLOWED_USER_ID) {
            await interaction.reply({
                content: '❌ Je hebt geen toestemming om dit command te gebruiken.',
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

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

            // Stuur het bericht in het huidige kanaal
            await interaction.channel.send({
                embeds: [embed],
            });

            // Bevestiging alleen voor jou zichtbaar
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
