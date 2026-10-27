/**
 * Product demo videos are a YouTube or Vimeo link, or a direct MP4/WebM file. Embeds use
 * YouTube's privacy-enhanced domain, so nothing loads until the visitor presses play.
 */
export type VideoSource =
  | { kind: 'youtube'; embed: string; thumb: string }
  | { kind: 'vimeo'; embed: string; thumb?: undefined }
  | { kind: 'file'; src: string; thumb?: undefined };

export function parseVideo(url?: string | null): VideoSource | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const youtubeId =
    host === 'youtu.be'
      ? u.pathname.slice(1)
      : host.endsWith('youtube.com')
        ? (u.searchParams.get('v') ?? /^\/(?:shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname)?.[1])
        : null;
  if (youtubeId) {
    const id = youtubeId.split(/[?&/]/)[0];
    return { kind: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  }
  const vimeoId = host.endsWith('vimeo.com') ? /\/(\d+)/.exec(u.pathname)?.[1] : null;
  if (vimeoId) return { kind: 'vimeo', embed: `https://player.vimeo.com/video/${vimeoId}?autoplay=1` };
  return { kind: 'file', src: url };
}
