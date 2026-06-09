import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. CORS Audio Proxy with Range Support (Bulletproof streaming bypassing CORS)
  app.get("/api/proxy", async (req, res) => {
    const audioUrl = req.query.url as string;
    if (!audioUrl) {
      return res.status(400).send("Missing url parameter");
    }

    try {
      const parsedUrl = new URL(audioUrl);
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36",
        "Accept": "*/*"
      };

      // Forward client's range headers if they exist
      if (req.headers.range) {
        headers["Range"] = req.headers.range;
      }

      const response = await fetch(audioUrl, { headers });

      // Copy key audio-serving headers
      const headersToCopy = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "cache-control",
        "etag",
        "last-modified"
      ];

      for (const h of headersToCopy) {
        const val = response.headers.get(h);
        if (val) {
          res.setHeader(h, val);
        }
      }

      // Safe permissive headers for Web Audio API drawing
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

      res.status(response.status);

      if (response.body) {
        const reader = response.body.getReader();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
              controller.close();
            } catch (err) {
              controller.error(err);
            }
          }
        });

        // Convert ReadableStream to Node.JS compatible format
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      } else {
        res.end();
      }
    } catch (error: any) {
      console.error("Audio proxy error for url:", audioUrl, error.message);
      res.status(500).send("Proxy streaming failed: " + error.message);
    }
  });

  // 2. SoundCloud Resolver Endpoint (Extracting metadata and streams from public pages)
  app.get("/api/soundcloud-resolve", async (req, res) => {
    const scUrl = req.query.url as string;
    if (!scUrl) {
      return res.status(400).json({ error: "Missing soundcloud url" });
    }

    try {
      // Fetch SoundCloud page HTML to scrape metadata & potential stream details
      const response = await fetch(scUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
        }
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `SoundCloud responded with status ${response.status}` });
      }

      const html = await response.text();

      // Simple regex extraction for track information
      // Page titles on SoundCloud are formatted as "Song Title by Artist | Listen online for free"
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      let title = "SoundCloud Track";
      let artist = "Unknown Artist";

      if (titleMatch && titleMatch[1]) {
        const cleanTitle = titleMatch[1].replace(" | Listen online for free on SoundCloud", "");
        const parts = cleanTitle.split(" by ");
        if (parts.length > 1) {
          title = parts[0].trim();
          artist = parts[1].trim();
        } else {
          title = cleanTitle;
        }
      }

      // Expose thumbnail image
      const thumbnailMatch = html.match(/<meta property="og:image" content="(.*?)"/i);
      const thumbnail = thumbnailMatch && thumbnailMatch[1] ? thumbnailMatch[1] : "";

      // Try extraction of ClientId or embedded stream urls.
      // Typical SoundCloud streams are HLS, but if direct stream fails,
      // we'll play via our proxy or guide the user to play it through the integrated SoundCloud official widget
      // We will return resolved info!
      res.json({
        title,
        artist,
        thumbnail,
        originalUrl: scUrl,
        embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(scUrl)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`
      });

    } catch (err: any) {
      console.error("SoundCloud resolve error:", err.message);
      res.status(500).json({ error: "Failed to resolve SoundCloud URL: " + err.message });
    }
  });

  // 3. Vite development vs production asset handling
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[READY] DJ Platform Server booted on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
