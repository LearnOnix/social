const $ = (s) => document.querySelector(s);

const form    = $("#form");
const input   = $("#url");
const goBtn   = $("#go");
const statusEl= $("#status");
const card    = $("#card");
const videoEl = $("#video");
const thumbEl = $("#thumb");
const capEl   = $("#caption");
const tagEl   = $("#tag");
const codeEl  = $("#code");
const noteEl  = $("#note");
const openEl  = $("#open");

let current = { video: null, thumb: null, shortcode: null, page: null };
let busy = false;

/* ---------- ui helpers ---------- */

function setStatus(text, kind = "load") {
  if (!text) { statusEl.hidden = true; return; }
  statusEl.hidden = false;
  statusEl.className = "status" + (kind === "err" ? " err" : "");
  statusEl.innerHTML =
    (kind === "load" ? '<span class="spinner"></span>' : "") +
    `<span>${escapeHtml(text)}</span>`;
}

function escapeHtml(s = "") {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function setBusy(state) {
  busy = state;
  goBtn.disabled = state;
  goBtn.textContent = state ? "…" : "Fetch";
}

/* ---------- fetch reel info ---------- */

async function fetchReel(rawUrl) {
  const res = await fetch("/api/reel?url=" + encodeURIComponent(rawUrl));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Reel nahi mila. Link check karo.");
  }
  return data;
}

/* ---------- render ---------- */

function render(data) {
  current = data;

  tagEl.textContent = data.type || "reel";
  codeEl.textContent = data.shortcode ? "#" + data.shortcode : "";

  // cover
  if (data.thumb) {
    thumbEl.src = data.thumb;
    thumbEl.hidden = false;
    videoEl.poster = data.thumb;
  } else {
    thumbEl.hidden = true;
  }

  // video
  if (data.video) {
    videoEl.src = data.video;
    videoEl.hidden = false;
    videoEl.load();
    $("#dlVideo").disabled = false;
    noteEl.textContent = "Link expire ho sakta hai — jaldi download kar lo.";
  } else {
    videoEl.hidden = true;
    videoEl.removeAttribute("src");
    $("#dlVideo").disabled = true;
    noteEl.textContent = "Ye post video nahi hai (photo/carousel). Sirf cover download hoga.";
  }

  // caption
  capEl.textContent = data.caption || "";

  // links
  const page = data.page || data.original || "https://www.instagram.com/";
  openEl.href = page;

  $("#dlThumb").disabled = !data.thumb;

  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- download ---------- */

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function download(url, filename) {
  if (!url) return;

  // 1) direct blob (IG CDN mostly allows cors)
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error("bad status");
    const blob = await res.blob();
    if (blob.size < 1024) throw new Error("empty");
    saveBlob(blob, filename);
    return;
  } catch {
    /* fall through */
  }

  // 2) server proxy (works even when cors fails)
  window.location.href =
    "/api/download?url=" + encodeURIComponent(url) +
    "&name=" + encodeURIComponent(filename);
}

/* ---------- events ---------- */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  const raw = input.value.trim();
  if (!raw) {
    setStatus("Pehle reel ka link daalo.", "err");
    return;
  }

  setBusy(true);
  card.hidden = true;
  setStatus("Reel fetch ho raha hai…");

  try {
    const data = await fetchReel(raw);
    setStatus(null);
    render(data);
  } catch (err) {
    setStatus(err.message || "Kuch galat ho gaya.", "err");
  } finally {
    setBusy(false);
  }
});

$("#dlVideo").addEventListener("click", () => {
  download(current.video, `reel-${current.shortcode || "video"}.mp4`);
});

$("#dlThumb").addEventListener("click", () => {
  download(current.thumb, `reel-${current.shortcode || "cover"}.jpg`);
});

$("#copy").addEventListener("click", async () => {
  const link = current.page || current.original || "";
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    const btn = $("#copy");
    const old = btn.textContent;
    btn.textContent = "Copied ✓";
    setTimeout(() => (btn.textContent = old), 1400);
  } catch {
    setStatus("Copy fail — manually copy karo.", "err");
  }
});

/* paste helper: auto-fetch on paste */
input.addEventListener("paste", () => {
  setTimeout(() => {
    if (input.value.trim().length > 12) form.requestSubmit();
  }, 60);
});
