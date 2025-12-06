import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { Bot } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
}

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  streamingContent: string;
}

export function ChatArea({ messages, isLoading, streamingContent }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-primary/20 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-pulse-glow">
            <Bot className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            ¿En qué puedo ayudarte?
          </h2>
          <p className="text-muted-foreground">
            Escribe un mensaje o sube una imagen para comenzar una conversación con la IA.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea ref={scrollRef} className="flex-1 p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            role={message.role}
            content={message.content}
            images={message.images}
          />
        ))}
        
        {streamingContent && (
          <MessageBubble
            role="assistant"
            content={streamingContent}
          />
        )}
        
        {isLoading && !streamingContent && (
          <TypingIndicator />
        )}
      </div>
    </ScrollArea>
  );
}
