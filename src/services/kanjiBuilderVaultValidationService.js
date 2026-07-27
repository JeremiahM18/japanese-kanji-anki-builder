const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { isPathInside } = require("../utils/fs");
const { readGitHead } = require("../utils/gitRepository");

const REQUIRED_FRONTMATTER_FIELDS = Object.freeze([
    "type",
    "project",
    "status",
    "verified_date",
    "repository_commit",
]);

const SECRET_PATTERNS = Object.freeze([
    ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
    ["github-token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u],
    ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/u],
    ["google-api-key", /\bAIza[0-9A-Za-z_-]{30,}\b/u],
]);

function normalizeSlash(value) {
    return String(value || "").replaceAll("\\", "/");
}

function listMarkdownFiles(rootDir) {
    const files = [];
    const skippedSymlinks = [];
    const pending = [path.resolve(rootDir)];
    while (pending.length > 0) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const filePath = path.join(current, entry.name);
            if (entry.isSymbolicLink()) {
                skippedSymlinks.push(filePath);
                continue;
            }
            if (entry.isDirectory()) {
                pending.push(filePath);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
                files.push(filePath);
            }
        }
    }
    return {
        files: files.sort((left, right) => left.localeCompare(right)),
        skippedSymlinks: skippedSymlinks.sort((left, right) => left.localeCompare(right)),
    };
}

function parseFrontmatter(text, label) {
    const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
    if (!match) {
        throw new Error(`${label} is missing leading YAML frontmatter.`);
    }
    const parsed = YAML.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`${label} frontmatter must be a YAML mapping.`);
    }
    return {
        data: parsed,
        body: text.slice(match[0].length),
    };
}

function extractWikiLinks(body) {
    return [...String(body).matchAll(/\[\[([^\]]+)\]\]/gu)]
        .map((match) => match[1].split("|")[0].split("#")[0].trim())
        .filter(Boolean);
}

function extractNpmCommands(body) {
    return [...String(body).matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/gu)]
        .map((match) => match[1]);
}

function extractRepositoryPaths(body) {
    const values = [...String(body).matchAll(
        /`((?:package\.json|README\.md|CLAUDE\.md|SECURITY\.md|(?:src|scripts|docs|templates|test|\.github)\/[^`\r\n\s]+))`/gu
    )].map((match) => match[1].replace(/[),.;:]+$/u, ""));
    return [...new Set(values)].filter((value) => !/[<>{}*]/u.test(value));
}

function resolveWikiLink(link, notePath, vaultRoot, byBaseName) {
    const normalized = normalizeSlash(link).replace(/\.md$/iu, "");
    if (normalized.includes("/") || normalized.startsWith(".")) {
        if (normalized.startsWith("/")) {
            return [];
        }
        const candidate = normalized.startsWith(".")
            ? path.resolve(path.dirname(notePath), `${normalized}.md`)
            : path.resolve(vaultRoot, `${normalized}.md`);
        return isPathInside(candidate, vaultRoot) && fs.existsSync(candidate) ? [candidate] : [];
    }
    return byBaseName.get(normalized.toLowerCase()) || [];
}

function isCanonicalIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
        return false;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function inspectMarkdownStructure(body) {
    const h1Titles = [];
    let openFence = "";
    for (const line of String(body).split(/\r?\n/u)) {
        const fence = /^\s*(```+|~~~+)/u.exec(line)?.[1] || "";
        if (fence) {
            if (!openFence) {
                openFence = fence[0];
            } else if (fence[0] === openFence) {
                openFence = "";
            }
            continue;
        }
        if (!openFence && /^# (?!#)/u.test(line)) {
            h1Titles.push(line.slice(2).trim());
        }
    }
    return {
        h1Titles,
        unbalancedFence: Boolean(openFence),
    };
}

function findSecretFindings(text, relativePath) {
    const findings = [];
    const lines = String(text).split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
        for (const [category, pattern] of SECRET_PATTERNS) {
            if (pattern.test(lines[index])) {
                findings.push({
                    code: "secret-shape",
                    path: relativePath,
                    line: index + 1,
                    message: `Potential ${category} material is present.`,
                });
            }
        }
    }
    return findings;
}

function buildKanjiBuilderVaultValidationReport({
    vaultRoot,
    repositoryRoot = process.cwd(),
    now = () => new Date(),
    maxAgeDays = 14,
} = {}) {
    if (!vaultRoot) {
        throw new Error("vaultRoot is required.");
    }
    const resolvedVaultRoot = path.resolve(vaultRoot);
    const resolvedRepositoryRoot = path.resolve(repositoryRoot);
    if (!fs.statSync(resolvedVaultRoot).isDirectory()) {
        throw new Error(`Vault root is not a directory: ${resolvedVaultRoot}`);
    }
    if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 1) {
        throw new Error("maxAgeDays must be a positive integer.");
    }

    const packageJson = JSON.parse(fs.readFileSync(path.join(resolvedRepositoryRoot, "package.json"), "utf8"));
    const packageScripts = new Set(Object.keys(packageJson.scripts || {}));
    const repositoryCommit = readGitHead(resolvedRepositoryRoot);
    const validationTime = now();
    const listed = listMarkdownFiles(resolvedVaultRoot);
    const files = listed.files;
    const notes = [];
    const failures = [];
    const warnings = listed.skippedSymlinks.map((filePath) => ({
        code: "skipped-symlink",
        path: normalizeSlash(path.relative(resolvedVaultRoot, filePath)),
        message: "Symbolic-link content was not traversed or validated.",
    }));
    const byBaseName = new Map();

    for (const filePath of files) {
        const baseName = path.basename(filePath, ".md").toLowerCase();
        const values = byBaseName.get(baseName) || [];
        values.push(filePath);
        byBaseName.set(baseName, values);
    }

    const titles = new Map();
    for (const filePath of files) {
        const relativePath = normalizeSlash(path.relative(resolvedVaultRoot, filePath));
        const text = fs.readFileSync(filePath, "utf8");
        let frontmatter;
        let body;
        try {
            ({ data: frontmatter, body } = parseFrontmatter(text, relativePath));
        } catch (error) {
            failures.push({ code: "frontmatter", path: relativePath, message: error.message });
            continue;
        }
        for (const field of REQUIRED_FRONTMATTER_FIELDS) {
            if (frontmatter[field] === undefined || frontmatter[field] === null || String(frontmatter[field]).trim() === "") {
                failures.push({
                    code: "frontmatter-required",
                    path: relativePath,
                    message: `Missing required frontmatter field: ${field}.`,
                });
            } else if (typeof frontmatter[field] !== "string") {
                failures.push({
                    code: "frontmatter-type",
                    path: relativePath,
                    message: `Required frontmatter field ${field} must be a string.`,
                });
            }
        }
        if (frontmatter.project !== "Kanji Builder") {
            failures.push({
                code: "frontmatter-project",
                path: relativePath,
                message: "frontmatter project must be Kanji Builder.",
            });
        }
        const verifiedDate = String(frontmatter.verified_date || "");
        if (!isCanonicalIsoDate(verifiedDate)) {
            failures.push({
                code: "verified-date",
                path: relativePath,
                message: "verified_date must be a real calendar date using YYYY-MM-DD.",
            });
        } else {
            const ageDays = Math.floor((validationTime.getTime() - new Date(`${verifiedDate}T00:00:00.000Z`).getTime()) / 86400000);
            if (ageDays < 0) {
                failures.push({
                    code: "future-verified-date",
                    path: relativePath,
                    message: `verified_date is ${Math.abs(ageDays)} days in the future.`,
                });
            } else if (ageDays > maxAgeDays) {
                warnings.push({
                    code: "stale-verification",
                    path: relativePath,
                    message: `verified_date is ${ageDays} days old; policy threshold is ${maxAgeDays}.`,
                });
            }
        }
        const noteCommit = String(frontmatter.repository_commit || "");
        if (!/^[a-f0-9]{40}$/iu.test(noteCommit)) {
            failures.push({
                code: "repository-commit",
                path: relativePath,
                message: "repository_commit must be a full 40-character Git SHA.",
            });
        } else if (String(frontmatter.status || "").startsWith("current") && noteCommit !== repositoryCommit) {
            failures.push({
                code: "current-commit-drift",
                path: relativePath,
                message: `Current note commit ${noteCommit} does not match repository HEAD ${repositoryCommit}.`,
            });
        }

        const markdownStructure = inspectMarkdownStructure(body);
        const h1Titles = markdownStructure.h1Titles;
        if (h1Titles.length !== 1) {
            failures.push({
                code: "h1-count",
                path: relativePath,
                message: `Expected exactly one H1; found ${h1Titles.length}.`,
            });
        }
        const title = h1Titles[0] || "";
        if (title) {
            const titleKey = title.toLowerCase();
            const prior = titles.get(titleKey);
            if (prior) {
                failures.push({
                    code: "duplicate-title",
                    path: relativePath,
                    message: `Duplicate H1 title with ${prior}: ${title}.`,
                });
            } else {
                titles.set(titleKey, relativePath);
            }
        }
        if (markdownStructure.unbalancedFence) {
            failures.push({
                code: "unbalanced-fence",
                path: relativePath,
                message: "Markdown contains an unbalanced fenced-code block.",
            });
        }

        notes.push({
            filePath,
            relativePath,
            wikiLinks: extractWikiLinks(body),
            npmCommands: extractNpmCommands(body),
            repositoryPaths: extractRepositoryPaths(body),
        });
        failures.push(...findSecretFindings(text, relativePath));
    }

    for (const [baseName, matching] of byBaseName) {
        if (matching.length > 1) {
            failures.push({
                code: "duplicate-basename",
                path: matching.map((entry) => normalizeSlash(path.relative(resolvedVaultRoot, entry))).join(", "),
                message: `Duplicate note basename: ${baseName}.`,
            });
        }
    }

    for (const note of notes) {
        for (const link of note.wikiLinks) {
            const matches = resolveWikiLink(link, note.filePath, resolvedVaultRoot, byBaseName);
            if (matches.length !== 1) {
                failures.push({
                    code: matches.length === 0 ? "broken-wikilink" : "ambiguous-wikilink",
                    path: note.relativePath,
                    message: `Wikilink ${link} resolved to ${matches.length} notes.`,
                });
            }
        }
        for (const command of note.npmCommands) {
            if (!packageScripts.has(command)) {
                failures.push({
                    code: "unknown-npm-command",
                    path: note.relativePath,
                    message: `Unknown package script referenced: ${command}.`,
                });
            }
        }
        for (const repositoryPath of note.repositoryPaths) {
            const resolvedRepositoryPath = path.resolve(resolvedRepositoryRoot, repositoryPath);
            if (!isPathInside(resolvedRepositoryPath, resolvedRepositoryRoot)) {
                failures.push({
                    code: "repository-path-escape",
                    path: note.relativePath,
                    message: `Referenced repository path escapes the repository: ${repositoryPath}.`,
                });
            } else if (!fs.existsSync(resolvedRepositoryPath)) {
                failures.push({
                    code: "missing-repository-path",
                    path: note.relativePath,
                    message: `Referenced repository path does not exist: ${repositoryPath}.`,
                });
            }
        }
    }

    return {
        passed: failures.length === 0,
        vaultRoot: resolvedVaultRoot,
        repositoryRoot: resolvedRepositoryRoot,
        repositoryCommit,
        maxAgeDays,
        counts: {
            notes: files.length,
            validatedNotes: notes.length,
            failures: failures.length,
            warnings: warnings.length,
            skippedSymlinks: listed.skippedSymlinks.length,
            wikiLinks: notes.reduce((sum, note) => sum + note.wikiLinks.length, 0),
            npmCommands: notes.reduce((sum, note) => sum + note.npmCommands.length, 0),
            repositoryPaths: notes.reduce((sum, note) => sum + note.repositoryPaths.length, 0),
        },
        failures,
        warnings,
        authority: "Read-only vault structure and evidence-reference validation; it does not certify repository lanes or make vault notes repository authority.",
    };
}

function formatKanjiBuilderVaultValidationReport(report = {}) {
    const lines = [
        "Kanji Builder vault validation",
        `Status: ${report.passed ? "pass" : "fail"}`,
        `Vault: ${report.vaultRoot}`,
        `Repository HEAD: ${report.repositoryCommit}`,
        `Notes: ${report.counts?.notes || 0}`,
        `Validated notes: ${report.counts?.validatedNotes || 0}`,
        `Wikilinks: ${report.counts?.wikiLinks || 0}`,
        `npm command references: ${report.counts?.npmCommands || 0}`,
        `Repository path references: ${report.counts?.repositoryPaths || 0}`,
        `Failures: ${report.counts?.failures || 0}`,
        `Warnings: ${report.counts?.warnings || 0}`,
    ];
    for (const finding of report.failures || []) {
        lines.push(`- FAIL ${finding.code} ${finding.path}: ${finding.message}`);
    }
    for (const finding of report.warnings || []) {
        lines.push(`- WARN ${finding.code} ${finding.path}: ${finding.message}`);
    }
    lines.push(`Authority: ${report.authority}`);
    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildKanjiBuilderVaultValidationReport,
    extractNpmCommands,
    extractRepositoryPaths,
    extractWikiLinks,
    formatKanjiBuilderVaultValidationReport,
    inspectMarkdownStructure,
    isCanonicalIsoDate,
    parseFrontmatter,
    readGitHead,
};
