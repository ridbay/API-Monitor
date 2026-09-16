import { z } from "zod";
import { endpointRepository, CreateEndpointInput } from "../repositories/endpoint.repository";

export const createEndpointSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  expected_status: z.number().int().min(100).max(599).default(200),
  timeout: z.number().int().min(100).max(60_000).default(5000),
  interval: z.enum(["1m", "5m", "15m", "30m", "1h"]).default("5m"),
});

export const updateEndpointSchema = createEndpointSchema.partial();

export const endpointService = {
  listWithStats: () => endpointRepository.findAllWithStats(),

  getById: (id: number) => endpointRepository.findByIdWithStats(id),

  create: (input: CreateEndpointInput) => endpointRepository.create(input),

  createMany: (inputs: CreateEndpointInput[]) => endpointRepository.createMany(inputs),

  update: (id: number, input: Partial<CreateEndpointInput>) => endpointRepository.update(id, input),

  softDelete: (id: number) => endpointRepository.softDelete(id),
};
