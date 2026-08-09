function parseNumericOption(arg, name) {
    return Number(arg.slice(name.length + 3));
}

function parseStringOption(arg, name) {
    return arg.slice(name.length + 3);
}

function parseExplicitJlptLevels(value, label = "level") {
    const raw = String(value ?? "").trim();
    if (!raw) {
        throw new Error(`${label} must explicitly select JLPT level 1-5 or all.`);
    }
    if (raw.toLowerCase() === "all") {
        return [5, 4, 3, 2, 1];
    }

    const tokens = raw.split(",").map((entry) => entry.trim());
    const invalid = tokens.filter((entry) => !/^N?[1-5]$/i.test(entry));
    if (tokens.length === 0 || invalid.length > 0) {
        const invalidLabels = invalid.map((entry) => entry || "<empty>");
        throw new Error(`${label} contains unsupported JLPT level values: ${invalidLabels.join(", ") || raw}.`);
    }

    return [...new Set(tokens.map((entry) => Number(entry.toUpperCase().replace(/^N/, ""))))]
        .sort((left, right) => right - left);
}

function parseCsvOption(arg, name) {
    return parseStringOption(arg, name)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function collectUnknownArg(options, arg) {
    options.unknownArgs.push(arg);
}

function assertNoUnknownArgs(commandName, unknownArgs = []) {
    if (Array.isArray(unknownArgs) && unknownArgs.length > 0) {
        throw new Error(`Unsupported arguments for ${commandName}: ${unknownArgs.join(", ")}`);
    }
}

function invokeCliMain(mainFn) {
    return Promise.resolve().then(() => mainFn());
}

module.exports = {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseExplicitJlptLevels,
    parseNumericOption,
    parseStringOption,
};
