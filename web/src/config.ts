export const config = {
  /**
   * Same-origin proxy prefix. In production the Worker hosts both the PWA
   * (at `/`) and the Soft1 reverse proxy (at `/api/<sn>/s1services...`),
   * so the default `/api` keeps every request same-origin and CORS-free.
   * Override with VITE_SOFT1_PROXY to point at a remote Worker host.
   */
  soft1Proxy: (import.meta.env.VITE_SOFT1_PROXY as string | undefined)?.replace(/\/$/, '') ?? '/api',
  cstDownloadUrl: (import.meta.env.VITE_CST_DOWNLOAD_URL as string | undefined) ?? '/aicmp.pack-delivery.CST',
  defaultLocale: 'el' as const,
  defaultTheme: 'slate' as const
};

/** Build the proxied base URL for a given Soft1 serial number. */
export function baseUrlFor(serialNumber: string): string {
  if (!config.soft1Proxy) {
    return `https://${serialNumber}.oncloud.gr/s1services`;
  }
  return `${config.soft1Proxy}/${serialNumber}/s1services`;
}
