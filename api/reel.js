const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

const HEADERS = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "upgrade-insecure-requests": "1",
  "cache-control": "no-cache",
};

function extractShortcode(input = "") {
  const s = String(input).trim();
  if (!s) return null;

  const m = s.match(
    /instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,})/i
  );
  if (m) return m[1];

  // bare shortcode
  if (/^[A-Za-z0-9_-]{5,20}$/.test(s)) return s;

  return null;
}

function detectType(input = "") {
  const s = String(input).toLowerCase();
  if (s.includes("/reels/")) return "reels";
  if (s.includes("/tv/")) return "tv";
  if (s.includes("/p/")) return "post";
  return "reel";
}

/** pull a JSON-escaped string out of html and decode it properly */
function grabJsonString(html, re) {
  const m = html.match(re);
  if (!m) return null;
  try {
    return JSON.parse('"' + m[1] + '"');
  } catch {
    return m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/") || null;
  }
}

function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function grabMeta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(re) || html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i")
  );
  return m ? decodeEntities(m[1]) : null;
}

async function fetchEmbed(shortcode) {
  const candidates = [
    `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/reel/${shortcode}/embed/`,
    `https://www.instagram.com/p/${shortcode}/embed/`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
      if (!res.ok) continue;
      const html = await res.text();
      if (
        html.includes("video_url") ||
        html.includes("og:video") ||
        html.includes("display_url")
      ) {
        return html;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function parse(html) {
  const video =
    grabJsonString(html, /"video_url":"((?:[^"\\]|\\.)*)"/) ||
    grabJsonString(html, /"contentUrl":"((?:[^"\\]|\\.)*)"/) ||
    grabMeta(html, "og:video") ||
    grabMeta(html, "og:video:secure_url");

  const thumb =
    grabJsonString(html, /"display_url":"((?:[^"\\]|\\.)*)"/) ||
    grabJsonString(html, /"thumbnail_src":"((?:[^"\\]|\\.)*)"/) ||
    grabMeta(html, "og:image");

  let caption =
    grabJsonString(html, /"caption":"((?:[^"\\]|\\.)*)"/) ||
    grabMeta(html, "og:description") ||
    grabMeta(html, "og:title");

  if (!caption) {
    const c = html.match(/<div[^>]*class="[^"]*Caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (c) {
      caption = decodeEntities(c[1].replace(/<[^>]+>/g, " ")).trim();
    }
  }

  const clean = (t) =>
    t ? decodeEntities(String(t)).replace(/\s+\n/g, "\n").trim() : null;

  return {
    video: video ? video.replace(/\\u0026/g, "&") : null,
    thumb: thumb ? thumb.replace(/\\u0026/g, "&") : null,
    caption: clean(caption),
  };
}

module.exports = async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "no-store");

  const raw =
    (req.query && req.query.url) ||
    (req.body && req.body.url) ||
    "";

  const shortcode = extractShortcode(raw);
  if (!shortcode) {
    return res.status(400).json({
      ok: false,
      error: "Valid Instagram link ya shortcode do.",
    });
  }

  try {
    const html = await fetchEmbed(shortcode);
    if (!html) {
      return res.status(404).json({
        ok: false,
        error: "Reel nahi mila. Private ho sakta hai ya delete ho gaya.",
      });
    }

    const data = parse(html);

    if (!data.video && !data.thumb) {
      return res.status(422).json({
        ok: false,
        error: "Media extract nahi hua. Link dobara check karo.",
      });
    }

    return res.status(200).json({
      ok: true,
      type: detectType(raw),
      shortcode,
      original: raw,
      page: `https://www.instagram.com/reel/${shortcode}/`,
      video: data.video,
      thumb: data.thumb,
      caption: data.caption,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Server side problem: " + (err.message || "unknown"),
    });
  }
};
