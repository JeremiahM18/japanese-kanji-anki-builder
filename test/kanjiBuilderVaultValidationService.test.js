const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
    buildKanjiBuilderVaultValidationReport,
    inspectMarkdownStructure,
    isCanonicalIsoDate,
} = require("../src/services/kanjiBuilderVaultValidationService");
const {
    parseArgs,
} = require("../scripts/validateKanjiBuilderVault");

function buildFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-validation-"));
    const repositoryRoot = path.join(root, "repo");
    const vaultRoot = path.join(root, "vault");
    fs.mkdirSync(path.join(repositoryRoot, ".git", "refs", "heads"), { recursive: true });
    fs.mkdirSync(path.join(repositoryRoot, "docs"), { recursive: true });
    fs.mkdirSync(path.join(vaultRoot, "Audit"), { recursive: true });
    const commit = "a".repeat(40);
    fs.writeFileSync(path.join(repositoryRoot, ".git", "HEAD"), "ref: refs/heads/main\n");
    fs.writeFileSync(path.join(repositoryRoot, ".git", "refs", "heads", "main"), `${commit}\n`);
    fs.writeFileSync(path.join(repositoryRoot, "package.json"), JSON.stringify({
        scripts: { "docs:status-audit": "node scripts/audit.js" },
    }));
    fs.writeFileSync(path.join(repositoryRoot, "docs", "policy.md"), "# Policy\n");
    const frontmatter = [
        "---",
        "type: project-status",
        "project: Kanji Builder",
        "status: current",
        "verified_date: 2026-07-26",
        `repository_commit: ${commit}`,
        "---",
    ].join("\n");
    fs.writeFileSync(path.join(vaultRoot, "Home.md"), [
        frontmatter,
        "# Home",
        "",
        "See [[Audit/Status]] and `docs/policy.md`.",
        "Run `npm run docs:status-audit`.",
    ].join("\n"));
    fs.writeFileSync(path.join(vaultRoot, "Audit", "Status.md"), [
        frontmatter.replace("type: project-status", "type: audit"),
        "# Status",
        "",
        "See [[../Home]].",
    ].join("\n"));
    return { repositoryRoot, vaultRoot };
}

test("vault validation parses YAML and validates links, commands, paths, titles, and freshness", () => {
    const fixture = buildFixture();
    const report = buildKanjiBuilderVaultValidationReport({
        ...fixture,
        now: () => new Date("2026-07-26T12:00:00.000Z"),
    });

    assert.equal(report.passed, true);
    assert.deepEqual(report.counts, {
        notes: 2,
        validatedNotes: 2,
        failures: 0,
        warnings: 0,
        skippedSymlinks: 0,
        wikiLinks: 2,
        npmCommands: 1,
        repositoryPaths: 1,
    });
});

test("vault validation rejects impossible dates and ignores headings inside code fences", () => {
    assert.equal(isCanonicalIsoDate("2026-02-29"), false);
    assert.equal(isCanonicalIsoDate("2026-02-28"), true);
    assert.deepEqual(inspectMarkdownStructure([
        "# Real title",
        "```markdown",
        "# Example title",
        "```",
    ].join("\n")), {
        h1Titles: ["Real title"],
        unbalancedFence: false,
    });
    assert.equal(inspectMarkdownStructure("~~~text\nvalue").unbalancedFence, true);
});

test("vault validation fails broken references, stale current commits, duplicate titles, and secret shapes", () => {
    const fixture = buildFixture();
    fs.appendFileSync(path.join(fixture.vaultRoot, "Home.md"), [
        "",
        "[[Missing Note]]",
        "`npm run missing:command`",
        "ghp_123456789012345678901234567890",
    ].join("\n"));
    fs.writeFileSync(path.join(fixture.vaultRoot, "Duplicate.md"), fs.readFileSync(
        path.join(fixture.vaultRoot, "Home.md"),
        "utf8"
    ).replace("repository_commit: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", `repository_commit: ${"b".repeat(40)}`));

    const report = buildKanjiBuilderVaultValidationReport({
        ...fixture,
        now: () => new Date("2026-08-20T12:00:00.000Z"),
        maxAgeDays: 7,
    });

    assert.equal(report.passed, false);
    assert.equal(report.failures.some((entry) => entry.code === "broken-wikilink"), true);
    assert.equal(report.failures.some((entry) => entry.code === "unknown-npm-command"), true);
    assert.equal(report.failures.some((entry) => entry.code === "current-commit-drift"), true);
    assert.equal(report.failures.some((entry) => entry.code === "duplicate-title"), true);
    assert.equal(report.failures.some((entry) => entry.code === "secret-shape"), true);
    assert.equal(report.warnings.some((entry) => entry.code === "stale-verification"), true);
});

test("vault validation CLI requires explicit vault scope and records unknown arguments", () => {
    assert.deepEqual(parseArgs([
        "--vault=C:/Vault/Project",
        "--max-age-days=30",
        "--json",
        "--unexpected",
    ]), {
        json: true,
        maxAgeDays: 30,
        unknownArgs: ["--unexpected"],
        vaultRoot: "C:/Vault/Project",
    });
});
