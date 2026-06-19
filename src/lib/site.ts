/** Public site branding and URL — used in layout, metadata, and footer. */
export const SITE_NAME = "Board Analytics PH";
export const SITE_NAME_DISPLAY = "Board Analytics PH";

/** Preferred public URL (custom domain). Override via env in production. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://boardanalyticsph.com";
