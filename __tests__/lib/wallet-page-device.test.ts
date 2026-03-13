import { describe, it, expect } from 'vitest';

/**
 * Tests for the device-aware wallet button rendering logic.
 *
 * We test the rendering rules directly since successHtml is not exported.
 * The rules are:
 *   - iOS + both URLs → Apple primary, Google secondary link
 *   - Android + both URLs → Google primary, Apple secondary link
 *   - Desktop + both URLs → both as primary buttons
 *   - Any device + single URL → show available wallet only
 *   - Fallback always present when both URLs exist
 */

// Simulate the rendering logic from verify-email route
type DeviceType = 'ios' | 'android' | 'desktop';

interface WalletUrls {
  apple: string | null;
  google: string | null;
}

interface RenderResult {
  primaryType: 'apple' | 'google' | 'both' | 'none';
  hasSecondaryLink: boolean;
  secondaryType: 'apple' | 'google' | null;
}

function resolveWalletDisplay(device: DeviceType, urls: WalletUrls): RenderResult {
  if (!urls.apple && !urls.google) {
    return { primaryType: 'none', hasSecondaryLink: false, secondaryType: null };
  }

  if (device === 'ios' && urls.apple) {
    return {
      primaryType: 'apple',
      hasSecondaryLink: !!urls.google,
      secondaryType: urls.google ? 'google' : null,
    };
  }

  if (device === 'android' && urls.google) {
    return {
      primaryType: 'google',
      hasSecondaryLink: !!urls.apple,
      secondaryType: urls.apple ? 'apple' : null,
    };
  }

  // Desktop or device doesn't match available URLs
  if (urls.apple && urls.google) {
    return { primaryType: 'both', hasSecondaryLink: false, secondaryType: null };
  }

  return {
    primaryType: urls.apple ? 'apple' : 'google',
    hasSecondaryLink: false,
    secondaryType: null,
  };
}

describe('Wallet page device-aware display', () => {
  const both: WalletUrls = { apple: 'https://app/pkpass', google: 'https://pay.google.com/save/xxx' };
  const appleOnly: WalletUrls = { apple: 'https://app/pkpass', google: null };
  const googleOnly: WalletUrls = { apple: null, google: 'https://pay.google.com/save/xxx' };
  const none: WalletUrls = { apple: null, google: null };

  // ── iOS ──────────────────────────────────────────────────────────────
  describe('iOS device', () => {
    it('shows Apple as primary when both available', () => {
      const result = resolveWalletDisplay('ios', both);
      expect(result.primaryType).toBe('apple');
    });

    it('shows Google as secondary link on iOS', () => {
      const result = resolveWalletDisplay('ios', both);
      expect(result.hasSecondaryLink).toBe(true);
      expect(result.secondaryType).toBe('google');
    });

    it('shows Apple only when Google unavailable', () => {
      const result = resolveWalletDisplay('ios', appleOnly);
      expect(result.primaryType).toBe('apple');
      expect(result.hasSecondaryLink).toBe(false);
    });

    it('falls back to Google on iOS if Apple unavailable', () => {
      const result = resolveWalletDisplay('ios', googleOnly);
      expect(result.primaryType).toBe('google');
    });
  });

  // ── Android ──────────────────────────────────────────────────────────
  describe('Android device', () => {
    it('shows Google as primary when both available', () => {
      const result = resolveWalletDisplay('android', both);
      expect(result.primaryType).toBe('google');
    });

    it('shows Apple as secondary link on Android', () => {
      const result = resolveWalletDisplay('android', both);
      expect(result.hasSecondaryLink).toBe(true);
      expect(result.secondaryType).toBe('apple');
    });

    it('shows Google only when Apple unavailable', () => {
      const result = resolveWalletDisplay('android', googleOnly);
      expect(result.primaryType).toBe('google');
      expect(result.hasSecondaryLink).toBe(false);
    });

    it('falls back to Apple on Android if Google unavailable', () => {
      const result = resolveWalletDisplay('android', appleOnly);
      expect(result.primaryType).toBe('apple');
    });
  });

  // ── Desktop ──────────────────────────────────────────────────────────
  describe('Desktop device', () => {
    it('shows both as primary buttons when both available', () => {
      const result = resolveWalletDisplay('desktop', both);
      expect(result.primaryType).toBe('both');
    });

    it('shows no secondary link on desktop', () => {
      const result = resolveWalletDisplay('desktop', both);
      expect(result.hasSecondaryLink).toBe(false);
    });

    it('shows Apple only when Google unavailable', () => {
      const result = resolveWalletDisplay('desktop', appleOnly);
      expect(result.primaryType).toBe('apple');
    });

    it('shows Google only when Apple unavailable', () => {
      const result = resolveWalletDisplay('desktop', googleOnly);
      expect(result.primaryType).toBe('google');
    });
  });

  // ── No wallet URLs ──────────────────────────────────────────────────
  describe('No wallet URLs', () => {
    it('returns none for all device types', () => {
      for (const device of ['ios', 'android', 'desktop'] as DeviceType[]) {
        expect(resolveWalletDisplay(device, none).primaryType).toBe('none');
      }
    });
  });

  // ── Fallback guarantee ──────────────────────────────────────────────
  describe('Fallback always accessible', () => {
    it('iOS always has Google fallback when both exist', () => {
      const result = resolveWalletDisplay('ios', both);
      expect(result.hasSecondaryLink).toBe(true);
    });

    it('Android always has Apple fallback when both exist', () => {
      const result = resolveWalletDisplay('android', both);
      expect(result.hasSecondaryLink).toBe(true);
    });

    it('Desktop shows both without needing fallback', () => {
      const result = resolveWalletDisplay('desktop', both);
      expect(result.primaryType).toBe('both');
    });
  });
});
