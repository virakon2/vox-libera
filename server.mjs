import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("./public/", import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const UPSTREAM = "https://text.pollinations.ai/openai";

const SYSTEM = `Eres Vox Libera, un asistente de conversación claro y útil.
Responde en el idioma de la persona; si no está claro, responde en español.
Sé concreto y amable. Si la pregunta es simple, responde breve. Si pide profundidad, desarrolla con ejemplos.
No muestres razonamiento interno, ni etiquetas de pensamiento, ni preámbulos como "voy a pensar".
Si no sabes algo, dilo sin inventar cifras ni citas.
Puedes usar markdown ligero: párrafos, listas y bloques de código.`;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const buckets = new Map();

function allow(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const hits = (buckets.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= 30) {
    buckets.set(ip, hits);
    return false;
  }
  hits.push(now);
  buckets.set(ip, hits);
  return true;
}

function publicFile(urlPath) {
  const raw = decodeURIComponent(urlPath.split("?")[0]);
  const rel = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
  const full = normalize(join(ROOT, rel));
  if (!full.startsWith(normalize(ROOT))) return null;
  return full;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200_000) throw new Error("too big");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-12)
    .map((message) => {
      const role = message?.role === "assistant" ? "assistant" : "user";
      const content = String(message?.content ?? "").slice(0, 4000);
      return { role, content };
    })
    .filter((message) => message.content.trim());
}

function extractText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return "";
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && url.pathname === "/api/salud") {
      sendJson(res, 200, {
        ok: true,
        modelo: "openai-fast",
        proveedor: "Pollinations, capa anónima gratuita",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local")
        .split(",")[0]
        .trim();
      if (!allow(ip)) {
        sendJson(res, 429, { error: "Demasiados mensajes seguidos. Esperá un momento y reintentá." });
        return;
      }

      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: "No pude leer el mensaje." });
        return;
      }

      const messages = sanitizeMessages(body.messages);
      if (!messages.length || messages.at(-1).role !== "user") {
        sendJson(res, 400, { error: "Falta el mensaje." });
        return;
      }

      const upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          model: "openai-fast",
          messages: [{ role: "system", content: SYSTEM }, ...messages],
          stream: false,
        }),
        signal: AbortSignal.timeout(90_000),
      });

      const raw = await upstream.text();
      if (!upstream.ok) {
        sendJson(res, 502, { error: "La IA gratuita no respondió. Probá otra vez en unos segundos." });
        return;
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
      const reply = extractText(data);
      if (!reply) {
        sendJson(res, 502, { error: "La respuesta llegó vacía. Probá de nuevo." });
        return;
      }

      sendJson(res, 200, { reply });
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD, POST" });
      res.end();
      return;
    }

    const file = publicFile(url.pathname);
    if (!file) {
      res.writeHead(403);
      res.end();
      return;
    }

    try {
      const data = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] || "application/octet-stream",
        "cache-control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("No encontrado");
    }
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, timedOut ? 504 : 500, {
      error: timedOut
        ? "La IA gratuita tardó demasiado. Probá con una pregunta más corta."
        : "Error interno. Probá de nuevo.",
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Vox Libera en http://127.0.0.1:${PORT}`);
});
