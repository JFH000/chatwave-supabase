import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Trash2, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface ChatSidebarProps {
  chats: Chat[];
  activeChat: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function ChatSidebar({
  chats,
  activeChat,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  isOpen,
  onToggle,
}: ChatSidebarProps) {
  const { user, signOut } = useAuth();
  const [hoveredChat, setHoveredChat] = useState<string | null>(null);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:relative inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <div className="w-4 h-4 bg-primary-foreground rounded-sm" />
              </div>
              <span className="font-semibold text-foreground">AI Chat</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="md:hidden text-sidebar-foreground"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          <Button 
            onClick={onNewChat}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuevo chat
          </Button>
        </div>

        <ScrollArea className="flex-1 p-2">
          <div className="space-y-1">
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                  activeChat === chat.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
                onClick={() => onSelectChat(chat.id)}
                onMouseEnter={() => setHoveredChat(chat.id)}
                onMouseLeave={() => setHoveredChat(null)}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 truncate text-sm">{chat.title}</span>
                {hoveredChat === chat.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(chat.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <span className="text-sm font-medium text-muted-foreground">
                {user?.email?.[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            onClick={signOut}
            className="w-full justify-start text-muted-foreground hover:text-foreground gap-2"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className="fixed top-4 left-4 z-30 md:hidden bg-card border border-border shadow-lg"
      >
        <Menu className="h-5 w-5" />
      </Button>
    </>
  );
}
