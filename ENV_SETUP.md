# Configuración de Variables de Entorno

Este proyecto requiere las siguientes variables de entorno para funcionar correctamente.

## Variables Requeridas

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key

# n8n Webhook URL
# URL del webhook de n8n que procesa los mensajes del chat
# Debe ser un endpoint POST que acepte { chat_id, prompt } y devuelva un stream
VITE_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/your-webhook-id
```

## Descripción de Variables

### VITE_SUPABASE_URL
URL de tu proyecto de Supabase. Puedes encontrarla en el dashboard de Supabase.

### VITE_SUPABASE_PUBLISHABLE_KEY
Clave pública (anon key) de tu proyecto de Supabase. Puedes encontrarla en el dashboard de Supabase.

### VITE_N8N_WEBHOOK_URL
URL del webhook de n8n que procesará los mensajes del chat. 

**Formato esperado del webhook:**
- **Método:** POST
- **Body:** 
  ```json
  {
    "chat_id": "uuid-del-chat",
    "prompt": "mensaje del usuario",
    "images": [  // Opcional: array de imágenes en base64 si se adjuntaron
      {
        "data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
        "name": "imagen.jpg",
        "type": "image/jpeg"
      }
    ]
  }
  ```
- **Respuesta:** Debe devolver un stream (Server-Sent Events, texto plano, o JSON lines)

**Nota:** 
- El campo `images` solo se incluye cuando el usuario adjunta imágenes al mensaje
- Las imágenes se envían como base64 en el formato data URL (data:image/type;base64,...)
- Cada imagen incluye: `data` (base64), `name` (nombre del archivo), y `type` (MIME type)

**Ejemplo de URL:**
```
https://tu-n8n.com/webhook/abc123def456
```

## Notas

- Todas las variables deben comenzar con `VITE_` para que Vite las exponga al frontend
- El archivo `.env` está en `.gitignore` y no se subirá al repositorio
- Después de crear o modificar el archivo `.env`, reinicia el servidor de desarrollo

