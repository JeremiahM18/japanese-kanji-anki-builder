const path = require("node:path");

const {
    createEmptyMediaManifest,
    ensureMediaLayout,
    readManifestIfExists,
    writeManifest,
} = require("./mediaStore");
const {
    buildKanjiFileCandidates,
    copyAssetIfChanged,
    findMatchingAsset,
    normalizeKanji,
} = require("./strokeOrderService");

const AUDIO_EXTENSIONS = new Map([
    [".mp3", "audio/mpeg"],
    [".wav", "audio/wav"],
    [".m4a", "audio/mp4"],
    [".ogg", "audio/ogg"],
    [".webm", "audio/webm"],
]);

function cleanToken(value) {
    const normalized = String(value ?? "").trim();
    return normalized || "";
}

function normalizeTokenForFileName(value) {
    return cleanToken(value)
        .replace(/[\\/:*?"<>|\s]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function buildAudioFileCandidates({ kanji, reading, text }) {
    const normalizedKanji = normalizeKanji(kanji);
    const normalizedReading = normalizeTokenForFileName(reading);
    const normalizedText = normalizeTokenForFileName(text);
    const candidates = new Set(buildKanjiFileCandidates(normalizedKanji));

    for (const token of [normalizedText, normalizedReading]) {
        if (token) {
            candidates.add(token);
        }
    }

    if (normalizedReading) {
        candidates.add(`${normalizedKanji}_${normalizedReading}`);
        candidates.add(`${normalizedKanji}-${normalizedReading}`);
    }

    if (normalizedText) {
        candidates.add(`${normalizedKanji}_${normalizedText}`);
        candidates.add(`${normalizedKanji}-${normalizedText}`);
    }

    if (normalizedText && normalizedReading) {
        candidates.add(`${normalizedText}_${normalizedReading}`);
        candidates.add(`${normalizedText}-${normalizedReading}`);
    }

    return [...candidates];
}

function buildAudioAssetKey(asset) {
    return [asset.category || "", asset.text || "", asset.reading || "", asset.voice || "", asset.locale || ""]
        .map((value) => String(value).toLowerCase())
        .join("|");
}

function compareAudioAssets(a, b) {
    return buildAudioAssetKey(a).localeCompare(buildAudioAssetKey(b)) || a.path.localeCompare(b.path);
}

function upsertAudioAsset(existingAssets, nextAsset) {
    const filtered = (Array.isArray(existingAssets) ? existingAssets : []).filter(
        (asset) => buildAudioAssetKey(asset) !== buildAudioAssetKey(nextAsset)
    );

    return [...filtered, nextAsset].sort(compareAudioAssets);
}

function scoreAudioAsset(asset, preferences = {}) {
    const categoryPriority = {
        "kanji-reading": 30,
        "word-reading": 20,
        sentence: 10,
    };

    let score = categoryPriority[asset.category] || 0;

    if (preferences.category && asset.category === preferences.category) {
        score += 40;
    }

    if (preferences.text && asset.text === preferences.text) {
        score += 25;
    }

    if (preferences.reading && asset.reading === preferences.reading) {
        score += 20;
    }

    if (asset.locale === "ja-JP") {
        score += 5;
    }

    return score;
}

function selectBestAudioAsset(audioAssets, preferences = {}) {
    const assets = Array.isArray(audioAssets) ? audioAssets : [];

    if (assets.length === 0) {
        return null;
    }

    return [...assets].sort((a, b) => {
        const scoreDiff = scoreAudioAsset(b, preferences) - scoreAudioAsset(a, preferences);
        if (scoreDiff !== 0) {
            return scoreDiff;
        }

        return compareAudioAssets(a, b);
    })[0];
}

async function findMatchingAudioAsset(sourceDir, { kanji, reading, text }) {
    const candidates = buildAudioFileCandidates({ kanji, reading, text });

    for (const candidate of candidates) {
        const asset = await findMatchingAsset(sourceDir, candidate, AUDIO_EXTENSIONS);
        if (asset) {
            return asset;
        }
    }

    return null;
}

function buildDestinationStem({ category, text, reading }) {
    const parts = [normalizeTokenForFileName(category || "kanji-reading")];

    for (const token of [text, reading].map(normalizeTokenForFileName).filter(Boolean)) {
        parts.push(token);
    }

    return parts.join("-") || "kanji-reading";
}

function createAudioService({ mediaRootDir, audioSourceDir }) {
    async function getManifest(kanji) {
        const normalizedKanji = normalizeKanji(kanji);
        return readManifestIfExists(mediaRootDir, normalizedKanji);
    }

    async function syncKanji(kanji, metadata = {}) {
        const normalizedKanji = normalizeKanji(kanji);
        const layout = ensureMediaLayout(mediaRootDir, normalizedKanji);
        const manifest = (await readManifestIfExists(mediaRootDir, normalizedKanji)) || createEmptyMediaManifest(normalizedKanji);
        const normalizedMetadata = {
            category: metadata.category || "kanji-reading",
            text: cleanToken(metadata.text) || normalizedKanji,
            reading: cleanToken(metadata.reading) || undefined,
            voice: cleanToken(metadata.voice) || undefined,
            locale: cleanToken(metadata.locale) || "ja-JP",
        };

        const audioAsset = await findMatchingAudioAsset(audioSourceDir, {
            kanji: normalizedKanji,
            text: normalizedMetadata.text,
            reading: normalizedMetadata.reading,
        });

        if (!audioAsset) {
            const writtenManifest = await writeManifest(mediaRootDir, manifest);

            return {
                kanji: normalizedKanji,
                manifest: writtenManifest,
                found: {
                    audio: false,
                },
            };
        }

        const destinationPath = path.join(
            layout.audioDir,
            `${buildDestinationStem(normalizedMetadata)}${audioAsset.extension}`
        );
        await copyAssetIfChanged(audioAsset, destinationPath);

        manifest.assets.audio = upsertAudioAsset(manifest.assets.audio, {
            kind: "audio",
            path: path.relative(layout.basePath, destinationPath).replace(/\\/g, "/"),
            mimeType: audioAsset.mimeType,
            source: "local-filesystem",
            checksum: audioAsset.checksum,
            category: normalizedMetadata.category,
            text: normalizedMetadata.text,
            reading: normalizedMetadata.reading,
            voice: normalizedMetadata.voice,
            locale: normalizedMetadata.locale,
            notes: `Imported from ${audioAsset.fileName}`,
        });

        const writtenManifest = await writeManifest(mediaRootDir, manifest);

        return {
            kanji: normalizedKanji,
            manifest: writtenManifest,
            found: {
                audio: true,
            },
        };
    }

    async function getBestAudioPath(kanji, preferences = {}) {
        const manifest = await getManifest(kanji);

        if (!manifest) {
            return "";
        }

        return selectBestAudioAsset(manifest.assets.audio, preferences)?.path || "";
    }

    return {
        getBestAudioPath,
        getManifest,
        syncKanji,
    };
}

module.exports = {
    AUDIO_EXTENSIONS,
    buildAudioFileCandidates,
    createAudioService,
    findMatchingAudioAsset,
    normalizeTokenForFileName,
    scoreAudioAsset,
    selectBestAudioAsset,
    upsertAudioAsset,
};
