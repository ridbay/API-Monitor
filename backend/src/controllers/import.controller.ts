import { Request, Response } from "express";
import { parseCsv } from "../services/csvImport.service";
import { endpointService } from "../services/endpoint.service";
import { createEndpointSchema } from "../services/endpoint.service";
import { HttpError } from "../middleware/errorHandler";
import { z } from "zod";

const confirmSchema = z.object({
  endpoints: z.array(createEndpointSchema),
});

export const importController = {
  async preview(req: Request, res: Response) {
    if (!req.file) throw new HttpError(400, "CSV file is required");

    const results = parseCsv(req.file.buffer);
    const validCount = results.filter((r) => r.data).length;

    res.json({
      total: results.length,
      valid: validCount,
      invalid: results.length - validCount,
      rows: results,
    });
  },

  async confirm(req: Request, res: Response) {
    const { endpoints } = confirmSchema.parse(req.body);
    const created = await endpointService.createMany(endpoints);
    res.status(201).json({ created: created.length, endpoints: created });
  },
};
