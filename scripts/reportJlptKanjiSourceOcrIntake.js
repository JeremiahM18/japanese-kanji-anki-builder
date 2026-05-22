const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

const DEFAULT_ROOT = path.join("downloads", "private", "shin-kanzen-master");
const DEFAULT_LEVEL_DIRS = ["n2", "n3"];
const INPUT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".pdf"]);

const TOOL_CHECKS = [
    {
        id: "tesseract",
        label: "Tesseract OCR",
        commands: [
            { command: "tesseract", args: ["--version"] },
            {
                command: path.join(process.env.USERPROFILE || "", "scoop", "shims", "tesseract.exe"),
                args: ["--version"],
            },
        ],
        requiredFor: "local OCR extraction",
    },
    {
        id: "imagemagick",
        label: "ImageMagick",
        commands: [{ command: "magick", args: ["-version"] }],
        requiredFor: "optional image preprocessing",
    },
    {
        id: "ghostscript",
        label: "Ghostscript",
        commands: [
            { command: "gswin64c", args: ["--version"] },
            { command: "gs", args: ["--version"] },
        ],
        requiredFor: "optional PDF rendering",
    },
    {
        id: "pdftotext",
        label: "Poppler pdftotext",
        commands: [{ command: "pdftotext", args: ["-v"] }],
        requiredFor: "optional searchable PDF text extraction",
        acceptsStderrVersion: true,
    },
    {
        id: "mutool",
        label: "MuPDF mutool",
        commands: [{ command: "mutool", args: ["--version"] }],
        requiredFor: "optional PDF rendering/text extraction",
        acceptsStderrVersion: true,
    },
];

function parseArgs(argv) {
    const options = {
        root: DEFAULT_ROOT,
        levelDirs: DEFAULT_LEVEL_DIRS,
        json: false,
        strict: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--root=")) {
            options.root = parseStringOption(arg, "root");
        } else if (arg.startsWith("--level-dirs=")) {
            options.levelDirs = parseStringOption(arg, "level-dirs")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function safeReaddir(dirPath) {
    try {
        return fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

function collectInputFiles({ rootDir, levelDirs = DEFAULT_LEVEL_DIRS } = {}) {
    const files = [];
    for (const levelDir of levelDirs) {
        const absoluteLevelDir = path.join(rootDir, levelDir);
        for (const entry of safeReaddir(absoluteLevelDir)) {
            if (!entry.isFile()) {
                continue;
            }
            const extension = path.extname(entry.name).toLowerCase();
            if (!INPUT_EXTENSIONS.has(extension)) {
                continue;
            }
            files.push({
                levelDir,
                file: path.join(absoluteLevelDir, entry.name),
                extension,
            });
        }
    }
    return files.sort((a, b) => a.file.localeCompare(b.file));
}

function firstVersionLine(result = {}, acceptsStderrVersion = false) {
    const stdout = String(result.stdout || "").trim();
    const stderr = String(result.stderr || "").trim();
    const source = stdout || (acceptsStderrVersion ? stderr : "");
    return source.split(/\r?\n/).find(Boolean) || "";
}

function checkTool(tool, commandRunner = spawnSync) {
    for (const commandSpec of tool.commands) {
        const result = commandRunner(commandSpec.command, commandSpec.args, {
            encoding: "utf8",
            shell: false,
            windowsHide: true,
        });
        if (!result.error && (result.status === 0 || result.status === 1)) {
            return {
                id: tool.id,
                label: tool.label,
                available: true,
                command: commandSpec.command,
                version: firstVersionLine(result, tool.acceptsStderrVersion),
                requiredFor: tool.requiredFor,
            };
        }
    }
    return {
        id: tool.id,
        label: tool.label,
        available: false,
        command: tool.commands.map((entry) => entry.command).join(" | "),
        version: "",
        requiredFor: tool.requiredFor,
    };
}

function listTesseractLanguages({ tesseractCommand = "tesseract", commandRunner = spawnSync } = {}) {
    const result = commandRunner(tesseractCommand, ["--list-langs"], {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
    });
    if (result.error || result.status !== 0) {
        return [];
    }
    return String(result.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("List of available languages"));
}

function buildOcrIntakeReport({
    rootDir = path.resolve(process.cwd(), DEFAULT_ROOT),
    levelDirs = DEFAULT_LEVEL_DIRS,
    commandRunner = spawnSync,
} = {}) {
    const resolvedRoot = path.resolve(process.cwd(), rootDir);
    const files = collectInputFiles({ rootDir: resolvedRoot, levelDirs });
    const tools = TOOL_CHECKS.map((tool) => checkTool(tool, commandRunner));
    const tesseractTool = tools.find((tool) => tool.id === "tesseract");
    const hasOcrEngine = Boolean(tesseractTool?.available);
    const tesseractLanguages = hasOcrEngine
        ? listTesseractLanguages({
            tesseractCommand: tesseractTool.command,
            commandRunner,
        })
        : [];
    const hasJapaneseLanguage = tesseractLanguages.includes("jpn");
    const hasVerticalJapaneseLanguage = tesseractLanguages.includes("jpn_vert");
    const blockers = [];

    if (files.length === 0) {
        blockers.push("no private scan/image/PDF files found in the configured level directories");
    }
    if (!hasOcrEngine) {
        blockers.push("Tesseract OCR is not available in PATH; install Tesseract with Japanese language data or provide searchable PDFs from a trusted scanner app");
    } else if (!hasJapaneseLanguage) {
        blockers.push("Tesseract is available, but Japanese language data (jpn.traineddata) is missing");
    }

    const status = blockers.length === 0 ? "ready" : files.length === 0 ? "needs_input" : "blocked";

    return {
        status,
        rootDir: resolvedRoot,
        levelDirs,
        acceptedExtensions: [...INPUT_EXTENSIONS].sort(),
        inputFiles: files,
        tools,
        tesseractLanguages,
        hasJapaneseLanguage,
        hasVerticalJapaneseLanguage,
        blockers,
        noDeckMutation: true,
    };
}

function formatReport(report = {}) {
    const lines = [
        "JLPT Kanji Source OCR Intake Preflight",
        "",
        `Result: ${report.status}`,
        `Private source root: ${report.rootDir}`,
        `Level directories: ${(report.levelDirs || []).join(", ")}`,
        `Accepted files: ${report.inputFiles?.length || 0}`,
        "No deck mutation: yes",
        "",
        "This command inventories ignored private source scans and checks local OCR prerequisites. It does not extract source evidence, import assignments, move kanji, move words, update decks, or change readiness.",
        "",
        "Tool checks:",
    ];

    for (const tool of report.tools || []) {
        lines.push(`- ${tool.label}: ${tool.available ? "available" : "missing"}${tool.version ? ` (${tool.version})` : ""}; ${tool.requiredFor}`);
    }
    if (report.tesseractLanguages?.length > 0) {
        lines.push(`- Tesseract languages: ${report.tesseractLanguages.join(", ")}`);
    }

    if (report.inputFiles?.length > 0) {
        lines.push("", "Private input files:");
        for (const file of report.inputFiles) {
            lines.push(`- ${file.levelDir}: ${file.file}`);
        }
    }

    if (report.blockers?.length > 0) {
        lines.push("", "Blockers:");
        for (const blocker of report.blockers) {
            lines.push(`- ${blocker}`);
        }
    }

    return lines.join("\n");
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:audit:jlpt:source-ocr-intake", options.unknownArgs);
    const report = buildOcrIntakeReport({
        rootDir: options.root,
        levelDirs: options.levelDirs,
    });
    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatReport(report)}\n`);
    }
    if (options.strict && report.status !== "ready") {
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
    buildOcrIntakeReport,
    collectInputFiles,
    formatReport,
    listTesseractLanguages,
    parseArgs,
};
