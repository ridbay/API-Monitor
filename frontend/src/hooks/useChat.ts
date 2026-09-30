import { useMutation } from "@tanstack/react-query";
import { chatApi } from "../services/api";
import type { ChatTurn } from "../types";

export function useSendChatMessage() {
  return useMutation({
    mutationFn: ({ message, history }: { message: string; history?: ChatTurn[] }) => chatApi.send(message, history),
  });
}
