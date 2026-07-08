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

function extractRequireSpecifiers(text) {
    return [...text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/gu)]
        .map((match) => match[1]);
}

function resolveRelativeJavaScriptRequire(importerRelativePath, specifier) {
    if (!specifier.startsWith(".")) {
        return null;
    }

    const importerDirectory = path.dirname(path.join(repoRoot, importerRelativePath));
    const absoluteBase = path.resolve(importerDirectory, specifier);
    const candidates = [
        absoluteBase,
        `${absoluteBase}.js`,
        path.join(absoluteBase, "index.js"),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return path.relative(repoRoot, candidate).split(path.sep).join("/");
        }
    }

    return null;
}

function listTextFiles(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const entry = fs.statSync(absolutePath);

    if (entry.isFile()) {
        return [relativePath.split(path.sep).join("/")];
    }

    const files = [];
    for (const directoryEntry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
        const childRelativePath = path.join(relativePath, directoryEntry.name);
        if (directoryEntry.isDirectory()) {
            files.push(...listTextFiles(childRelativePath));
        } else if (/\.(?:md|js|json|jsonl|ya?ml|txt)$/u.test(directoryEntry.name)) {
            files.push(childRelativePath.split(path.sep).join("/"));
        }
    }

    return files;
}

function listReviewLaneTerminologyFiles() {
    return [
        "README.md",
        "CLAUDE.md",
        "CHANGELOG.md",
        "docs",
        "scripts",
        "src",
        "test",
        "templates",
    ].flatMap(listTextFiles).sort();
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

function assertMarkdownSectionOrder(documentText, headings, description) {
    let previousIndex = -1;

    for (const heading of headings) {
        const headingText = `## ${heading}`;
        const currentIndex = documentText.indexOf(headingText);
        assert.notEqual(currentIndex, -1, `${description} missing section: ${headingText}`);
        assert.ok(
            currentIndex > previousIndex,
            `${description} section ${headingText} is out of order.`
        );
        previousIndex = currentIndex;
    }
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

const SCRIPT_TO_SCRIPT_IMPORT_ALLOWLIST = Object.freeze([
    "scripts/auditGithubRepositorySettingsWithGhAuth.js -> scripts/auditGithubRepositorySettings.js",
    "scripts/createJlptTextbookConsensusTemplate.js -> scripts/createJlptKanjiSourceInputTemplate.js",
    "scripts/discoverNlpReadingGapCandidates.js -> scripts/reportWordReadingGapPlan.js",
    "scripts/discoverNlpReadingGapCandidates.js -> scripts/reportWordReadingGapTriage.js",
    "scripts/importJlptWordSourceInput.js -> scripts/reportJlptWordSourceInputs.js",
    "scripts/importVoicevoxPitchAccents.js -> scripts/importKanjiumPitchAccents.js",
    "scripts/reportWordReadingGapPlan.js -> scripts/reportWordReadingGapTriage.js",
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
        "* @JeremiahM18",
        "/.github/workflows/ @JeremiahM18",
        "/src/services/ @JeremiahM18",
        "/scripts/ @JeremiahM18",
        "/test/ @JeremiahM18",
        "/README.md @JeremiahM18",
        "/CONTRIBUTING.md @JeremiahM18",
        "/SECURITY.md @JeremiahM18",
        "/package.json @JeremiahM18",
        "/package-lock.json @JeremiahM18",
    ];

    for (const entry of requiredEntries) {
        assert.equal(codeowners.includes(entry), true, `Missing CODEOWNERS entry: ${entry}`);
    }
});

test("branch protection baseline names the required GitHub checks", () => {
    const branchProtection = readRepoFile(path.join("docs", "branch-protection.md"));
    const policy = JSON.parse(readRepoFile(path.join(".github", "branch-protection.main.json")));
    const requiredChecks = policy.requiredStatusChecks;

    for (const check of requiredChecks) {
        assert.equal(branchProtection.includes(`- \`${check}\``), true, `Missing required check in branch protection doc: ${check}`);
    }

    assert.equal(branchProtection.includes("require `0` approving reviews"), true);
    assert.equal(branchProtection.includes("do not require code-owner review"), true);
    assert.equal(branchProtection.includes("require conversation resolution before merge"), true);
    assert.equal(branchProtection.includes("require branches to be up to date before merging"), true);
    assert.equal(branchProtection.includes("do not allow bypassing required protections"), true);
});

test("CI workflow uses tracked-input governance checks and documents local-data gates", () => {
    const workflow = readRepoFile(path.join(".github", "workflows", "ci.yml"));
    const readme = readRepoFile("README.md");

    assert.equal(workflow.includes("npm run data:audit:jlpt:sources -- --governance-strict --limit=25"), true);
    assert.equal(workflow.includes("npm run security:licenses"), true);
    assert.equal(workflow.includes("npm run security:requirements"), true);
    assert.equal(workflow.includes("npm run security:sdlc-metrics"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:validate"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:reconcile -- --levels=5,4,3,2"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:reconcile -- --deck-kind=word --levels=5,4"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --levels=5,4,3,2 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=kanji-batch-report --levels=5,4,3,2 --queue=substantive-rereview --limit=8 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=kanji-platinum-level --levels=5,4,3,2 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=kanji-field-source-contract --levels=5,4,3,2 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=platinum-governance-gate --levels=5,4,3,2 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=word-rereview-status --deck-kind=word --levels=5,4 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=word-certify-status --deck-kind=word --levels=5,4 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=word-batch-report --deck-kind=word --levels=5,4 --queue=substantive-rereview --limit=8 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=word-platinum-level --deck-kind=word --levels=5,4 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run data:obsidian:proof:provider-parity -- --consumer=word-governance-inputs --deck-kind=word --levels=5,4 --row-source=tracked-review-set"), true);
    assert.equal(workflow.includes("npm run perf:memory:matrix"), true);
    assert.equal(workflow.includes("npm run data:audit:jlpt -- --strict --tracked-only"), true);
    assert.equal(workflow.includes("npm run data:audit:jlpt:words"), true);
    assert.equal(workflow.includes("npm run deck:words:platinum:source-posture -- --levels=5,4"), true);
    assert.equal(workflow.includes("npm run deck:platinum:governance-gate"), false);
    assert.equal(workflow.includes("hashFiles('data/"), false);
    assert.match(workflow, /deck:platinum:governance-gate is intentionally local-data release QA/);
    assert.match(readme, /Clean CI runs `security:licenses`, `security:requirements`, `security:sdlc-metrics`, `data:obsidian:proof:validate`, `data:obsidian:proof:reconcile -- --levels=5,4,3,2`, `data:obsidian:proof:reconcile -- --deck-kind=word --levels=5,4`, `data:obsidian:proof:provider-parity -- --levels=5,4,3,2 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=kanji-platinum-level --levels=5,4,3,2 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=kanji-field-source-contract --levels=5,4,3,2 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=platinum-governance-gate --levels=5,4,3,2 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=word-rereview-status --deck-kind=word --levels=5,4 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=word-certify-status --deck-kind=word --levels=5,4 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=word-batch-report --deck-kind=word --levels=5,4 --queue=substantive-rereview --limit=8 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=word-platinum-level --deck-kind=word --levels=5,4 --row-source=tracked-review-set`/);
    assert.match(readme, /`data:obsidian:proof:provider-parity -- --consumer=word-governance-inputs --deck-kind=word --levels=5,4 --row-source=tracked-review-set`/);
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

test("source services never import CLI scripts", () => {
    const violations = [];

    for (const relativePath of listJavaScriptFiles("src").sort()) {
        const text = readRepoFile(relativePath);
        for (const specifier of extractRequireSpecifiers(text)) {
            const resolved = resolveRelativeJavaScriptRequire(relativePath, specifier);
            if (resolved?.startsWith("scripts/")) {
                violations.push(`${relativePath} -> ${resolved}`);
            }
        }
    }

    assert.deepEqual(
        violations,
        [],
        "Reusable source modules must not import CLI scripts; move shared implementation into src/services and keep scripts as facades."
    );
});

test("script-to-script imports stay explicit while shared logic moves into services", () => {
    const actualEdges = [];

    for (const relativePath of listJavaScriptFiles("scripts").sort()) {
        const text = readRepoFile(relativePath);
        for (const specifier of extractRequireSpecifiers(text)) {
            const resolved = resolveRelativeJavaScriptRequire(relativePath, specifier);
            if (resolved?.startsWith("scripts/")) {
                actualEdges.push(`${relativePath} -> ${resolved}`);
            }
        }
    }

    assert.deepEqual(
        actualEdges.sort(),
        [...SCRIPT_TO_SCRIPT_IMPORT_ALLOWLIST].sort(),
        "New script-to-script imports need explicit governance review. Shared command logic should usually live under src/services."
    );
});

test("README scopes benchmark budget commands as manual local guardrails unless CI wires them", () => {
    const workflow = readRepoFile(path.join(".github", "workflows", "ci.yml"));
    const releaseWorkflow = readRepoFile(path.join(".github", "workflows", "release.yml"));
    const readme = readRepoFile("README.md");

    assert.equal(workflow.includes("bench:build:gate"), false);
    assert.equal(workflow.includes("bench:build:cold-apkg:gate"), false);
    assert.equal(workflow.includes("bench:obsidian-proof-etl:gate"), false);
    assert.equal(workflow.includes("data:benchmark:jlpt:sources:gate"), false);
    assert.equal(releaseWorkflow.includes("bench:build:gate"), false);
    assert.equal(releaseWorkflow.includes("bench:build:cold-apkg:gate"), false);
    assert.equal(releaseWorkflow.includes("bench:obsidian-proof-etl:gate"), false);
    assert.equal(releaseWorkflow.includes("data:benchmark:jlpt:sources:gate"), false);
    assert.match(readme, /Benchmark budget commands are manual\/local performance guardrails, not GitHub Actions CI gates/);
    assert.match(readme, /`data:benchmark:jlpt:sources:gate`, `bench:obsidian-proof-etl:gate`, `bench:build:gate`, and `bench:build:cold-apkg:gate` are manual\/local performance guardrails/);
    assert.match(readme, /`bench:build:gate` runs a warmup before the measured hot-cache build/);
    assert.match(readme, /Both build gates require a ready local workspace and write benchmark output/);
    assert.match(readme, /Before changing timing budgets or claiming a close run is stable, run the benchmark standalone, append `-- --repeat=3`/);
    assert.match(readme, /`perf:memory:matrix` is a CI-safe metadata audit, not a timing budget gate/);
    assert.match(readme, /memory thresholds remain trend-only until repeated samples justify a hard limit/);
});

test("pull request template calls out release-gate and code-owner expectations", () => {
    const template = readRepoFile(path.join(".github", "PULL_REQUEST_TEMPLATE", "pull_request_template.md"));

    assert.equal(template.includes("`data:audit:jlpt`, read-only `data:audit:jlpt:sources -- --governance-strict --limit=25`, and relevant strict `data:audit:jlpt:source-inputs -- --source=<source-id> --strict` run when JLPT taxonomy, source-evidence inputs, starter curation, golden review placement, or deck-membership logic changed"), true);
    assert.equal(template.includes("`nlp:governance-gate` run when assistive NLP manifests, runtimes, artifact contracts, or governance docs changed"), true);
    assert.equal(template.includes("Source-evidence imports dry-run `data:import:jlpt:source-input -- --source=<source-id>` before any `--write`"), true);
    assert.equal(template.includes("`release:gate` run when packaging, CI, or toolchain behavior changed"), true);
    assert.equal(template.includes("`supply-chain:audit` run when dependency manifests, npm scripts, workflows, or release artifact boundaries changed"), true);
    assert.equal(template.includes("`security:advisories` run when dependency manifests or lockfiles changed"), true);
    assert.equal(template.includes("`security:branch-protection` run when CI job names, required checks, branch policy, or protected-branch docs changed"), true);
    assert.equal(template.includes("`security:licenses` run when dependency manifests, lockfiles, dependency-license policy, release-bundle paths, or supply-chain workflows changed"), true);
    assert.equal(template.includes("`security:requirements` run when security requirements, risk records, runbooks, release blockers, workflows, or verification commands changed"), true);
    assert.equal(template.includes("`security:sdlc-metrics` run when training checklist, SDLC metrics, risk register, security requirements, workflows, or security governance docs changed"), true);
    assert.equal(template.includes("`security:secrets` run when configuration, scripts, fixtures, docs, or workflows could introduce credentials"), true);
    assert.equal(template.includes("`security:sbom` run when dependency manifests, lockfiles, release-bundle paths, or supply-chain workflows changed"), true);
    assert.equal(template.includes("CodeQL is expected to pass when source code or GitHub Actions workflows changed"), true);
    assert.equal(template.includes("Release provenance and SBOM attestations are expected when tagged release-bundle workflow paths changed"), true);
    assert.equal(template.includes("CODEOWNERS-covered paths checked against the current single-maintainer policy"), true);
});

test("README presents the review tier model before status snapshots", () => {
    const readme = readRepoFile("README.md");
    const tierIndex = readme.indexOf("## Review Tiers");
    const baselineIndex = readme.indexOf("## Current Baseline");
    const tierSection = extractReadmeSection(readme, "Review Tiers");

    assert.notEqual(tierIndex, -1, "README must have a prominent Review Tiers section.");
    assert.notEqual(baselineIndex, -1, "README must keep the Current Baseline section.");
    assert.ok(tierIndex < baselineIndex, "Review Tiers should appear before Current Baseline so the status counts have context.");

    for (const tier of ["Silver", "Gold", "Sapphire", "Platinum", "Obsidian"]) {
        assert.match(tierSection, new RegExp(`\\| ${tier} \\|`), `README Review Tiers missing ${tier}.`);
    }
    assert.doesNotMatch(tierSection, /\| Candidate \|/, "Candidate must not be presented as a certified README review tier.");
    assert.match(tierSection, /Kanji and word decks run them separately/);
    assert.match(tierSection, /\[docs\/review-system-forward-contract\.md\]\(docs\/review-system-forward-contract\.md\)/);
    assert.match(tierSection, /Candidate rows.*pre-trust queues/s);
    assert.match(tierSection, /Deck Ready.*mechanical artifact states, not trust tiers/s);
    assert.match(tierSection, /Core kanji uses native `templates\/sapphire_n\*_review_set\.json` and `deck:sapphire:\*`/);
    assert.match(tierSection, /words use native `templates\/sapphire_n\*_word_review_set\.json` and `deck:words:sapphire:\*`/);
    assert.match(tierSection, /additional surfaces still retain compatibility command names/);
    assert.match(tierSection, /Platinum \| Card-surface inspection:/);
    assert.match(readme, /existing `platinum_n\*_review_set\.json` manifests remain the tracked Platinum inputs/i);
});

test("forward review system contract locks lane authority and compatibility boundaries", () => {
    const readme = readRepoFile("README.md");
    const contract = readRepoFile(path.join("docs", "review-system-forward-contract.md"));
    const tierGovernance = readRepoFile(path.join("docs", "review-tier-governance.md"));
    const platinumContract = readRepoFile(path.join("docs", "platinum-obsidian-review-contract.md"));
    const platinumPolicy = readRepoFile(path.join("docs", "platinum-review-policy.md"));
    const commandReference = readRepoFile(path.join("docs", "command-reference.md"));
    const kanjiSapphireSchema = readRepoFile(path.join("src", "datasets", "sapphireKanjiReviewSet.js"));
    const wordSapphireSchema = readRepoFile(path.join("src", "datasets", "sapphireWordReviewSet.js"));

    for (const heading of [
        "## Purpose",
        "## Scope",
        "## Authority Boundary",
        "## Source Of Truth",
        "## Forward Lane Matrix",
        "## Current Implementation Status",
        "## Legacy Compatibility Lock",
        "## Consumer Rules",
        "## Prior-Lane Enforcement",
        "## Forbidden Claims",
        "## Migration Policy",
        "## Verification",
        "## Update Triggers",
    ]) {
        assert.equal(contract.includes(heading), true, `Forward contract missing heading: ${heading}`);
    }

    assert.doesNotMatch(contract, /\| Candidate \|/, "Candidate must not be a certified lane in the forward matrix.");
    assert.match(contract, /Candidate rows.*pre-trust queues[\s\S]*not certification gates/);
    assert.match(contract, /\| Sapphire \| Structural certification\.[\s\S]*Empty or incomplete native Sapphire manifests fail closed\. Sapphire is not Platinum and is not Obsidian proof\./);
    assert.match(contract, /\| Platinum \| Card-surface inspection\.[\s\S]*No Platinum claim can come from Sapphire or NLP support alone\./);
    assert.match(contract, /Sapphire requires a passing prior Gold regression for the exact card identity/);
    assert.match(contract, /Platinum requires passing prior Gold and active current-standard Sapphire coverage for the exact card identity/);
    assert.match(contract, /Unscoped forward queues must not advance rows that are missing their required prior-lane coverage/);
    assert.match(contract, /Platinum is implemented through the existing Platinum manifests and command families/);
    assert.match(contract, /Do not describe these Platinum commands as legacy-only or unimplemented/);
    assert.match(contract, /Do not add new structure-only Sapphire work to Platinum naming/);
    assert.match(contract, /Do not use a Platinum command as the forward structural path when a native Sapphire command exists/);
    assert.match(contract, /Platinum is not Obsidian proof/);
    assert.match(contract, /Candidate queues are reviewed, generated, trusted, release-relevant, or certification gates/);
    assert.match(contract, /A denominator can shrink because another lane is incomplete/);
    assert.match(contract, /Create the native artifact and schema before retiring a compatibility name/);
    assert.match(contract, /Prove the new native command passes completed scopes and fails closed for empty scopes/);

    assert.match(kanjiSapphireSchema, /platinumReviewAudit:\s*z\.never\(\)\.optional\(\)/);
    assert.match(kanjiSapphireSchema, /rereviewProvenance:\s*z\.never\(\)\.optional\(\)/);
    assert.match(wordSapphireSchema, /platinumReviewAudit:\s*z\.never\(\)\.optional\(\)/);
    assert.match(wordSapphireSchema, /rereviewProvenance:\s*z\.never\(\)\.optional\(\)/);

    assert.match(commandReference, /`npm run deck:platinum:n5` \| Run the N5 kanji Platinum gate/);
    assert.match(commandReference, /`npm run deck:words:platinum:n5` \| Run the N5 word Platinum gate/);
    assert.match(commandReference, /Forward review gates enforce prior lanes/);
    assert.match(commandReference, /`npm run deck:platinum:batch -- --level=5 --limit=12` \| Build a read-only kanji Platinum packet for Sapphire-eligible rows/);
    assert.match(commandReference, /`npm run deck:words:review:n3` \| Run the N3 word Gold regression benchmark/);
    assert.match(commandReference, /`npm run deck:words:platinum:n3` \| Run the N3 word Platinum gate/);
    assert.match(readme, /\[docs\/review-system-forward-contract\.md\]\(docs\/review-system-forward-contract\.md\)/);
    assert.match(tierGovernance, /\[review-system-forward-contract\.md\]\(review-system-forward-contract\.md\)/);
    assert.match(platinumContract, /\[review-system-forward-contract\.md\]\(review-system-forward-contract\.md\)/);
    assert.match(platinumPolicy, /\[Review System Forward Contract\]\(review-system-forward-contract\.md\)/);
});

test("forward review text names the lane Platinum without temporal qualifiers", () => {
    const files = listReviewLaneTerminologyFiles();
    assert.ok(files.length > 100, "Review-lane terminology guard must scan repo-wide text surfaces.");

    for (const file of files) {
        assert.doesNotMatch(
            readRepoFile(file),
            /\b(?:future|vNext)[-\s]+Platinum\b/i,
            `${file} must name the lane Platinum and describe implementation status separately.`
        );
    }
});

test("CLAUDE N5/N4 word freeze guard requires fail-closed frozen-row proof checks", () => {
    const claude = readRepoFile("CLAUDE.md");
    const freezeSection = extractReadmeSection(claude, "N5/N4 Word Freeze");
    const commandSection = claude.slice(claude.indexOf("N4 word guard checks:"));
    const requiredFreezeCommands = [
        "npm run deck:words:review:n4",
        "npm run deck:words:sapphire:n4",
        "npm run data:obsidian:proof:reconcile -- --deck-kind=word --levels=5,4",
        "npm run deck:words:obsidian:certify-status -- --levels=5,4",
    ];

    assert.match(
        freezeSection,
        /readiness alone is not sufficient for frozen N4 word rows/i,
        "CLAUDE.md must warn that readiness does not prove frozen N4 word certification."
    );
    assert.match(
        freezeSection,
        /Gold protected snippets, current-standard native Sapphire protected snippets, or strict Obsidian certification proof/i,
        "CLAUDE.md must name the frozen-row proof surfaces that readiness misses."
    );

    for (const command of requiredFreezeCommands) {
        assert.equal(
            freezeSection.includes(`\`${command}\``),
            true,
            `N5/N4 word freeze section must require ${command}.`
        );
        assert.match(
            commandSection,
            new RegExp(command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
            `N4 word guard command list must include ${command}.`
        );
    }
});

test("documentation standard defines enterprise doc schemas and README routing", () => {
    const readme = readRepoFile("README.md");
    const standard = readRepoFile(path.join("docs", "documentation-standard.md"));
    const documentationMap = extractReadmeSection(readme, "Documentation Map");
    const readmePurpose = extractReadmeSection(readme, "Purpose");
    const readmeAuthorityBoundary = extractReadmeSection(readme, "Authority Boundary");
    const readmeFailureSemantics = extractReadmeSection(readme, "Failure Semantics");
    const readmeUpdateTriggers = extractReadmeSection(readme, "Update Triggers");

    assertMarkdownSectionOrder(readme, [
        "Purpose",
        "Scope",
        "Authority Boundary",
        "Quick Start",
        "Security Posture",
        "Review Tiers",
        "Current Baseline",
        "Pipeline At A Glance",
        "Deck Model At A Glance",
        "Source Of Truth",
        "JLPT Kanji Source Evidence At A Glance",
        "Product Rules",
        "Failure Semantics",
        "Core Workflows",
        "Verification And Release",
        "Assistive NLP Review Engine",
        "Documentation Map",
        "Update Triggers",
        "Local Data And Outputs",
    ], "README");
    assert.match(readme.slice(0, readme.indexOf("## Purpose")), /# Japanese Kanji Anki Builder[\s\S]*Run this first:[\s\S]*npm run doctor/);
    assert.match(documentationMap, /\[docs\/documentation-standard\.md\]\(docs\/documentation-standard\.md\)/);
    assert.match(documentationMap, /\[docs\/review-system-forward-contract\.md\]\(docs\/review-system-forward-contract\.md\)/);
    assert.match(documentationMap, /\[docs\/review-tier-governance\.md\]\(docs\/review-tier-governance\.md\)/);
    assert.match(standard, /# Documentation Standard/);
    assert.match(standard, /## Research Basis/);
    const researchBasisLines = standard.split(/\r?\n/u);
    for (const line of [
        "- [Google developer documentation style guide](https://developers.google.com/style) and [Google README guidance](https://google.github.io/styleguide/docguide/READMEs.html): project-specific style first, clear technical docs, accessible/global writing, descriptive links, and README files that explain purpose, status, usage, ownership/contact, and links to deeper docs.",
        "- [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/) and [Microsoft Learn contributor guidance](https://learn.microsoft.com/en-us/contribute/content/style-quick-start): task-focused writing, concise/scannable sections, everyday language, code examples where useful, and explicit contribution/update process.",
        "- [Apple Style Guide](https://support.apple.com/guide/applestyleguide/welcome/web): consistent voice across documentation, reference material, training, UI text, inclusive language, international style, and technical notation consistency.",
        "- [Oracle Database Release Notes](https://docs.oracle.com/en/database/oracle/oracle-database/19/rnrdm/database-release-notes.pdf): release-grade structure that states audience, accessibility, related resources, conventions, purpose, platform scope, compatibility/security posture, known issues, unsupported products, and late-breaking limitations.",
    ]) {
        assert.equal(researchBasisLines.some((actualLine) => actualLine === line), true, `Documentation standard missing research basis line: ${line}`);
    }

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
    assert.match(standard, /candidate pre-trust queues, Silver generated surface, Gold regression, Sapphire structural certification, Platinum, Obsidian proof/);
    assert.match(readmePurpose, /controlled output, not casual scrape-and-export deck generation/);
    assert.match(readmeAuthorityBoundary, /orientation and routing document/);
    assert.match(readmeAuthorityBoundary, /does not certify release readiness/);
    assert.match(readmeAuthorityBoundary, /Treat every count and status here as an orientation snapshot/);
    assert.match(readmeFailureSemantics, /Expected backlog failures must stay visible and scoped/);
    assert.match(readmeFailureSemantics, /Blockers require a fix, a rerun, or an explicit accepted-risk record/);
    assert.match(readmeFailureSemantics, /Diagnostic passes do not certify unrelated lanes/);
    assert.match(readmeUpdateTriggers, /Update this README in the same commit/);
    assert.match(readmeUpdateTriggers, /Do not preserve stale status language/);
    assert.doesNotMatch(readme, /staged consumer switch/);
});

test("security operations docs are routed and carry executable governance fields", () => {
    const readme = readRepoFile("README.md");
    const documentationMap = extractReadmeSection(readme, "Documentation Map");
    const requiredDocs = [
        {
            path: "docs/threat-model.md",
            link: "[docs/threat-model.md](docs/threat-model.md)",
            phrases: ["## Purpose", "## Scope", "## Authority Boundary", "## Verification", "## Update Triggers"],
        },
        {
            path: "docs/risk-register.md",
            link: "[docs/risk-register.md](docs/risk-register.md)",
            phrases: ["## Purpose", "## Scope", "## Authority Boundary", "## Register", "## Verification", "## Update Triggers"],
        },
        {
            path: "docs/security-training-checklist.md",
            link: "[docs/security-training-checklist.md](docs/security-training-checklist.md)",
            phrases: ["## Purpose", "## Scope", "## Authority Boundary", "## Required Training Areas", "## Reviewer Readiness Checklist", "## Verification"],
        },
        {
            path: "docs/incident-response.md",
            link: "[docs/incident-response.md](docs/incident-response.md)",
            phrases: ["## Purpose", "## Scope", "## Authority Boundary", "## Severity Classification", "## Triage", "## Post-Incident Review"],
        },
        {
            path: "docs/recovery-and-rollback.md",
            link: "[docs/recovery-and-rollback.md](docs/recovery-and-rollback.md)",
            phrases: ["## Purpose", "## Scope", "## Authority Boundary", "## Release Artifact Recovery", "## Recovery Exit Criteria"],
        },
    ];

    for (const doc of requiredDocs) {
        const text = readRepoFile(doc.path);
        assert.match(documentationMap, new RegExp(doc.link.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
        for (const phrase of doc.phrases) {
            assert.equal(text.includes(phrase), true, `${doc.path} missing ${phrase}`);
        }
        assert.equal(text.includes("git status --short"), true, `${doc.path} must name starting-state verification.`);
    }

    const sdlcAudit = readRepoFile(path.join("docs", "software-development-life-cycle-audit.md"));
    assert.match(sdlcAudit, /\[threat-model\.md\]\(threat-model\.md\)/);
    assert.match(sdlcAudit, /\[risk-register\.md\]\(risk-register\.md\)/);
    assert.match(sdlcAudit, /\[security-training-checklist\.md\]\(security-training-checklist\.md\)/);
    assert.match(sdlcAudit, /\[incident-response\.md\]\(incident-response\.md\)/);
    assert.match(sdlcAudit, /\[recovery-and-rollback\.md\]\(recovery-and-rollback\.md\)/);
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
            "scripts/createJlptKanjiSourceInputTemplate.js",
            "scripts/reportJlptKanjiSourceEvidenceCost.js",
            "src/datasets/jlptKanjiSourceEvidence.js",
            "src/services/databricksSnapshotExportService.js",
            "src/services/jlptKanjiSourceInputReportService.js",
            "src/services/jlptKanjiSourceLevelDeltaCommandService.js",
            "src/services/platinumKanjiSourceOriginService.js",
        ],
        loadJlptKanjiSourceInputs: [
            "scripts/auditJlptKanjiSourceAccess.js",
            "scripts/createJlptKanjiSourceInputTemplate.js",
            "scripts/mergeJlptKanjiSourceBatch.js",
            "scripts/pinJlptKanjiSourceInput.js",
            "scripts/reportJlptKanjiSourceEvidenceCost.js",
            "scripts/reportJlptKanjiSourceReviewPacket.js",
            "src/datasets/jlptKanjiSourceInputs.js",
            "src/services/jlptKanjiSourceInputReportService.js",
            "src/services/jlptKanjiSourceLevelDeltaCommandService.js",
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
        "scripts/auditGithubRepositorySettingsWithGhAuth.js",
        "scripts/auditSecrets.js",
        "scripts/manageVoicevoxContainer.js",
        "scripts/reportJlptKanjiSourceOcrIntake.js",
        "scripts/runKanjiNlpSignalSupport.js",
        "scripts/runNodeTests.js",
        "scripts/runWordNlpExpansionSupport.js",
        "src/services/ankiPackageService.js",
        "src/services/ciSmokeService.js",
        "src/services/databricksSnapshotExportService.js",
        "src/services/deckCloseoutStatusService.js",
        "src/services/focusedVerificationPlanService.js",
        "src/services/laneOpsStatusService.js",
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

test("shipped inference and word ordering paths avoid host-locale string ordering", () => {
    const deterministicOrderingFiles = [
        "src/inference/candidateExtractor.js",
        "src/inference/meaningInference.js",
        "src/inference/ranking.js",
        "src/inference/sentenceInference.js",
        "src/services/wordExportService.js",
    ];

    for (const relativePath of deterministicOrderingFiles) {
        const text = readRepoFile(relativePath);
        assert.doesNotMatch(
            text,
            /\.localeCompare\(/u,
            `${relativePath} is in the shipped inference/word ordering path and must not depend on host locale ordering.`
        );
        assert.match(
            text,
            /compareStableStrings/u,
            `${relativePath} should use compareStableStrings for deterministic string tiebreakers.`
        );
    }
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
