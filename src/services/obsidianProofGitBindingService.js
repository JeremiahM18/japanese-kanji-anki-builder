const { spawnSync } = require("node:child_process");

const { sha256Buffer } = require("./obsidianProofIntegrityService");

function toPosixPath(value) {
    return String(value).replace(/\\/g, "/");
}

function runGit({ cwd, args, encoding = "utf8" }) {
    const result = spawnSync("git", args, {
        cwd,
        encoding,
        shell: false,
        windowsHide: true,
    });
    if (result.error) {
        throw new Error(`Failed to run git ${args.join(" ")}: ${result.error.message}`);
    }
    if (result.status !== 0) {
        const stderr = Buffer.isBuffer(result.stderr)
            ? result.stderr.toString("utf8").trim()
            : String(result.stderr || "").trim();
        throw new Error(`git ${args.join(" ")} failed with exit code ${result.status}${stderr ? `: ${stderr}` : ""}.`);
    }
    return result.stdout;
}

function resolveSourceCommit({ cwd, sourceCommit }) {
    return String(runGit({
        cwd,
        args: ["rev-parse", "--verify", `${sourceCommit}^{commit}`],
    })).trim().toLowerCase();
}

function readFileAtCommit({ cwd, sourceCommit, sourcePath }) {
    return runGit({
        cwd,
        args: ["show", `${sourceCommit}:${toPosixPath(sourcePath)}`],
        encoding: null,
    });
}

function verifyHistoricalSourceCommit({ cwd, event }) {
    const sourceCommit = String(event.ledger.sourceCommit).trim().toLowerCase();
    const resolvedCommit = resolveSourceCommit({ cwd, sourceCommit });
    if (!resolvedCommit.startsWith(sourceCommit)) {
        throw new Error(`Obsidian proof event ${event.proofId} sourceCommit ${sourceCommit} does not resolve to the expected commit.`);
    }
    return resolvedCommit;
}

function verifyCurrentV2SourceBinding({ cwd, event }) {
    const sourceCommit = String(event.ledger.sourceCommit).trim().toLowerCase();
    const resolvedCommit = resolveSourceCommit({ cwd, sourceCommit });
    if (resolvedCommit !== sourceCommit) {
        throw new Error(`Obsidian proof event ${event.proofId} sourceCommit must be the full resolved commit ${resolvedCommit}.`);
    }
    const headCommit = String(runGit({ cwd, args: ["rev-parse", "HEAD"] })).trim().toLowerCase();
    if (headCommit !== sourceCommit) {
        throw new Error(`Obsidian proof event ${event.proofId} sourceCommit ${sourceCommit} must equal current HEAD ${headCommit}.`);
    }
    const committedReviewSet = readFileAtCommit({
        cwd,
        sourceCommit,
        sourcePath: event.ledger.sourceReviewSetPath,
    });
    const committedSha256 = sha256Buffer(committedReviewSet);
    if (committedSha256 !== event.ledger.sourceReviewSetSha256) {
        throw new Error(`Obsidian proof event ${event.proofId} sourceReviewSetSha256 does not match ${event.ledger.sourceReviewSetPath} at ${sourceCommit}.`);
    }
    const sourceStatus = String(runGit({
        cwd,
        args: ["status", "--porcelain", "--", toPosixPath(event.ledger.sourceReviewSetPath)],
    })).trim();
    if (sourceStatus) {
        throw new Error(`Obsidian proof event ${event.proofId} tracked review set has uncommitted changes and cannot be bound to sourceCommit.`);
    }
    return resolvedCommit;
}

function verifyV2LedgerSourceBinding({ cwd, event }) {
    const sourceCommit = String(event.ledger.sourceCommit).trim().toLowerCase();
    const resolvedCommit = resolveSourceCommit({ cwd, sourceCommit });
    if (resolvedCommit !== sourceCommit) {
        throw new Error(`Obsidian proof event ${event.proofId} sourceCommit must be the full resolved commit ${resolvedCommit}.`);
    }
    const committedReviewSet = readFileAtCommit({
        cwd,
        sourceCommit,
        sourcePath: event.ledger.sourceReviewSetPath,
    });
    if (sha256Buffer(committedReviewSet) !== event.ledger.sourceReviewSetSha256) {
        throw new Error(`Obsidian proof event ${event.proofId} sourceReviewSetSha256 does not match ${event.ledger.sourceReviewSetPath} at ${sourceCommit}.`);
    }
    return resolvedCommit;
}

module.exports = {
    readFileAtCommit,
    resolveSourceCommit,
    runGit,
    verifyCurrentV2SourceBinding,
    verifyHistoricalSourceCommit,
    verifyV2LedgerSourceBinding,
};
