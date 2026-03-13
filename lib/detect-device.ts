export type DeviceType = 'ios' | 'android' | 'desktop';

/**
 * Detect device type from User-Agent string.
 * Used to prioritize the correct wallet button (Apple vs Google).
 */
export function detectDevice(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}
