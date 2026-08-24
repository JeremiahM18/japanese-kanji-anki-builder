const fs = require("node:fs");
const path = require("node:path");

const {
    buildWordSourceAccessPacket,
    formatWordSourceAccessPacketJson,
    resolveGovernedWordSourceAccessPacketPath,
    validateWordSourceAccessPacket,
} = require("../src/services/jlptWordSourceAccessPacketService");
const { writeFileAtomicSync } = require("../src/utils/fs");
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
        evidenceRole: "jlpt-placement",
        allowedSupportClaims: [],
        surfaceType: "",
        title: "",
        citation: "",
        evidenceRef: "",
        notes: "",
        checkedAt: todayIsoDate(),
        out: "",
        json: false,
        strict: false,
        unknownArgs: [],
    };
    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--source=")) {
            options.source = parseStringOption(arg, "source");
        } else if (arg.startsWith("--evidence-role=")) {
            options.evidenceRole = parseStringOption(arg, "evidence-role");
        } else if (arg.startsWith("--allowed-support-claims=")) {
            options.allowedSupportClaims = parseStringOption(arg, "allowed-support-claims")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean);
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
    return path.join("downloads", "word-source-access-packets", `${sourceId || "unknown-source"}-word-source-access-packet.json`);
}

function resolveGovernedOutPath({ cwd = process.cwd(), sourceId, outPath } = {}) {
    return resolveGovernedWordSourceAccessPacketPath({
        cwd,
        sourceId,
        packetPath: outPath || resolveDefaultOutPath(sourceId),
    });
}

function buildPacketFromOptions(options = {}) {
    return buildWordSourceAccessPacket({
        sourceId: options.source,
        checkedAt: options.checkedAt,
        evidenceRole: options.evidenceRole,
        allowedSupportClaims: options.allowedSupportClaims,
        sourceSurface: {
            type: options.surfaceType,
            title: options.title,
            citation: options.citation,
            evidenceRef: options.evidenceRef,
            notes: options.notes,
        },
    });
}

function run(options = {}) {
    const packet = buildPacketFromOptions(options);
    const validation = validateWordSourceAccessPacket({ packet, expectedSourceId: options.source });
    const outPath = resolveGovernedOutPath({
        sourceId: options.source,
        outPath: options.out,
    });
    const templateOnly = !validation.valid && !options.strict;
    const shouldWrite = validation.valid || (templateOnly && Boolean(options.source || options.out));
    if (shouldWrite) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        const verifiedOutPath = resolveGovernedOutPath({
            sourceId: options.source,
            outPath: path.relative(process.cwd(), outPath),
        });
        writeFileAtomicSync(verifiedOutPath, formatWordSourceAccessPacketJson(packet), "utf8");
    }
    return {
        valid: options.strict ? validation.valid : true,
        packetValid: validation.valid,
        templateOnly,
        wrote: shouldWrite,
        blockers: validation.blockers,
        outPath,
        packet,
        noDeckMutation: true,
    };
}

function formatPacketReport(result = {}) {
    const lines = [
        "JLPT Word Source Access Packet",
        "",
        `Output: ${result.outPath}`,
        `Source: ${result.packet?.sourceId || ""}`,
        `Checked at: ${result.packet?.checkedAt || ""}`,
        `Evidence role: ${result.packet?.evidenceRole || "jlpt-placement"}`,
        `Allowed support claims: ${(result.packet?.allowedSupportClaims || []).join(", ") || "none"}`,
        `Surface type: ${result.packet?.sourceSurface?.type || ""}`,
        `Surface title: ${result.packet?.sourceSurface?.title || ""}`,
        `Evidence ref: ${result.packet?.sourceSurface?.evidenceRef || ""}`,
        `Result: ${result.valid ? "passing" : "blocked"}`,
        `Packet validity: ${result.packetValid ? "complete" : "incomplete-template"}`,
        `Template only: ${result.templateOnly ? "yes" : "no"}`,
        `Wrote packet: ${result.wrote ? "yes" : "no"}`,
        "No deck mutation: yes",
        "",
        "This writes an ignored word source-access packet only. It does not create review rows, import evidence, add words, move words, or touch kanji lanes.",
    ];
    if (result.blockers?.length > 0) {
        lines.push("", "Blockers:");
        for (const blocker of result.blockers) {
            lines.push(`- ${blocker}`);
        }
    }
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:packet:jlpt:word-source-access", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(formatPacketReport(result));
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
    resolveGovernedOutPath,
    run,
};
