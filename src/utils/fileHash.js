const crypto = require("node:crypto");
const fs = require("node:fs");

function hashFileSync(filePath) {
    const buffer = fs.readFileSync(filePath);
    return {
        path: filePath,
        bytes: buffer.length,
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    };
}

module.exports = {
    hashFileSync,
};
