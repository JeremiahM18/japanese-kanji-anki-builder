const express = require("express");
const { z, ZodError } = require("zod");

const { BadRequestError, NotFoundError, ValidationError } = require("./apiErrors");
const { logger } = require("./logger");
const { createInferenceEngine } = require("./inference/inferenceEngine");
const { createExportService } = require("./services/exportService");

const kanjiParamsSchema = z.object({
    kanji: z.string().trim().min(1),
});

const audioSyncBodySchema = z.object({
    category: z.enum(["kanji-reading", "word-reading", "sentence"]).optional(),
    text: z.string().trim().min(1).optional(),
    reading: z.string().trim().min(1).optional(),
    voice: z.string().trim().min(1).optional(),
    locale: z.string().trim().min(1).optional(),
}).strict();

function parseLevel(param) {
    const s = String(param).toUpperCase().replace("N", "").trim();
    const n = Number(s);

    if (![1, 2, 3, 4, 5].includes(n)) {
        return null;
    }

    return n;
}

function parseLimit(value) {
    if (value == null) {
        return null;
    }

    const n = Number(value);

    if (!Number.isFinite(n) || n <= 0) {
        return null;
    }

    return Math.floor(n);
}

function formatZodIssues(error) {
    return error.issues.map((issue) => ({
        path: issue.path.join(".") || "root",
        message: issue.message,
        code: issue.code,
    }));
}

function validateKanjiParams(params) {
    const parsed = kanjiParamsSchema.safeParse(params);

    if (!parsed.success) {
        throw new ValidationError("Invalid kanji route parameter.", formatZodIssues(parsed.error));
    }

    return parsed.data;
}

function validateAudioSyncBody(body) {
    const parsed = audioSyncBodySchema.safeParse(body || {});

    if (!parsed.success) {
        throw new ValidationError("Invalid audio sync request body.", formatZodIssues(parsed.error));
    }

    return parsed.data;
}

function validateExportRequest(req) {
    const level = parseLevel(req.params.level);
    if (!level) {
        throw new BadRequestError("Invalid level parameter. Use N1-N5 or 1-5.");
    }

    const limit = parseLimit(req.query.limit);
    if (req.query.limit != null && limit == null) {
        throw new BadRequestError("Invalid limit parameter. Must be a positive integer.");
    }

    return {
        level,
        limit,
    };
}

function createApp({
    config,
    jlptOnlyJson,
    kradMap,
    pickMainComponent,
    kanjiApiClient,
    strokeOrderService,
    audioService,
    sentenceCorpus = [],
    curatedStudyData = {},
    inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData }),
    exportService = createExportService({ inferenceEngine, curatedStudyData, sentenceCorpus }),
}) {
    const app = express();
    const jlptKanjiCount = Object.keys(jlptOnlyJson).length;

    app.use(express.json());

    app.get("/", (_req, res) => {
        res.type("text").send("OK - Japanese Kanji TSV Exporter");
    });

    app.get("/healthz", (_req, res) => {
        res.status(200).json({
            status: "ok",
            service: "japanese-kanji-builder",
            timestamp: new Date().toISOString(),
        });
    });

    app.get("/readyz", (_req, res) => {
        const metrics = typeof kanjiApiClient.getMetrics === "function"
            ? kanjiApiClient.getMetrics()
            : null;
        const strokeOrderProviderMetrics = typeof strokeOrderService?.getProviderMetrics === "function"
            ? strokeOrderService.getProviderMetrics()
            : null;
        const audioProviderMetrics = typeof audioService?.getProviderMetrics === "function"
            ? audioService.getProviderMetrics()
            : null;

        res.status(200).json({
            status: "ready",
            datasets: {
                jlptKanjiCount,
                kradEntries: kradMap.size,
                sentenceCorpusEntries: sentenceCorpus.length,
                curatedStudyEntries: Object.keys(curatedStudyData).length,
            },
            config: {
                cacheDir: config.cacheDir,
                jlptJsonPath: config.jlptJsonPath,
                kradfilePath: config.kradfilePath,
                sentenceCorpusPath: config.sentenceCorpusPath,
                curatedStudyDataPath: config.curatedStudyDataPath,
                mediaRootDir: config.mediaRootDir,
                strokeOrderImageSourceDir: config.strokeOrderImageSourceDir,
                strokeOrderAnimationSourceDir: config.strokeOrderAnimationSourceDir,
                audioSourceDir: config.audioSourceDir,
                remoteStrokeOrderImageBaseUrl: config.remoteStrokeOrderImageBaseUrl || null,
                remoteStrokeOrderAnimationBaseUrl: config.remoteStrokeOrderAnimationBaseUrl || null,
                remoteAudioBaseUrl: config.remoteAudioBaseUrl || null,
                exportConcurrency: config.exportConcurrency,
                fetchTimeoutMs: config.fetchTimeoutMs,
            },
            cache: metrics,
            mediaProviders: {
                strokeOrder: strokeOrderProviderMetrics,
                audio: audioProviderMetrics,
            },
        });
    });

    app.get("/inference/:kanji", async (req, res, next) => {
        try {
            const { kanji } = validateKanjiParams(req.params);
            const inference = await exportService.buildInferenceForKanji({
                kanji,
                jlptEntry: jlptOnlyJson[kanji] || null,
                kanjiApiClient,
                strokeOrderService,
                audioService,
            });

            return res.status(200).json({
                status: "ok",
                inference,
            });
        } catch (err) {
            return next(err);
        }
    });

    app.get("/media/:kanji", async (req, res, next) => {
        try {
            const { kanji } = validateKanjiParams(req.params);
            const manifest = await strokeOrderService.getManifest(kanji);

            if (!manifest) {
                throw new NotFoundError(`No managed media manifest exists for kanji '${kanji}'.`, { kanji });
            }

            return res.status(200).json({
                status: "ok",
                manifest,
                bestStrokeOrderPath: await strokeOrderService.getBestStrokeOrderPath(kanji),
                strokeOrderImagePath: typeof strokeOrderService?.getStrokeOrderImagePath === "function"
                    ? await strokeOrderService.getStrokeOrderImagePath(kanji)
                    : "",
                strokeOrderAnimationPath: typeof strokeOrderService?.getStrokeOrderAnimationPath === "function"
                    ? await strokeOrderService.getStrokeOrderAnimationPath(kanji)
                    : "",
                bestAudioPath: typeof audioService?.getBestAudioPath === "function"
                    ? await audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji })
                    : "",
            });
        } catch (err) {
            return next(err);
        }
    });

    app.post("/media/:kanji/sync", async (req, res, next) => {
        try {
            const { kanji } = validateKanjiParams(req.params);
            const result = await strokeOrderService.syncKanji(kanji);
            return res.status(200).json({
                status: "ok",
                ...result,
                bestStrokeOrderPath: await strokeOrderService.getBestStrokeOrderPath(kanji),
                strokeOrderImagePath: typeof strokeOrderService?.getStrokeOrderImagePath === "function"
                    ? await strokeOrderService.getStrokeOrderImagePath(kanji)
                    : "",
                strokeOrderAnimationPath: typeof strokeOrderService?.getStrokeOrderAnimationPath === "function"
                    ? await strokeOrderService.getStrokeOrderAnimationPath(kanji)
                    : "",
            });
        } catch (err) {
            return next(err);
        }
    });

    app.post("/media/:kanji/audio/sync", async (req, res, next) => {
        try {
            const { kanji } = validateKanjiParams(req.params);
            const body = validateAudioSyncBody(req.body);
            const result = await audioService.syncKanji(kanji, body);
            return res.status(200).json({
                status: "ok",
                ...result,
                bestAudioPath: await audioService.getBestAudioPath(kanji, {
                    category: body.category || "kanji-reading",
                    text: body.text || kanji,
                    reading: body.reading,
                }),
            });
        } catch (err) {
            return next(err);
        }
    });

    async function handleExportRequest(req, res, next, options = {}) {
        const startedAt = Date.now();

        try {
            const { level, limit } = validateExportRequest(req);

            logger.info(
                {
                    level,
                    limit: limit ?? "all",
                    concurrency: config.exportConcurrency,
                    download: Boolean(options.download),
                },
                "Generating TSV for JLPT level"
            );

            const tsv = await exportService.buildTsvForJlptLevel({
                levelNumber: level,
                jlptOnlyJson,
                kradMap,
                pickMainComponent,
                kanjiApiClient,
                strokeOrderService,
                audioService,
                limit,
                concurrency: config.exportConcurrency,
            });

            logger.info(
                {
                    level,
                    limit: limit ?? "all",
                    durationMs: Date.now() - startedAt,
                    rowCount: tsv.split("\n").length - 1,
                    download: Boolean(options.download),
                    cache: typeof kanjiApiClient.getMetrics === "function" ? kanjiApiClient.getMetrics() : undefined,
                },
                "Generated TSV for JLPT level"
            );

            if (options.download) {
                res.setHeader("Content-Disposition", `attachment; filename="jlpt_n${level}_kanji.tsv"`);
            }

            return res
                .status(200)
                .type("text/tab-separated-values; charset=utf-8")
                .send(tsv);
        } catch (err) {
            return next(err);
        }
    }

    app.get("/export/:level", (req, res, next) => handleExportRequest(req, res, next));
    app.get("/export/:level/download", (req, res, next) => handleExportRequest(req, res, next, { download: true }));

    app.use((err, _req, res, _next) => {
        logger.error({ err }, "Error handling request");

        if (err instanceof ZodError) {
            err = new ValidationError("Request validation failed.", formatZodIssues(err));
        }

        if (err && err.type === "entity.parse.failed") {
            err = new BadRequestError("Malformed JSON request body.");
        }

        if (err && typeof err.statusCode === "number") {
            return res.status(err.statusCode).json({
                status: "error",
                code: err.code || "request_error",
                message: err.message,
                details: err.details || null,
            });
        }

        if (process.env.NODE_ENV !== "production") {
            return res.status(500).json({
                status: "error",
                code: "internal_error",
                message: err?.message || "Internal Server Error",
                stack: err?.stack || String(err),
            });
        }

        return res.status(500).json({
            status: "error",
            code: "internal_error",
            message: "Internal Server Error",
        });
    });

    return app;
}

module.exports = {
    createApp,
    parseLevel,
    parseLimit,
};

