const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSupplyChainAuditReport } = require("../scripts/auditSupplyChain");
const {
    buildDockerRunArgs,
    parseArgs,
} = require("../scripts/manageVoicevoxContainer");
const {
    formatAnkiAudioField,
    formatAnkiStrokeOrderField,
    formatExampleSentence,
    formatNotesWithRuby,
} = require("../src/services/exportService");
const {
    buildWordInventoryExpansionCandidateReport,
    normalizeCandidateSourceRows,
    parseCandidateSourceText,
} = require("../src/services/wordInventoryExpansionCandidateService");
const {
    createEmptyMediaManifest,
    isManagedAssetRelativePath,
    mediaManifestSchema,
    resolveManagedAssetPath,
} = require("../src/services/mediaStore");
const { assertSafeGeneratedPath } = require("../src/utils/fs");

const repoRoot = path.resolve(__dirname, "..");

function makeTempRepo(prefix = "hostile-supply-chain-") {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    for (const relativePath of [
        "package.json",
        "package-lock.json",
        path.join("templates", "dependency_security_overrides.json"),
        path.join("templates", "nlp_model_manifest.json"),
        path.join("src", "services", "nlpEmbeddingModelEvaluationService.js"),
        path.join(".github", "workflows", "codeql.yml"),
        path.join(".github", "workflows", "ci.yml"),
        path.join(".github", "workflows", "release.yml"),
    ]) {
        const sourcePath = path.join(repoRoot, relativePath);
        const targetPath = path.join(tempDir, relativePath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
    }
    return tempDir;
}

test("Anki HTML renderers escape hostile text while preserving only exporter-owned markup", () => {
    const payloads = [
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(1)>",
        "<svg><animate onbegin=alert(1) /></svg>",
        "\" autofocus onfocus=\"alert(1)",
        "javascript:alert(1)",
    ];

    for (const payload of payloads) {
        const sentence = formatExampleSentence({
            japanese: `今日は${payload}`,
            reading: `きょうは${payload}`,
            english: `Today ${payload}`,
        });
        assert.doesNotMatch(sentence, /<(?:script|img|svg|iframe|animate)\b/iu);
        assert.doesNotMatch(sentence, /"\s+on[a-z]+\s*=/iu);

        const notes = formatNotesWithRuby(`悪 （あく） - ${payload}`);
        assert.match(notes, /^<ruby>悪<rt>あく<\/rt><\/ruby> - /u);
        assert.doesNotMatch(notes, /<(?:script|img|svg|iframe|animate)\b/iu);
        assert.doesNotMatch(notes, /"\s+on[a-z]+\s*=/iu);
    }

    const strokeOrder = formatAnkiStrokeOrderField('animations/bad" onerror="alert(1).gif');
    assert.equal(
        strokeOrder,
        '<img src="bad&quot; onerror=&quot;alert(1).gif" alt="Stroke order media" />'
    );
    assert.doesNotMatch(strokeOrder, /" onerror="/iu);

    const audio = formatAnkiAudioField("audio/bad<script>.mp3");
    assert.equal(audio, "[sound:bad&lt;script&gt;.mp3]");
    assert.doesNotMatch(audio, /<script/iu);
});

test("word candidate source parsing treats adversarial rows as inert data", () => {
    const rows = parseCandidateSourceText([
        "word,reading,meaning,notes",
        "\"山川\",\"さんせん\",\"=IMPORTXML(\"\"https://example.invalid\"\",\"\"//x\"\")\",\"<script>alert(1)</script>\"",
        "\"悪\",\"あく／わる\",\"contains, comma\",\"javascript:alert(1)\"",
    ].join("\n"), { format: "csv" });

    assert.equal(rows.length, 2);
    assert.deepEqual(
        normalizeCandidateSourceRows(rows[1]).map((row) => row.key),
        ["悪|あく", "悪|わる"]
    );

    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows: rows,
        targetLevel: 1,
        jlptLevelContract: {
            kanjiLevels: {
                山: 5,
                川: 5,
                悪: 1,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
        kanjiScope: "any",
        sourceLabel: "hostile-fixture",
    });

    assert.equal(report.summary.sourceRows, 2);
    assert.equal(report.summary.normalizedRows, 3);
    assert.equal(report.summary.reviewCandidateRows, 2);
    assert.deepEqual(report.candidates.map((row) => row.key), ["悪|あく", "悪|わる"]);
    assert.match(report.candidates[0].notes, /javascript:alert\(1\)/u);
});

test("media and generated-output path guards reject traversal and absolute paths", () => {
    const mediaRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "hostile-media-path-"));

    try {
        assert.equal(isManagedAssetRelativePath("images/65E5_日-stroke-order.png"), true);
        for (const relativePath of [
            "../secret.txt",
            "images/../secret.txt",
            "images\\secret.txt",
            "/tmp/secret.txt",
            "C:\\temp\\secret.txt",
            "images/\0secret.txt",
            "images//secret.txt",
            "./images/secret.txt",
        ]) {
            assert.equal(isManagedAssetRelativePath(relativePath), false, relativePath);
            assert.throws(
                () => resolveManagedAssetPath(mediaRootDir, "日", relativePath),
                /Invalid managed media asset path/
            );
        }

        const manifest = createEmptyMediaManifest("日");
        manifest.assets.strokeOrderAnimation = {
            kind: "animation",
            path: "animations/../../secret.gif",
            mimeType: "image/gif",
            source: "hostile-fixture",
        };
        assert.throws(() => mediaManifestSchema.parse(manifest), /Invalid managed media asset relative path/);

        const safeOutPath = path.join(repoRoot, "out", "hostile-input", "report.json");
        const allowedRoots = [path.join(repoRoot, "out")];
        assert.equal(assertSafeGeneratedPath(safeOutPath, { allowedRoots }), path.resolve(safeOutPath));
        assert.throws(
            () => assertSafeGeneratedPath(path.join(repoRoot, "package.json"), { allowedRoots }),
            /outside governed generated-output roots/
        );
        assert.throws(
            () => assertSafeGeneratedPath(path.parse(path.resolve(repoRoot)).root),
            /filesystem root/
        );
    } finally {
        fs.rmSync(mediaRootDir, { recursive: true, force: true });
    }
});

test("VOICEVOX Docker helper rejects unknown options and keeps run arguments separated", () => {
    assert.throws(
        () => parseArgs(["start", "--volume", "/host:/container"]),
        /Unknown voicevox container option/
    );
    assert.throws(
        () => parseArgs(["start", "--port=0"]),
        /Invalid VOICEVOX host port/
    );

    const options = parseArgs([
        "start",
        "--container-name=voicevox-test",
        "--image=voicevox/voicevox_nemo_engine:cpu-ubuntu20.04-latest",
        "--host-ip=127.0.0.1",
        "--host-port=50021",
        "--container-port=50121",
    ]);
    const dockerArgs = buildDockerRunArgs(options);

    assert.equal(dockerArgs[0], "run");
    assert.equal(dockerArgs[dockerArgs.indexOf("--name") + 1], "voicevox-test");
    assert.equal(dockerArgs[dockerArgs.indexOf("-p") + 1], "127.0.0.1:50021:50121");
    assert.equal(dockerArgs.includes("--volume"), false);
});

test("supply-chain audit catches dependency and workflow mutation abuse", () => {
    const tempRepo = makeTempRepo();

    try {
        const packageJsonPath = path.join(tempRepo, "package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        packageJson.dependencies.express = "github:attacker/express";
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf-8");

        const ciWorkflowPath = path.join(tempRepo, ".github", "workflows", "ci.yml");
        const ciWorkflowText = fs.readFileSync(ciWorkflowPath, "utf-8")
            .replace(/actions\/checkout@[a-f0-9]{40}/u, "actions/checkout@v4")
            .replace("run: npm ci --ignore-scripts", "run: npm ci")
            .replace(/\r?\n\s+env:\r?\n\s+ONNXRUNTIME_NODE_INSTALL:\s+skip/u, "");
        fs.writeFileSync(ciWorkflowPath, ciWorkflowText, "utf-8");

        const report = buildSupplyChainAuditReport({ cwd: tempRepo });
        const errors = report.errors.join("\n");

        assert.equal(report.ok, false);
        assert.match(errors, /Direct dependency express must come from the npm registry/);
        assert.match(errors, /must pin actions\/checkout@v6\.0\.3 to the reviewed SHA/);
        assert.match(errors, /must use exact npm ci --ignore-scripts bootstrap and npm rebuild lifecycle-activation steps/);
        assert.match(errors, /must set ONNXRUNTIME_NODE_INSTALL: skip/);
    } finally {
        fs.rmSync(tempRepo, { recursive: true, force: true });
    }
});
