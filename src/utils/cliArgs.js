function parseNumericOption(arg, name) {
    return Number(arg.slice(name.length + 3));
}

function parseStringOption(arg, name) {
    return arg.slice(name.length + 3);
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

module.exports = {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseCsvOption,
    parseNumericOption,
    parseStringOption,
};
