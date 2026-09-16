import { Router } from "express";
import { reportController } from "../controllers/report.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const reportRouter = Router();

reportRouter.get("/daily", asyncHandler(reportController.daily));
reportRouter.get("/weekly", asyncHandler(reportController.weekly));
