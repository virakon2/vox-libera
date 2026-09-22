const hilo = document.querySelector("#hilo");
const caja = document.querySelector("#caja");
const form = document.querySelector("#composer");
const enviar = document.querySelector("#enviar");
const starters = document.querySelector("#starters");
const nueva = document.querySelector("#nueva");
const estado = document.querySelector("#estado");
const STORAGE = "vox-libera-v1";

let messages = load();
let pending = false;
let startedAt = 0;
let timer = null;

render();
fit();

caja.addEventListener("input", fit);
caja.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = caja.value.trim();
  if (!text || pending) return;
  caja.value = "";
  fit();
  ask(text);
});

starters.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || pending) return;
  ask(button.dataset.prompt);
});

nueva.addEventListener("click", () => {
  if (pending) return;
  messages = [];
  save();
  render();
  caja.focus();
});

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .slice(-12);
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE, JSON.stringify(messages.slice(-12)));
}

function fit() {
  caja.style.height = "auto";
  caja.style.height = `${Math.min(caja.scrollHeight, 160)}px`;
}

async function ask(text) {
  messages.push({ role: "user", content: text });
  save();
  pending = true;
  startedAt = Date.now();
  render();
  timer = setInterval(render, 1000);
  enviar.disabled = true;
  estado.textContent = "Consultando el modelo gratuito…";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.reply) {
      throw new Error(data.error || "No hubo respuesta.");
    }
    messages.push({ role: "assistant", content: data.reply });
    save();
    estado.textContent = `Respuesta en ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} s · modelo gratuito gpt-oss-20b.`;
  } catch (error) {
    estado.textContent = error.message || "No se pudo completar la respuesta.";
  } finally {
    clearInterval(timer);
    pending = false;
    enviar.disabled = false;
    render();
    caja.focus();
  }
}

function render() {
  starters.hidden = messages.length > 0;
  hilo.replaceChildren();
  if (messages.length === 0 && !pending) {
    const empty = document.createElement("p");
    empty.className = "burbuja assistant";
    empty.textContent = "Cuando quieras, escribí abajo o elegí una de las ideas. No hace falta registrarse.";
    hilo.append(empty);
  }

  for (const message of messages) {
    const bubble = document.createElement("div");
    bubble.className = `burbuja ${message.role}`;
    if (message.role === "assistant") bubble.innerHTML = markdown(message.content);
    else bubble.textContent = message.content;
    hilo.append(bubble);
  }

  if (pending) {
    const wait = document.createElement("div");
    wait.className = "burbuja assistant pending";
    const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    wait.textContent = `Tejiendo la respuesta… ${elapsed}s`;
    hilo.append(wait);
  }

  hilo.scrollTop = hilo.scrollHeight;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

function markdown(source) {
  const blocks = escapeThink(source).split(/```/);
  return blocks
    .map((block, index) => {
      if (index % 2 === 1) {
        const code = block.replace(/^\w+\n/, "");
        return `<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`;
      }
      return paragraphs(block);
    })
    .join("");
}

function escapeThink(source) {
  return source.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function paragraphs(source) {
  const lines = source.split(/\n/);
  const html = [];
  let list = null;
  const closeList = () => {
    if (list) {
      html.push(list.type === "ol" ? "</ol>" : "</ul>");
      list = null;
    }
  };
  for (const line of lines) {
    const ordered = line.match(/^\s*\d+\.\s+(.*)/);
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    if (ordered || bullet) {
      const type = ordered ? "ol" : "ul";
      if (!list || list.type !== type) {
        closeList();
        list = { type };
        html.push(type === "ol" ? "<ol>" : "<ul>");
      }
      html.push(`<li>${inline((ordered || bullet)[1])}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) continue;
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join("");
}
