const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const scriptsDir = path.resolve(__dirname, "..", "scripts");

const cliParsers = [
    ["auditDocumentationStatus", require("../scripts/auditDocumentationStatus").parseArgs],
    ["auditStrokeOrderPolicy", require("../scripts/auditStrokeOrderPolicy").parseArgs],
    ["benchmarkExport", require("../scripts/benchmarkExport").parseArgs],
    ["generateCycloneDxSbom", require("../scripts/generateCycloneDxSbom").parseArgs],
    ["generateVoicevoxAudio", require("../scripts/generateVoicevoxAudio").parseArgs],
    ["generateWordExampleVoicevoxAudio", require("../scripts/generateWordExampleVoicevoxAudio").parseArgs],
    ["generateWordVoicevoxAudio", require("../scripts/generateWordVoicevoxAudio").parseArgs],
    ["importKanjiVgStrokeOrder", require("../scripts/importKanjiVgStrokeOrder").parseArgs],
    ["initCuratedStudyData", require("../scripts/initCuratedStudyData").parseArgs],
    ["initSentenceCorpus", require("../scripts/initSentenceCorpus").parseArgs],
    ["initWordStudyData", require("../scripts/initWordStudyData").parseArgs],
    ["normalizeCuratedStudyData", require("../scripts/normalizeCuratedStudyData").parseArgs],
    ["syncWordAudio", require("../scripts/syncWordAudio").parseArgs],
    ["syncWordExampleAudio", require("../scripts/syncWordExampleAudio").parseArgs],
];

test("operational CLI parsers reject unknown arguments instead of silently continuing", () => {
    for (const [commandName, parseArgs] of cliParsers) {
        assert.equal(typeof parseArgs, "function", `${commandName} must export parseArgs for contract testing`);
        assert.throws(
            () => parseArgs(["--definitely-unknown"]),
            /Unknown|Unsupported/u,
            `${commandName} must fail closed on unknown arguments`
        );
    }
});

test("every script parseArgs surface declares fail-closed unknown-argument handling", () => {
    const gaps = fs.readdirSync(scriptsDir)
        .filter((fileName) => fileName.endsWith(".js"))
        .filter((fileName) => {
            const source = fs.readFileSync(path.join(scriptsDir, fileName), "utf8");
            if (!/function\s+parseArgs\s*\(/u.test(source)) {
                return false;
            }
            return !(
                /assertNoUnknownArgs|collectUnknownArg|unknownArgs/u.test(source)
                || /Unknown [^`\r\n]*(?:argument|option|action)/iu.test(source)
                || /Unsupported arguments?/iu.test(source)
            );
        });

    assert.deepEqual(
        gaps,
        [],
        "Every script parseArgs surface must reject or explicitly collect unknown arguments."
    );
});
