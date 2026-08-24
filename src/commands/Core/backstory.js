import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const BACKSTORY = `# 🤍 WHITE ANGELS
### *One group. One family. One goal.*

━━━━━━━━━━━━━━━━━━━━

## 🇷🇺 HET BEGIN

White Angels begon niet in RLRP, maar in Rusland.

De groep bestond uit een aantal boys die elkaar al jaren kenden en samen waren opgegroeid. Ze hadden allemaal hun eigen problemen, maar één ding hadden ze gemeen: **ze vertrouwden alleen elkaar.**

Door problemen in Rusland moesten ze uiteindelijk vluchten. Ze konden niet zomaar blijven en besloten daarom alles achter te laten en naar RealLife te vertrekken.

Ze kwamen daar aan zonder veel geld en zonder mensen die ze konden vertrouwen.

## 🌆 EEN NIEUW BEGIN

In het begin hielden ze zich vooral rustig. Ze probeerden werk te vinden en een nieuw leven op te bouwen.

Toch kwamen ze er snel achter dat het leven in RealLife niet zo makkelijk was als ze hadden gedacht. Geld was moeilijk te verdienen en de mensen die ze ontmoetten waren niet altijd te vertrouwen.

Eén van de oprichters, **Lolo Bobbers**, begon daarom oude contacten te gebruiken om aan geld te komen.

Wat eerst een paar kleine klusjes waren, werd langzaam steeds groter. De groep begon steeds meer mensen te leren kennen en kreeg daardoor ook steeds meer invloed.

## 🤍 DE GEBOORTE VAN WHITE ANGELS

Na een tijdje werd **White Angels officieel opgericht.**

De naam kwam voort uit hun verleden. Voor de buitenwereld waren ze misschien *"de engelen"* die uit Rusland waren gekomen, maar achter die naam zat een groep die alles had moeten achterlaten om opnieuw te beginnen.

Door de jaren heen werd de groep steeds hechter.

Binnen White Angels gelden daarom drie belangrijke waarden:

**LOYALITEIT • RESPECT • VERTROUWEN**

Wie bij de groep hoort, wordt gezien als familie.

**Verraad wordt absoluut niet geaccepteerd.**

## 🔥 DE TOEKOMST

Nu willen de White Angels hun verleden achter zich laten en in RealLife een nieuwe naam opbouwen.

Ze willen niet zomaar een groep zijn die tijdelijk bestaat, maar een **elite organisatie** die langzaam groter en machtiger wordt.

Hun doel is om vanuit het niets iets op te bouwen waar mensen in RealLife uiteindelijk rekening mee moeten houden.

Ze zijn Rusland ontvlucht om te overleven.

**In RealLife willen ze ervoor zorgen dat ze nooit meer hoeven te vluchten.**

━━━━━━━━━━━━━━━━━━━━

### 🤍 WHITE ANGELS
**Één groep. Één familie. Één doel.**`;

export default {
    data: new SlashCommandBuilder()
        .setName('backstory')
        .setDescription('Plaats de White Angels backstory')
        .setDMPermission(false),

    category: 'Core',

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            return;
        }

        try {
            const embed = createEmbed({
                title: '🤍 WHITE ANGELS',
                description: BACKSTORY,
                color: '#FFFFFF',
            });

            embed.setFooter({
                text: 'White Angels • Backstory',
                iconURL: interaction.client.user.displayAvatarURL(),
            });

            embed.setTimestamp();

            await interaction.channel.send({
                embeds: [embed],
            });

            await InteractionHelper.safeEditReply(interaction, {
                content: '✅ De White Angels backstory is geplaatst.',
            });

        } catch (error) {
            logger.error('Backstory command error:', error);

            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ Er ging iets mis bij het plaatsen van de backstory.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};
