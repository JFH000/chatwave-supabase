import { Bot } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex gap-4 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
        <Bot className="h-4 w-4 text-accent-foreground" />
      </div>
      <div className="bg-assistant-message rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="typing-indicator flex gap-1">
          <span className="w-2 h-2 bg-muted-foreground rounded-full" />
          <span className="w-2 h-2 bg-muted-foreground rounded-full" />
          <span className="w-2 h-2 bg-muted-foreground rounded-full" />
        </div>
      </div>
    </div>
  );
}
