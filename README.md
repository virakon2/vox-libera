# Vox Libera

Chatbot de uso gratuito. Quien abre la página puede conversar sin cuenta y sin clave.

La página habla con un servidor propio. Ese servidor reenvía la conversación a la capa anónima de [Pollinations](https://pollinations.ai) (`openai-fast`, GPT-OSS 20B). La clave no existe: no hay nada que pegar en el navegador.

## Cómo usarlo

```bash
node server.mjs
```

Abrí http://127.0.0.1:4173

Para publicarlo hace falta un túnel HTTPS, por ejemplo:

```bash
cloudflared tunnel --url http://127.0.0.1:4173
```

## Qué incluye

- Charla con memoria de los últimos mensajes, guardada en este navegador.
- Ideas para empezar, nueva charla y envío con Enter.
- El modelo responde en el idioma de quien escribe.
