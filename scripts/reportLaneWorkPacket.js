const fs = require("node:fs");
const path = require("node:path");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { writeFileAtomicSync } = require("../src/utils/fs");
const { readJsonFile } = require("../src/utils/jsonFile");
const {
    DEFAULT_WORK_PACKET_OUT_DIR,
    buildLaneWorkPacket,
    formatLaneWorkPacket,
    formatLaneWorkPacketValidation,
    resolveLaneWorkPacketPath,
    validateLaneWorkPacket,
} = require("../src/services/laneWorkPacketService");

function parseIntegerOption(arg, name, options) {
    const rawValue = parseStringOption(arg, name);
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 0) {
        collectUnknownArg(options, `${name} must be a non-negative integer`);
        return null;
    }
    return parsed;
}

function parseArgs(argv) {
    const options = {
        deckKind: "word",
        lane: "ops",
        levels: [5],
        batchReportPath: "",
        decisionsPath: "",
        verificationResultsPath: "",
        packetPath: "",
        queueBefore: null,
        queueAfter: null,
        runId: "",
        outDir: DEFAULT_WORK_PACKET_OUT_DIR,
        write: false,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--write") {
            options.write = true;
        } else if (arg.startsWith("--deck=")) {
            options.deckKind = parseStringOption(arg, "deck");
        } else if (arg.startsWith("--deck-kind=")) {
            options.deckKind = parseStringOption(arg, "deck-kind");
        } else if (arg.startsWith("--lane=")) {
            options.lane = parseStringOption(arg, "lane");
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--batch-report=")) {
            options.batchReportPath = parseStringOption(arg, "batch-report");
        } else if (arg.startsWith("--decisions=")) {
            options.decisionsPath = parseStringOption(arg, "decisions");
        } else if (arg.startsWith("--verification-results=")) {
            options.verificationResultsPath = parseStringOption(arg, "verification-results");
        } else if (arg.startsWith("--packet=")) {
            options.packetPath = parseStringOption(arg, "packet");
        } else if (arg.startsWith("--validate=")) {
            options.packetPath = parseStringOption(arg, "validate");
        } else if (arg.startsWith("--queue-before=")) {
            options.queueBefore = parseIntegerOption(arg, "queue-before", options);
        } else if (arg.startsWith("--queue-after=")) {
            options.queueAfter = parseIntegerOption(arg, "queue-after", options);
        } else if (arg.startsWith("--run-id=")) {
            options.runId = parseStringOption(arg, "run-id");
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (options.packetPath && options.write) {
        collectUnknownArg(options, "--write is not supported with --packet/--validate");
    }
    if (!options.packetPath && !options.batchReportPath) {
        collectUnknownArg(options, "--batch-report is required when building a lane work packet");
    }
    if (options.write && !options.runId) {
        collectUnknownArg(options, "--run-id is required with --write to avoid packet output collisions");
    }

    return options;
}

function readJsonOrJsonLines(filePath, { label = "JSON file" } = {}) {
    const resolvedPath = path.resolve(filePath);
    const text = fs.readFileSync(resolvedPath, "utf8");
    const trimmed = text.trim();
    if (!trimmed) {
        return [];
    }
    try {
        return JSON.parse(trimmed);
    } catch (error) {
        if (!(error instanceof SyntaxError)) {
            throw error;
        }
    }
    return trimmed
        .split(/\r?\n/u)
        .filter((line) => line.trim())
        .map((line, index) => {
            try {
                return JSON.parse(line);
            } catch (error) {
                if (error instanceof SyntaxError) {
                    throw new Error(`${label} line ${index + 1} contains invalid JSON. Parser detail: ${error.message}`);
                }
                throw error;
            }
        });
}

function readOptionalRecordFile(filePath, { label }) {
    return filePath ? readJsonOrJsonLines(filePath, { label }) : [];
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:work-packet", options.unknownArgs);

    if (options.packetPath) {
        const packet = readJsonFile(path.resolve(options.packetPath), { label: "Lane work packet" });
        const validation = validateLaneWorkPacket(packet);
        if (options.json) {
            process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
        } else {
            process.stdout.write(formatLaneWorkPacketValidation(validation));
        }
        if (!validation.ok) {
            process.exitCode = 1;
        }
        return;
    }

    const batchReport = readJsonFile(path.resolve(options.batchReportPath), { label: "Batch report" });
    const decisions = readOptionalRecordFile(options.decisionsPath, { label: "Decision records" });
    const verificationResults = readOptionalRecordFile(options.verificationResultsPath, {
        label: "Verification result records",
    });
    const packet = buildLaneWorkPacket({
        deckKind: options.deckKind,
        lane: options.lane,
        levels: options.levels,
        batchReport,
        decisions,
        verificationResults,
        queueBefore: options.queueBefore,
        queueAfter: options.queueAfter,
        runId: options.runId,
    });

    if (options.write) {
        const outputPath = resolveLaneWorkPacketPath({
            outDir: options.outDir,
            runId: options.runId,
            deckKind: packet.scope.deckKind,
            lane: packet.scope.lane,
            levels: packet.scope.levels,
        });
        writeFileAtomicSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
        packet.outputPath = outputPath;
    }

    if (options.json) {
        process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
        return;
    }
    process.stdout.write(formatLaneWorkPacket(packet));
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
    readJsonOrJsonLines,
};
