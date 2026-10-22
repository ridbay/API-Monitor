import express, { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import {
  discoverySummary,
  ingestLogs,
  IngestDefaults,
  listRoutes,
  promoteRoute,
  setRouteIgnored,
} from "../services/logDiscovery.service";
import { HttpError } from "../middleware/errorHandler";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const discoveryRouter = Router();

function defaultsFrom(source: Record<string, unknown> | undefined): IngestDefaults {
  const pick = (key: string) => (typeof source?.[key] === "string" && source[key] ? String(source[key]) : undefined);
  return { host: pick("host"), scheme: pick("scheme"), service: pick("service"), pod: pick("pod") };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "");
}

// Accepts either a raw log body (Content-Type: text/plain, defaults in the
// query string) or JSON: { lines: string[] } / { text: string }, plus { defaults }.
discoveryRouter.post(
  "/ingest",
  express.text({ type: "text/*", limit: "20mb" }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let lines: string[];
      let defaults: IngestDefaults;
      if (typeof req.body === "string") {
        lines = splitLines(req.body);
        defaults = defaultsFrom(req.query as Record<string, unknown>);
      } else if (Array.isArray(req.body?.lines)) {
        lines = req.body.lines.map(String);
        defaults = defaultsFrom(req.body.defaults);
      } else if (typeof req.body?.text === "string") {
        lines = splitLines(req.body.text);
        defaults = defaultsFrom(req.body.defaults);
      } else {
        throw new HttpError(400, "Send log lines as text/plain, or JSON with `lines` (array) or `text` (string)");
      }
      res.status(201).json(await ingestLogs(lines, defaults, String(req.query.source ?? "api")));
    } catch (err) {
      next(err);
    }
  }
);

discoveryRouter.post("/upload", upload.single("file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new HttpError(400, "Attach a log file in the `file` field");
    const lines = splitLines(req.file.buffer.toString("utf-8"));
    res.status(201).json(await ingestLogs(lines, defaultsFrom(req.body), `upload:${req.file.originalname}`));
  } catch (err) {
    next(err);
  }
});

discoveryRouter.get("/routes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, host, q } = req.query as Record<string, string | undefined>;
    res.json(await listRoutes({ status, host, q }));
  } catch (err) {
    next(err);
  }
});

discoveryRouter.get("/summary", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await discoverySummary());
  } catch (err) {
    next(err);
  }
});

discoveryRouter.post("/routes/:id/promote", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url, name, expected_status, interval } = req.body ?? {};
    res.status(201).json(await promoteRoute(Number(req.params.id), { url, name, expected_status, interval }));
  } catch (err) {
    next(err);
  }
});

discoveryRouter.post("/routes/:id/ignore", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await setRouteIgnored(Number(req.params.id), true));
  } catch (err) {
    next(err);
  }
});

discoveryRouter.post("/routes/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await setRouteIgnored(Number(req.params.id), false));
  } catch (err) {
    next(err);
  }
});
