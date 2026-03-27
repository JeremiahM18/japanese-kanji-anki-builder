const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function ensureFileFromExample(targetPath, examplePath) {
    if (fs.existsSync(targetPath) || !fs.existsSync(examplePath)) {
        return false;
    }

    fs.copyFileSync(examplePath, targetPath);
    return true;
}

function main() {
    const cwd = process.cwd();
    const config = loadConfig({ cwd });

    const createdDirs = [];
    for (const dirPath of [
        config.strokeOrderImageSourceDir,
        config.strokeOrderAnimationSourceDir,
        config.audioSourceDir,
        config.mediaRootDir,
    ]) {
        if (!fs.existsSync(dirPath)) {
            createdDirs.push(dirPath);
        }
        ensureDir(dirPath);
    }

    const envCreated = ensureFileFromExample(
        path.join(cwd, ".env"),
        path.join(cwd, ".env.example")
    );

    const lines = [];
    lines.push("Japanese Kanji Builder Media Init");
    lines.push("");
    lines.push("Directories ready:");
    for (const dirPath of [
        config.strokeOrderImageSourceDir,
        config.strokeOrderAnimationSourceDir,
        config.audioSourceDir,
        config.mediaRootDir,
    ]) {
        const marker = createdDirs.includes(dirPath) ? "created" : "present";
        lines.push(`- ${marker}: ${dirPath}`);
    }
    lines.push("");
    lines.push(envCreated
        ? `Created .env from ${path.join(cwd, ".env.example")}`
        : `.env already present or no .env.example found at ${path.join(cwd, ".env.example")}`);
    lines.push("");
    lines.push("Next steps:");
    lines.push("- Add local stroke-order image, stroke-order animation, and audio files to the source folders above.");
    lines.push("- Or edit .env to set REMOTE_STROKE_ORDER_IMAGE_BASE_URL, REMOTE_STROKE_ORDER_ANIMATION_BASE_URL, and REMOTE_AUDIO_BASE_URL.");
    lines.push("- Run `npm run doctor` to confirm acquisition readiness.");
    lines.push("- Run `npm run deck:ready -- --levels=5 --limit=25` to sync media and build a package.");

    process.stdout.write(`${lines.join("\n")}\n`);
}

main();
