const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
} = require("../src/services/obsidianProofProviderService");
const {
    parseArgs,
} = require("../scripts/reportObsidianWordCertificationStatus");

test("word certification status script parses levels, json, proof provider, and unknown args", () => {
    const options = parseArgs([
        "--levels=5,4",
        "--proof-provider=inline",
        "--json",
        "--unexpected",
    ]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.INLINE);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--unexpected"]);
});

test("word certification status script defaults to N5 and N4 with ledger fallback provider", () => {
    const options = parseArgs([]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE);
    assert.equal(options.json, false);
});

test("word certification status script accepts a scoped default provider", () => {
    const options = parseArgs([], {
        defaultProofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });

    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.INLINE);
});

function writeStaleLocalWordOverlayFixture(rootDir) {
    const starterPath = path.join(process.cwd(), "templates", "starter_word_study_data_n5.json");
    const starterEntries = JSON.parse(fs.readFileSync(starterPath, "utf8"));
    const [key] = Object.keys(starterEntries).filter((entryKey) => (
        Array.isArray(starterEntries[entryKey]?.tags)
            && starterEntries[entryKey].tags.includes("starter")
    ));
    assert.ok(key, "Expected at least one tracked N5 starter word fixture.");
    const staleEntry = {
        ...starterEntries[key],
        meaning: `${starterEntries[key].meaning} stale fixture`,
    };
    const localPath = path.join(rootDir, "stale_word_study_data.json");
    fs.writeFileSync(localPath, `${JSON.stringify({ [key]: staleEntry }, null, 2)}\n`);
    return localPath;
}

function writeJlptOnlyJsonFixture(rootDir) {
    const contractPath = path.join(process.cwd(), "templates", "jlpt_level_contract.json");
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    const jlptOnlyJson = Object.fromEntries(
        Object.entries(contract.kanjiLevels || {})
            .map(([kanji, jlpt]) => [kanji, { jlpt }])
    );
    const fixturePath = path.join(rootDir, "kanji_jlpt_only.json");
    fs.writeFileSync(fixturePath, `${JSON.stringify(jlptOnlyJson, null, 2)}\n`);
    return fixturePath;
}

function runWordObsidianStatusScript(scriptName, { jlptJsonPath, localPath, mediaRootDir }) {
    return spawnSync(
        process.execPath,
        [path.join(process.cwd(), "scripts", scriptName), "--levels=5"],
        {
            cwd: process.cwd(),
            env: {
                ...process.env,
                JLPT_JSON_PATH: jlptJsonPath,
                MEDIA_ROOT_DIR: mediaRootDir,
                WORD_STUDY_DATA_PATH: localPath,
            },
            encoding: "utf8",
            maxBuffer: 20 * 1024 * 1024,
            timeout: 60000,
        }
    );
}

test("word Obsidian status commands print stale local overlay provenance before fail-closed certification results", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-obsidian-overlay-"));
    try {
        const localPath = writeStaleLocalWordOverlayFixture(rootDir);
        const jlptJsonPath = writeJlptOnlyJsonFixture(rootDir);
        const mediaRootDir = path.join(rootDir, "media");
        fs.mkdirSync(mediaRootDir, { recursive: true });
        for (const scriptName of [
            "reportObsidianWordCertificationStatus.js",
            "reportObsidianWordRereviewStatus.js",
        ]) {
            const result = runWordObsidianStatusScript(scriptName, {
                jlptJsonPath,
                localPath,
                mediaRootDir,
            });

            assert.equal(result.error, undefined);
            assert.equal(result.signal, null);
            assert.equal(result.status, 1, result.stderr || result.stdout);
            assert.equal(result.stderr, "");
            assert.match(result.stdout, /Local word overlay provenance:/);
            assert.match(result.stdout, /resolved path:/);
            assert.match(result.stdout, /mtime: \d{4}-\d{2}-\d{2}T/);
            assert.match(result.stdout, /staleness counts: stale starter-derived rows=1;/);
            assert.match(result.stdout, /warning: stale_local_overlay/);
            assert.match(result.stdout, /Result: failing/);
            assert.match(result.stdout, /audio field is empty/);
        }
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});
