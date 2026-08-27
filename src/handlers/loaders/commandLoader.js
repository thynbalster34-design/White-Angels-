```js
import fs from 'fs/promises';
import path from 'path';
import {
    fileURLToPath,
    pathToFileURL,
} from 'url';

import {
    Collection,
    Routes,
} from 'discord.js';

import {
    logger,
} from '../../utils/logger.js';

import botConfig from '../../config/bot.js';

/* ============================================================
   PATHS
   ============================================================ */

const __filename =
    fileURLToPath(
        import.meta.url
    );

const __dirname =
    path.dirname(
        __filename
    );

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_COMMANDS = 100;

const COMMAND_COUNT_WARN_THRESHOLD = 90;

const REGISTRATION_TIMEOUT_MS = 30000;

/* ============================================================
   SUBCOMMAND INFO
   ============================================================ */

function getSubcommandInfo(
    commandData
) {
    const subcommands = [];

    if (
        !commandData ||
        !Array.isArray(
            commandData.options
        )
    ) {
        return subcommands;
    }

    for (
        const option
        of commandData.options
    ) {
        /*
         * SUB_COMMAND
         */
        if (
            option.type === 1
        ) {
            subcommands.push(
                option.name
            );

            continue;
        }

        /*
         * SUB_COMMAND_GROUP
         */
        if (
            option.type === 2 &&
            Array.isArray(
                option.options
            )
        ) {
            for (
                const subOption
                of option.options
            ) {
                if (
                    subOption.type === 1
                ) {
                    subcommands.push(
                        `${option.name}/${subOption.name}`
                    );
                }
            }
        }
    }

    return subcommands;
}

/* ============================================================
   GET ALL COMMAND FILES
   ============================================================ */

async function getAllFiles(
    directory,
    fileList = []
) {
    const files =
        await fs.readdir(
            directory,
            {
                withFileTypes:
                    true,
            }
        );

    for (
        const file
        of files
    ) {
        const filePath =
            path.join(
                directory,
                file.name
            );

        if (
            file.isDirectory()
        ) {
            /*
             * Modules are not commands.
             */
            if (
                file.name ===
                'modules'
            ) {
                continue;
            }

            await getAllFiles(
                filePath,
                fileList
            );

            continue;
        }

        if (
            file.name.endsWith(
                '.js'
            )
        ) {
            fileList.push(
                filePath
            );
        }
    }

    return fileList;
}

/* ============================================================
   LOAD COMMANDS
   ============================================================ */

export async function loadCommands(
    client
) {
    client.commands =
        new Collection();

    const commandsPath =
        path.join(
            __dirname,
            '../../commands'
        );

    const commandFiles =
        await getAllFiles(
            commandsPath
        );

    logger.info(
        `Found ${commandFiles.length} command files to load`
    );

    const uniqueCommandNames =
        new Set();

    for (
        const filePath
        of commandFiles
    ) {
        try {
            const normalizedPath =
                filePath.replace(
                    /\\/g,
                    '/'
                );

            const commandDir =
                path.dirname(
                    filePath
                );

            const category =
                path.basename(
                    commandDir
                );

            const moduleUrl =
                pathToFileURL(
                    filePath
                ).href;

            const commandModule =
                await import(
                    moduleUrl
                );

            const command =
                commandModule.default ||
                commandModule;

            if (
                !command?.data ||
                typeof command.execute !==
                    'function'
            ) {
                logger.warn(
                    `Command at ${normalizedPath} is missing "data" or "execute".`
                );

                continue;
            }

            if (
                typeof command.data.toJSON !==
                    'function'
            ) {
                logger.warn(
                    `Command at ${normalizedPath} has invalid command data.`
                );

                continue;
            }

            const commandData =
                command.data.toJSON();

            const commandName =
                commandData.name;

            if (
                !commandName
            ) {
                logger.warn(
                    `Command at ${normalizedPath} has no command name.`
                );

                continue;
            }

            if (
                uniqueCommandNames.has(
                    commandName
                )
            ) {
                logger.warn(
                    `Duplicate command name detected: ${commandName} from ${normalizedPath}`
                );

                continue;
            }

            uniqueCommandNames.add(
                commandName
            );

            command.category =
                category;

            command.filePath =
                normalizedPath;

            client.commands.set(
                commandName,
                command
            );

            logger.info(
                `Loaded command: ${commandName} from ${normalizedPath} (category: ${category})`
            );

            const subcommands =
                getSubcommandInfo(
                    commandData
                );

            if (
                subcommands.length > 0
            ) {
                logger.info(
                    `  - Subcommands: ${subcommands.join(', ')}`
                );
            }
        } catch (
            error
        ) {
            logger.error(
                `Error loading command from ${filePath}:`,
                error
            );
        }
    }

    let totalSubcommands = 0;

    for (
        const command
        of client.commands.values()
    ) {
        try {
            const commandData =
                command.data.toJSON();

            totalSubcommands +=
                getSubcommandInfo(
                    commandData
                ).length;
        } catch {
            // Non-fatal.
        }
    }

    logger.info(
        `Loaded ${client.commands.size} commands`
    );

    logger.info(
        `Loaded ${totalSubcommands} subcommands`
    );

    return client.commands;
}

/* ============================================================
   COLLECT COMMAND PAYLOADS
   ============================================================ */

function collectCommandPayloads(
    client
) {
    const commands = [];

    let totalSubcommands = 0;

    const registeredNames =
        new Set();

    for (
        const command
        of client.commands.values()
    ) {
        try {
            if (
                !command?.data ||
                typeof command.data.toJSON !==
                    'function'
            ) {
                logger.warn(
                    'Skipping command without valid data.toJSON()'
                );

                continue;
            }

            const commandJson =
                command.data.toJSON();

            const commandName =
                commandJson.name;

            if (
                !commandName
            ) {
                logger.warn(
                    'Skipping command without a name'
                );

                continue;
            }

            if (
                registeredNames.has(
                    commandName
                )
            ) {
                logger.warn(
                    `Skipping duplicate command: ${commandName}`
                );

                continue;
            }

            registeredNames.add(
                commandName
            );

            commands.push(
                commandJson
            );

            totalSubcommands +=
                getSubcommandInfo(
                    commandJson
                ).length;
        } catch (
            error
        ) {
            logger.error(
                'Error preparing command for registration:',
                error
            );
        }
    }

    return {
        commands,
        totalSubcommands,
    };
}

/* ============================================================
   VALIDATE COMMANDS
   ============================================================ */

function validateCommands(
    commands
) {
    const validationErrors = [];

    for (
        const command
        of commands
    ) {
        if (
            !command?.name
        ) {
            validationErrors.push(
                'Command has no name'
            );

            continue;
        }

        if (
            command.name.length >
            32
        ) {
            validationErrors.push(
                `Command ${command.name} has a name longer than 32 characters`
            );
        }

        if (
            command.description &&
            command.description.length >
                100
        ) {
            validationErrors.push(
                `Command ${command.name} has a description longer than 100 characters`
            );
        }

        if (
            !Array.isArray(
                command.options
            )
        ) {
            continue;
        }

        for (
            const option
            of command.options
        ) {
            if (
                option.name &&
                option.name.length >
                    32
            ) {
                validationErrors.push(
                    `Command ${command.name} option ${option.name} has a name longer than 32 characters`
                );
            }

            if (
                option.description &&
                option.description.length >
                    100
            ) {
                validationErrors.push(
                    `Command ${command.name} option ${option.name} has a description longer than 100 characters`
                );
            }

            if (
                !Array.isArray(
                    option.options
                )
            ) {
                continue;
            }

            for (
                const subOption
                of option.options
            ) {
                if (
                    subOption.name &&
                    subOption.name.length >
                        32
                ) {
                    validationErrors.push(
                        `Command ${command.name} subcommand ${option.name} option ${subOption.name} has a name longer than 32 characters`
                    );
                }

                if (
                    subOption.description &&
                    subOption.description.length >
                        100
                ) {
                    validationErrors.push(
                        `Command ${command.name} subcommand ${option.name} option ${subOption.name} has a description longer than 100 characters`
                    );
                }
            }
        }
    }

    if (
        validationErrors.length > 0
    ) {
        logger.error(
            'Command validation failed:'
        );

        for (
            const error
            of validationErrors
        ) {
            logger.error(
                `  - ${error}`
            );
        }

        throw new Error(
            `Command validation failed with ${validationErrors.length} errors`
        );
    }

    logger.info(
        `Command validation successful for ${commands.length} commands`
    );
}

/* ============================================================
   PREPARE COMMANDS
   ============================================================ */

function prepareCommandsForRegistration(
    commands
) {
    if (
        commands.length >=
        COMMAND_COUNT_WARN_THRESHOLD
    ) {
        logger.warn(
            `Command count (${commands.length}) is near Discord's ${MAX_COMMANDS} command limit`
        );
    }

    if (
        commands.length <=
        MAX_COMMANDS
    ) {
        return commands;
    }

    logger.warn(
        `Command count (${commands.length}) exceeds Discord's ${MAX_COMMANDS} command limit. Truncating.`
    );

    return commands.slice(
        0,
        MAX_COMMANDS
    );
}

/* ============================================================
   REST REQUEST WITH TIMEOUT
   ============================================================ */

async function discordRequest(
    client,
    route,
    body
) {
    logger.info(
        `Discord REST request starting: ${route}`
    );

    const requestPromise =
        client.rest.put(
            route,
            {
                body,
            }
        );

    const timeoutPromise =
        new Promise(
            (_, reject) => {
                const timer =
                    setTimeout(
                        () => {
                            reject(
                                new Error(
                                    `Discord REST request timed out after ${REGISTRATION_TIMEOUT_MS / 1000} seconds`
                                )
                            );
                        },
                        REGISTRATION_TIMEOUT_MS
                    );

                if (
                    typeof timer.unref ===
                    'function'
                ) {
                    timer.unref();
                }
            }
        );

    try {
        const result =
            await Promise.race(
                [
                    requestPromise,
                    timeoutPromise,
                ]
            );

        logger.info(
            `Discord REST request completed: ${route}`
        );

        return result;
    } catch (
        error
    ) {
        logger.error(
            `Discord REST request failed: ${route}`
        );

        logger.error(
            `Discord error name: ${error?.name || 'unknown'}`
        );

        logger.error(
            `Discord error code: ${error?.code || 'unknown'}`
        );

        logger.error(
            `Discord error status: ${error?.status || 'unknown'}`
        );

        logger.error(
            `Discord error message: ${error?.message || error}`
        );

        throw error;
    }
}

/* ============================================================
   GLOBAL COMMANDS
   ============================================================ */

async function registerGlobalCommands(
    client,
    clientId,
    commands,
    totalSubcommands
) {
    if (
        !clientId
    ) {
        throw new Error(
            'CLIENT_ID is required for slash command registration'
        );
    }

    if (
        !client.rest
    ) {
        throw new Error(
            'Discord REST client is not available'
        );
    }

    validateCommands(
        commands
    );

    const commandsToRegister =
        prepareCommandsForRegistration(
            commands
        );

    logger.info(
        `Registering ${commandsToRegister.length} global commands (${totalSubcommands} subcommands)`
    );

    if (
        botConfig.commands?.deleteCommands
    ) {
        logger.info(
            'Clearing existing global commands...'
        );

        await discordRequest(
            client,
            Routes.applicationCommands(
                clientId
            ),
            []
        );

        logger.info(
            'Existing global commands cleared'
        );
    }

    await discordRequest(
        client,
        Routes.applicationCommands(
            clientId
        ),
        commandsToRegister
    );

    logger.info(
        `✅ Successfully registered ${commandsToRegister.length} global commands`
    );
}

/* ============================================================
   REGISTER COMMANDS
   ============================================================ */

export async function registerCommands(
    client,
    options = {}
) {
    const {
        clientId = null,
        guildId = null,
    } = options;

    try {
        if (
            !clientId
        ) {
            throw new Error(
                'CLIENT_ID is required for slash command registration'
            );
        }

        if (
            !client.rest
        ) {
            throw new Error(
                'Discord REST client is not available for command registration'
            );
        }

        const {
            commands,
            totalSubcommands,
        } =
            collectCommandPayloads(
                client
            );

        logger.info(
            `Collected ${commands.length} command payloads`
        );

        validateCommands(
            commands
        );

        const commandsToRegister =
            prepareCommandsForRegistration(
                commands
            );

        /* ======================================================
           GUILD COMMANDS
           ====================================================== */

        if (
            guildId
        ) {
            const route =
                Routes.applicationGuildCommands(
                    clientId,
                    guildId
                );

            logger.info(
                `Registering ${commandsToRegister.length} commands to guild ${guildId}...`
            );

            logger.info(
                `Application ID: ${clientId}`
            );

            logger.info(
                `Guild ID: ${guildId}`
            );

            logger.info(
                `Command names: ${commandsToRegister
                    .map(
                        command =>
                            command.name
                    )
                    .join(', ')}`
            );

            /*
             * Replace ALL commands in this guild.
             */
            await discordRequest(
                client,
                route,
                commandsToRegister
            );

            logger.info(
                `✅ Successfully registered ${commandsToRegister.length} commands to guild ${guildId}`
            );

            /*
             * Read them back from Discord.
             */
            logger.info(
                'Verifying guild commands with Discord...'
            );

            const registeredCommands =
                await client.rest.get(
                    route
                );

            logger.info(
                `Discord currently reports ${registeredCommands.length} guild commands`
            );

            const expected =
                new Set(
                    commandsToRegister.map(
                        command =>
                            command.name
                    )
                );

            const actual =
                new Set(
                    registeredCommands.map(
                        command =>
                            command.name
                    )
                );

            const missing =
                commandsToRegister
                    .map(
                        command =>
                            command.name
                    )
                    .filter(
                        name =>
                            !actual.has(
                                name
                            )
                    );

            if (
                missing.length > 0
            ) {
                logger.error(
                    `Commands missing from Discord after registration: ${missing.join(', ')}`
                );

                throw new Error(
                    `Guild command verification failed. ${missing.length} commands are missing.`
                );
            }

            logger.info(
                '✅ Guild command verification successful'
            );

            return;
        }

        /* ======================================================
           GLOBAL COMMANDS
           ====================================================== */

        await registerGlobalCommands(
            client,
            clientId,
            commands,
            totalSubcommands
        );
    } catch (
        error
    ) {
        logger.error(
            'Error registering commands:',
            error
        );

        throw error;
    }
}

/* ============================================================
   RELOAD COMMAND
   ============================================================ */

export async function reloadCommand(
    client,
    commandName
) {
    const command =
        client.commands.get(
            commandName
        );

    if (
        !command
    ) {
        return {
            success:
                false,

            message:
                `Command "${commandName}" not found`,
        };
    }

    try {
        const commandPath =
            path.resolve(
                command.filePath
            );

        const moduleUrl =
            pathToFileURL(
                commandPath
            );

        moduleUrl.searchParams.set(
            't',
            Date.now().toString()
        );

        const imported =
            await import(
                moduleUrl.href
            );

        const newCommand =
            imported.default ||
            imported;

        if (
            !newCommand?.data ||
            typeof newCommand.execute !==
                'function'
        ) {
            throw new Error(
                `Reloaded command "${commandName}" is missing data or execute`
            );
        }

        newCommand.category =
            command.category;

        newCommand.filePath =
            command.filePath;

        client.commands.set(
            commandName,
            newCommand
        );

        logger.info(
            `Reloaded command: ${commandName}`
        );

        return {
            success:
                true,

            message:
                `Successfully reloaded command "${commandName}"`,
        };
    } catch (
        error
    ) {
        logger.error(
            `Error reloading command "${commandName}":`,
            error
        );

        return {
            success:
                false,

            message:
                `Error reloading command: ${error.message}`,
        };
    }
}
```
