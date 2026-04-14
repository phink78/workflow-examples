import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputTools,
} from "./ai-elements/prompt-input";

export interface ChatInputProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onNewChat: () => void;
  onSendMessage: (text: string) => void;
}

export default function ChatInput({
  textareaRef,
  onNewChat,
  onSendMessage,
}: ChatInputProps) {
  const [text, setText] = useState("");

  return (
    <div className="w-full max-w-2xl bg-background">
      <PromptInput
        onSubmit={(message: PromptInputMessage) => {
          const hasText = Boolean(message.text);
          if (!hasText) return;

          onSendMessage(message.text || "");
          setText("");
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask me about flights, airports, or bookings..."
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onNewChat();
                setText("");
              }}
            >
              New Chat
            </Button>
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
