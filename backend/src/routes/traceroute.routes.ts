import { Router, Request, Response, NextFunction } from "express";
import { runTraceroute } from "../services/traceroute.service";

export const tracerouteRouter = Router();

tracerouteRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid endpoint ID" });
      return;
    }
    const result = await runTraceroute(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

tracerouteRouter.post("/run", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { target } = req.body;
    if (!target) {
      res.status(400).json({ error: "Target URL or endpoint ID is required" });
      return;
    }
    const result = await runTraceroute(target);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
