#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const { invokeCliMain } = require("../src/utils/cliArgs");
const {
    buildGithubSettingsAudit,
    formatGithubSettingsAudit,
    parseArgs,
} = require("./auditGithubRepositorySettings");

function normalizeToken(value) {
    return String(value || "").trim();
}

function resolveGithubAuditToken({ env = process.env, spawnSyncImpl = spawnSync } = {}) {
    const ghToken = normalizeToken(env.GH_TOKEN);
    if (ghToken) {
        return { token: ghToken, source: "GH_TOKEN" };
    }

    const githubToken = normalizeToken(env.GITHUB_TOKEN);
    if (githubToken) {
        return { token: githubToken, source: "GITHUB_TOKEN" };
    }

    const result = spawnSyncImpl("gh", ["auth", "token"], {
        encoding: "utf-8",
        env,
        windowsHide: true,
    });
    if (result.error) {
        throw new Error(
            "No GH_TOKEN/GITHUB_TOKEN was set, and GitHub CLI token lookup failed. " +
            "Install GitHub CLI and run `gh auth login`, or set GH_TOKEN with repository security/settings read access."
        );
    }
    if (result.status !== 0) {
        throw new Error(
            "`gh auth token` did not return a usable token. " +
            "Run `gh auth status`, refresh GitHub CLI authentication, or set GH_TOKEN with repository security/settings read access."
        );
    }

    const token = normalizeToken(result.stdout);
    if (!token) {
        throw new Error(
            "`gh auth token` returned an empty token. " +
            "Run `gh auth login`, or set GH_TOKEN with repository security/settings read access."
        );
    }

    return { token, source: "gh auth token" };
}

function buildAuthenticatedAuditEnv(env, token) {
    return {
        ...env,
        GH_TOKEN: token,
    };
}

function formatAuthenticatedGithubSettingsAudit(audit) {
    return [
        formatGithubSettingsAudit(audit),
        `Authentication source: ${audit.authenticationSource || "unknown"}`,
    ].join("\n");
}

async function main(argv = process.argv.slice(2), {
    env = process.env,
    fetchImpl = fetch,
    spawnSyncImpl = spawnSync,
    stdout = process.stdout,
} = {}) {
    const options = parseArgs(argv);
    const auth = resolveGithubAuditToken({ env, spawnSyncImpl });
    const audit = await buildGithubSettingsAudit({
        ...options,
        env: buildAuthenticatedAuditEnv(env, auth.token),
        fetchImpl,
    });
    const authenticatedAudit = {
        ...audit,
        authenticationSource: auth.source,
    };

    if (options.json) {
        stdout.write(`${JSON.stringify(authenticatedAudit, null, 2)}\n`);
    } else {
        stdout.write(`${formatAuthenticatedGithubSettingsAudit(authenticatedAudit)}\n`);
    }

    if (audit.status !== "pass") {
        process.exitCode = 1;
    }
    return authenticatedAudit;
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

module.exports = {
    buildAuthenticatedAuditEnv,
    formatAuthenticatedGithubSettingsAudit,
    main,
    resolveGithubAuditToken,
};
