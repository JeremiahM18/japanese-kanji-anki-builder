const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

function listJavaScriptFiles(relativeDirectory) {
    const absoluteDirectory = path.join(repoRoot, relativeDirectory);
    const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const relativePath = path.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
            files.push(...listJavaScriptFiles(relativePath));
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(relativePath.split(path.sep).join("/"));
        }
    }

    return files;
}

function extractReadmeSection(readme, heading) {
    const headingText = `## ${heading}`;
    const start = readme.indexOf(headingText);
    assert.notEqual(start, -1, `Missing README section: ${headingText}`);
    const bodyStart = start + headingText.length;
    const nextHeading = readme.slice(bodyStart).search(/\n## /);
    return nextHeading === -1
        ? readme.slice(bodyStart)
        : readme.slice(bodyStart, bodyStart + nextHeading);
}

function extractMarkdownTableRows(sectionText) {
    return sectionText
        .split(/\r?\n/)
        .filter((line) => line.startsWith("| "))
        .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
        .filter((cells) => cells.length > 0 && !cells.every((cell) => /^-+$/.test(cell)))
        .map(([sourceCell, sourceLocation, currentUse]) => {
            const match = sourceCell.match(/^`([^`]+)`$/);
            return match ? { sourceId: match[1], sourceLocation, currentUse } : null;
        })
        .filter((row) => row !== null);
}

function extractMarkdownTableSourceIds(sectionText) {
    return extractMarkdownTableRows(sectionText).map((row) => row.sourceId);
}

test("CODEOWNERS covers critical repository governance paths", () => {
    const codeowners = readRepoFile(path.join(".github", "CODEOWNERS"));
    const requiredEntries = [
        "* @cover",
        "/.github/workflows/ @cover",
        "/src/services/ @cover",
        "/scripts/ @cover",
        "/test/ @cover",
        "/README.md @cover",
        "/CONTRIBUTING.md @cover",
        "/package.json @cover",
    ];

    for (const entry of requiredEntries) {
        assert.equal(codeowners.includes(entry), true, `Missing CODEOWNERS entry: ${entry}`);
    }
});

test("branch protection baseline names the required GitHub checks", () => {
    const branchProtection = readRepoFile(path.join("docs", "branch-protection.md"));
    const requiredChecks = [
        "Verify Ubuntu Node 18",
        "Verify Ubuntu Node 20",
        "Verify Ubuntu Node 22",
        "Smoke ubuntu-latest Node 18",
        "Smoke ubuntu-latest Node 22",
        "Smoke windows-latest Node 18",
        "Smoke windows-latest Node 22",
        "Smoke macos-latest Node 18",
        "Smoke macos-latest Node 22",
        "Release Gate Ubuntu Node 22",
    ];

    for (const check of requiredChecks) {
        assert.equal(branchProtection.includes(`- \`${check}\``), true, `Missing required check in branch protection doc: ${check}`);
    }

    assert.equal(branchProtection.includes("require review from code owners"), true);
    assert.equal(branchProtection.includes("require conversation resolution before merge"), true);
});

test("pull request template calls out release-gate and code-owner expectations", () => {
    const template = readRepoFile(path.join(".github", "PULL_REQUEST_TEMPLATE", "pull_request_template.md"));

    assert.equal(template.includes("`data:audit:jlpt`, read-only `data:audit:jlpt:sources -- --limit=25`, and relevant strict `data:audit:jlpt:source-inputs -- --source=<source-id> --strict` run when JLPT taxonomy, source-evidence inputs, starter curation, golden review placement, or deck-membership logic changed"), true);
    assert.equal(template.includes("Source-evidence imports dry-run `data:import:jlpt:source-input -- --source=<source-id>` before any `--write`"), true);
    assert.equal(template.includes("`release:gate` run when packaging, CI, or toolchain behavior changed"), true);
    assert.equal(template.includes("CODEOWNERS review requested when touching protected paths"), true);
});

test("README source-evidence lane table matches the governed source manifest", () => {
    const readme = readRepoFile("README.md");
    const evidence = JSON.parse(readRepoFile(path.join("templates", "jlpt_kanji_source_evidence.json")));
    const section = extractReadmeSection(readme, "JLPT Kanji Source Evidence At A Glance");
    const readmeSourceIds = extractMarkdownTableSourceIds(section);
    const manifestSourceIds = Object.keys(evidence.sources).sort();

    assert.deepEqual([...new Set(readmeSourceIds)].sort(), manifestSourceIds);
    assert.equal(readmeSourceIds.length, manifestSourceIds.length, "README source lane table contains duplicate source ids.");
});

test("README marks in-review source-evidence lanes as inactive review work", () => {
    const readme = readRepoFile("README.md");
    const evidence = JSON.parse(readRepoFile(path.join("templates", "jlpt_kanji_source_evidence.json")));
    const section = extractReadmeSection(readme, "JLPT Kanji Source Evidence At A Glance");
    const readmeRows = extractMarkdownTableRows(section);
    const readmeRowsBySourceId = new Map(readmeRows.map((row) => [row.sourceId, row]));

    for (const [sourceId, source] of Object.entries(evidence.sources)) {
        if (source.status !== "in_review") {
            continue;
        }

        const row = readmeRowsBySourceId.get(sourceId);
        assert.ok(row, `Missing README source lane row for in-review source: ${sourceId}`);
        assert.match(row.currentUse, /in-review/i);
        assert.match(row.currentUse, /inactive\/non-voting/i);
    }
});

test("JLPT kanji source-evidence assignment files match manifest routing", () => {
    const evidence = JSON.parse(readRepoFile(path.join("templates", "jlpt_kanji_source_evidence.json")));
    const assignmentFiles = evidence.assignmentFiles || {};

    assert.deepEqual(evidence.assignments || {}, {}, "Tracked source-evidence assignments should live in routed per-source files.");
    for (const [sourceId, relativePath] of Object.entries(assignmentFiles)) {
        const assignmentFile = JSON.parse(readRepoFile(path.join("templates", relativePath)));
        assert.equal(assignmentFile.sourceId, sourceId, `Assignment file sourceId mismatch for ${sourceId}.`);
        assert.equal(typeof assignmentFile.assignments, "object", `Assignment file is missing assignments object for ${sourceId}.`);
    }
});

test("JLPT kanji source-evidence loaders stay in read-only governance paths", () => {
    const expectedFilesByLoader = {
        loadJlptKanjiSourceEvidence: [
            "scripts/auditJlptKanjiSourceAccess.js",
            "scripts/auditJlptKanjiSourceEvidence.js",
            "scripts/auditJlptKanjiSourceLevelDeltas.js",
            "scripts/createJlptKanjiSourceInputTemplate.js",
            "scripts/reportJlptKanjiSourceEvidenceCost.js",
            "scripts/reportJlptKanjiSourceInputs.js",
            "src/datasets/jlptKanjiSourceEvidence.js",
        ],
        loadJlptKanjiSourceInputs: [
            "scripts/auditJlptKanjiSourceAccess.js",
            "scripts/auditJlptKanjiSourceLevelDeltas.js",
            "scripts/createJlptKanjiSourceInputTemplate.js",
            "scripts/mergeJlptKanjiSourceBatch.js",
            "scripts/pinJlptKanjiSourceInput.js",
            "scripts/reportJlptKanjiSourceEvidenceCost.js",
            "scripts/reportJlptKanjiSourceInputs.js",
            "src/datasets/jlptKanjiSourceInputs.js",
        ],
        loadJlptOfficialOccurrenceEvidence: [
            "scripts/reportJlptOfficialOccurrences.js",
            "src/datasets/jlptOfficialOccurrenceEvidence.js",
        ],
    };
    const files = [
        ...listJavaScriptFiles("scripts"),
        ...listJavaScriptFiles("src"),
    ];

    for (const [loaderName, expectedFiles] of Object.entries(expectedFilesByLoader)) {
        const actualFiles = files
            .filter((relativePath) => readRepoFile(relativePath).includes(loaderName))
            .sort();

        assert.deepEqual(actualFiles, [...expectedFiles].sort(), `${loaderName} is imported or exported outside the governed source-evidence paths.`);
    }
});
