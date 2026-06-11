const {
    buildWordStudyDataStalenessReport,
    loadTrackedStarterWordStudyData,
    normalizeWordStudyData,
    refreshStarterEntries,
} = require("../datasets/wordStudyData");
const { readJsonObjectIfExists } = require("./curatedStudyBootstrapService");
const { writeFileAtomicSync, writeFileIfMissingSync } = require("../utils/fs");

function bootstrapWordStudyData({
    targetPath,
    starterPath,
    merge = false,
    refreshStarter = false,
}) {
    const preflight = buildWordStudyDataStalenessReport({
        localPath: targetPath,
        starterPath,
    });
    const starterEntries = normalizeWordStudyData(loadTrackedStarterWordStudyData({ starterPath }));
    const existingTarget = readJsonObjectIfExists(targetPath);
    const targetExists = existingTarget.exists;
    const existingEntries = existingTarget.value;
    const nextEntries = refreshStarter
        ? normalizeWordStudyData(refreshStarterEntries(starterEntries, existingEntries))
        : merge
        ? normalizeWordStudyData({ ...existingEntries, ...starterEntries })
        : starterEntries;

    let changed = false;
    if (merge || refreshStarter) {
        writeFileAtomicSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
        changed = true;
    } else {
        changed = writeFileIfMissingSync(targetPath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf-8");
    }
    const postflight = buildWordStudyDataStalenessReport({
        localPath: targetPath,
        starterPath,
    });

    return {
        targetPath,
        starterPath,
        targetExists,
        merge,
        refreshStarter,
        starterEntries: Object.keys(starterEntries).length,
        existingEntries: Object.keys(existingEntries).length,
        writtenEntries: changed ? Object.keys(nextEntries).length : Object.keys(existingEntries).length,
        changed,
        preflight: postflight,
        preflightBeforeWrite: preflight,
    };
}

module.exports = {
    bootstrapWordStudyData,
    refreshStarterEntries,
};
