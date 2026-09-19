const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
const STORY_FIELDS = "id,media_type,media_url,thumbnail_url,permalink,timestamp";

function toMediaItem(media) {
  const thumbnailUrl = media.thumbnail_url || media.media_url;
  if (!thumbnailUrl || !media.permalink) return null;
  const isVideo = ["REELS", "VIDEO"].includes(media.media_type);
  return {
    caption: String(media.caption || "").slice(0, 180),
    permalink: media.permalink,
    thumbnailUrl,
    mediaType: media.media_type,
    videoUrl: isVideo ? media.media_url || null : null,
    timestamp: media.timestamp || null
  };
}

function toStory(media) {
  const thumbnailUrl = media.thumbnail_url || media.media_url;
  if (!thumbnailUrl) return null;
  const isVideo = ["REELS", "VIDEO"].includes(media.media_type);
  return {
    thumbnailUrl,
    videoUrl: isVideo ? media.media_url || null : null,
    permalink: media.permalink || null,
    timestamp: media.timestamp || null
  };
}

/** Public, cached presentation endpoint. The Instagram token stays server-side. */
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  let token = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN1;
  let accountId = process.env.INSTAGRAM_ACCOUNT_ID;

  // Keep the connection resilient if the token was saved in the account-ID slot.
  if (accountId?.startsWith("IGAA")) {
    token = accountId;
    accountId = "17841430709232060";
  }
  if (!token || !accountId) {
    return res.status(503).json({ error: "Instagram feed is not connected yet." });
  }

  try {
    const makeUrl = (edge, limit) => {
      const url = new URL(`https://graph.instagram.com/${encodeURIComponent(accountId)}/${edge}`);
      url.searchParams.set("fields", edge === "stories" ? STORY_FIELDS : FIELDS);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("access_token", token);
      return url;
    };
    const [response, storiesResponse] = await Promise.all([
      fetch(makeUrl("media", 100), { headers: { Accept: "application/json" } }),
      fetch(makeUrl("stories", 4), { headers: { Accept: "application/json" } })
    ]);
    const [body, storiesBody] = await Promise.all([response.json(), storiesResponse.json()]);
    if (!response.ok) throw new Error(body?.error?.message || "Instagram request failed");

    const mediaItems = (body.data || [])
      .map(toMediaItem)
      .filter(Boolean);
    const reels = mediaItems
      .filter((media) => ["REELS", "VIDEO"].includes(media.mediaType))
      .slice(0, 4);
    const posts = mediaItems
      .filter((media) => ["IMAGE", "CAROUSEL_ALBUM"].includes(media.mediaType))
      .slice(0, 4);
    const stories = storiesResponse.ok
      ? (storiesBody.data || []).map(toStory).filter(Boolean).slice(0, 4)
      : [];

    res.setHeader("Cache-Control", "public, s-maxage=60, must-revalidate");
    const payload = { stories, reels, posts };
    // Only expose the non-sensitive API message when explicitly diagnosing a connection.
    if (req.query.debug === "stories") {
      payload.storiesDebug = {
        ok: storiesResponse.ok,
        status: storiesResponse.status,
        message: storiesResponse.ok ? null : storiesBody?.error?.message || "Instagram Stories request failed",
        media: storiesResponse.ok
          ? (storiesBody?.data || []).map(({ id, media_type, media_url, thumbnail_url }) => ({
              id,
              mediaType: media_type,
              hasMediaUrl: Boolean(media_url),
              hasThumbnailUrl: Boolean(thumbnail_url)
            }))
          : []
      };
    }
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Instagram Reels request failed:", error.message);
    return res.status(502).json({ error: "Unable to load Instagram reels right now." });
  }
}
