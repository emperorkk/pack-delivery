export const config = {
  soft1Proxy: (import.meta.env.VITE_SOFT1_PROXY as string | undefined)?.replace(/\/$/, '') ?? '',
  cstDownloadUrl: (import.meta.env.VITE_CST_DOWNLOAD_URL as string | undefined) ?? '',
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
