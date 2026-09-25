import { Request, Response } from "express";
import { z } from "zod";
import { answer } from "../services/chat.service";

const chatSchema = z.object({ message: z.string().min(1).max(500) });

export const chatController = {
  async message(req: Request, res: Response) {
    const { message } = chatSchema.parse(req.body);
    const result = await answer(message);
    res.json(result);
  },
};
