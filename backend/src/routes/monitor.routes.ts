import { Router } from "express";
import { monitorController } from "../controllers/monitor.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const monitorRouter = Router();

monitorRouter.post("/run/:id", asyncHandler(monitorController.runOne));
monitorRouter.post("/run-all", asyncHandler(monitorController.runAll));
