import { Router } from "express";
import { endpointController } from "../controllers/endpoint.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { endpointDetailService } from "../services/endpointDetail.service";

export const endpointRouter = Router();

endpointRouter.get("/", asyncHandler(endpointController.list));
endpointRouter.get("/:id", asyncHandler(endpointController.getById));
endpointRouter.post("/", asyncHandler(endpointController.create));
endpointRouter.put("/:id", asyncHandler(endpointController.update));
endpointRouter.delete("/:id", asyncHandler(endpointController.remove));

endpointRouter.get(
  "/:id/trends",
  asyncHandler(async (req, res) => {
    const hours = req.query.hours ? Number(req.query.hours) : 24;
    const trends = await endpointDetailService.getTrends(Number(req.params.id), hours);
    res.json(trends);
  })
);

endpointRouter.get(
  "/:id/status-codes",
  asyncHandler(async (req, res) => {
    const hours = req.query.hours ? Number(req.query.hours) : undefined;
    const distribution = await endpointDetailService.getStatusCodeDistribution(Number(req.params.id), hours);
    res.json(distribution);
  })
);
