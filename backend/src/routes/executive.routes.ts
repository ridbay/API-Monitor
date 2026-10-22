import { Router, Request, Response, NextFunction } from "express";
import { getExecutiveSummary } from "../services/executive.service";

export const executiveRouter = Router();

executiveRouter.get("/summary", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await getExecutiveSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
});
