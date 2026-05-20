const fs = require("node:fs");

function readJsonFile(filePath, { label = "JSON file" } = {}) {
    const text = fs.readFileSync(filePath, "utf8");
    try {
        return JSON.parse(text);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`${label} contains invalid JSON. Parser detail: ${error.message}`);
        }
        throw error;
    }
}

module.exports = {
    readJsonFile,
};
