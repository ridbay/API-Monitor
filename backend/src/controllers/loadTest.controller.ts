import { Request, Response } from "express";
import { z } from "zod";
import { endpointRepository } from "../repositories/endpoint.repository";
import { runLoadTest } from "../services/loadTest.service";
import { HttpError } from "../middleware/errorHandler";

const loadTestSchema = z.object({
  concurrency: z.number().int().min(1).max(50).default(10),
  requestCount: z.number().int().min(1).max(500).default(50),
});

export const loadTestController = {
  async run(req: Request, res: Response) {
    const id = Number(req.params.id);
    const endpoint = await endpointRepository.findById(id);
    if (!endpoint) throw new HttpError(404, "Endpoint not found");

    const options = loadTestSchema.parse(req.body ?? {});
    const result = await runLoadTest(endpoint, options);
    res.json(result);
  },
};
