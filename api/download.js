const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

function allowed(u) {
  try {
    const { hostname, protocol } = new URL(u);
    if (!/^https?:$/.test(protocol)) return false;
    return /(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com)$/i.test(hostname);
  } catch {
    return false;
  }
}

function safeName(name, fallback) {
  const base = String(name || fallback)
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return base || fallback;
}

module.exports = async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "no-store");

  const target = (req.query && req.query.url) || "";
  if (!target || !allowed(target)) {
    return res.status(400).send("Invalid or disallowed url.");
  }

  const wantsVideo = /\.mp4|video/i.test(target);
  const fallback = wantsVideo ? "reel.mp4" : "reel.jpg";
  const filename = safeName(req.query.name, fallback);

  try {
    const upstream = await fetch(target, {
      headers: {
        "user-agent": UA,
        referer: "https://www.instagram.com/",
        accept: "*/*",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send("Upstream fetch failed.");
    }

    const type = upstream.headers.get("content-type") || (wantsVideo ? "video/mp4" : "image/jpeg");
    const buf = Buffer.from(await upstream.arrayBuffer());

    // NOTE: vercel hobby functions cap response bodies around 4.5MB.
    // Bade reels ke liye frontend ka direct-blob path pehle try hota hai.
    res.setHeader("content-type", type);
    res.setHeader("content-length", String(buf.length));
    res.setHeader(
      "content-disposition",
      `attachment; filename="${filename}"`
    );
    return res.status(200).send(buf);
  } catch (err) {
    return res.status(500).send("Download error: " + (err.message || "unknown"));
  }
};
