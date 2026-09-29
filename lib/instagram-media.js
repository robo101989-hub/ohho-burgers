// Media type, not availability of a downloadable URL, determines whether this is a reel.
export function instagramPlayback(item) {
  const isVideo = ['VIDEO', 'REELS'].includes(item.mediaType) || Boolean(item.videoUrl);
  let embedUrl = null;
  if (isVideo && !item.videoUrl) {
    try {
      const url = new URL(item.permalink);
      const match = url.pathname.match(/^\/(?:reel|p)\/([A-Za-z0-9_-]+)\/?$/);
      if (url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) && match) {
        embedUrl = `https://www.instagram.com/p/${match[1]}/embed/`;
      }
    } catch { /* Retain the normal Instagram link when no valid embed is available. */ }
  }
  return { isVideo, embedUrl };
}

// Match the supplied original to its post, so new posts never inherit the wrong video.
export function withOriginalVideo(item) {
  try {
    const url = new URL(item.permalink);
    if (url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname)
      && /^\/(?:reel|p)\/DdtpGVdqeIp\/?$/.test(url.pathname)) {
      return { ...item, mediaType: 'VIDEO', videoUrl: '/videos/ohho-reel-DdtpGVdqeIp.mp4' };
    }
  } catch { /* Leave unrelated posts untouched. */ }
  return item;
}
