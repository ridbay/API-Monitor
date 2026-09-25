import { useMutation } from "@tanstack/react-query";
import { chatApi } from "../services/api";

export function useSendChatMessage() {
  return useMutation({
    mutationFn: (message: string) => chatApi.send(message),
  });
}
