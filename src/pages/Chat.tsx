import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { ChatInput } from "@/components/chat/ChatInput";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
}

export default function Chat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShopifyDialog, setShowShopifyDialog] = useState(false);
  const [shopifyUrl, setShopifyUrl] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  // Fetch chats
  const fetchChats = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching chats:", error);
      return;
    }

    setChats(data || []);
    
    if (data && data.length > 0 && !activeChat) {
      setActiveChat(data[0].id);
    }
  }, [user, activeChat]);

  // Fetch messages for active chat
  const fetchMessages = useCallback(async () => {
    if (!activeChat || !user) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", activeChat)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      return;
    }

    // Fetch images for messages
    const messagesWithImages: Message[] = await Promise.all(
      (data || []).map(async (msg) => {
        if (msg.role === "user") {
          const { data: imageData } = await supabase
            .from("uploaded_images")
            .select("file_path")
            .eq("message_id", msg.id);

          const images = imageData?.map((img) => {
            const { data: urlData } = supabase.storage
              .from("chat-images")
              .getPublicUrl(img.file_path);
            return urlData.publicUrl;
          });

          return { id: msg.id, role: msg.role as "user" | "assistant", content: msg.content, images };
        }
        return { id: msg.id, role: msg.role as "user" | "assistant", content: msg.content };
      })
    );

    setMessages(messagesWithImages);
  }, [activeChat, user]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Create new chat - show Shopify dialog first
  const handleNewChat = () => {
    setShopifyUrl("");
    setShowShopifyDialog(true);
  };

  // Handle Shopify URL submission
  const handleShopifySubmit = async () => {
    if (!shopifyUrl.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa el link de la tienda de Shopify",
        variant: "destructive",
      });
      return;
    }

    if (!user) return;

    setIsCreatingChat(true);
    setShowShopifyDialog(false);

    try {
      // Send Shopify URL to n8n
      const n8nWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;
      
      if (n8nWebhookUrl) {
        try {
          await fetch(n8nWebhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              shopify_url: shopifyUrl.trim(),
              action: "setup_chat",
            }),
          });
        } catch (error) {
          console.error("Error sending Shopify URL to n8n:", error);
          // Continue even if n8n call fails
        }
      }

      // Sleep/delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Create the chat
      const { data, error } = await supabase
        .from("chats")
        .insert({ 
          user_id: user.id, 
          title: shopifyUrl.trim() || "Nuevo chat" 
        })
        .select()
        .single();

      if (error) {
        toast({
          title: "Error",
          description: "No se pudo crear el chat",
          variant: "destructive",
        });
        return;
      }

      setChats([data, ...chats]);
      setActiveChat(data.id);
      setMessages([]);
      setSidebarOpen(false);
    } catch (error) {
      console.error("Error creating chat:", error);
      toast({
        title: "Error",
        description: "Ocurrió un error al crear el chat",
        variant: "destructive",
      });
    } finally {
      setIsCreatingChat(false);
      setShopifyUrl("");
    }
  };

  // Delete chat
  const handleDeleteChat = async (chatId: string) => {
    const { error } = await supabase.from("chats").delete().eq("id", chatId);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar el chat",
        variant: "destructive",
      });
      return;
    }

    const updatedChats = chats.filter((c) => c.id !== chatId);
    setChats(updatedChats);

    if (activeChat === chatId) {
      setActiveChat(updatedChats[0]?.id || null);
      setMessages([]);
    }
  };

  // Upload images to storage
  const uploadImages = async (files: File[], messageId: string, chatId: string) => {
    const uploadedUrls: string[] = [];

    for (const file of files) {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user!.id}/${chatId}/${messageId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(fileName, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      // Save image record
      await supabase.from("uploaded_images").insert({
        user_id: user!.id,
        message_id: messageId,
        chat_id: chatId,
        file_name: file.name,
        file_path: fileName,
        file_size: file.size,
        mime_type: file.type,
      });

      const { data: urlData } = supabase.storage
        .from("chat-images")
        .getPublicUrl(fileName);

      uploadedUrls.push(urlData.publicUrl);
    }

    return uploadedUrls;
  };

  // Send message
  const handleSend = async (content: string, images: File[]) => {
    if (!user || !activeChat) {
      // Create new chat if none exists
      const { data: newChat, error } = await supabase
        .from("chats")
        .insert({ user_id: user!.id, title: content.slice(0, 50) || "Chat con imagen" })
        .select()
        .single();

      if (error) {
        toast({
          title: "Error",
          description: "No se pudo crear el chat",
          variant: "destructive",
        });
        return;
      }

      setChats([newChat, ...chats]);
      setActiveChat(newChat.id);
      
      // Continue with the new chat ID
      await sendMessageToChat(newChat.id, content, images);
    } else {
      await sendMessageToChat(activeChat, content, images);
    }
  };

  const sendMessageToChat = async (chatId: string, content: string, images: File[]) => {
    setIsLoading(true);
    setStreamingContent("");

    try {
      // Save user message
      const { data: userMsg, error: userMsgError } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          user_id: user!.id,
          role: "user",
          content: content || "(imagen)",
        })
        .select()
        .single();

      if (userMsgError) throw userMsgError;

      // Upload images if any
      let imageUrls: string[] = [];
      if (images.length > 0) {
        imageUrls = await uploadImages(images, userMsg.id, chatId);
      }

      // Add user message to UI immediately
      setMessages((prev) => [
        ...prev,
        { id: userMsg.id, role: "user", content: content || "(imagen)", images: imageUrls },
      ]);

      // Update chat title if it's the first message
      if (messages.length === 0 && content) {
        await supabase
          .from("chats")
          .update({ title: content.slice(0, 50) })
          .eq("id", chatId);
        
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, title: content.slice(0, 50) } : c
          )
        );
      }

      // Call n8n webhook
      const n8nWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;
      
      if (!n8nWebhookUrl) {
        throw new Error("VITE_N8N_WEBHOOK_URL no está configurada en las variables de entorno");
      }

      // Prepare prompt - include context from previous messages if needed
      const prompt = content || (images.length > 0 ? "Describe esta imagen" : "");

      // Convert images to base64 for sending in HTTP request
      const convertImageToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      // Prepare body with chat_id, prompt, and images if any
      const requestBody: {
        chat_id: string;
        prompt: string;
        images?: Array<{
          data: string; // base64 data URL
          name: string;
          type: string;
        }>;
      } = {
        chat_id: chatId,
        prompt: prompt,
      };

      // Convert and add images if any
      if (images.length > 0) {
        const imageData = await Promise.all(
          images.map(async (file) => ({
            data: await convertImageToBase64(file),
            name: file.name,
            type: file.type,
          }))
        );
        requestBody.images = imageData;
      }

      const response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Error al conectar con n8n";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Stream response from n8n
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No se pudo obtener el stream de respuesta");
      }

      const decoder = new TextDecoder();
      let assistantContent = "";
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        // Handle different streaming formats from n8n
        // Format 1: SSE (Server-Sent Events) with "data: " prefix
        // Format 2: Plain text streaming
        // Format 3: JSON lines

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.trim() === "") continue;

          // Handle SSE format
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            
            try {
              const parsed = JSON.parse(data);
              // Try different possible response formats
              const content = parsed.content || parsed.text || parsed.message || parsed.data || data;
              if (typeof content === "string") {
                assistantContent += content;
                setStreamingContent(assistantContent);
              }
            } catch {
              // If not JSON, treat as plain text
              assistantContent += data;
              setStreamingContent(assistantContent);
            }
          } 
          // Handle JSON lines format
          else if (line.startsWith("{") || line.startsWith("[")) {
            try {
              const parsed = JSON.parse(line);
              const content = parsed.content || parsed.text || parsed.message || parsed.data;
              if (typeof content === "string") {
                assistantContent += content;
                setStreamingContent(assistantContent);
              }
            } catch {
              // Invalid JSON, skip
            }
          }
          // Handle plain text streaming
          else {
            assistantContent += line;
            setStreamingContent(assistantContent);
          }
        }
      }

      // Handle any remaining content in buffer
      if (textBuffer.trim()) {
        assistantContent += textBuffer;
        setStreamingContent(assistantContent);
      }

      // Save assistant message
      const { data: assistantMsg, error: assistantMsgError } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          user_id: user!.id,
          role: "assistant",
          content: assistantContent,
        })
        .select()
        .single();

      if (assistantMsgError) throw assistantMsgError;

      setMessages((prev) => [
        ...prev,
        { id: assistantMsg.id, role: "assistant", content: assistantContent },
      ]);
      setStreamingContent("");

      // Update chat timestamp
      await supabase
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", chatId);

    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al enviar mensaje",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={showShopifyDialog} onOpenChange={setShowShopifyDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nueva Tienda de Shopify</DialogTitle>
            <DialogDescription>
              Ingresa el link de la tienda de Shopify para comenzar un nuevo chat.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="shopify-url">Link de la tienda</Label>
              <Input
                id="shopify-url"
                placeholder="https://tu-tienda.myshopify.com"
                value={shopifyUrl}
                onChange={(e) => setShopifyUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleShopifySubmit();
                  }
                }}
                disabled={isCreatingChat}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowShopifyDialog(false)}
              disabled={isCreatingChat}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleShopifySubmit}
              disabled={isCreatingChat || !shopifyUrl.trim()}
            >
              {isCreatingChat ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear chat"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isCreatingChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Configurando tu tienda...</p>
          </div>
        </div>
      )}

      <div className="h-screen flex bg-background">
        <ChatSidebar
          chats={chats}
          activeChat={activeChat}
          onSelectChat={(id) => {
            setActiveChat(id);
            setSidebarOpen(false);
          }}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 flex flex-col min-w-0">
          <ChatArea
            messages={messages}
            isLoading={isLoading}
            streamingContent={streamingContent}
          />
          <ChatInput
            onSend={handleSend}
            disabled={false}
            isLoading={isLoading}
          />
        </main>
      </div>
    </>
  );
}
