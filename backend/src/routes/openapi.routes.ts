import { Router } from "express";
import { openapiController } from "../controllers/openapi.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const openapiRouter = Router();

openapiRouter.post("/discover", asyncHandler(openapiController.discover));
openapiRouter.post("/import", asyncHandler(openapiController.importSelected));
