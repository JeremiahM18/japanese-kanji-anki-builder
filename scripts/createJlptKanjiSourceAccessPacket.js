const fs = require("node:fs");
const path = require("node:path");

const {
    buildSourceAccessPacket,
    formatSourceAccessPacketJson,
    validateSourceAccessPacket,
} = require("../src/services/jlptKanjiSourceAccessPacketService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
    const options = {
        source: "",
        surfaceType: "",
        title: "",
        citation: "",
        evidenceRef: "",
        notes: "",
        checkedAt: todayIsoDate(),
        out: "",
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--source=")) {
            options.source = parseStringOption(arg, "source");
        } else if (arg.startsWith("--surface-type=")) {
            options.surfaceType = parseStringOption(arg, "surface-type");
        } else if (arg.startsWith("--title=")) {
            options.title = parseStringOption(arg, "title");
        } else if (arg.startsWith("--citation=")) {
            options.citation = parseStringOption(arg, "citation");
        } else if (arg.startsWith("--evidence-ref=")) {
            options.evidenceRef = parseStringOption(arg, "evidence-ref");
        } else if (arg.startsWith("--notes=")) {
            options.notes = parseStringOption(arg, "notes");
        } else if (arg.startsWith("--checked-at=")) {
            options.checkedAt = parseStringOption(arg, "checked-at");
        } else if (arg.startsWith("--out=")) {
            options.out = parseStringOption(arg, "out");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function resolveDefaultOutPath(sourceId) {
    return path.join("downloads", "source-access-packets", `${sourceId || "unknown-source"}-source-access-packet.json`);
}

function buildPacketFromOptions(options = {}) {
    return buildSourceAccessPacket({
        sourceId: options.source,
        checkedAt: options.checkedAt,
        sourceSurface: {
            type: options.surfaceType,
            title: options.title,
            citation: options.citation,
            evidenceRef: options.evidenceRef,
            notes: options.notes,
        },
    });
}

function formatPacketReport({ packetPath, packet, validation } = {}) {
    const lines = [
        "JLPT Kanji Source Access Packet",
        "",
        `Output: ${packetPath}`,
        `Source: ${packet?.sourceId || ""}`,
        `Checked at: ${packet?.checkedAt || ""}`,
        `Surface type: ${packet?.sourceSurface?.type || ""}`,
        `Surface title: ${packet?.sourceSurface?.title || ""}`,
        `Evidence ref: ${packet?.sourceSurface?.evidenceRef || ""}`,
        `Result: ${validation?.valid ? "passing" : "blocked"}`,
        "No deck mutation: yes",
        "",
        "This command writes an ignored source-access packet only. It does not create review rows, import evidence, move kanji, move words, update decks, or change readiness.",
    ];
    if (validation?.blockers?.length > 0) {
        lines.push("", "Blockers:");
        for (const blocker of validation.blockers) {
            lines.push(`- ${blocker}`);
        }
    }
    return lines.join("\n");
}

function run(options = {}) {
    const packet = buildPacketFromOptions(options);
    const validation = validateSourceAccessPacket({ packet, expectedSourceId: options.source });
    const outPath = path.resolve(process.cwd(), options.out || resolveDefaultOutPath(options.source));

    if (validation.valid) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, formatSourceAccessPacketJson(packet), "utf8");
    }

    return {
        valid: validation.valid,
        blockers: validation.blockers,
        outPath,
        packet,
        noDeckMutation: true,
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:packet:jlpt:source-access", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatPacketReport({
            packetPath: result.outPath,
            packet: result.packet,
            validation: result,
        })}\n`);
    }
    if (!result.valid) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    buildPacketFromOptions,
    formatPacketReport,
    main,
    parseArgs,
    run,
};
