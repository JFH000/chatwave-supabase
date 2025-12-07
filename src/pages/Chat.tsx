import { ChatArea } from "@/components/chat/ChatArea";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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

interface BrandingData {
  nombre_marca?: string;
  oferta_valor?: string;
  perfil_cliente?: string;
  valores_marca?: string;
  personalidad_marca?: string;
  tono_voz?: string;
  colores_identidad?: string;
  estilo_visual?: string;
  objetivo_principal?: string;
  diferenciador?: string;
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
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isBrandingMode, setIsBrandingMode] = useState(false);
  const [brandingData, setBrandingData] = useState<BrandingData>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [brandingComplete, setBrandingComplete] = useState(false);
  const [isGeneratingLogo, setIsGeneratingLogo] = useState(false);
  const [logoGenerated, setLogoGenerated] = useState(false);
  const [waitingForMercadoLibreImage, setWaitingForMercadoLibreImage] = useState(false);

  // Define essential branding questions (4 core questions)
  const brandingQuestions = [
    { key: "nombre_marca", question: "¿Cómo se llama tu marca?", path: ["nombre_marca"] },
    { key: "oferta_valor", question: "¿Qué problema resuelves o qué beneficio ofreces a tus clientes?", path: ["oferta_valor"] },
    { key: "colores_identidad", question: "¿Qué colores representan mejor tu marca? (máximo 3)", path: ["colores_identidad"] },
    { key: "estilo_visual", question: "¿Qué estilo visual prefieres? (minimalista, moderno, clásico, audaz)", path: ["estilo_visual"] }
  ];

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

    // Fetch images for messages (both user and assistant messages)
    const messagesWithImages: Message[] = await Promise.all(
      (data || []).map(async (msg) => {
        // Fetch images for both user and assistant messages
        const { data: imageData } = await supabase
          .from("uploaded_images")
          .select("file_path")
          .eq("message_id", msg.id);

        const images = imageData?.map((img) => {
          // Check if it's an external URL (stored with "external:" prefix)
          if (img.file_path.startsWith("external:")) {
            return img.file_path.replace("external:", "");
          }
          // Otherwise, get the public URL from storage
          const { data: urlData } = supabase.storage
            .from("chat-images")
            .getPublicUrl(img.file_path);
          return urlData.publicUrl;
        });

        return { 
          id: msg.id, 
          role: msg.role as "user" | "assistant", 
          content: msg.content, 
          images: images && images.length > 0 ? images : undefined
        };
      })
    );

    setMessages(messagesWithImages);
    
    // Check if logo was already generated in this chat (look for logo message)
    const hasLogoMessage = messagesWithImages.some(
      (msg) => msg.role === "assistant" && 
      msg.content.includes("¡Tu logo está listo!") && 
      msg.images && msg.images.length > 0
    );
    setLogoGenerated(hasLogoMessage);
  }, [activeChat, user]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Start branding questionnaire
  const startBrandingQuestionnaire = async () => {
    if (!activeChat) return;
    
    setIsBrandingMode(true);
    setCurrentQuestionIndex(0);
    setBrandingData({});
    setBrandingComplete(false);
    setIsLoading(true);

    try {
      const firstQuestion = brandingQuestions[0];
      
      // Save assistant's first question
      const { data: assistantMsg, error } = await supabase
        .from("messages")
        .insert({
          chat_id: activeChat,
          user_id: user!.id,
          role: "assistant",
          content: `**Cuestionario de Branding** (Pregunta 1 de ${brandingQuestions.length})\n\n${firstQuestion.question}`,
        })
        .select()
        .single();

      if (!error && assistantMsg) {
        setMessages([{ 
          id: assistantMsg.id, 
          role: "assistant", 
          content: `**Cuestionario de Branding** (Pregunta 1 de ${brandingQuestions.length})\n\n${firstQuestion.question}`
        }]);
      }
    } catch (error) {
      console.error("Error starting questionnaire:", error);
      toast({
        title: "Error",
        description: "No se pudo iniciar el cuestionario",
        variant: "destructive",
      });
      setIsBrandingMode(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Create new chat
  const handleNewChat = async () => {
    if (!user) return;

    setIsCreatingChat(true);

    try {
      // Create the chat
      const { data, error } = await supabase
        .from("chats")
        .insert({ 
          user_id: user.id, 
          title: "Nuevo chat" 
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
      // Reset logo generated state for new chat
      setLogoGenerated(false);
      setWaitingForMercadoLibreImage(false);
    } catch (error) {
      console.error("Error creating chat:", error);
      toast({
        title: "Error",
        description: "Ocurrió un error al crear el chat",
        variant: "destructive",
      });
    } finally {
      setIsCreatingChat(false);
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

  // Update chat title
  const handleUpdateChatTitle = async (chatId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      toast({
        title: "Error",
        description: "El nombre del chat no puede estar vacío",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("chats")
      .update({ title: newTitle.trim() })
      .eq("id", chatId);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el nombre del chat",
        variant: "destructive",
      });
      return;
    }

    // Update local state
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title: newTitle.trim() } : c))
    );

    toast({
      title: "Éxito",
      description: "Nombre del chat actualizado",
    });
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

      // Check if we're in branding mode
      if (isBrandingMode && !brandingComplete) {
        await handleBrandingResponse(chatId, content);
      } else if (waitingForMercadoLibreImage && images.length > 0 && content.trim()) {
        // User has provided image and description for MercadoLibre image generation
        setWaitingForMercadoLibreImage(false);
        await generateMercadoLibreImage(chatId, content, images[0]);
      } else if (logoGenerated && !waitingForMercadoLibreImage) {
        // Check if user wants to generate MercadoLibre image (responded yes to the question)
        const wantsToGenerate = content.toLowerCase().includes("sí") || 
                                content.toLowerCase().includes("si") || 
                                content.toLowerCase().includes("yes") ||
                                content.toLowerCase().includes("quiero") ||
                                content.toLowerCase().includes("continuar") ||
                                content.toLowerCase().includes("adelante") ||
                                content.toLowerCase().includes("vamos");
        
        if (wantsToGenerate && images.length === 0) {
          // User wants to generate but hasn't provided image yet
          // Set state to wait for image and description
          setWaitingForMercadoLibreImage(true);
          // Continue with regular chat so agent can ask for image and description
          await handleRegularChat(chatId, content, images);
        } else {
          // Regular n8n chat flow
          await handleRegularChat(chatId, content, images);
        }
      } else {
        // Regular n8n chat flow
        await handleRegularChat(chatId, content, images);
      }
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

  // Handle branding questionnaire response
  const handleBrandingResponse = async (chatId: string, userResponse: string) => {
    try {
      // Save user's answer to branding data
      const currentQuestion = brandingQuestions[currentQuestionIndex];
      const newData = { ...brandingData };
      
      // Set nested properties
      let target: Record<string, unknown> = newData;
      for (let i = 0; i < currentQuestion.path.length - 1; i++) {
        const key = currentQuestion.path[i];
        if (!target[key]) target[key] = {};
        target = target[key] as Record<string, unknown>;
      }
      
      const finalKey = currentQuestion.path[currentQuestion.path.length - 1];
      // No conversion needed - all answers are now text-based
      target[finalKey] = userResponse;
      
      setBrandingData(newData);

      // Check if we're done
      const nextIndex = currentQuestionIndex + 1;
      
      if (nextIndex >= brandingQuestions.length) {
        // Questionnaire complete!
        setBrandingComplete(true);
        setIsBrandingMode(false);
        
        const completionMessage = `**¡Cuestionario Completado!**

Has completado exitosamente el perfil de branding de tu marca. Aquí está tu resumen:

---

### **${newData.nombre_marca || 'Tu Marca'}**

**Oferta de Valor:**
${newData.oferta_valor || 'No especificada'}

**Colores de Identidad:**
${newData.colores_identidad || 'No especificados'}

**Estilo Visual:**
${newData.estilo_visual || 'No especificado'}

---

**ID de Chat:** \`${chatId}\`

Puedes usar esta información para desarrollar tu identidad de marca, crear contenido y comunicarte consistentemente con tu audiencia.`;
        
        // Save completion message
        const { data: assistantMsg, error } = await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            user_id: user!.id,
            role: "assistant",
            content: completionMessage,
          })
          .select()
          .single();

        if (!error && assistantMsg) {
          setMessages((prev) => [
            ...prev,
            { id: assistantMsg.id, role: "assistant", content: completionMessage },
          ]);
        }

        toast({
          title: "¡Completado!",
          description: "Se ha recopilado toda la información de branding",
        });

        // Generate logo by calling the webhook
        await generateLogo(chatId, newData);
      } else {
        // Ask next question
        setCurrentQuestionIndex(nextIndex);
        const nextQuestion = brandingQuestions[nextIndex];
        
        const questionMessage = `**Cuestionario de Branding** (Pregunta ${nextIndex + 1} de ${brandingQuestions.length})\n\n${nextQuestion.question}`;
        
        const { data: assistantMsg, error } = await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            user_id: user!.id,
            role: "assistant",
            content: questionMessage,
          })
          .select()
          .single();

        if (!error && assistantMsg) {
          setMessages((prev) => [
            ...prev,
            { id: assistantMsg.id, role: "assistant", content: questionMessage },
          ]);
        }
      }
    } catch (error) {
      console.error("Error in branding questionnaire:", error);
      throw error;
    }
  };

  // Generate logo by calling the webhook
  const generateLogo = async (chatId: string, brandingData: BrandingData) => {
    setIsGeneratingLogo(true);
    
    try {
      const logoWebhookUrl = import.meta.env.VITE_LOGO_GENERATOR_WEBHOOK_URL;
      
      if (!logoWebhookUrl) {
        throw new Error("VITE_LOGO_GENERATOR_WEBHOOK_URL no está configurada en las variables de entorno");
      }

      // Prepare the request body with all branding data
      const requestBody = {
        chat_id: chatId,
        nombre_marca: brandingData.nombre_marca || "",
        oferta_valor: brandingData.oferta_valor || "",
        colores_identidad: brandingData.colores_identidad || "",
        estilo_visual: brandingData.estilo_visual || "",
      };

      // Show loading message
      const loadingMessage = "🎨 Generando tu logo personalizado... Esto puede tomar unos momentos.";
      const { data: loadingMsg, error: loadingError } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          user_id: user!.id,
          role: "assistant",
          content: loadingMessage,
        })
        .select()
        .single();

      if (!loadingError && loadingMsg) {
        setMessages((prev) => [
          ...prev,
          { id: loadingMsg.id, role: "assistant", content: loadingMessage },
        ]);
      }

      // Call the webhook
      const response = await fetch(logoWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Error al generar el logo";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Get the response - it should be an image
      // The response could be:
      // 1. A direct image (blob)
      // 2. A JSON with an image URL
      // 3. A JSON with base64 image data
      
      const contentType = response.headers.get("content-type");
      let imageUrl: string;
      let imageBlob: Blob | null = null;
      let isBase64 = false;

      if (contentType?.startsWith("image/")) {
        // Direct image response
        imageBlob = await response.blob();
        imageUrl = URL.createObjectURL(imageBlob);
      } else {
        // JSON response with image data
        const data = await response.json();
        
        if (data.image_url) {
          imageUrl = data.image_url;
        } else if (data.image) {
          imageUrl = data.image;
          if (imageUrl.startsWith("data:image")) {
            isBase64 = true;
          }
        } else if (data.logo_url) {
          imageUrl = data.logo_url;
        } else if (data.data && typeof data.data === "string" && data.data.startsWith("data:image")) {
          // Base64 image
          imageUrl = data.data;
          isBase64 = true;
        } else if (data.url) {
          imageUrl = data.url;
        } else {
          throw new Error("Formato de respuesta no reconocido del webhook");
        }
      }

      // Remove loading message and add logo message
      if (loadingMsg) {
        setMessages((prev) => prev.filter((msg) => msg.id !== loadingMsg.id));
        await supabase.from("messages").delete().eq("id", loadingMsg.id);
      }

      // Save logo message first
      const logoMessage = `**¡Tu logo está listo!** 🎉

He generado un logo personalizado basado en el perfil de branding de tu marca.`;

      const { data: logoMsg, error: logoError } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          user_id: user!.id,
          role: "assistant",
          content: logoMessage,
        })
        .select()
        .single();

      if (logoError || !logoMsg) {
        throw new Error("No se pudo guardar el mensaje del logo");
      }

      // Save logo image to storage if it's a blob or base64, or save external URL reference
      let finalImageUrl = imageUrl;
      const isExternalUrl = !imageBlob && !isBase64 && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"));
      
      if (imageBlob || isBase64) {
        try {
          // Convert base64 to blob if needed
          let blobToUpload: Blob;
          let fileName: string;
          
          if (imageBlob) {
            blobToUpload = imageBlob;
            fileName = `logo-${Date.now()}.png`;
          } else {
            // Convert base64 to blob
            const base64Data = imageUrl.split(",")[1] || imageUrl;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blobToUpload = new Blob([byteArray], { type: "image/png" });
            fileName = `logo-${Date.now()}.png`;
          }

          // Upload to Supabase Storage
          const filePath = `${user!.id}/${chatId}/${logoMsg.id}/${fileName}`;
          
          const { error: uploadError } = await supabase.storage
            .from("chat-images")
            .upload(filePath, blobToUpload, {
              contentType: blobToUpload.type,
              upsert: false,
            });

          if (uploadError) {
            console.error("Error uploading logo:", uploadError);
            // Continue with the original URL if upload fails
          } else {
            // Get public URL
            const { data: urlData } = supabase.storage
              .from("chat-images")
              .getPublicUrl(filePath);
            finalImageUrl = urlData.publicUrl;

            // Save image record in database
            await supabase.from("uploaded_images").insert({
              user_id: user!.id,
              message_id: logoMsg.id,
              chat_id: chatId,
              file_name: fileName,
              file_path: filePath,
              file_size: blobToUpload.size,
              mime_type: blobToUpload.type,
            });
          }
        } catch (error) {
          console.error("Error processing logo image:", error);
          // Continue with the original URL if processing fails
        }
      } else if (isExternalUrl) {
        // For external URLs, save the URL reference in the database
        // We'll use a special file_path format to indicate it's an external URL
        try {
          await supabase.from("uploaded_images").insert({
            user_id: user!.id,
            message_id: logoMsg.id,
            chat_id: chatId,
            file_name: "logo-external.png",
            file_path: `external:${imageUrl}`, // Special prefix to indicate external URL
            file_size: null,
            mime_type: "image/png",
          });
        } catch (error) {
          console.error("Error saving external logo URL:", error);
        }
      }

      // Update UI with the final image URL
      setMessages((prev) => [
        ...prev,
        { 
          id: logoMsg.id, 
          role: "assistant", 
          content: logoMessage,
          images: [finalImageUrl]
        },
      ]);

      toast({
        title: "¡Logo generado!",
        description: "Tu logo personalizado ha sido creado exitosamente",
      });

      // Mark logo as generated so we use the final webhook from now on
      setLogoGenerated(true);

      // Send automatic message to conversational agent
      await sendLogoCompletionMessage(chatId, brandingData);

    } catch (error) {
      console.error("Error generating logo:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo generar el logo",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingLogo(false);
    }
  };

  // Generate MercadoLibre main image
  const generateMercadoLibreImage = async (chatId: string, description: string, imageFile: File) => {
    setIsLoading(true);
    
    try {
      // Always use the exact URL specified
      const mercadoLibreWebhookUrl = "https://sellify.app.n8n.cloud/webhook/upload-ticket";
      
      // Convert image to base64
      const convertImageToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            // Remove data URL prefix if present
            const base64Data = base64String.includes(",") ? base64String.split(",")[1] : base64String;
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      const fileBase64 = await convertImageToBase64(imageFile);

      // Show loading message
      const loadingMessage = "🎨 Generando tu imagen principal para MercadoLibre... Esto puede tomar unos momentos.";
      const { data: loadingMsg, error: loadingError } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          user_id: user!.id,
          role: "assistant",
          content: loadingMessage,
        })
        .select()
        .single();

      if (!loadingError && loadingMsg) {
        setMessages((prev) => [
          ...prev,
          { id: loadingMsg.id, role: "assistant", content: loadingMessage },
        ]);
      }

      // Call the webhook - exact URL as specified
      const webhookUrl = "https://sellify.app.n8n.cloud/webhook/upload-ticket";
      
      // Prepare request body exactly as specified: {"Description":"d", "FileBase64":"afdfsd"}
      const requestBody = {
        Description: description,
        FileBase64: fileBase64,
      };
      
      console.log("Calling MercadoLibre webhook:", webhookUrl);
      console.log("Request body:", { Description: description, FileBase64: `[${fileBase64.length} chars]` });
      
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Error al generar la imagen";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Get the response
      const contentType = response.headers.get("content-type");
      let imageUrl: string;
      let imageBlob: Blob | null = null;
      let isBase64 = false;

      if (contentType?.startsWith("image/")) {
        // Direct image response
        imageBlob = await response.blob();
        imageUrl = URL.createObjectURL(imageBlob);
      } else {
        // JSON response
        const data = await response.json();
        
        if (data.image_url) {
          imageUrl = data.image_url;
        } else if (data.image) {
          imageUrl = data.image;
          if (imageUrl.startsWith("data:image")) {
            isBase64 = true;
          }
        } else if (data.url) {
          imageUrl = data.url;
        } else if (data.data && typeof data.data === "string" && data.data.startsWith("data:image")) {
          imageUrl = data.data;
          isBase64 = true;
        } else {
          throw new Error("Formato de respuesta no reconocido del webhook");
        }
      }

      // Remove loading message
      if (loadingMsg) {
        setMessages((prev) => prev.filter((msg) => msg.id !== loadingMsg.id));
        await supabase.from("messages").delete().eq("id", loadingMsg.id);
      }

      // Save result message
      const resultMessage = `**¡Tu imagen principal está lista!** 🎉

He generado tu imagen principal para MercadoLibre basada en tu descripción y la imagen que subiste.`;

      const { data: resultMsg, error: resultError } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          user_id: user!.id,
          role: "assistant",
          content: resultMessage,
        })
        .select()
        .single();

      if (resultError || !resultMsg) {
        throw new Error("No se pudo guardar el mensaje de resultado");
      }

      // Save image to storage if it's a blob or base64
      let finalImageUrl = imageUrl;
      const isExternalUrl = !imageBlob && !isBase64 && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"));
      
      if (imageBlob || isBase64) {
        try {
          let blobToUpload: Blob;
          let fileName: string;
          
          if (imageBlob) {
            blobToUpload = imageBlob;
            fileName = `mercadolibre-${Date.now()}.png`;
          } else {
            const base64Data = imageUrl.split(",")[1] || imageUrl;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            blobToUpload = new Blob([byteArray], { type: "image/png" });
            fileName = `mercadolibre-${Date.now()}.png`;
          }

          const filePath = `${user!.id}/${chatId}/${resultMsg.id}/${fileName}`;
          
          const { error: uploadError } = await supabase.storage
            .from("chat-images")
            .upload(filePath, blobToUpload, {
              contentType: blobToUpload.type,
              upsert: false,
            });

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from("chat-images")
              .getPublicUrl(filePath);
            finalImageUrl = urlData.publicUrl;

            await supabase.from("uploaded_images").insert({
              user_id: user!.id,
              message_id: resultMsg.id,
              chat_id: chatId,
              file_name: fileName,
              file_path: filePath,
              file_size: blobToUpload.size,
              mime_type: blobToUpload.type,
            });
          }
        } catch (error) {
          console.error("Error processing image:", error);
        }
      } else if (isExternalUrl) {
        try {
          await supabase.from("uploaded_images").insert({
            user_id: user!.id,
            message_id: resultMsg.id,
            chat_id: chatId,
            file_name: "mercadolibre-external.png",
            file_path: `external:${imageUrl}`,
            file_size: null,
            mime_type: "image/png",
          });
        } catch (error) {
          console.error("Error saving external image URL:", error);
        }
      }

      // Update UI
      setMessages((prev) => [
        ...prev,
        { 
          id: resultMsg.id, 
          role: "assistant", 
          content: resultMessage,
          images: [finalImageUrl]
        },
      ]);

      toast({
        title: "¡Imagen generada!",
        description: "Tu imagen principal para MercadoLibre ha sido creada exitosamente",
      });

    } catch (error) {
      console.error("Error generating MercadoLibre image:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo generar la imagen",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Send automatic message to conversational agent after logo generation
  const sendLogoCompletionMessage = async (chatId: string, brandingData: BrandingData) => {
    try {
      const finalWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL_FINAL;
      
      if (!finalWebhookUrl) {
        console.warn("VITE_N8N_WEBHOOK_URL_FINAL no está configurada, no se puede enviar el mensaje automático");
        return;
      }

      // Prepare the message for the agent
      const systemMessage = `Acabamos de terminar la creación del logo del usuario. Presenta de forma amigable y breve un resumen de lo que el logo representa para su marca basándote en esta información:
- Nombre: ${brandingData.nombre_marca || 'No especificado'}
- Oferta de valor: ${brandingData.oferta_valor || 'No especificada'}
- Colores: ${brandingData.colores_identidad || 'No especificados'}
- Estilo visual: ${brandingData.estilo_visual || 'No especificado'}

Al final, pregúntale si quiere seguir con la creación de su imagen principal para MercadoLibre. Sé breve, amigable y entusiasta.`;

      // Send message to final webhook
      const response = await fetch(finalWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          prompt: systemMessage,
        }),
      });

      if (!response.ok) {
        console.error("Error sending logo completion message:", response.statusText);
        return;
      }

      // Handle response from the agent
      const contentType = response.headers.get("content-type");
      
      if (contentType?.includes("application/json")) {
        const data = await response.json();
        
        // Extract text content
        const assistantContent = data.text || data.content || data.message || "";
        
        // Extract images (can be 0, 1, or multiple)
        const responseImages: string[] = [];
        
        if (data.images && Array.isArray(data.images)) {
          for (const img of data.images) {
            if (typeof img === "string") {
              responseImages.push(img);
            } else if (img.url) {
              responseImages.push(img.url);
            } else if (img.data) {
              responseImages.push(img.data);
            }
          }
        } else if (data.image) {
          if (typeof data.image === "string") {
            responseImages.push(data.image);
          } else if (data.image.url) {
            responseImages.push(data.image.url);
          } else if (data.image.data) {
            responseImages.push(data.image.data);
          }
        } else if (data.image_url) {
          responseImages.push(data.image_url);
        } else if (data.logo_url) {
          responseImages.push(data.logo_url);
        } else if (data.url) {
          responseImages.push(data.url);
        }

          // Save assistant message
          const { data: assistantMsg, error: assistantMsgError } = await supabase
            .from("messages")
            .insert({
              chat_id: chatId,
              user_id: user!.id,
              role: "assistant",
              content: assistantContent || "(sin texto)",
            })
            .select()
            .single();

          if (!assistantMsgError && assistantMsg) {
            setMessages((prev) => [
              ...prev,
              { 
                id: assistantMsg.id, 
                role: "assistant", 
                content: assistantContent || "(sin texto)",
                images: responseImages.length > 0 ? responseImages : undefined
              },
            ]);
            
            // Check if agent is asking for image and description for MercadoLibre
            if (logoGenerated && !waitingForMercadoLibreImage) {
              const askingForImage = assistantContent.toLowerCase().includes("imagen") && 
                                     (assistantContent.toLowerCase().includes("sube") || 
                                      assistantContent.toLowerCase().includes("envía") ||
                                      assistantContent.toLowerCase().includes("comparte") ||
                                      assistantContent.toLowerCase().includes("carga") ||
                                      assistantContent.toLowerCase().includes("subir"));
              if (askingForImage) {
                setWaitingForMercadoLibreImage(true);
              }
            }
          }
      } else {
        // Non-JSON response, treat as text
        const text = await response.text();
        
        const { data: assistantMsg, error: assistantMsgError } = await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            user_id: user!.id,
            role: "assistant",
            content: text,
          })
          .select()
          .single();

        if (!assistantMsgError && assistantMsg) {
          setMessages((prev) => [
            ...prev,
            { id: assistantMsg.id, role: "assistant", content: text },
          ]);
        }
      }
    } catch (error) {
      console.error("Error sending logo completion message:", error);
      // Don't show error to user, just log it
    }
  };

  // Handle image webhook call
  const handleImageWebhook = async (chatId: string, description: string, imageFile: File) => {
    try {
      const imageWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL_IMAGEN;
      const descriptionWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL_DESCRIPTION;
      
      if (!imageWebhookUrl) {
        throw new Error("VITE_N8N_WEBHOOK_URL_IMAGEN no está configurada en las variables de entorno");
      }

      if (!descriptionWebhookUrl) {
        throw new Error("VITE_N8N_WEBHOOK_URL_DESCRIPTION no está configurada en las variables de entorno");
      }

      // Convert image to base64 without prefix
      const convertImageToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            // Remove data URL prefix if present
            const base64Data = base64String.includes(",") ? base64String.split(",")[1] : base64String;
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      const fileBase64 = await convertImageToBase64(imageFile);
      const requestBody = {
        Description: description || "",
        FileBase64: fileBase64,
      };

      // First: Call image webhook
      const imageResponse = await fetch(imageWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text();
        let errorMessage = "Error al procesar la imagen";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Process image response first (show image first)
      const imageContentType = imageResponse.headers.get("content-type");
      let responseImageUrl: string | null = null;
      let imageBlob: Blob | null = null;
      let isBase64 = false;
      let imageMessageId: string | null = null;

      if (imageContentType?.startsWith("image/")) {
        // Direct image response
        imageBlob = await imageResponse.blob();
        responseImageUrl = URL.createObjectURL(imageBlob);
      } else if (imageContentType?.includes("application/json")) {
        // JSON response with image
        const imageData = await imageResponse.json();
        
        // Extract image
        if (imageData.image_url) {
          responseImageUrl = imageData.image_url;
        } else if (imageData.image) {
          if (typeof imageData.image === "string") {
            responseImageUrl = imageData.image;
            if (responseImageUrl.startsWith("data:image")) {
              isBase64 = true;
            }
          } else if (imageData.image.url) {
            responseImageUrl = imageData.image.url;
          } else if (imageData.image.data) {
            responseImageUrl = imageData.image.data;
            isBase64 = true;
          }
        } else if (imageData.url) {
          responseImageUrl = imageData.url;
        } else if (imageData.data && typeof imageData.data === "string" && imageData.data.startsWith("data:image")) {
          responseImageUrl = imageData.data;
          isBase64 = true;
        }
      }

      // Save image message first (if we have an image)
      if (responseImageUrl) {
        const { data: imageMsg, error: imageMsgError } = await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            user_id: user!.id,
            role: "assistant",
            content: "He procesado tu imagen.",
          })
          .select()
          .single();

        if (!imageMsgError && imageMsg) {
          imageMessageId = imageMsg.id;

          // Save image to storage
          let finalImageUrl = responseImageUrl;
          const isExternalUrl = !imageBlob && !isBase64 && (responseImageUrl.startsWith("http://") || responseImageUrl.startsWith("https://"));
          
          if (imageBlob || isBase64) {
            try {
              let blobToUpload: Blob;
              let fileName: string;
              
              if (imageBlob) {
                blobToUpload = imageBlob;
                fileName = `processed-${Date.now()}.png`;
              } else {
                const base64Data = responseImageUrl.split(",")[1] || responseImageUrl;
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                blobToUpload = new Blob([byteArray], { type: "image/png" });
                fileName = `processed-${Date.now()}.png`;
              }

              const filePath = `${user!.id}/${chatId}/${imageMsg.id}/${fileName}`;
              
              const { error: uploadError } = await supabase.storage
                .from("chat-images")
                .upload(filePath, blobToUpload, {
                  contentType: blobToUpload.type,
                  upsert: false,
                });

              if (!uploadError) {
                const { data: urlData } = supabase.storage
                  .from("chat-images")
                  .getPublicUrl(filePath);
                finalImageUrl = urlData.publicUrl;

                await supabase.from("uploaded_images").insert({
                  user_id: user!.id,
                  message_id: imageMsg.id,
                  chat_id: chatId,
                  file_name: fileName,
                  file_path: filePath,
                  file_size: blobToUpload.size,
                  mime_type: blobToUpload.type,
                });
              }
            } catch (error) {
              console.error("Error processing response image:", error);
            }
          } else if (isExternalUrl) {
            try {
              await supabase.from("uploaded_images").insert({
                user_id: user!.id,
                message_id: imageMsg.id,
                chat_id: chatId,
                file_name: "processed-external.png",
                file_path: `external:${responseImageUrl}`,
                file_size: null,
                mime_type: "image/png",
              });
            } catch (error) {
              console.error("Error saving external image URL:", error);
            }
          }

          // Show image message first
          setMessages((prev) => [
            ...prev,
            { 
              id: imageMsg.id, 
              role: "assistant", 
              content: "He procesado tu imagen.",
              images: [finalImageUrl]
            },
          ]);
        }
      }

      // Second: Call description webhook after image is processed and shown
      let descriptionText = "";
      let productTitle = "";
      let productDescription = "";
      try {
        const descriptionResponse = await fetch(descriptionWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (descriptionResponse.ok) {
          try {
            const responseText = await descriptionResponse.text();
            console.log("Description response text:", responseText);
            
            let descriptionData: unknown;
            try {
              descriptionData = JSON.parse(responseText);
            } catch {
              // Not JSON, use as plain text
              descriptionText = responseText;
              descriptionData = null;
            }
            
            if (descriptionData) {
              console.log("Description response data:", descriptionData);
              
              // Parse the structure: [{"output": {"title": "...", "description": "..."}}]
              if (Array.isArray(descriptionData) && descriptionData.length > 0) {
                const firstItem = descriptionData[0] as Record<string, unknown>;
                if (firstItem.output) {
                  const output = firstItem.output as Record<string, unknown>;
                  const title = (output.title as string) || "";
                  const description = (output.description as string) || "";
                  
                  if (title && description) {
                    descriptionText = `**${title}**\n\n${description}`;
                    productTitle = title;
                    productDescription = description;
                  } else if (title) {
                    descriptionText = `**${title}**`;
                    productTitle = title;
                  } else if (description) {
                    descriptionText = description;
                    productDescription = description;
                  }
                } else if (firstItem.title || firstItem.description) {
                  // Direct structure in array: [{"title": "...", "description": "..."}]
                  const title = (firstItem.title as string) || "";
                  const description = (firstItem.description as string) || "";
                  
                  if (title && description) {
                    descriptionText = `**${title}**\n\n${description}`;
                    productTitle = title;
                    productDescription = description;
                  } else if (title) {
                    descriptionText = `**${title}**`;
                    productTitle = title;
                  } else if (description) {
                    descriptionText = description;
                    productDescription = description;
                  }
                }
              } else if (typeof descriptionData === "object" && descriptionData !== null) {
                const data = descriptionData as Record<string, unknown>;
                
                // Check for direct title/description first (most common case)
                if (data.title !== undefined || data.description !== undefined) {
                  // Direct structure: {"title": "...", "description": "..."}
                  const title = (data.title as string) || "";
                  const description = (data.description as string) || "";
                  
                  console.log("Found direct title/description structure:", { title, description });
                  
                  if (title && description) {
                    descriptionText = `**${title}**\n\n${description}`;
                    productTitle = title;
                    productDescription = description;
                  } else if (title) {
                    descriptionText = `**${title}**`;
                    productTitle = title;
                  } else if (description) {
                    descriptionText = description;
                    productDescription = description;
                  }
                } else if (data.output) {
                  // Structure: {"output": {"title": "...", "description": "..."}}
                  const output = data.output as Record<string, unknown>;
                  const title = (output.title as string) || "";
                  const description = (output.description as string) || "";
                  
                  console.log("Found output structure:", { title, description });
                  
                  if (title && description) {
                    descriptionText = `**${title}**\n\n${description}`;
                    productTitle = title;
                    productDescription = description;
                  } else if (title) {
                    descriptionText = `**${title}**`;
                    productTitle = title;
                  } else if (description) {
                    descriptionText = description;
                    productDescription = description;
                  }
                } else {
                  console.warn("Unknown description data structure:", data);
                }
              } else if (typeof descriptionData === "string") {
                descriptionText = descriptionData;
              }
            }
          } catch (error) {
            console.error("Error parsing description response:", error);
          }
        } else {
          // Response not OK, try to get error message
          try {
            const errorText = await descriptionResponse.text();
            console.error("Description webhook error:", descriptionResponse.status, errorText);
          } catch {
            console.error("Description webhook error:", descriptionResponse.status, descriptionResponse.statusText);
          }
        }
      } catch (error) {
        console.error("Error calling description webhook:", error);
        // Continue even if description fails
      }

      // Save description message (after image)
      console.log("Final descriptionText value:", descriptionText);
      console.log("descriptionText length:", descriptionText?.length);
      console.log("descriptionText trimmed:", descriptionText?.trim());
      
      if (descriptionText && descriptionText.trim()) {
        console.log("Saving description text:", descriptionText);
        const { data: descriptionMsg, error: descriptionMsgError } = await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            user_id: user!.id,
            role: "assistant",
            content: descriptionText,
          })
          .select()
          .single();

        if (descriptionMsgError) {
          console.error("Error saving description message:", descriptionMsgError);
        } else if (descriptionMsg) {
          console.log("Description message saved successfully:", descriptionMsg.id);
          // Show description message after image
          setMessages((prev) => [
            ...prev,
            { 
              id: descriptionMsg.id, 
              role: "assistant", 
              content: descriptionText
            },
          ]);
        } else {
          console.warn("No description message returned from database");
        }
      } else {
        console.warn("No description text to save - descriptionText is empty or whitespace");
        console.warn("descriptionText value:", descriptionText);
      }

      // Third: Call MercadoLibre webhook after image and description are processed
      const mercadoLibreWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL_MERCADO_LIBRE;
      
      if (mercadoLibreWebhookUrl && productTitle && productDescription) {
        try {
          // Show "creando publicacion en mercado libre" message
          const creatingMessage = "Creando publicación en MercadoLibre...";
          const { data: creatingMsg, error: creatingMsgError } = await supabase
            .from("messages")
            .insert({
              chat_id: chatId,
              user_id: user!.id,
              role: "assistant",
              content: creatingMessage,
            })
            .select()
            .single();

          if (!creatingMsgError && creatingMsg) {
            setMessages((prev) => [
              ...prev,
              { 
                id: creatingMsg.id, 
                role: "assistant", 
                content: creatingMessage
              },
            ]);
          }

          // Get image in base64 format
          // Use the processed image if available, otherwise use the original
          let imageBase64 = fileBase64;
          let imageMimeType = "image/jpeg";
          let imageFileName = "imagen1.jpg";

          // Try to get the processed image if it's a blob
          if (imageBlob) {
            try {
              const blobBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64String = reader.result as string;
                  const base64Data = base64String.includes(",") ? base64String.split(",")[1] : base64String;
                  resolve(base64Data);
                };
                reader.onerror = reject;
                reader.readAsDataURL(imageBlob!);
              });
              imageBase64 = blobBase64;
              imageMimeType = imageBlob.type || "image/jpeg";
              // Keep simple filename as per specification
              imageFileName = imageMimeType.includes("jpeg") || imageMimeType.includes("jpg") ? "imagen1.jpg" : "imagen1.png";
            } catch (error) {
              console.error("Error converting blob to base64:", error);
            }
          } else if (isBase64 && responseImageUrl) {
            // If it's already base64, extract it
            imageBase64 = responseImageUrl.includes(",") ? responseImageUrl.split(",")[1] : responseImageUrl;
            imageMimeType = "image/jpeg";
            imageFileName = "imagen1.jpg";
          }

          // Prepare MercadoLibre webhook body - exact structure as specified
          const mercadoLibreBody = {
            title: productTitle || "Producto XYZ2",
            description: productDescription || "Descripción generada automáticamente",
            price: 159900,
            category_id: "MCO5072",
            quantity: 10,
            currency_id: "COP",
            images: [
              {
                fileName: imageFileName,
                mimeType: imageMimeType,
                data: imageBase64
              }
            ]
          };

          // Log the request details
          console.log("=== Llamando a webhook de MercadoLibre ===");
          console.log("URL:", mercadoLibreWebhookUrl);
          console.log("Body completo:", mercadoLibreBody);
          console.log("Título:", mercadoLibreBody.title);
          console.log("Descripción:", mercadoLibreBody.description);
          console.log("Precio:", mercadoLibreBody.price);
          console.log("Categoría:", mercadoLibreBody.category_id);
          console.log("Cantidad:", mercadoLibreBody.quantity);
          console.log("Moneda:", mercadoLibreBody.currency_id);
          console.log("Imagen - Nombre:", mercadoLibreBody.images[0].fileName);
          console.log("Imagen - Tipo MIME:", mercadoLibreBody.images[0].mimeType);
          console.log("Imagen - Base64 (primeros 100 caracteres):", mercadoLibreBody.images[0].data.substring(0, 100) + "...");

          // Call MercadoLibre webhook
          const mercadoLibreResponse = await fetch(mercadoLibreWebhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(mercadoLibreBody),
          });

          console.log("=== Respuesta del webhook de MercadoLibre ===");
          console.log("Status:", mercadoLibreResponse.status);
          console.log("Status Text:", mercadoLibreResponse.statusText);
          console.log("Headers:", Object.fromEntries(mercadoLibreResponse.headers.entries()));

          if (!mercadoLibreResponse.ok) {
            const errorText = await mercadoLibreResponse.text();
            console.error("Error en la respuesta:", errorText);
          } else {
            try {
              const responseData = await mercadoLibreResponse.json();
              console.log("Respuesta exitosa (JSON):", JSON.stringify(responseData, null, 2));
            } catch {
              const responseText = await mercadoLibreResponse.text();
              console.log("Respuesta exitosa (texto):", responseText);
            }
          }
        } catch (error) {
          console.error("Error calling MercadoLibre webhook:", error);
          // Don't throw, just log the error
        }
      }

    } catch (error) {
      console.error("Error in image webhook:", error);
      throw error;
    }
  };

  // Handle regular chat (existing functionality)
  const handleRegularChat = async (chatId: string, content: string, images: File[]) => {
    try {
      // If there's an image, use the image webhook instead
      if (images.length > 0) {
        await handleImageWebhook(chatId, content, images[0]);
        return;
      }

      // Use final webhook if logo was generated, otherwise use regular webhook
      let n8nWebhookUrl: string | undefined;
      
      if (logoGenerated) {
        n8nWebhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL_FINAL;
        if (!n8nWebhookUrl) {
          throw new Error("VITE_N8N_WEBHOOK_URL_FINAL no está configurada en las variables de entorno");
        }
      } else {
        n8nWebhookUrl = import.meta.env.DEV 
          ? "/api/chat" 
          : import.meta.env.VITE_N8N_WEBHOOK_URL;
        
        if (!n8nWebhookUrl) {
          throw new Error("VITE_N8N_WEBHOOK_URL no está configurada en las variables de entorno");
        }
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

      // Convert and add images if any (always in base64 for final webhook)
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

      // Handle response based on whether logo was generated
      if (logoGenerated) {
        // Final webhook: JSON response with text and images
        const contentType = response.headers.get("content-type");
        
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          
          // Extract text content
          const assistantContent = data.text || data.content || data.message || "";
          
          // Extract images (can be 0, 1, or multiple)
          const responseImages: string[] = [];
          
          if (data.images && Array.isArray(data.images)) {
            // Array of images
            for (const img of data.images) {
              if (typeof img === "string") {
                responseImages.push(img);
              } else if (img.url) {
                responseImages.push(img.url);
              } else if (img.data) {
                responseImages.push(img.data);
              }
            }
          } else if (data.image) {
            // Single image
            if (typeof data.image === "string") {
              responseImages.push(data.image);
            } else if (data.image.url) {
              responseImages.push(data.image.url);
            } else if (data.image.data) {
              responseImages.push(data.image.data);
            }
          } else if (data.image_url) {
            responseImages.push(data.image_url);
          } else if (data.logo_url) {
            responseImages.push(data.logo_url);
          } else if (data.url) {
            responseImages.push(data.url);
          }

          // Save assistant message with text and images
          const { data: assistantMsg, error: assistantMsgError } = await supabase
            .from("messages")
            .insert({
              chat_id: chatId,
              user_id: user!.id,
              role: "assistant",
              content: assistantContent || "(sin texto)",
            })
            .select()
            .single();

          if (assistantMsgError) throw assistantMsgError;

          setMessages((prev) => [
            ...prev,
            { 
              id: assistantMsg.id, 
              role: "assistant", 
              content: assistantContent || "(sin texto)",
              images: responseImages.length > 0 ? responseImages : undefined
            },
          ]);
        } else {
          // Non-JSON response, treat as text
          const text = await response.text();
          
          const { data: assistantMsg, error: assistantMsgError } = await supabase
            .from("messages")
            .insert({
              chat_id: chatId,
              user_id: user!.id,
              role: "assistant",
              content: text,
            })
            .select()
            .single();

          if (assistantMsgError) throw assistantMsgError;

          setMessages((prev) => [
            ...prev,
            { id: assistantMsg.id, role: "assistant", content: text },
          ]);
          
          // Check if agent is asking for image and description for MercadoLibre
          if (logoGenerated && !waitingForMercadoLibreImage) {
            const askingForImage = text.toLowerCase().includes("imagen") && 
                                   (text.toLowerCase().includes("sube") || 
                                    text.toLowerCase().includes("envía") ||
                                    text.toLowerCase().includes("comparte") ||
                                    text.toLowerCase().includes("carga") ||
                                    text.toLowerCase().includes("subir"));
            if (askingForImage) {
              setWaitingForMercadoLibreImage(true);
            }
          }
        }
      } else {
        // Regular webhook: Stream response from n8n
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
      }

      // Update chat timestamp
      await supabase
        .from("chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", chatId);

    } catch (error) {
      console.error("Error in regular chat:", error);
      throw error;
    }
  };

  return (
    <>
      {isCreatingChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Creando chat...</p>
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
            // Reset logo generated state when switching chats
            setLogoGenerated(false);
            setWaitingForMercadoLibreImage(false);
          }}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onUpdateChatTitle={handleUpdateChatTitle}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 flex flex-col min-w-0">
          <ChatArea
            messages={messages}
            isLoading={isLoading || isGeneratingLogo}
            streamingContent={streamingContent}
            onStartBranding={messages.length === 0 && !brandingComplete ? () => {
              setIsBrandingMode(true);
              startBrandingQuestionnaire();
            } : undefined}
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
