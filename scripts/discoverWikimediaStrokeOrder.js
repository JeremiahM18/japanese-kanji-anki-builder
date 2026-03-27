const fs = require("node:fs");
const https = require("node:https");

const { loadConfig } = require("../src/config");
const { buildMediaSourceReport, parseLevelsArgument } = require("../src/services/mediaSourceReportService");
const { discoverWikimediaStrokeOrderForKanji } = require("../src/services/wikimediaStrokeOrderDiscoveryService");

function parseArgs(argv) {
    const options = {
        levels: [5],
        limit: 10,
        json: argv.includes("--json"),
    };

    for (const arg of argv) {
        if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        }
    }

    return options;
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                "User-Agent": "JapaneseKanjiBuilder/1.0 (Commons discovery)",
            },
        }, (response) => {
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => {
                const body = Buffer.concat(chunks).toString("utf-8");
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`Commons API returned ${response.statusCode}: ${body.slice(0, 200)}`));
                    return;
                }

                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(err);
                }
            });
        }).on("error", reject);
    });
}

function formatReport(results) {
    const lines = [];
    lines.push("Japanese Kanji Builder Wikimedia Stroke-Order Discovery");
    lines.push("");

    for (const result of results) {
        lines.push(`- ${result.kanji}`);
        lines.push(`  Image: ${result.image ? result.image.fileName : "not found"}`);
        lines.push(`  Animation: ${result.animation ? result.animation.fileName : "not found"}`);
        if (result.image) {
            lines.push(`  Image page: ${result.image.filePageUrl}`);
        }
        if (result.animation) {
            lines.push(`  Animation page: ${result.animation.filePageUrl}`);
        }
        if (result.diagram && (!result.image || result.diagram.fileName !== result.image.fileName) && (!result.animation || result.diagram.fileName !== result.animation.fileName)) {
            lines.push(`  Diagram fallback: ${result.diagram.fileName}`);
            lines.push(`  Diagram page: ${result.diagram.filePageUrl}`);
        }
    }

    if (results.length === 0) {
        lines.push("No missing kanji were selected for discovery.");
    }

    return `${lines.join("\n")}\n`;
}

async function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const sourceReport = await buildMediaSourceReport({
        jlptOnlyJson,
        strokeOrderImageSourceDir: config.strokeOrderImageSourceDir,
        strokeOrderAnimationSourceDir: config.strokeOrderAnimationSourceDir,
        audioSourceDir: "",
        audioEnabled: false,
        levels: options.levels,
        limit: options.limit,
    });

    const results = [];
    for (const row of sourceReport.rows || []) {
        if (row.hasImage && row.hasAnimation) {
            continue;
        }

        results.push(await discoverWikimediaStrokeOrderForKanji(row.kanji, { fetchJson }));
    }

    if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
    }

    process.stdout.write(formatReport(results));
}

main().catch((err) => {
    console.error(err.stack || err);
    process.exit(1);
});
