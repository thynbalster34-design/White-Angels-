import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";

import {
  reconcileReactionRoleMessages,
} from "../services/reactionRoleService.js";

import {
  reconcileTicketPanels,
  reconcileVerificationPanels,
  reconcileReactionRolePanelHealth,
} from "../services/panelHealthService.js";

import {
  reconcileLevelRoles,
} from "../services/leveling/levelRoleSyncService.js";

import {
  initRiffyAfterReady,
} from "../services/music/riffySetup.js";

import {
  startAllTicketPanelAutoUpdates,
} from "../commands/Ticket/modules/ticket_dashboard.js";

/* ============================================================
   WHITE ANGELS ROLE
   ============================================================ */

const WHITE_ANGELS_ROLE_ID =
  "1437696432340467786";

/* ============================================================
   CLIENT READY
   ============================================================ */

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      /* ========================================================
         BOT READY
         ======================================================== */

      client.user.setPresence(
        config.bot.presence
      );

      startupLog(
        `Ready! Logged in as ${client.user.tag}`
      );

      startupLog(
        `Serving ${client.guilds.cache.size} guild(s)`
      );

      startupLog(
        `Loaded ${client.commands.size} commands`
      );

      /* ========================================================
         SERVER MEMBERS OPHALEN + WHITE ANGELS CONTROLEREN
         ======================================================== */

      for (
        const guild
        of client.guilds.cache.values()
      ) {
        try {
          /*
           * Alle members ophalen.
           * Door GatewayIntentBits.GuildMembers in app.js
           * kunnen ook offline leden worden opgehaald.
           */
          const members =
            await guild.members.fetch();

          startupLog(
            `✅ Members loaded for ${guild.name}: ${members.size}`
          );

          /*
           * White Angels rol ophalen via exacte ID.
           */
          const whiteAngelsRole =
            guild.roles.cache.get(
              WHITE_ANGELS_ROLE_ID
            );

          if (!whiteAngelsRole) {
            startupLog(
              `❌ White Angels role not found: ${WHITE_ANGELS_ROLE_ID}`
            );

            continue;
          }

          startupLog(
            `🤍 White Angels role found: ${whiteAngelsRole.name}`
          );

          /*
           * Alle leden met de White Angels rol tellen.
           */
          const whiteAngelsMembers =
            members.filter(
              member =>
                !member.user.bot &&
                member.roles.cache.has(
                  WHITE_ANGELS_ROLE_ID
                )
            );

          startupLog(
            `🤍 White Angels members detected: ${whiteAngelsMembers.size}`
          );

          /*
           * Iedere gevonden White Angels member loggen.
           * Dit is handig om te controleren welke leden Discord
           * daadwerkelijk aan de bot teruggeeft.
           */
          for (
            const member
            of whiteAngelsMembers.values()
          ) {
            startupLog(
              `🤍 White Angels member: ${member.user.tag} (${member.id})`
            );
          }

        } catch (error) {
          logger.error(
            `Failed to fetch members for ${guild.name}:`,
            error
          );
        }
      }

      /* ========================================================
         MUSIC
         ======================================================== */

      if (
        client.config?.features?.music
      ) {
        initRiffyAfterReady(
          client
        );
      }

      /* ========================================================
         REACTION ROLES
         ======================================================== */

      const reconciliationSummary =
        await reconcileReactionRoleMessages(
          client
        );

      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

      /* ========================================================
         TICKET PANEL HEALTH
         ======================================================== */

      const ticketPanelSummary =
        await reconcileTicketPanels(
          client
        );

      startupLog(
        `Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}, recovered ${ticketPanelSummary.recoveredIds}, errors ${ticketPanelSummary.errors}`
      );

      /* ========================================================
         TICKET PANEL AUTO UPDATE
         ======================================================== */

      await startAllTicketPanelAutoUpdates(
        client
      );

      /* ========================================================
         VERIFICATION PANEL
         ======================================================== */

      const verificationPanelSummary =
        await reconcileVerificationPanels(
          client
        );

      startupLog(
        `Verification panel health: scanned ${verificationPanelSummary.scannedGuilds} guilds, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}, missing channel ${verificationPanelSummary.missingChannels}, recovered ${verificationPanelSummary.recoveredIds}, errors ${verificationPanelSummary.errors}`
      );

      /* ========================================================
         REACTION ROLE PANEL HEALTH
         ======================================================== */

      const reactionRolePanelSummary =
        await reconcileReactionRolePanelHealth(
          client
        );

      startupLog(
        `Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels} panels, healthy ${reactionRolePanelSummary.healthyPanels}, deleted ${reactionRolePanelSummary.deletedPanels}, missing channel ${reactionRolePanelSummary.missingChannels}, recovered ${reactionRolePanelSummary.recoveredIds}, errors ${reactionRolePanelSummary.errors}`
      );

      /* ========================================================
         LEVEL ROLES
         ======================================================== */

      const levelRoleSummary =
        await reconcileLevelRoles(
          client
        );

      startupLog(
        `Level role sync: scanned ${levelRoleSummary.scannedGuilds} guilds, pruned ${levelRoleSummary.prunedRewardEntries} stale rewards, re-awarded ${levelRoleSummary.rolesReAwarded} roles, errors ${levelRoleSummary.errors}`
      );

      /* ========================================================
         KLAAR
         ======================================================== */

      startupLog(
        "✅ All startup systems initialized successfully"
      );

    } catch (error) {
      logger.error(
        "Error in ready event:",
        error
      );
    }
  },
};
