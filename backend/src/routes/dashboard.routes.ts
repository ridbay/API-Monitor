import { Router } from "express";
import { dashboardController } from "../controllers/dashboard.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", asyncHandler(dashboardController.summary));
dashboardRouter.get("/trends", asyncHandler(dashboardController.trends));
dashboardRouter.get("/endpoint-health", asyncHandler(dashboardController.endpointHealth));
