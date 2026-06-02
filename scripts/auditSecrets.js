#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SECRET_PATTERNS = Object.freeze([
    {
        id: "private-key-block",
        label: "Private key block",
        pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/gu,
    },
    {
        id: "github-classic-token",
        label: "GitHub classic token",
        pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/gu,
    },
    {
        id: "github-fine-grained-token",
        label: "GitHub fine-grained token",
        pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/gu,
    },
    {
        id: "npm-token",
        label: "npm token",
        pattern: /\bnpm_[A-Za-z0-9]{36,}\b/gu,
    },
    {
        id: "npm-auth-token-config",
        label: "npm registry auth token config",
        pattern: /\/\/registry\.npmjs\.org\/:_authToken\s*=\s*[^\s#]+/gu,
    },
    {
        id: "aws-access-key",
        label: "AWS access key",
        pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu,
    },
    {
        id: "openai-api-key",
        label: "OpenAI API key",
        pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/gu,
    },
    {
        id: "slack-token",
        label: "Slack token",
        pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gu,
    },
]);

function listTrackedFiles({ cwd = process.cwd() } = {}) {
    const result = spawnSync("git", ["ls-files", "-z"], {
        cwd,
        encoding: "buffer",
        shell: false,
        windowsHide: true,
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error((result.stderr?.toString("utf8") || result.stdout?.toString("utf8") || "git ls-files failed").trim());
    }

    return result.stdout
        .toString("utf8")
        .split("\0")
        .filter(Boolean)
        .sort();
}

function isProbablyBinary(buffer) {
    return buffer.includes(0);
}

function lineNumberAt(text, index) {
    let line = 1;
    for (let cursor = 0; cursor < index; cursor += 1) {
        if (text.charCodeAt(cursor) === 10) {
            line += 1;
        }
    }
    return line;
}

function redactSecret(value) {
    if (value.length <= 12) {
        return "<redacted>";
    }
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function scanTextForSecrets({ relativePath, text }) {
    const findings = [];

    for (const secretPattern of SECRET_PATTERNS) {
        secretPattern.pattern.lastIndex = 0;
        let match = secretPattern.pattern.exec(text);
        while (match !== null) {
            findings.push({
                patternId: secretPattern.id,
                label: secretPattern.label,
                relativePath,
                line: lineNumberAt(text, match.index),
                match: redactSecret(match[0]),
            });
            match = secretPattern.pattern.exec(text);
        }
    }

    return findings;
}

function scanTrackedFile({ cwd, relativePath }) {
    const absolutePath = path.join(cwd, relativePath);
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
        return [];
    }

    const buffer = fs.readFileSync(absolutePath);
    if (isProbablyBinary(buffer)) {
        return [];
    }

    return scanTextForSecrets({
        relativePath: relativePath.split(path.sep).join("/"),
        text: buffer.toString("utf8"),
    });
}

function buildSecretAuditReport({ cwd = process.cwd(), files = null } = {}) {
    const trackedFiles = files || listTrackedFiles({ cwd });
    const findings = [];

    for (const relativePath of trackedFiles) {
        try {
            const absolutePath = path.join(cwd, relativePath);
            if (!fs.existsSync(absolutePath)) {
                continue;
            }
            findings.push(...scanTrackedFile({ cwd, relativePath }));
        } catch (error) {
            findings.push({
                patternId: "scan-error",
                label: "Secret scan file error",
                relativePath,
                line: 0,
                match: error.message || String(error),
            });
        }
    }

    return {
        ok: findings.length === 0,
        findings,
        scannedFileCount: trackedFiles.length,
    };
}

function formatSecretAuditReport(report) {
    const lines = [
        "Secret audit",
        `Status: ${report.ok ? "pass" : "fail"}`,
        `Tracked files scanned: ${report.scannedFileCount}`,
    ];

    if (report.findings.length > 0) {
        lines.push("Findings:");
        for (const finding of report.findings) {
            lines.push(`- ${finding.relativePath}:${finding.line} ${finding.label} (${finding.patternId}) ${finding.match}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

if (require.main === module) {
    const report = buildSecretAuditReport();
    const text = formatSecretAuditReport(report);
    if (report.ok) {
        process.stdout.write(text);
    } else {
        process.stderr.write(text);
        process.exitCode = 1;
    }
}

module.exports = {
    SECRET_PATTERNS,
    buildSecretAuditReport,
    formatSecretAuditReport,
    scanTextForSecrets,
};
