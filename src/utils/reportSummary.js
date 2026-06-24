function summarizeReportShape(value, { maxDepth = 2 } = {}) {
    return describeValue(value, maxDepth);
}

function describeValue(value, depth) {
    if (Array.isArray(value)) {
        return {
            type: "array",
            count: value.length,
            item: value.length > 0 && depth > 0 ? describeValue(value[0], depth - 1) : null,
        };
    }
    if (value && typeof value === "object") {
        const keys = Object.keys(value).sort();
        const shape = {
            type: "object",
            keys,
        };
        if (depth > 0) {
            shape.children = Object.fromEntries(
                keys.map((key) => [key, describeValue(value[key], depth - 1)])
            );
        }
        return shape;
    }
    return {
        type: value === null ? "null" : typeof value,
    };
}

module.exports = {
    summarizeReportShape,
};
