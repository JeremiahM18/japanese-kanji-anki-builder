const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { buildLocalDirectoryIndex } = require("./mediaProviders");
const { buildMediaSourceReport } = require("./mediaSourceReportService");
const { buildStrokeOrderAnimationCandidates } = require("./strokeOrderService");

const SVG_EXTENSION_MAP = new Map([[".svg", "image/svg+xml"]]);

function tokenizePathData(d) {
    return Array.from(String(d || "").matchAll(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g), (match) => match[0]);
}

function cubicPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const a = mt2 * mt;
    const b = 3 * mt2 * t;
    const c = 3 * mt * t2;
    const d = t * t2;

    return {
        x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
        y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
}

function sampleCubicSegment(p0, p1, p2, p3, samples = 24) {
    const points = [];
    for (let index = 1; index <= samples; index += 1) {
        points.push(cubicPoint(p0, p1, p2, p3, index / samples));
    }
    return points;
}

function parseStrokePath(d) {
    const tokens = tokenizePathData(d);
    const points = [];
    let index = 0;
    let command = null;
    let current = { x: 0, y: 0 };
    let lastControl = null;

    while (index < tokens.length) {
        const token = tokens[index];
        if (/^[A-Za-z]$/.test(token)) {
            command = token;
            index += 1;
        }

        if (!command) {
            throw new Error(`Unsupported SVG path data: missing command in '${d}'`);
        }

        if (command === "M") {
            current = {
                x: Number(tokens[index]),
                y: Number(tokens[index + 1]),
            };
            points.push({ ...current });
            index += 2;
            lastControl = null;
            continue;
        }

        if (command === "C" || command === "c") {
            const isRelative = command === "c";
            const control1 = {
                x: Number(tokens[index]),
                y: Number(tokens[index + 1]),
            };
            const control2 = {
                x: Number(tokens[index + 2]),
                y: Number(tokens[index + 3]),
            };
            const end = {
                x: Number(tokens[index + 4]),
                y: Number(tokens[index + 5]),
            };
            index += 6;

            const nextControl1 = isRelative ? { x: current.x + control1.x, y: current.y + control1.y } : control1;
            const nextControl2 = isRelative ? { x: current.x + control2.x, y: current.y + control2.y } : control2;
            const nextEnd = isRelative ? { x: current.x + end.x, y: current.y + end.y } : end;
            points.push(...sampleCubicSegment(current, nextControl1, nextControl2, nextEnd));
            current = nextEnd;
            lastControl = nextControl2;
            continue;
        }

        if (command === "S") {
            const reflected = lastControl
                ? { x: current.x * 2 - lastControl.x, y: current.y * 2 - lastControl.y }
                : { ...current };
            const control2 = {
                x: Number(tokens[index]),
                y: Number(tokens[index + 1]),
            };
            const end = {
                x: Number(tokens[index + 2]),
                y: Number(tokens[index + 3]),
            };
            index += 4;

            points.push(...sampleCubicSegment(current, reflected, control2, end));
            current = end;
            lastControl = control2;
            continue;
        }

        throw new Error(`Unsupported SVG path command '${command}'`);
    }

    return points;
}

function parseKanjiVgSvg(svgText) {
    const viewBoxMatch = String(svgText).match(/viewBox="([^"]+)"/i);
    if (!viewBoxMatch) {
        throw new Error("SVG is missing a viewBox");
    }

    const [, viewBoxText] = viewBoxMatch;
    const [, , width, height] = viewBoxText.split(/\s+/).map(Number);
    const strokes = [];

    for (const match of String(svgText).matchAll(/<path\b[^>]*\sd="([^"]+)"[^>]*\/>/g)) {
        strokes.push(parseStrokePath(match[1]));
    }

    if (strokes.length === 0) {
        throw new Error("SVG does not contain stroke paths");
    }

    return {
        width,
        height,
        strokes,
    };
}

function transformPoint(point, { scale, padX, padY }) {
    return {
        x: padX + point.x * scale,
        y: padY + point.y * scale,
    };
}

function createFrame(width, height, fill = 0) {
    return new Uint8Array(width * height).fill(fill);
}

function stampCircle(frame, width, height, cx, cy, radius, colorIndex) {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));
    const radiusSquared = radius * radius;

    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const dx = x - cx;
            const dy = y - cy;
            if ((dx * dx) + (dy * dy) <= radiusSquared) {
                frame[(y * width) + x] = colorIndex;
            }
        }
    }
}

function drawPolyline(frame, width, height, points, colorIndex, strokeWidth) {
    if (!Array.isArray(points) || points.length === 0) {
        return;
    }

    const radius = Math.max(1, strokeWidth / 2);
    stampCircle(frame, width, height, points[0].x, points[0].y, radius, colorIndex);

    for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1];
        const end = points[index];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const steps = Math.max(1, Math.ceil(distance));

        for (let step = 0; step <= steps; step += 1) {
            const t = step / steps;
            stampCircle(frame, width, height, start.x + (dx * t), start.y + (dy * t), radius, colorIndex);
        }
    }
}

function buildGifFrames(parsedSvg, {
    size = 300,
    padding = 18,
    subframesPerStroke = 6,
    holdFramesPerStroke = 2,
    finalHoldFrames = 8,
} = {}) {
    const scale = Math.min((size - (padding * 2)) / parsedSvg.width, (size - (padding * 2)) / parsedSvg.height);
    const padX = (size - (parsedSvg.width * scale)) / 2;
    const padY = (size - (parsedSvg.height * scale)) / 2;
    const transformedStrokes = parsedSvg.strokes.map((stroke) => stroke.map((point) => transformPoint(point, { scale, padX, padY })));
    const strokeWidth = Math.max(2, 3 * scale);
    const frames = [];

    for (let strokeIndex = 0; strokeIndex < transformedStrokes.length; strokeIndex += 1) {
        const completed = transformedStrokes.slice(0, strokeIndex);
        const current = transformedStrokes[strokeIndex];

        for (let subframe = 1; subframe <= subframesPerStroke; subframe += 1) {
            const frame = createFrame(size, size, 0);
            for (const stroke of completed) {
                drawPolyline(frame, size, size, stroke, 1, strokeWidth);
            }

            const progress = subframe / subframesPerStroke;
            const pointCount = Math.max(2, Math.floor(current.length * progress));
            drawPolyline(frame, size, size, current.slice(0, pointCount), 2, strokeWidth);
            frames.push({ pixels: frame, delay: subframe === subframesPerStroke ? 10 : 6 });
        }

        for (let hold = 0; hold < holdFramesPerStroke; hold += 1) {
            const frame = createFrame(size, size, 0);
            for (const stroke of transformedStrokes.slice(0, strokeIndex + 1)) {
                drawPolyline(frame, size, size, stroke, 1, strokeWidth);
            }
            frames.push({ pixels: frame, delay: 8 });
        }
    }

    const finalFrame = createFrame(size, size, 0);
    for (const stroke of transformedStrokes) {
        drawPolyline(finalFrame, size, size, stroke, 1, strokeWidth);
    }
    for (let hold = 0; hold < finalHoldFrames; hold += 1) {
        frames.push({ pixels: Uint8Array.from(finalFrame), delay: 10 });
    }

    return { width: size, height: size, frames };
}

function pushWord(bytes, value) {
    bytes.push(value & 0xFF, (value >> 8) & 0xFF);
}

function packSubBlocks(buffer) {
    const bytes = [];
    for (let offset = 0; offset < buffer.length; offset += 255) {
        const slice = buffer.subarray(offset, Math.min(buffer.length, offset + 255));
        bytes.push(slice.length, ...slice);
    }
    bytes.push(0);
    return bytes;
}

function encodeLzw(minCodeSize, pixels) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let nextCode = endCode + 1;
    let codeSize = minCodeSize + 1;
    let dictionary = new Map();
    for (let index = 0; index < clearCode; index += 1) {
        dictionary.set(String.fromCharCode(index), index);
    }

    const output = [];
    let bitBuffer = 0;
    let bitCount = 0;

    function writeCode(code) {
        bitBuffer |= code << bitCount;
        bitCount += codeSize;
        while (bitCount >= 8) {
            output.push(bitBuffer & 0xFF);
            bitBuffer >>= 8;
            bitCount -= 8;
        }
    }

    function resetDictionary() {
        dictionary = new Map();
        for (let index = 0; index < clearCode; index += 1) {
            dictionary.set(String.fromCharCode(index), index);
        }
        nextCode = endCode + 1;
        codeSize = minCodeSize + 1;
    }

    writeCode(clearCode);
    let phrase = String.fromCharCode(pixels[0]);

    for (let index = 1; index < pixels.length; index += 1) {
        const char = String.fromCharCode(pixels[index]);
        const phrasePlusChar = phrase + char;
        if (dictionary.has(phrasePlusChar)) {
            phrase = phrasePlusChar;
            continue;
        }

        writeCode(dictionary.get(phrase));
        if (nextCode < 4096) {
            dictionary.set(phrasePlusChar, nextCode);
            nextCode += 1;
            if (nextCode === (1 << codeSize) && codeSize < 12) {
                codeSize += 1;
            }
        } else {
            writeCode(clearCode);
            resetDictionary();
        }

        phrase = char;
    }

    writeCode(dictionary.get(phrase));
    writeCode(endCode);

    if (bitCount > 0) {
        output.push(bitBuffer & 0xFF);
    }

    return Buffer.from(output);
}

function encodeAnimatedGif({ width, height, frames, loopCount = 0 }) {
    const palette = [
        255, 255, 255,
        0, 0, 0,
        214, 58, 58,
        180, 180, 180,
    ];
    const minCodeSize = 2;
    const bytes = [];

    bytes.push(...Buffer.from("GIF89a", "ascii"));
    pushWord(bytes, width);
    pushWord(bytes, height);
    bytes.push(0xF1, 0x00, 0x00);
    bytes.push(...palette);

    bytes.push(0x21, 0xFF, 0x0B, ...Buffer.from("NETSCAPE2.0", "ascii"), 0x03, 0x01);
    pushWord(bytes, loopCount);
    bytes.push(0x00);

    for (const frame of frames) {
        bytes.push(0x21, 0xF9, 0x04, 0x00);
        pushWord(bytes, frame.delay || 8);
        bytes.push(0x00, 0x00);

        bytes.push(0x2C);
        pushWord(bytes, 0);
        pushWord(bytes, 0);
        pushWord(bytes, width);
        pushWord(bytes, height);
        bytes.push(0x00);
        bytes.push(minCodeSize);
        bytes.push(...packSubBlocks(encodeLzw(minCodeSize, frame.pixels)));
    }

    bytes.push(0x3B);
    return Buffer.from(bytes);
}

async function findSvgSourceAsset(kanji, imageSourceDir) {
    const index = await buildLocalDirectoryIndex(imageSourceDir, SVG_EXTENSION_MAP);

    for (const candidate of buildStrokeOrderAnimationCandidates(kanji)) {
        const matches = index.get(candidate) || [];
        const preferred = matches.find((match) => match.fileName.includes("KanjiVG stroke order")) || matches[0] || null;
        if (preferred) {
            return path.join(imageSourceDir, preferred.fileName);
        }
    }

    return null;
}

function buildOutputFileName(kanji) {
    const preferred = buildStrokeOrderAnimationCandidates(kanji).find((candidate) => candidate.endsWith("-order"));
    return `${preferred || kanji}-order.gif`.replace(/-order-order\.gif$/, "-order.gif");
}

async function writeFileIfChanged(filePath, buffer) {
    try {
        const existing = await fsp.readFile(filePath);
        if (Buffer.compare(existing, buffer) === 0) {
            return "unchanged";
        }
    } catch (error) {
        if (error?.code !== "ENOENT") {
            throw error;
        }
    }

    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, buffer);
    return "written";
}

async function generateStrokeOrderGifs({
    jlptOnlyJson,
    imageSourceDir,
    animationSourceDir,
    levels = [5],
    limit = 25,
    overwrite = false,
}) {
    const sourceReport = await buildMediaSourceReport({
        jlptOnlyJson,
        strokeOrderImageSourceDir: imageSourceDir,
        strokeOrderAnimationSourceDir: animationSourceDir,
        audioSourceDir: "",
        audioEnabled: false,
        levels,
        limit,
    });

    const summary = {
        levels: sourceReport.levels,
        totalKanji: sourceReport.totalKanji,
        attempted: 0,
        generated: 0,
        unchanged: 0,
        skippedExisting: 0,
        failures: [],
        files: [],
    };

    for (const row of sourceReport.rows || []) {
        if (row.hasTrueAnimation) {
            continue;
        }

        const outputFileName = buildOutputFileName(row.kanji);
        const outputPath = path.join(animationSourceDir, outputFileName);
        if (!overwrite && fs.existsSync(outputPath)) {
            summary.skippedExisting += 1;
            continue;
        }

        summary.attempted += 1;
        try {
            const svgPath = await findSvgSourceAsset(row.kanji, imageSourceDir);
            if (!svgPath) {
                throw new Error("No SVG source asset available");
            }

            const svgText = await fsp.readFile(svgPath, "utf8");
            const parsed = parseKanjiVgSvg(svgText);
            const animation = buildGifFrames(parsed);
            const buffer = encodeAnimatedGif(animation);
            const status = await writeFileIfChanged(outputPath, buffer);
            if (status === "unchanged") {
                summary.unchanged += 1;
            } else {
                summary.generated += 1;
            }
            summary.files.push({
                kanji: row.kanji,
                svgPath,
                outputPath,
                fileName: outputFileName,
                status,
                strokeCount: parsed.strokes.length,
            });
        } catch (error) {
            summary.failures.push({
                kanji: row.kanji,
                message: String(error?.message || error),
            });
        }
    }

    return summary;
}

function formatStrokeOrderGifGenerationSummary(summary) {
    const lines = [];
    lines.push("Japanese Kanji Builder Stroke-Order GIF Generation");
    lines.push("");
    lines.push(`Target levels: ${(summary.levels || []).map((level) => `N${level}`).join(", ") || "n/a"}`);
    lines.push(`Kanji in scope: ${summary.totalKanji}`);
    lines.push(`Attempted generations: ${summary.attempted}`);
    lines.push(`Generated GIFs: ${summary.generated}`);
    lines.push(`Unchanged GIFs: ${summary.unchanged}`);
    lines.push(`Skipped existing GIFs: ${summary.skippedExisting}`);

    if (summary.files?.length) {
        lines.push("");
        lines.push("Generated:");
        for (const file of summary.files) {
            lines.push(`- ${file.kanji}: ${path.basename(file.outputPath)} (${file.strokeCount} strokes, ${file.status})`);
        }
    }

    if (summary.failures?.length) {
        lines.push("");
        lines.push("Failures:");
        for (const failure of summary.failures) {
            lines.push(`- ${failure.kanji}: ${failure.message}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildGifFrames,
    buildOutputFileName,
    encodeAnimatedGif,
    formatStrokeOrderGifGenerationSummary,
    generateStrokeOrderGifs,
    parseKanjiVgSvg,
    parseStrokePath,
};
