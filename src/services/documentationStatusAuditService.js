const fs = require("node:fs");
const path = require("node:path");

const { buildWordReviewStandardSummary } = require("./platinumReviewService");
const { buildWordSapphireReviewStandardSummary } = require("./sapphireWordReviewService");

function readJson(filePath, { readFileSync = fs.readFileSync } = {}) {
    return JSON.parse(readFileSync(filePath, "utf8"));
}

function readText(filePath, { existsSync = fs.existsSync, readFileSync = fs.readFileSync } = {}) {
    if (!existsSync(filePath)) {
        return null;
    }
    return readFileSync(filePath, "utf8");
}

function countWordContractDenominator(contract = {}, level) {
    return Object.values(contract?.wordLevels || {})
        .filter((entry) => Number(entry?.jlpt) === Number(level))
        .length;
}

function countKanjiContractDenominator(contract = {}, level) {
    return Number(contract?.inventoryCounts?.[String(level)] || 0);
}

function sumLevelCounts(contract = {}, levels = [], counter) {
    return levels.reduce((total, level) => total + counter(contract, level), 0);
}

function countWordGold(entries = []) {
    return new Set((Array.isArray(entries) ? entries : []).map((entry) => {
        const reading = Array.isArray(entry?.readingIncludes) ? entry.readingIncludes.join(" / ") : "";
        return `${entry?.word || ""}|${reading}`;
    }).filter((key) => key !== "|")).size;
}

function countJsonlRecords(filePath, { existsSync = fs.existsSync, readFileSync = fs.readFileSync } = {}) {
    if (!existsSync(filePath)) {
        return 0;
    }
    return readFileSync(filePath, "utf8")
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .length;
}

function buildLaneSnapshot(count, denominator) {
    const missing = Math.max(0, Number(denominator || 0) - Number(count || 0));
    return {
        count,
        denominator,
        missing,
        ratio: `${count}/${denominator}`,
    };
}

function buildProductDocumentationSnapshot({
    rootDir = process.cwd(),
    existsSync = fs.existsSync,
    readFileSync = fs.readFileSync,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const templatesDir = path.join(resolvedRoot, "templates");
    const proofLedgerDir = path.join(templatesDir, "obsidian_proof_ledger");
    const kanjiContract = readJson(path.join(templatesDir, "jlpt_level_contract.json"), { readFileSync });
    const wordContract = readJson(path.join(templatesDir, "jlpt_word_level_contract.json"), { readFileSync });
    const allLevels = [5, 4, 3, 2, 1];
    const lockedKanjiLevels = [5, 4, 3, 2];
    const lockedWordLevels = [5, 4];
    const countLedger = (deckKind, levels) => levels.reduce((total, level) => {
        return total + countJsonlRecords(path.join(proofLedgerDir, `${deckKind}_n${level}.jsonl`), { existsSync, readFileSync });
    }, 0);

    const wordN5Denominator = countWordContractDenominator(wordContract, 5);
    const wordN4Denominator = countWordContractDenominator(wordContract, 4);
    const wordN5ObsidianProof = countLedger("word", [5]);
    const wordN4ObsidianProof = countLedger("word", [4]);

    return {
        kanjiDenominator: sumLevelCounts(kanjiContract, allLevels, countKanjiContractDenominator),
        wordDenominator: sumLevelCounts(wordContract, allLevels, countWordContractDenominator),
        kanjiLockedDenominator: sumLevelCounts(kanjiContract, lockedKanjiLevels, countKanjiContractDenominator),
        wordLockedDenominator: sumLevelCounts(wordContract, lockedWordLevels, countWordContractDenominator),
        kanjiObsidianProof: countLedger("kanji", lockedKanjiLevels),
        wordObsidianProof: wordN5ObsidianProof + wordN4ObsidianProof,
        wordN5Denominator,
        wordN4Denominator,
        wordN5ObsidianProof,
        wordN4ObsidianProof,
    };
}

function buildN3WordDocumentationSnapshot({
    rootDir = process.cwd(),
    readFileSync = fs.readFileSync,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const templatesDir = path.join(resolvedRoot, "templates");
    const level = 3;
    const wordContract = readJson(path.join(templatesDir, "jlpt_word_level_contract.json"), { readFileSync });
    const denominator = countWordContractDenominator(wordContract, level);
    const goldEntries = readJson(path.join(templatesDir, "golden_n3_word_review_set.json"), { readFileSync });
    const sapphireEntries = readJson(path.join(templatesDir, "sapphire_n3_word_review_set.json"), { readFileSync });
    const platinumEntries = readJson(path.join(templatesDir, "platinum_n3_word_review_set.json"), { readFileSync });
    const sapphireSummary = buildWordSapphireReviewStandardSummary(sapphireEntries);
    const platinumSummary = buildWordReviewStandardSummary(platinumEntries);

    return {
        level,
        denominator,
        silver: buildLaneSnapshot(denominator, denominator),
        gold: buildLaneSnapshot(countWordGold(goldEntries), denominator),
        sapphire: buildLaneSnapshot(sapphireSummary.currentStandardCount || 0, denominator),
        platinum: buildLaneSnapshot(platinumSummary.currentStandardCount || 0, denominator),
        obsidianProofRecorded: false,
    };
}

function buildN3WordStatusPhrases(snapshot) {
    const goldPosture = snapshot.gold.missing === 0 ? "complete Gold" : "partial Gold";

    return {
        readmeGoldStatus: `Gold is \`${snapshot.gold.ratio}\` current-standard with \`${snapshot.gold.missing}\` generated rows still missing Gold; Sapphire is \`${snapshot.sapphire.ratio}\` current-standard with \`${snapshot.sapphire.missing}\` generated rows still missing Sapphire; Platinum remains \`${snapshot.platinum.ratio}\` current-standard with \`${snapshot.platinum.missing}\` generated rows still missing Platinum. Obsidian proof is not recorded for N3 words.`,
        changelogGoldStatus: `N3 word Gold review from \`8/${snapshot.denominator}\` to \`${snapshot.gold.ratio}\``,
        changelogGoldBacklog: `Gold now has \`${snapshot.gold.missing}\` generated rows still missing`,
        claudeWordPosture: `N3 word work has a complete Silver generated surface plus ${goldPosture} (\`${snapshot.gold.ratio}\`), current-standard Sapphire structural review in progress (\`${snapshot.sapphire.ratio}\`), and Platinum (\`${snapshot.platinum.ratio}\`); N3 word Obsidian proof is not recorded.`,
        workflowGoldCadenceHeading: "### N3 Gold word review cadence",
        workflowGoldScaffoldCommand: "`npm run deck:words:gold:scaffold -- --level=3 --limit=10`",
        commandReferenceAuditCommand: "`npm run docs:status-audit`",
        orderedLaneFlow: "Silver/Gold/Sapphire/Platinum/Obsidian",
    };
}

function buildProductStatusPhrases(productSnapshot = {}) {
    const wordN5Denominator = productSnapshot.wordN5Denominator ?? 300;
    const wordN4Denominator = productSnapshot.wordN4Denominator ?? 700;
    const wordN5ObsidianProof = productSnapshot.wordN5ObsidianProof ?? 300;
    const wordN4ObsidianProof = productSnapshot.wordN4ObsidianProof ?? 700;
    const wordN5Ratio = `${wordN5ObsidianProof}/${wordN5Denominator}`;
    const wordN4Ratio = `${wordN4ObsidianProof}/${wordN4Denominator}`;
    const wordLockedRatio = `${productSnapshot.wordObsidianProof}/${productSnapshot.wordLockedDenominator}`;
    const wordLockedUncertified = Math.max(0, Number(productSnapshot.wordLockedDenominator || 0) - Number(productSnapshot.wordObsidianProof || 0));
    const wordN5Uncertified = Math.max(0, Number(wordN5Denominator || 0) - Number(wordN5ObsidianProof || 0));
    const wordN4Uncertified = Math.max(0, Number(wordN4Denominator || 0) - Number(wordN4ObsidianProof || 0));

    return {
        employerGeneratedDenominators: `Current generated denominators cover \`${productSnapshot.kanjiDenominator}\` core kanji rows and \`${productSnapshot.wordDenominator}\` word rows across JLPT N5-N1.`,
        employerWordDenominator: `| Words | \`${productSnapshot.wordDenominator}/${productSnapshot.wordDenominator}\` across N5-N1 | \`${productSnapshot.wordObsidianProof}/${productSnapshot.wordDenominator}\` |`,
        systemWordDenominator: `| Words | ${productSnapshot.wordDenominator} | ${productSnapshot.wordObsidianProof} |`,
        readmeN5KanjiObsidian: "| N5 kanji | `80/80` Obsidian-certified",
        readmeN4KanjiObsidian: "| N4 kanji | `212/212` Obsidian-certified",
        readmeN3KanjiObsidian: "| N3 kanji | `341/341` Obsidian-certified",
        readmeN2KanjiObsidian: "| N2 kanji | `349/349` Obsidian-certified",
        readmeN5WordObsidian: `| N5 word | \`${wordN5Ratio}\` strict word Obsidian-certified`,
        readmeN4WordObsidian: `| N4 word | \`${wordN4Ratio}\` strict word Obsidian-certified`,
        claudeFrozenWordObsidian: `N5 and N4 Obsidian-certified subsets are strict Obsidian-certified at \`${wordLockedRatio}\` across current N5/N4 generated rows, with N5 at \`${wordN5Ratio}\` and N4 at \`${wordN4Ratio}\``,
        productExitN5WordObsidian: `N5 word: strict non-human governed native/fluent-quality word Obsidian content certification covers \`${wordN5Ratio}\` current generated rows`,
        productExitN4WordObsidian: `N4 word: strict non-human governed native/fluent-quality word Obsidian content certification covers \`${wordN4Ratio}\` current generated rows`,
        releaseQaWordObsidian: `N5 word is strict non-human governed native/fluent-quality Obsidian-certified at \`${wordN5Ratio}\`; N4 word is strict non-human governed native/fluent-quality Obsidian-certified at \`${wordN4Ratio}\`; the ${wordLockedUncertified} current N5/N4 word v2 Silver additions (${wordN5Uncertified} N5, ${wordN4Uncertified} N4) are not release-certifiable until lower lanes and Obsidian proof catch up`,
        releaseProcessObsidianFirst: "first confirm the fail-closed Obsidian native/fluent-quality content-certification gate and its lower-lane prerequisite gates",
        systemObsidianProofNode: "Proof + natural-language certification",
        closeoutLowerLaneMatrix: "lower-lane Silver/Gold/Sapphire/Platinum count matrix",
    };
}

function buildWordExpansionDoctrinePhrases() {
    return {
        sourceDepthClaimLimiter: "Source-depth is not a Silver blocker; it is a claim limiter.",
        sourceAdequacyNonBlocker: "`deck:words:source-adequacy` may fail evidence depth while free labeled expansion remains allowed.",
        dictionaryCommonPoolExtraLane: "The dictionary common pool is part of the extra expansion lane, not a separate source-depth lane.",
        dictionaryCommonPoolRoute: "JMdict containment/commonness discovery",
        dictionaryCommonPoolLabels: "Dictionary common-pool rows must remain labeled `DICTIONARY COMMON POOL` plus `Source level claim unverified`.",
        dictionaryCommonPoolCommandReference: "Continue the same extra expansion lane with the `DICTIONARY COMMON POOL`",
        dictionaryCommonPoolQualityFilter: "The default dictionary common-pool view is an editorial shortlist over an audit-visible raw pool, not the raw pool itself.",
        dictionaryCommonPoolLearnerUtilityOrder: "Dictionary common-pool editorial queues are ordered by a transparent learner-utility score before the `200`-row cap is applied.",
        dictionaryCommonPoolLearnerUtilityComponents: "everyday usefulness, concrete/common domain fit, target-kanji reinforcement value, duplicate or near-duplicate safety, specialized/proper-noun penalty signals, exampleability, and pitch/audio/media readiness",
        dictionaryCommonPoolLearnerUtilityBoundary: "The score is an ordering signal only, never card approval.",
        dictionaryCommonPoolOutsideSupport: "Outside-JLPT and higher-level support kanji are label/review needs, not automatic common-pool deprioritization.",
        dictionaryCommonPoolRawCommand: "`--common-pool-mode=raw`",
        expansionTargetMinimums: "Expansion targets are useful minimums, not hard caps or approval quotas: N5 ~800, N4 ~1000, N3 ~2250, N2 ~2250, and N1 ~4000 unique governed words.",
        expansionTargetActivation: "Target-progress reporting starts after reading expansion; it must not activate common-word expansion before reading work is exhausted.",
        expansionTargetQualityBoundary: "Missing a target is never permission to accept weak rows",
        expansionStatusTargetProgress: "Show governed unique word progress against the useful-minimum expansion targets",
        paidSourceBoundary: "Paid/private sources are optional future improvements, not a prerequisite for free labeled word expansion.",
    };
}

function extractChangelogUnreleased(changelogText = "") {
    const start = changelogText.indexOf("## [Unreleased]");
    if (start === -1) {
        return "";
    }
    const rest = changelogText.slice(start + "## [Unreleased]".length);
    const nextRelease = rest.search(/\n## \[/u);
    return nextRelease === -1 ? rest : rest.slice(0, nextRelease);
}

function addFailure(failures, condition, message) {
    if (!condition) {
        failures.push(message);
    }
}

function getDocumentedNpmScripts(commandReferenceText = "") {
    const documented = new Set();
    for (const match of commandReferenceText.matchAll(/`npm run ([A-Za-z0-9:_-]+)/gu)) {
        documented.add(match[1]);
    }
    if (/`npm test`/u.test(commandReferenceText)) {
        documented.add("test");
    }
    if (/`npm start`/u.test(commandReferenceText)) {
        documented.add("start");
    }
    return documented;
}

function findUndocumentedPackageScripts(packageJsonText = "", commandReferenceText = "") {
    let packageJson;
    try {
        packageJson = JSON.parse(packageJsonText);
    } catch {
        return ["<package.json parse failed>"];
    }
    const documented = getDocumentedNpmScripts(commandReferenceText);
    return Object.keys(packageJson?.scripts || {})
        .filter((scriptName) => !documented.has(scriptName))
        .sort();
}

function collectMarkdownFiles(rootDir = process.cwd(), {
    existsSync = fs.existsSync,
    readdirSync = fs.readdirSync,
    statSync = fs.statSync,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const markdownFiles = [];
    const maybeAddFile = (relativePath) => {
        const fullPath = path.join(resolvedRoot, relativePath);
        if (existsSync(fullPath) && statSync(fullPath).isFile() && relativePath.endsWith(".md")) {
            markdownFiles.push(relativePath.replace(/\\/gu, "/"));
        }
    };
    const walk = (relativeDir) => {
        const fullDir = path.join(resolvedRoot, relativeDir);
        if (!existsSync(fullDir) || !statSync(fullDir).isDirectory()) {
            return;
        }
        for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
            const relativePath = path.join(relativeDir, entry.name);
            if (entry.isDirectory()) {
                walk(relativePath);
            } else if (entry.isFile() && entry.name.endsWith(".md")) {
                markdownFiles.push(relativePath.replace(/\\/gu, "/"));
            }
        }
    };

    for (const entry of readdirSync(resolvedRoot, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
            maybeAddFile(entry.name);
        }
    }
    for (const relativeDir of ["docs", ".github", "examples", "data"]) {
        walk(relativeDir);
    }
    return [...new Set(markdownFiles)].sort();
}

function normalizeMarkdownLinkTarget(target = "") {
    let normalized = target.trim();
    if (normalized.startsWith("<")) {
        const closing = normalized.indexOf(">");
        normalized = closing === -1 ? normalized.slice(1) : normalized.slice(1, closing);
    } else {
        normalized = normalized.split(/\s+/u)[0];
    }
    const hashIndex = normalized.indexOf("#");
    if (hashIndex !== -1) {
        normalized = normalized.slice(0, hashIndex);
    }
    try {
        normalized = decodeURIComponent(normalized);
    } catch {
        // Keep the raw target when it is not URI-encoded.
    }
    return normalized;
}

function auditMarkdownLocalLinks({
    rootDir = process.cwd(),
    existsSync = fs.existsSync,
    readFileSync = fs.readFileSync,
    readdirSync = fs.readdirSync,
    statSync = fs.statSync,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const markdownFiles = collectMarkdownFiles(resolvedRoot, { existsSync, readdirSync, statSync });
    const failures = [];
    for (const relativeFile of markdownFiles) {
        const filePath = path.join(resolvedRoot, relativeFile);
        const text = readFileSync(filePath, "utf8");
        for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
            const target = normalizeMarkdownLinkTarget(match[1]);
            if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(target)) {
                continue;
            }
            const resolvedTarget = path.resolve(path.dirname(filePath), target);
            if (!resolvedTarget.startsWith(resolvedRoot) || !existsSync(resolvedTarget)) {
                failures.push(`${relativeFile} -> ${match[1]}`);
            }
        }
    }
    return {
        checkedFiles: markdownFiles.length,
        failures,
        passed: failures.length === 0,
    };
}

function auditDocumentationText({
    files,
    n3WordSnapshot,
    productSnapshot,
} = {}) {
    const snapshot = n3WordSnapshot || buildN3WordDocumentationSnapshot();
    const phrases = buildN3WordStatusPhrases(snapshot);
    const product = productSnapshot || snapshot.product || {
        kanjiDenominator: 2212,
        wordDenominator: 2263,
        kanjiLockedDenominator: 982,
        wordLockedDenominator: 1065,
        kanjiObsidianProof: 982,
        wordObsidianProof: 1000,
        wordN5Denominator: 346,
        wordN4Denominator: 719,
        wordN5ObsidianProof: 300,
        wordN4ObsidianProof: 700,
    };
    const productPhrases = buildProductStatusPhrases(product);
    const failures = [];
    const readme = files?.["README.md"] || "";
    const changelog = files?.["CHANGELOG.md"] || "";
    const claude = files?.["CLAUDE.md"] || "";
    const workflows = files?.["docs/workflows.md"] || "";
    const commandReference = files?.["docs/command-reference.md"] || "";
    const documentationStandard = files?.["docs/documentation-standard.md"] || "";
    const verification = files?.["docs/verification.md"] || "";
    const employerOverview = files?.["docs/employer-overview.md"] || "";
    const productExitCriteria = files?.["docs/product-exit-criteria.md"] || "";
    const releaseQaChecklist = files?.["docs/release-qa-checklist.md"] || "";
    const releaseProcess = files?.["docs/release-process.md"] || "";
    const systemArchitecture = files?.["docs/system-architecture.md"] || "";
    const packageJson = files?.["package.json"] || "";
    const unreleased = extractChangelogUnreleased(changelog);
    const wordExpansionDoctrine = buildWordExpansionDoctrinePhrases();

    addFailure(failures, readme.includes(phrases.readmeGoldStatus), `README.md N3 word status must include: ${phrases.readmeGoldStatus}`);
    addFailure(failures, !/Gold is `315\/1081` current-standard/u.test(readme), "README.md still contains stale N3 word Gold ratio 315/1081.");
    addFailure(failures, !/`766` generated rows still missing Gold/u.test(readme), "README.md still contains stale N3 word Gold backlog 766.");

    addFailure(failures, unreleased.includes(phrases.changelogGoldStatus), `CHANGELOG.md Unreleased must include: ${phrases.changelogGoldStatus}`);
    addFailure(failures, unreleased.includes(phrases.changelogGoldBacklog), `CHANGELOG.md Unreleased must include: ${phrases.changelogGoldBacklog}`);
    addFailure(failures, !/315\/1081/u.test(unreleased), "CHANGELOG.md Unreleased still contains stale N3 word Gold ratio 315/1081.");
    addFailure(failures, !/`766` generated rows still missing/u.test(unreleased), "CHANGELOG.md Unreleased still contains stale N3 word Gold backlog 766.");

    addFailure(failures, claude.includes(phrases.claudeWordPosture), `CLAUDE.md current posture must include: ${phrases.claudeWordPosture}`);
    addFailure(failures, !/N3\/N2\/N1 word work has Silver generated surfaces only/u.test(claude), "CLAUDE.md still claims N3/N2/N1 word work is Silver-only.");

    addFailure(failures, workflows.includes(phrases.workflowGoldCadenceHeading), "docs/workflows.md must document the N3 Gold word review cadence.");
    addFailure(failures, workflows.includes(phrases.workflowGoldScaffoldCommand), `docs/workflows.md must name ${phrases.workflowGoldScaffoldCommand}.`);
    addFailure(failures, commandReference.includes(phrases.commandReferenceAuditCommand), "docs/command-reference.md must document docs:status-audit.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.sourceDepthClaimLimiter), "docs/workflows.md must state that word source-depth is a claim limiter, not a Silver blocker.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.sourceAdequacyNonBlocker), "docs/workflows.md must state that incomplete word source-adequacy evidence does not block free labeled expansion.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.dictionaryCommonPoolExtraLane), "docs/workflows.md must state that the dictionary common pool is part of the extra expansion lane, not a source-depth lane.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.dictionaryCommonPoolRoute), "docs/workflows.md must document the JMdict containment/commonness common-pool route.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.dictionaryCommonPoolLabels), "docs/workflows.md must require DICTIONARY COMMON POOL and Source level claim unverified labels for common-pool rows.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.dictionaryCommonPoolQualityFilter), "docs/workflows.md must state that the default dictionary common-pool queue is an editorial shortlist over an audit-visible raw pool.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.dictionaryCommonPoolLearnerUtilityOrder), "docs/workflows.md must state that common-pool editorial queues are ordered by transparent learner-utility score before the 200-row cap.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.dictionaryCommonPoolLearnerUtilityComponents), "docs/workflows.md must list the learner-utility scoring components.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.dictionaryCommonPoolLearnerUtilityBoundary), "docs/workflows.md must state learner-utility score is ordering only, not card approval.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.dictionaryCommonPoolOutsideSupport), "docs/workflows.md must state that outside-JLPT/higher-level support kanji are label needs, not automatic common-pool deprioritization.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.expansionTargetMinimums), "docs/workflows.md must preserve the word expansion target minimums as useful minimums, not hard caps or quotas.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.expansionTargetActivation), "docs/workflows.md must preserve that target-progress reporting does not activate common-word expansion before reading exhaustion.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.expansionTargetQualityBoundary), "docs/workflows.md must preserve that missing target counts do not permit weak word rows.");
    addFailure(failures, workflows.includes(wordExpansionDoctrine.paidSourceBoundary), "docs/workflows.md must preserve the free expansion boundary that paid/private sources are optional, not prerequisites.");
    addFailure(failures, commandReference.includes(wordExpansionDoctrine.sourceDepthClaimLimiter), "docs/command-reference.md must state that word source-depth is a claim limiter, not a Silver blocker.");
    addFailure(failures, commandReference.includes(wordExpansionDoctrine.dictionaryCommonPoolCommandReference), "docs/command-reference.md must document common-pool work as the same extra expansion lane.");
    addFailure(failures, commandReference.includes(wordExpansionDoctrine.dictionaryCommonPoolRawCommand), "docs/command-reference.md must document dictionary common-pool raw audit mode.");
    addFailure(failures, commandReference.includes(wordExpansionDoctrine.dictionaryCommonPoolLearnerUtilityComponents), "docs/command-reference.md must document learner-utility scoring components for common-pool work.");
    addFailure(failures, commandReference.includes(wordExpansionDoctrine.expansionStatusTargetProgress), "docs/command-reference.md must document expansion-status target-progress reporting.");
    addFailure(failures, commandReference.includes("do not automatically deprioritize outside-JLPT or higher-level support kanji"), "docs/command-reference.md must document that outside-JLPT/higher-level support kanji are not automatically deprioritized.");
    addFailure(failures, commandReference.includes(wordExpansionDoctrine.paidSourceBoundary), "docs/command-reference.md must preserve the free expansion boundary that paid/private sources are optional, not prerequisites.");
    addFailure(failures, documentationStandard.includes(phrases.commandReferenceAuditCommand), "docs/documentation-standard.md must require docs:status-audit for status/count doc edits.");
    addFailure(failures, verification.includes(phrases.commandReferenceAuditCommand), "docs/verification.md must route documentation status audits through docs:status-audit.");
    addFailure(failures, readme.includes(phrases.commandReferenceAuditCommand), "README.md update triggers must name docs:status-audit.");
    addFailure(failures, readme.includes(phrases.orderedLaneFlow), "README.md must preserve the Silver/Gold/Sapphire/Platinum/Obsidian lane order near closeout/status language.");
    addFailure(failures, !/Silver-Gold-Sapphire-Platinum counts/u.test(readme), "README.md closeout language must not omit Obsidian by using Silver-Gold-Sapphire-Platinum counts shorthand.");
    addFailure(failures, readme.includes(productPhrases.closeoutLowerLaneMatrix), "README.md closeout language must label Silver/Gold/Sapphire/Platinum counts as a lower-lane matrix.");
    addFailure(failures, /"docs:status-audit"\s*:\s*"node scripts\/auditDocumentationStatus\.js"/u.test(packageJson), "package.json must expose npm run docs:status-audit.");
    const undocumentedScripts = findUndocumentedPackageScripts(packageJson, commandReference);
    addFailure(failures, undocumentedScripts.length === 0, `docs/command-reference.md is missing package scripts: ${undocumentedScripts.join(", ")}`);

    addFailure(failures, readme.includes(productPhrases.readmeN5KanjiObsidian), "README.md N5 kanji status must headline Obsidian certification.");
    addFailure(failures, readme.includes(productPhrases.readmeN4KanjiObsidian), "README.md N4 kanji status must headline Obsidian certification.");
    addFailure(failures, readme.includes(productPhrases.readmeN3KanjiObsidian), "README.md N3 kanji status must headline Obsidian certification.");
    addFailure(failures, readme.includes(productPhrases.readmeN2KanjiObsidian), "README.md N2 kanji status must headline Obsidian certification.");
    addFailure(failures, readme.includes(productPhrases.readmeN5WordObsidian), "README.md N5 word status must headline strict Obsidian certification.");
    addFailure(failures, readme.includes(productPhrases.readmeN4WordObsidian), "README.md N4 word status must headline strict Obsidian certification.");
    addFailure(failures, claude.includes(productPhrases.claudeFrozenWordObsidian), "CLAUDE.md frozen N5/N4 word posture must headline Obsidian certification.");
    addFailure(failures, employerOverview.includes(productPhrases.employerGeneratedDenominators), `docs/employer-overview.md must include current generated denominators: ${productPhrases.employerGeneratedDenominators}`);
    addFailure(failures, employerOverview.includes(productPhrases.employerWordDenominator), `docs/employer-overview.md word denominator row must include: ${productPhrases.employerWordDenominator}`);
    addFailure(failures, systemArchitecture.includes(productPhrases.systemWordDenominator), `docs/system-architecture.md word denominator row must include: ${productPhrases.systemWordDenominator}`);
    addFailure(failures, productExitCriteria.includes(productPhrases.productExitN5WordObsidian), "docs/product-exit-criteria.md N5 word posture must headline Obsidian certification.");
    addFailure(failures, productExitCriteria.includes(productPhrases.productExitN4WordObsidian), "docs/product-exit-criteria.md N4 word posture must headline Obsidian certification.");
    addFailure(failures, releaseQaChecklist.includes(productPhrases.releaseQaWordObsidian), "docs/release-qa-checklist.md word spot review must headline Obsidian certification.");
    addFailure(failures, releaseProcess.includes(productPhrases.releaseProcessObsidianFirst), "docs/release-process.md release checklist must put Obsidian certification before lower-lane prerequisite detail.");
    addFailure(failures, systemArchitecture.includes(productPhrases.systemObsidianProofNode), "docs/system-architecture.md architecture graph must identify Obsidian as proof plus natural-language certification.");

    const obsidianDecenteredStatusFiles = {
        "README.md": readme,
        "CLAUDE.md": claude,
        "CHANGELOG.md": changelog,
        "docs/product-exit-criteria.md": productExitCriteria,
        "docs/release-qa-checklist.md": releaseQaChecklist,
        "docs/release-process.md": releaseProcess,
    };
    const obsidianDecenteredStatusPatterns = [
        /Gold, native Sapphire, Platinum, and (?:strict word |strict )?Obsidian/u,
        /Gold, current-standard native Sapphire structural coverage, Platinum, and Obsidian/u,
        /Gold, Sapphire, Platinum, and Obsidian certified/u,
        /Gold regression, current-standard native Sapphire coverage, current-standard Platinum, and strict/u,
        /Gold, readiness, tracked-source artifact, native Sapphire structural coverage, Platinum, and strict/u,
        /current level-specific Gold regression, native Sapphire structural gate, Platinum gate, and fail-closed Obsidian/u,
        /currently passes placement, readiness, Gold, tracked-source artifact, native Sapphire, Platinum, and strict/u,
        /with Gold, native Sapphire, Platinum, and strict/u,
    ];
    for (const [fileName, text] of Object.entries(obsidianDecenteredStatusFiles)) {
        for (const pattern of obsidianDecenteredStatusPatterns) {
            addFailure(
                failures,
                !pattern.test(text),
                `${fileName} contains Obsidian-decentered completed-scope status wording matching ${pattern}. Headline Obsidian certification and describe lower lanes as prerequisites.`,
            );
        }
    }
    addFailure(failures, !/1470\/1470|987\/1470|\| Words \| 1470 \| 987/u.test(`${employerOverview}\n${systemArchitecture}`), "overview/architecture docs still contain stale pre-N3-expansion word denominator 1470.");

    return {
        passed: failures.length === 0,
        failures,
        snapshot: {
            ...snapshot,
            product,
        },
    };
}

function auditDocumentationStatus({
    rootDir = process.cwd(),
    existsSync = fs.existsSync,
    readFileSync = fs.readFileSync,
} = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const files = {};
    for (const relativePath of [
        "README.md",
        "CHANGELOG.md",
        "CLAUDE.md",
        "docs/workflows.md",
        "docs/command-reference.md",
        "docs/documentation-standard.md",
        "docs/employer-overview.md",
        "docs/product-exit-criteria.md",
        "docs/release-qa-checklist.md",
        "docs/release-process.md",
        "docs/system-architecture.md",
        "docs/verification.md",
        "package.json",
    ]) {
        files[relativePath] = readText(path.join(resolvedRoot, relativePath), { existsSync, readFileSync }) || "";
    }

    const report = auditDocumentationText({
        files,
        n3WordSnapshot: buildN3WordDocumentationSnapshot({ rootDir: resolvedRoot, readFileSync }),
        productSnapshot: buildProductDocumentationSnapshot({ rootDir: resolvedRoot, existsSync, readFileSync }),
    });
    const linkReport = auditMarkdownLocalLinks({ rootDir: resolvedRoot, existsSync, readFileSync });
    const failures = [
        ...report.failures,
        ...linkReport.failures.map((failure) => `broken markdown local link: ${failure}`),
    ];
    return {
        ...report,
        passed: failures.length === 0,
        failures,
        markdownLinks: linkReport,
    };
}

function formatDocumentationStatusAuditReport(report = {}) {
    const snapshot = report.snapshot || {};
    const lines = [
        "Japanese Kanji Builder Documentation Status Audit",
        "",
        "Tracked N3 word status:",
        `- denominator: ${snapshot.denominator}`,
        `- Gold: ${snapshot.gold?.ratio || "unknown"} (missing ${snapshot.gold?.missing ?? "unknown"})`,
        `- Sapphire: ${snapshot.sapphire?.ratio || "unknown"} (missing ${snapshot.sapphire?.missing ?? "unknown"})`,
        `- Platinum: ${snapshot.platinum?.ratio || "unknown"} (missing ${snapshot.platinum?.missing ?? "unknown"})`,
        `- Obsidian proof recorded: ${snapshot.obsidianProofRecorded ? "yes" : "no"}`,
        "",
        "Tracked product denominators:",
        `- kanji generated: ${snapshot.product?.kanjiDenominator ?? "unknown"}`,
        `- word generated: ${snapshot.product?.wordDenominator ?? "unknown"}`,
        `- kanji Obsidian proof: ${snapshot.product?.kanjiObsidianProof ?? "unknown"}/${snapshot.product?.kanjiLockedDenominator ?? "unknown"} locked N5-N2`,
        `- word Obsidian proof: ${snapshot.product?.wordObsidianProof ?? "unknown"}/${snapshot.product?.wordLockedDenominator ?? "unknown"} locked N5-N4`,
        `- markdown files link-checked: ${report.markdownLinks?.checkedFiles ?? "not run"}`,
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
    ];

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    auditDocumentationStatus,
    auditDocumentationText,
    buildN3WordDocumentationSnapshot,
    buildN3WordStatusPhrases,
    buildProductDocumentationSnapshot,
    buildProductStatusPhrases,
    buildWordExpansionDoctrinePhrases,
    extractChangelogUnreleased,
    findUndocumentedPackageScripts,
    auditMarkdownLocalLinks,
    formatDocumentationStatusAuditReport,
};
