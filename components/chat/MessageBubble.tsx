import type { ChatMessage } from "@/lib/cv/schemas";

type MessageBubbleProps = {
  message: ChatMessage;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <article className={`message-bubble ${message.role === "user" ? "from-user" : "from-assistant"}`}>
      <p>{message.content}</p>
    </article>
  );
}
