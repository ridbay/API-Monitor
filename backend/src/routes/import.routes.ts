import { Router } from "express";
import multer from "multer";
import { importController } from "../controllers/import.controller";
import { asyncHandler } from "../utils/asyncHandler";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

export const importRouter = Router();

importRouter.post("/preview", upload.single("file"), asyncHandler(importController.preview));
importRouter.post("/confirm", asyncHandler(importController.confirm));
