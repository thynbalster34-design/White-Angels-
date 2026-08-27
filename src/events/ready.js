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
  startSavedMemberListUpdater,
} from "../commands/Core/ledenlijst.js";

import {
  registerCommands,
} from "../services/commandLoader.js";

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
         SLASH COMMAND REGISTRATION
         ======================================================== */

      try {
        const clientId =
          client.user.id;

        /*
         * Probeer eerst de guild ID uit de application config
         * te halen. Verschillende configuraties kunnen hiervoor
         * verschillende namen gebruiken.
         */

        const guildId =
          config.guildId ||
          config.discord?.guildId ||
          config.discord?.serverId ||
          process.env.GUILD_ID ||
          process.env.DISCORD_GUILD_ID ||
          null;

        startupLog(
          `Registering ${client.commands.size} slash commands...`
        );

        if (guildId) {
          startupLog(
            `Using guild command registration for guild ${guildId}`
          );
        } else {
          startupLog(
            "No GUILD_ID configured - using global command registration"
          );
        }

        await registerCommands(
          client,
          {
            clientId,
            guildId,
          }
        );

        startupLog(
          `✅ Slash commands registered successfully (${client.commands.size} commands)`
        );

      } catch (error) {
        logger.error(
          "❌ Failed to register slash commands:",
          error
        );
      }

      /* ========================================================
         WHITE ANGELS LEDENLIJST AUTO-UPDATER
         ======================================================== */

      try {
        await startSavedMemberListUpdater(
          client
        );

        startupLog(
          "✅ White Angels ledenlijst auto-updater gestart"
        );
      } catch (error) {
        logger.warn(
          "Could not start saved White Angels ledenlijst updater:",
          error
        );
      }

      /* ========================================================
         MUSIC
         ======================================================== */

      if (
        client.config?.features?.music
      ) {
        try {
          initRiffyAfterReady(
            client
          );
        } catch (error) {
          logger.warn(
            "Could not initialize music system:",
            error
          );
        }
      }

      /* ========================================================
         REACTION ROLES
         ======================================================== */

      try {
        const reconciliationSummary =
          await reconcileReactionRoleMessages(
            client
          );

        startupLog(
          `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
        );
      } catch (error) {
        logger.warn(
          "Could not reconcile reaction role messages:",
          error
        );
      }

      /* ========================================================
         TICKET PANEL HEALTH
         ======================================================== */

      try {
        const ticketPanelSummary =
          await reconcileTicketPanels(
            client
          );

        startupLog(
          `Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}, recovered ${ticketPanelSummary.recoveredIds}, errors ${ticketPanelSummary.errors}`
        );
      } catch (error) {
        logger.warn(
          "Could not reconcile ticket panels:",
          error
        );
      }

      /* ========================================================
         VERIFICATION PANEL
         ======================================================== */

      try {
        const verificationPanelSummary =
          await reconcileVerificationPanels(
            client
          );

        startupLog(
          `Verification panel health: scanned ${verificationPanelSummary.scannedGuilds} guilds, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}, missing channel ${verificationPanelSummary.missingChannels}, recovered ${verificationPanelSummary.recoveredIds}, errors ${verificationPanelSummary.errors}`
        );
      } catch (error) {
        logger.warn(
          "Could not reconcile verification panels:",
          error
        );
      }

      /* ========================================================
         REACTION ROLE PANEL HEALTH
         ======================================================== */

      try {
        const reactionRolePanelSummary =
          await reconcileReactionRolePanelHealth(
            client
          );

        startupLog(
          `Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels} panels, healthy ${reactionRolePanelSummary.healthyPanels}, deleted ${reactionRolePanelSummary.deletedPanels}, missing channel ${reactionRolePanelSummary.missingChannels}, recovered ${reactionRolePanelSummary.recoveredIds}, errors ${reactionRolePanelSummary.errors}`
        );
      } catch (error) {
        logger.warn(
          "Could not reconcile reaction role panel health:",
          error
        );
      }

      /* ========================================================
         LEVEL ROLES
         ======================================================== */

      try {
        const levelRoleSummary =
          await reconcileLevelRoles(
            client
          );

        startupLog(
          `Level role sync: scanned ${levelRoleSummary.scannedGuilds} guilds, pruned ${levelRoleSummary.prunedRewardEntries} stale rewards, re-awarded ${levelRoleSummary.rolesReAwarded} roles, errors ${levelRoleSummary.errors}`
        );
      } catch (error) {
        logger.warn(
          "Could not reconcile level roles:",
          error
        );
      }

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
