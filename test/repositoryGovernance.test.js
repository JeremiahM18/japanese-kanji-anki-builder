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

const SOURCE_COUNT_GUARD_LANES = Object.freeze([
    {
        sourceId: "ask_hajimete_jlpt_kanji",
        changelogLabel: "ASK Hajimete",
        productDocLabel: "`ask_hajimete_jlpt_kanji`",
    },
    {
        sourceId: "shin_kanzen_master_kanji",
        changelogLabel: "Shin Kanzen",
        productDocLabel: "`shin_kanzen_master_kanji`",
    },
    {
        sourceId: "nihongo_sou_matome_kanji",
        changelogLabel: "Sou Matome",
        productDocLabel: "`nihongo_sou_matome_kanji`",
    },
]);

const TRACKED_TEST_IGNORED_DATA_READ_ALLOWLIST = Object.freeze(new Set([
    "test/repositoryGovernance.test.js",
]));

const TRACKED_TEST_IGNORED_DATA_READ_PATTERNS = Object.freeze([
    { label: "path.join root data", pattern: /path\.join\(\s*["']data["']/u },
    { label: "path.resolve root data", pattern: /path\.resolve\(\s*["']data["']/u },
    { label: "path.join repoRoot data", pattern: /path\.join\(\s*(?:repoRoot|ROOT_DIR)\s*,\s*["']data["']/u },
    { label: "path.resolve repoRoot data", pattern: /path\.resolve\(\s*(?:repoRoot|ROOT_DIR)\s*,\s*["']data["']/u },
    { label: "fs.readFileSync data path", pattern: /fs\.readFileSync\(\s*["']data[\\/]/u },
    { label: "readRepoFile data path", pattern: /readRepoFile\(\s*["']data[\\/]/u },
]);

function normalizeWhitespace(value) {
    return String(value).replace(/\s+/gu, " ");
}

function getExpectedReviewCounts(sourceInput = {}) {
    const counts = sourceInput.expectedReviewStatusCounts || {};
    return {
        reviewed: counts.reviewed || 0,
        sourceAccessGap: counts.source_access_gap || 0,
        pending: counts.needs_review || 0,
        blocked: counts.blocked || 0,
    };
}

function assertTextCarriesSourceCounts(text, counts, description) {
    const normalized = normalizeWhitespace(text);
    assert.match(normalized, new RegExp(`\`${counts.reviewed}\`\\s+reviewed`, "iu"), `${description} missing reviewed count ${counts.reviewed}.`);
    assert.match(normalized, new RegExp(`\`${counts.sourceAccessGap}\`[^.]*source[-_ ]access[-_ ]gap`, "iu"), `${description} missing source_access_gap count ${counts.sourceAccessGap}.`);
    assert.match(normalized, new RegExp(`\`${counts.pending}\`[^.]*pending`, "iu"), `${description} missing pending count ${counts.pending}.`);
}

function sliceNearLabel(text, label, width = 700) {
    const normalized = normalizeWhitespace(text);
    const index = normalized.indexOf(label);
    assert.notEqual(index, -1, `Missing source count label: ${label}`);
    return normalized.slice(index, index + width);
}

function countReviewedAssignmentsForSource(evidence, sourceId) {
    const relativePath = evidence.assignmentFiles?.[sourceId];
    assert.ok(relativePath, `Missing routed assignment file for ${sourceId}.`);
    const assignmentFile = JSON.parse(readRepoFile(path.join("templates", relativePath)));
    assert.equal(assignmentFile.sourceId, sourceId, `Assignment file sourceId mismatch for ${sourceId}.`);
    return Object.values(assignmentFile.assignments || {})
        .filter((assignment) => (assignment.reviewStatus || "reviewed") === "reviewed")
        .length;
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
        "/SECURITY.md @cover",
        "/package.json @cover",
        "/package-lock.json @cover",
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

test("CI workflow uses tracked-input governance checks and documents local-data gates", () => {
    const workflow = readRepoFile(path.join(".github", "workflows", "ci.yml"));
    const readme = readRepoFile("README.md");

    assert.equal(workflow.includes("npm run data:audit:jlpt:sources -- --governance-strict --limit=25"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:validate"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:reconcile -- --levels=3"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --levels=3 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=kanji-batch-report --levels=3 --queue=substantive-rereview --limit=8 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=kanji-platinum-level --levels=3 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=kanji-field-source-contract --levels=3 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=platinum-governance-gate --levels=3 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:audit:jlpt -- --strict --tracked-only"), true);
    assert.equal(workflow.includes("npm run data:audit:jlpt:words"), true);
    assert.equal(workflow.includes("npm run deck:words:platinum:source-posture -- --levels=5,4"), true);
    assert.equal(workflow.includes("npm run deck:platinum:governance-gate"), false);
    assert.equal(workflow.includes("hashFiles('data/"), false);
    assert.match(workflow, /deck:platinum:governance-gate is intentionally local-data release QA/);
    assert.match(readme, /Clean CI runs `data:obsidian:proof:validate`, `data:obsidian:proof:reconcile -- --levels=3`, `data:obsidian:proof:provider-parity -- --levels=3 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=kanji-platinum-level --levels=3 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=kanji-field-source-contract --levels=3 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=platinum-governance-gate --levels=3 --row-source=tracked-review-set`/);
    assert.match(readme, /Clean CI does not run `deck:platinum:governance-gate` or generated-row Obsidian proof-provider parity/);
    assert.match(readme, /data:audit:jlpt -- --strict --tracked-only/);
});

test("tracked CI tests do not read ignored local data inputs", () => {
    const testFiles = listJavaScriptFiles("test")
        .filter((relativePath) => relativePath.endsWith(".test.js"))
        .sort();
    const violations = [];

    for (const relativePath of testFiles) {
        if (TRACKED_TEST_IGNORED_DATA_READ_ALLOWLIST.has(relativePath)) {
            continue;
        }

        const contents = readRepoFile(relativePath);
        const matches = TRACKED_TEST_IGNORED_DATA_READ_PATTERNS
            .filter(({ pattern }) => pattern.test(contents))
            .map(({ label }) => label);

        if (matches.length > 0) {
            violations.push(`${relativePath}: ${matches.join(", ")}`);
        }
    }

    assert.deepEqual(
        violations,
        [],
        "Tracked CI tests must not read ignored root data/* inputs. Use tracked fixtures/contracts, temp fixtures, or explicit local-data release gates instead."
    );
});

test("README scopes benchmark budget commands as manual local guardrails unless CI wires them", () => {
    const workflow = readRepoFile(path.join(".github", "workflows", "ci.yml"));
    const releaseWorkflow = readRepoFile(path.join(".github", "workflows", "release.yml"));
    const readme = readRepoFile("README.md");

    assert.equal(workflow.includes("bench:build:gate"), false);
    assert.equal(workflow.includes("bench:obsidian-proof-etl:gate"), false);
    assert.equal(workflow.includes("data:benchmark:jlpt:sources:gate"), false);
    assert.equal(releaseWorkflow.includes("bench:build:gate"), false);
    assert.equal(releaseWorkflow.includes("bench:obsidian-proof-etl:gate"), false);
    assert.equal(releaseWorkflow.includes("data:benchmark:jlpt:sources:gate"), false);
    assert.match(readme, /Benchmark budget commands are manual\/local performance guardrails, not GitHub Actions CI gates/);
    assert.match(readme, /`data:benchmark:jlpt:sources:gate`, `bench:obsidian-proof-etl:gate`, and `bench:build:gate` are manual\/local performance guardrails/);
    assert.match(readme, /`bench:build:gate` requires a ready local workspace and writes benchmark output/);
});

test("pull request template calls out release-gate and code-owner expectations", () => {
    const template = readRepoFile(path.join(".github", "PULL_REQUEST_TEMPLATE", "pull_request_template.md"));

    assert.equal(template.includes("`data:audit:jlpt`, read-only `data:audit:jlpt:sources -- --governance-strict --limit=25`, and relevant strict `data:audit:jlpt:source-inputs -- --source=<source-id> --strict` run when JLPT taxonomy, source-evidence inputs, starter curation, golden review placement, or deck-membership logic changed"), true);
    assert.equal(template.includes("`nlp:governance-gate` run when assistive NLP manifests, runtimes, artifact contracts, or governance docs changed"), true);
    assert.equal(template.includes("Source-evidence imports dry-run `data:import:jlpt:source-input -- --source=<source-id>` before any `--write`"), true);
    assert.equal(template.includes("`release:gate` run when packaging, CI, or toolchain behavior changed"), true);
    assert.equal(template.includes("`supply-chain:audit` run when dependency manifests, npm scripts, workflows, or release artifact boundaries changed"), true);
    assert.equal(template.includes("CODEOWNERS review requested when touching protected paths"), true);
});

test("README presents the review tier model before status snapshots", () => {
    const readme = readRepoFile("README.md");
    const tierIndex = readme.indexOf("## Review Tiers");
    const baselineIndex = readme.indexOf("## Current Baseline");
    const tierSection = extractReadmeSection(readme, "Review Tiers");

    assert.notEqual(tierIndex, -1, "README must have a prominent Review Tiers section.");
    assert.notEqual(baselineIndex, -1, "README must keep the Current Baseline section.");
    assert.ok(tierIndex < baselineIndex, "Review Tiers should appear before Current Baseline so the status counts have context.");

    for (const tier of ["Silver", "Gold", "Platinum", "Obsidian"]) {
        assert.match(tierSection, new RegExp(`\\| ${tier} \\|`), `README Review Tiers missing ${tier}.`);
    }
    assert.match(tierSection, /Kanji and word decks run them separately/);
});

test("documentation standard defines enterprise doc schemas and README routing", () => {
    const readme = readRepoFile("README.md");
    const standard = readRepoFile(path.join("docs", "documentation-standard.md"));
    const documentationMap = extractReadmeSection(readme, "Documentation Map");

    assert.match(documentationMap, /\[docs\/documentation-standard\.md\]\(docs\/documentation-standard\.md\)/);
    assert.match(standard, /# Documentation Standard/);
    assert.match(standard, /## Research Basis/);
    assert.match(standard, /https:\/\/developers\.google\.com\/style/);
    assert.match(standard, /https:\/\/google\.github\.io\/styleguide\/docguide\/READMEs\.html/);
    assert.match(standard, /https:\/\/learn\.microsoft\.com\/en-us\/style-guide\/welcome\//);
    assert.match(standard, /https:\/\/support\.apple\.com\/guide\/applestyleguide\/welcome\/web/);
    assert.match(standard, /https:\/\/docs\.oracle\.com\/en\/database\/oracle\/oracle-database\/19\/rnrdm\/database-release-notes\.pdf/);

    for (const heading of [
        "## Universal Schema",
        "## README Schema",
        "## Workflow Document Schema",
        "## Command And Reference Schema",
        "## Status And Count Claim Rule",
        "## Security And Release Schema",
        "## Legal And Provenance Schema",
        "## Update Protocol",
        "## No-Go Rules",
        "## Review Checklist",
    ]) {
        assert.equal(standard.includes(heading), true, `Documentation standard missing heading: ${heading}`);
    }

    assert.match(standard, /Do not use generated TSV, APKG output, SQLite mirrors, or local ignored files as tracked source truth/);
    assert.doesNotMatch(readme, /staged consumer switch/);
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

test("current textbook source-count baselines match tracked manifests and docs", () => {
    const readme = readRepoFile("README.md");
    const changelog = readRepoFile("CHANGELOG.md");
    const productExitCriteria = readRepoFile(path.join("docs", "product-exit-criteria.md"));
    const evidence = JSON.parse(readRepoFile(path.join("templates", "jlpt_kanji_source_evidence.json")));
    const sourceInputs = JSON.parse(readRepoFile(path.join("templates", "jlpt_kanji_source_inputs.json")));
    const sourceSection = extractReadmeSection(readme, "JLPT Kanji Source Evidence At A Glance");
    const sourceRowsById = new Map(extractMarkdownTableRows(sourceSection).map((row) => [row.sourceId, row]));
    const changelogCurrentBaseline = sliceNearLabel(
        changelog,
        "current routed assignment files and pinned worksheet baselines contain",
        900
    );

    for (const lane of SOURCE_COUNT_GUARD_LANES) {
        const sourceInput = sourceInputs.inputs?.[lane.sourceId];
        assert.ok(sourceInput, `Missing source input for ${lane.sourceId}.`);
        assert.ok(sourceInput.expectedReviewStatusCounts, `Missing expected review-status counts for ${lane.sourceId}.`);

        const counts = getExpectedReviewCounts(sourceInput);
        assert.equal(
            counts.reviewed + counts.sourceAccessGap + counts.pending + counts.blocked,
            sourceInput.rowCount,
            `Expected review-status counts must sum to rowCount for ${lane.sourceId}.`
        );
        assert.equal(
            counts.reviewed,
            countReviewedAssignmentsForSource(evidence, lane.sourceId),
            `Reviewed assignment count drifted for ${lane.sourceId}.`
        );

        const readmeRow = sourceRowsById.get(lane.sourceId);
        assert.ok(readmeRow, `Missing README source lane row for ${lane.sourceId}.`);
        assertTextCarriesSourceCounts(readmeRow.currentUse, counts, `README source row for ${lane.sourceId}`);
        assertTextCarriesSourceCounts(
            sliceNearLabel(productExitCriteria, lane.productDocLabel),
            counts,
            `product exit criteria source baseline for ${lane.sourceId}`
        );
        assertTextCarriesSourceCounts(
            sliceNearLabel(changelogCurrentBaseline, lane.changelogLabel),
            counts,
            `CHANGELOG source baseline for ${lane.sourceId}`
        );
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

test("JLPT kanji source-evidence loaders stay in governed source and platinum-origin paths", () => {
    const expectedFilesByLoader = {
        loadJlptKanjiSourceEvidence: [
            "scripts/auditJlptKanjiSourceAccess.js",
            "scripts/auditJlptKanjiSourceEvidence.js",
            "scripts/auditJlptKanjiSourceLevelDeltas.js",
            "scripts/createJlptKanjiSourceInputTemplate.js",
            "scripts/reportJlptKanjiSourceEvidenceCost.js",
            "scripts/reportJlptKanjiSourceInputs.js",
            "src/datasets/jlptKanjiSourceEvidence.js",
            "src/services/platinumKanjiSourceOriginService.js",
        ],
        loadJlptKanjiSourceInputs: [
            "scripts/auditJlptKanjiSourceAccess.js",
            "scripts/auditJlptKanjiSourceLevelDeltas.js",
            "scripts/createJlptKanjiSourceInputTemplate.js",
            "scripts/mergeJlptKanjiSourceBatch.js",
            "scripts/pinJlptKanjiSourceInput.js",
            "scripts/reportJlptKanjiSourceEvidenceCost.js",
            "scripts/reportJlptKanjiSourceInputs.js",
            "scripts/reportJlptKanjiSourceReviewPacket.js",
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

        assert.deepEqual(actualFiles, [...expectedFiles].sort(), `${loaderName} is imported or exported outside the governed source-evidence/platinum-origin paths.`);
    }
});

test("JLPT runtime dataset readers use the governed JLPT JSON loader", () => {
    const files = [
        ...listJavaScriptFiles("scripts"),
        ...listJavaScriptFiles("src"),
    ];
    const forbiddenRawReads = [];

    for (const relativePath of files) {
        const text = readRepoFile(relativePath);
        if (/JSON\.parse\(fs\.readFileSync\(config\.jlptJsonPath/u.test(text)
            || /fs\.readFileSync\(config\.jlptJsonPath/u.test(text)) {
            forbiddenRawReads.push(relativePath);
        }
    }

    assert.deepEqual(
        forbiddenRawReads.sort(),
        [],
        "Scripts and services should use loadJlptOnlyJson(config.jlptJsonPath) so JLPT runtime data stays schema-validated."
    );
});

test("child process execution stays explicit and allowlisted", () => {
    const expectedFiles = [
        "scripts/manageVoicevoxContainer.js",
        "scripts/reportJlptKanjiSourceOcrIntake.js",
        "scripts/runKanjiNlpSignalSupport.js",
        "scripts/runNodeTests.js",
        "scripts/runWordNlpExpansionSupport.js",
        "src/services/ankiPackageService.js",
        "src/services/ciSmokeService.js",
        "src/services/obsidianProofSqliteMirrorService.js",
        "src/services/productReadinessService.js",
        "src/services/toolchainService.js",
    ];
    const files = [
        ...listJavaScriptFiles("scripts"),
        ...listJavaScriptFiles("src"),
    ];
    const childProcessFiles = files
        .filter((relativePath) => readRepoFile(relativePath).includes("node:child_process"))
        .sort();
    const shellEnabledFiles = files
        .filter((relativePath) => /shell\s*:\s*true/u.test(readRepoFile(relativePath)))
        .sort();

    assert.deepEqual(childProcessFiles, [...expectedFiles].sort(), "New child_process usage needs explicit runtime-execution review.");
    assert.deepEqual(shellEnabledFiles, [], "Scripts and services should execute subprocesses without shell expansion.");
});

test("recursive generated-output cleanup stays behind the shared safety guard", () => {
    const files = [
        ...listJavaScriptFiles("scripts"),
        ...listJavaScriptFiles("src"),
    ];
    const rawCleanupFiles = files
        .filter((relativePath) => relativePath !== "src/utils/fs.js")
        .filter((relativePath) => /\b(?:fs|fsp)\.rm(?:Sync)?\(/u.test(readRepoFile(relativePath)))
        .sort();

    assert.deepEqual(
        rawCleanupFiles,
        [],
        "Scripts and services should use removeGeneratedPath/removeGeneratedPathSync for recursive cleanup."
    );
});

test("tracked text release artifacts pin LF line endings", () => {
    const attributes = readRepoFile(".gitattributes");
    const requiredPatterns = [
        ".gitattributes text eol=lf",
        "*.json text eol=lf",
        "*.jsonl text eol=lf",
        "*.md text eol=lf",
        "*.tsv text eol=lf",
        "*.yml text eol=lf",
        "*.yaml text eol=lf",
        "/.github/CODEOWNERS text eol=lf",
    ];

    for (const pattern of requiredPatterns) {
        assert.equal(attributes.includes(pattern), true, `.gitattributes missing ${pattern}`);
    }

    const fixture = readRepoFile(path.join("examples", "n5-mini", "sample-kanji-output.tsv"));
    assert.equal(fixture.includes("\r"), false, "sample kanji TSV fixture must stay LF-only on disk.");
});
