import { describe, it, expect } from 'vitest';
import { detectDevice } from '@/lib/detect-device';

describe('detectDevice', () => {
  // ── iOS ──────────────────────────────────────────────────────────────
  it('detects iPhone', () => {
    expect(detectDevice(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1'
    )).toBe('ios');
  });

  it('detects iPad', () => {
    expect(detectDevice(
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1'
    )).toBe('ios');
  });

  it('detects iPod', () => {
    expect(detectDevice(
      'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15'
    )).toBe('ios');
  });

  // ── Android ──────────────────────────────────────────────────────────
  it('detects Android phone', () => {
    expect(detectDevice(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.90 Mobile Safari/537.36'
    )).toBe('android');
  });

  it('detects Android tablet', () => {
    expect(detectDevice(
      'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'
    )).toBe('android');
  });

  it('detects Samsung Browser', () => {
    expect(detectDevice(
      'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0 Mobile Safari/537.36'
    )).toBe('android');
  });

  // ── Desktop / unknown ───────────────────────────────────────────────
  it('detects desktop Chrome', () => {
    expect(detectDevice(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    )).toBe('desktop');
  });

  it('detects desktop Firefox', () => {
    expect(detectDevice(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0'
    )).toBe('desktop');
  });

  it('detects macOS Safari as desktop (not iOS)', () => {
    expect(detectDevice(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15'
    )).toBe('desktop');
  });

  it('returns desktop for empty string', () => {
    expect(detectDevice('')).toBe('desktop');
  });

  it('returns desktop for unknown UA', () => {
    expect(detectDevice('curl/7.88.1')).toBe('desktop');
  });
});
