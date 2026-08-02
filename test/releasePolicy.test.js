const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { loadConfig } = require("../src/config");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

function extractChangelogSection(changelog, heading) {
    const headingText = `## ${heading}`;
    const start = changelog.indexOf(headingText);
    assert.notEqual(start, -1, `Missing changelog section: ${headingText}`);
    const bodyStart = start + headingText.length;
    const nextHeading = changelog.slice(bodyStart).search(/\n## /);
    return nextHeading === -1
        ? changelog.slice(bodyStart)
        : changelog.slice(bodyStart, bodyStart + nextHeading);
}

test("changelog keeps unreleased section and current package version entry", () => {
    const packageJson = JSON.parse(readRepoFile("package.json"));
    const changelog = readRepoFile("CHANGELOG.md");

    assert.equal(changelog.includes("## [Unreleased]"), true);
    assert.equal(changelog.includes(`## [${packageJson.version}] - `), true, `Missing changelog entry for package version ${packageJson.version}`);
});

test("changelog unreleased section stays release-facing", () => {
    const changelog = readRepoFile("CHANGELOG.md");
    const unreleased = extractChangelogSection(changelog, "[Unreleased]");
    const nonEmptyLines = unreleased
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);

    assert.ok(nonEmptyLines.length <= 80, `Unreleased section has ${nonEmptyLines.length} non-empty lines; keep release notes concise.`);
    assert.equal(unreleased.includes("controlled 8-card batch"), false);
    assert.equal(unreleased.includes("controlled 8-card batches"), false);
    assert.match(unreleased, /release-facing/);
    assert.match(unreleased, /git commit messages/);
    assert.match(unreleased, /tracked review manifests/);
});

test("release workflow is tag-driven and publishes release artifacts", () => {
    const workflow = readRepoFile(path.join(".github", "workflows", "release.yml"));
    const packageJson = JSON.parse(readRepoFile("package.json"));
    const expectedReleaseDecision = path.join(
        "docs",
        "releases",
        `v${packageJson.version}-n5-automation-preview.md`
    );

    assert.equal(workflow.includes("tags:"), true);
    assert.equal(workflow.includes('- "v*"'), true);
    assert.equal(workflow.includes("workflow_dispatch:"), true);
    assert.equal(workflow.includes('test "${GITHUB_REF_TYPE}" = "tag"'), true);
    assert.equal(workflow.includes("Release Verify Ubuntu Node 22"), true);
    assert.equal(workflow.includes("Release Bundle Ubuntu Node 22"), true);
    assert.match(workflow, /release_verify:\s*\n(?: {4}.*\n)*? {4}permissions:\s*\n {6}contents: write/u);
    assert.match(workflow, /name: release-verification-\$\{\{ github\.ref_name \}\}[\s\S]*?if-no-files-found: warn/u);
    assert.equal(workflow.includes("npm run security:licenses"), true);
    assert.equal(workflow.includes("npm run security:requirements"), true);
    assert.equal(workflow.includes(".release-bundle/dependency-licenses.json"), true);
    assert.equal(workflow.includes("release-artifacts.sha256"), true);
    assert.equal(workflow.includes("Verify release bundle attestations"), true);
    assert.equal(workflow.includes("gh attestation verify"), true);
    assert.match(
        workflow,
        /name:\s*release-bundle-\$\{\{ github\.ref_name \}\}[\s\S]*?path:\s*\.release-bundle[\s\S]*?if-no-files-found:\s*error[\s\S]*?include-hidden-files:\s*true/u
    );
    assert.equal(workflow.includes("npm run product:release-qa:evidence"), true);
    assert.equal(workflow.includes("npm run product:release-qa:apkg-inspect"), true);
    assert.equal(workflow.includes("--artifact-dir=\"${RELEASE_INPUT_DIR}\" --require-golden"), true);
    assert.equal(workflow.includes("npm run product:readiness:n5 -- --tracked-only"), true);
    assert.equal(workflow.includes("npm run product:readiness:n5\n"), false);
    assert.equal(workflow.includes("gh release upload"), true);
    assert.equal(workflow.includes("--draft=false --prerelease --verify-tag"), true);
    assert.equal(workflow.includes("docs/release-process.md"), true);
    assert.equal(fs.existsSync(path.join(repoRoot, expectedReleaseDecision)), true);
    assert.equal(workflow.includes('release_decision="docs/releases/${GITHUB_REF_NAME}-n5-automation-preview.md"'), true);
    assert.equal(workflow.includes('test -f "${release_decision}"'), true);
    assert.match(workflow, /tar --sort=name[\s\S]*?"\$\{release_decision\}"/u);
});

test("release process doc aligns tag naming with package version", () => {
    const releaseProcess = readRepoFile(path.join("docs", "release-process.md"));

    assert.equal(releaseProcess.includes("Update `package.json` version intentionally."), true);
    assert.equal(releaseProcess.includes("Create Git tags as `v<package.json version>`"), true);
    assert.equal(releaseProcess.includes("Keep `## [Unreleased]` release-facing and concise."), true);
    assert.equal(releaseProcess.includes("npm run supply-chain:audit"), true);
    assert.equal(releaseProcess.includes("npm run security:licenses"), true);
    assert.equal(releaseProcess.includes("npm run security:requirements"), true);
    assert.equal(releaseProcess.includes(".release-bundle/dependency-licenses.json"), true);
    assert.equal(releaseProcess.includes("supply-chain-security.md"), true);
    assert.equal(releaseProcess.includes("CHANGELOG.md"), true);
    assert.equal(releaseProcess.includes("release-qa-checklist.md"), true);
    assert.equal(releaseProcess.includes("compatibility-matrix.md"), true);
    assert.equal(releaseProcess.includes("NOTICE.md"), true);
});

test("product hardening docs exist for exit criteria, accessibility, and content style", () => {
    const exitCriteria = readRepoFile(path.join("docs", "product-exit-criteria.md"));
    const accessibilityChecklist = readRepoFile(path.join("docs", "accessibility-checklist.md"));
    const contentStyleGuide = readRepoFile(path.join("docs", "content-style-guide.md"));
    const compatibilityMatrix = readRepoFile(path.join("docs", "compatibility-matrix.md"));
    const releaseQaChecklist = readRepoFile(path.join("docs", "release-qa-checklist.md"));
    const supplyChainSecurity = readRepoFile(path.join("docs", "supply-chain-security.md"));
    const notice = readRepoFile("NOTICE.md");

    assert.equal(exitCriteria.includes("Product Exit Criteria"), true);
    assert.equal(accessibilityChecklist.includes("Accessibility Checklist"), true);
    assert.equal(contentStyleGuide.includes("Content Style Guide"), true);
    assert.equal(compatibilityMatrix.includes("Compatibility Matrix"), true);
    assert.equal(releaseQaChecklist.includes("Release QA Checklist"), true);
    assert.equal(supplyChainSecurity.includes("Supply Chain Security"), true);
    assert.equal(notice.includes("VOICEVOX Nemo"), true);
});

test("declared Node support matches the ESLint 10 runtime floor", () => {
    const expectedNodeRange = "^20.19.0 || ^22.13.0 || >=24";
    const packageJson = JSON.parse(readRepoFile("package.json"));
    const packageLock = JSON.parse(readRepoFile("package-lock.json"));
    const compatibilityMatrix = readRepoFile(path.join("docs", "compatibility-matrix.md"));

    assert.equal(packageJson.engines.node, expectedNodeRange);
    assert.equal(packageLock.packages[""].engines.node, expectedNodeRange);
    assert.equal(compatibilityMatrix.includes(expectedNodeRange.replaceAll("|", "\\|")), true);
});

test("NOTICE attributes the configured kanji dictionary API and upstream EDRDG data", () => {
    const notice = readRepoFile("NOTICE.md");
    const config = loadConfig({ cwd: repoRoot, env: {}, dotEnvFileName: ".missing-test-env" });
    const apiHost = new URL(config.kanjiApiBaseUrl).hostname;

    assert.equal(notice.includes(apiHost), true, `NOTICE.md must attribute configured kanji API host ${apiHost}.`);
    assert.match(notice, /KANJIDIC2/);
    assert.match(notice, /JMdict/);
    assert.match(notice, /Electronic Dictionary Research and Development Group/);
    assert.match(notice, /CC BY-SA 4\.0/);
});

test("platinum review npm scripts are full-level release gates", () => {
    const packageJson = JSON.parse(readRepoFile("package.json"));
    const platinumScripts = Object.entries(packageJson.scripts)
        .filter(([name, command]) => name.includes("platinum") && command.includes("reviewPlatinum"));

    assert.ok(platinumScripts.length > 0, "Expected package.json to expose platinum review scripts");

    for (const [name, command] of platinumScripts) {
        assert.match(command, /--require-all(?:\s|$)/, `${name} must require full generated-level platinum coverage`);
    }
});

test("sapphire review npm scripts are full-level structural gates", () => {
    const packageJson = JSON.parse(readRepoFile("package.json"));
    const sapphireScripts = Object.entries(packageJson.scripts)
        .filter(([name, command]) => name.includes("sapphire") && command.includes("reviewSapphire"));

    assert.ok(sapphireScripts.length > 0, "Expected package.json to expose sapphire review scripts");

    for (const [name, command] of sapphireScripts) {
        assert.match(command, /--require-all(?:\s|$)/, `${name} must require full generated-level sapphire coverage`);
    }
});
