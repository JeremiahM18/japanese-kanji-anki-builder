const test = require("node:test");
const assert = require("node:assert/strict");

const { buildUrl, createVoicevoxClient } = require("../src/clients/voicevoxClient");

test("buildUrl normalizes the VOICEVOX engine base URL", () => {
    assert.equal(
        buildUrl("http://127.0.0.1:50021", "/audio_query", { text: "にち", speaker: 1 }),
        "http://127.0.0.1:50021/audio_query?text=%E3%81%AB%E3%81%A1&speaker=1"
    );
});

test("listSpeakers reads speaker metadata from the engine", async () => {
    const calls = [];
    const client = createVoicevoxClient({
        baseUrl: "http://127.0.0.1:50021",
        fetchImpl: async (url) => {
            calls.push(url);
            return {
                ok: true,
                async text() {
                    return JSON.stringify([{ name: "Nemo", styles: [{ id: 1, name: "ノーマル" }] }]);
                },
            };
        },
    });

    const speakers = await client.listSpeakers();

    assert.equal(calls.length, 1);
    assert.equal(calls[0], "http://127.0.0.1:50021/speakers");
    assert.equal(speakers[0].name, "Nemo");
    assert.equal(speakers[0].styles[0].id, 1);
});

test("synthesize requests audio_query and synthesis in order", async () => {
    const calls = [];
    const client = createVoicevoxClient({
        baseUrl: "http://127.0.0.1:50021",
        fetchImpl: async (url, options = {}) => {
            calls.push({ url, options });
            if (String(url).includes("audio_query")) {
                return {
                    ok: true,
                    async text() {
                        return JSON.stringify({ accent_phrases: [], speedScale: 1 });
                    },
                };
            }

            return {
                ok: true,
                async arrayBuffer() {
                    return Uint8Array.from([1, 2, 3]).buffer;
                },
            };
        },
    });

    const buffer = await client.synthesize({ text: "にち", speakerId: 1 });

    assert.deepEqual([...buffer], [1, 2, 3]);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /audio_query/);
    assert.equal(calls[0].options.method, "POST");
    assert.match(calls[1].url, /synthesis/);
    assert.equal(calls[1].options.method, "POST");
    assert.equal(calls[1].options.headers["content-type"], "application/json");
});
