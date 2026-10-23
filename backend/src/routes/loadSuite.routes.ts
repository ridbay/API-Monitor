import { Router, Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  cancelRun,
  createSuite,
  deleteSuite,
  getRun,
  listRuns,
  listSuites,
  startRun,
  subscribeToRun,
  updateSuite,
} from "../services/loadSuite.service";

export const loadSuiteRouter = Router();

loadSuiteRouter.get("/suites", asyncHandler(async (_req: Request, res: Response) => {
  res.json(await listSuites());
}));

loadSuiteRouter.post("/suites", asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await createSuite(req.body));
}));

loadSuiteRouter.put("/suites/:id", asyncHandler(async (req: Request, res: Response) => {
  res.json(await updateSuite(Number(req.params.id), req.body));
}));

loadSuiteRouter.delete("/suites/:id", asyncHandler(async (req: Request, res: Response) => {
  await deleteSuite(Number(req.params.id));
  res.status(204).end();
}));

loadSuiteRouter.post("/suites/:id/run", asyncHandler(async (req: Request, res: Response) => {
  res.status(202).json(await startRun(Number(req.params.id)));
}));

loadSuiteRouter.get("/runs", asyncHandler(async (req: Request, res: Response) => {
  res.json(await listRuns(req.query.suite_id ? Number(req.query.suite_id) : undefined));
}));

loadSuiteRouter.get("/runs/:id", asyncHandler(async (req: Request, res: Response) => {
  res.json(await getRun(Number(req.params.id)));
}));

loadSuiteRouter.post("/runs/:id/cancel", asyncHandler(async (req: Request, res: Response) => {
  await cancelRun(Number(req.params.id));
  res.status(202).json({ cancelling: true });
}));

// Server-sent events: one "tick" per second while the run is live, then a
// final "end" with the summary. A finished run gets its "end" immediately.
loadSuiteRouter.get("/runs/:id/stream", asyncHandler(async (req: Request, res: Response) => {
  const runId = Number(req.params.id);
  const run = await getRun(runId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const end = (payload: unknown) => {
    send("end", payload);
    res.end();
  };

  const subscription = subscribeToRun(runId, (tick) => send("tick", tick), (payload) => end(payload));
  if (!subscription) {
    for (const tick of run.timeline) send("tick", tick);
    end({ status: run.status, summary: run.summary, error: run.error });
    return;
  }
  for (const tick of subscription.backlog) send("tick", tick);
  req.on("close", subscription.unsubscribe);
}));
