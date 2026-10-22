import { Router, Request, Response, NextFunction } from "express";
import { getServiceTopology } from "../services/topology.service";

export const topologyRouter = Router();

topologyRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const topology = await getServiceTopology();
    res.json(topology);
  } catch (err) {
    next(err);
  }
});
