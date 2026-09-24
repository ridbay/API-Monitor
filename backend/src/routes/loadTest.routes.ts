import { Router } from "express";
import { loadTestController } from "../controllers/loadTest.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const loadTestRouter = Router();

loadTestRouter.post("/:id/run", asyncHandler(loadTestController.run));
