import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { ChatInput } from "@/components/chat/ChatInput";
import { useToast } from "@/hooks/use-toast";

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

  // Create new chat
  const handleNewChat = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: user.id, title: "Nuevo chat" })
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

      // Call AI
      const messagesForAI = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: content || "Describe esta imagen" },
      ];

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: messagesForAI, imageUrls }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error de la IA");
      }

      // Stream response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setStreamingContent(assistantContent);
            }
          } catch {
            // Incomplete JSON, will be handled in next iteration
          }
        }
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
  );
}
