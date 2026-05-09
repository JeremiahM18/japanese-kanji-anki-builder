const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildSourceAccessPacket,
    formatSourceAccessPacketJson,
    requiresSourceAccessPacket,
    validateSourceAccessPacket,
    validateSourceAccessPacketFile,
} = require("../src/services/jlptKanjiSourceAccessPacketService");
const {
    buildPacketFromOptions,
    formatPacketReport,
    parseArgs,
    run,
} = require("../scripts/createJlptKanjiSourceAccessPacket");

function buildValidPacket(overrides = {}) {
    return buildSourceAccessPacket({
        sourceId: "nihongo_sou_matome_kanji",
        checkedAt: "2026-05-09",
        sourceSurface: {
            type: "official-correction-list-target-row",
            title: "N2 kanji correction-list target rows",
            citation: "ASK Publishing, Nihongo Sou Matome N2 Kanji official correction-list target rows",
            evidenceRef: "https://storage.ask-books.com/uploads/books/9784866395128/teacher_materials/teacher_material_1.pdf",
            notes: "Use only rows where the correction list names the target kanji.",
        },
        ...overrides,
    });
}

test("source-access packet validates exact assignment surfaces", () => {
    const packet = buildValidPacket();
    const validation = validateSourceAccessPacket({
        packet,
        expectedSourceId: "nihongo_sou_matome_kanji",
    });

    assert.equal(validation.valid, true);
    assert.equal(packet.noDeckMutation, true);
    assert.equal(packet.sourceSurface.type, "official-correction-list-target-row");
});

test("source-access packet rejects missing or mismatched proof fields", () => {
    const validation = validateSourceAccessPacket({
        packet: buildSourceAccessPacket({
            sourceId: "try_jlpt_textbook",
            checkedAt: "",
            sourceSurface: {
                type: "grammar-syllabus",
                title: "",
                citation: "",
                evidenceRef: "",
            },
        }),
        expectedSourceId: "nihongo_sou_matome_kanji",
    });

    assert.equal(validation.valid, false);
    assert.match(validation.blockers.join("\n"), /does not match nihongo_sou_matome_kanji/);
    assert.match(validation.blockers.join("\n"), /checkedAt/);
    assert.match(validation.blockers.join("\n"), /sourceSurface.type/);
    assert.match(validation.blockers.join("\n"), /sourceSurface.citation/);
});

test("source-access packet files are validated before large batch use", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "source-access-packet-"));
    const packetPath = path.join(tmpDir, "packet.json");
    fs.writeFileSync(packetPath, formatSourceAccessPacketJson(buildValidPacket()), "utf8");

    const validation = validateSourceAccessPacketFile({
        packetPath,
        expectedSourceId: "nihongo_sou_matome_kanji",
    });

    assert.equal(validation.valid, true);
    assert.equal(validation.packetPath, packetPath);
});

test("source-access packet threshold starts at 100 rows and treats unbounded as large", () => {
    assert.equal(requiresSourceAccessPacket(99), false);
    assert.equal(requiresSourceAccessPacket(100), true);
    assert.equal(requiresSourceAccessPacket(null), true);
});

test("source-access packet script writes only the ignored packet artifact", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "source-access-packet-script-"));
    const outPath = path.join(tmpDir, "packet.json");
    const options = parseArgs([
        "--source=ask_hajimete_jlpt_kanji",
        "--surface-type=target-entry-page",
        "--title=ASK Hajimete N1 sample target entries",
        "--citation=ASK Publishing, Hajimete N1 official sample target-entry pages",
        "--evidence-ref=https://storage.ask-books.com/uploads/books/9784866393643/images/sample_image_12.png",
        "--notes=Target-entry rows only",
        "--checked-at=2026-05-09",
        `--out=${outPath}`,
        "--json",
    ]);

    assert.equal(options.source, "ask_hajimete_jlpt_kanji");
    assert.equal(options.surfaceType, "target-entry-page");
    const packet = buildPacketFromOptions(options);
    assert.equal(packet.sourceSurface.title, "ASK Hajimete N1 sample target entries");

    const result = run(options);
    assert.equal(result.valid, true);
    assert.equal(fs.existsSync(outPath), true);
    const text = formatPacketReport({
        packetPath: outPath,
        packet: result.packet,
        validation: result,
    });
    assert.match(text, /No deck mutation: yes/);
    assert.match(text, /does not create review rows, import evidence, move kanji, move words, update decks, or change readiness/);
});
