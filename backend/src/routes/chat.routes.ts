import { Router } from "express";
import { chatController } from "../controllers/chat.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const chatRouter = Router();

chatRouter.post("/message", asyncHandler(chatController.message));
