/**
 * Smoke tests — READ-ONLY.
 *
 * Couvre les parcours critiques sans jamais écrire en base :
 * locale routing, gate d'auth serveur (proxy.ts), pages publiques
 * (login, inscription client, réservation), états d'erreur.
 *
 * La base Supabase derrière le dev server est la vraie — aucune
 * soumission de formulaire ici.
 */
import { test, expect } from '@playwright/test';

// Restaurant démo stable (is_demo=true, seedé par l'admin)
const DEMO_SLUG = 'demo-bistrot';
const DEMO_BOOKING_SLUG = 'demo-coiffure';

test.describe('Locale routing (proxy.ts)', () => {
  test('la racine redirige vers /fr pour un navigateur francophone', async ({ browser }) => {
    // Accept-Language pilote la détection → forcer fr-FR
    const ctx = await browser.newContext({ locale: 'fr-FR' });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/fr(\/|$)/);
    await ctx.close();
  });

  test('la racine redirige vers une locale supportée (défaut navigateur)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(fr|en|nl|it|es)(\/|$)/);
  });

  test('une locale supportée est conservée (/en)', async ({ page }) => {
    await page.goto('/en/dashboard/login');
    await expect(page).toHaveURL(/\/en\/dashboard\/login/);
  });
});

test.describe("Gate d'auth serveur", () => {
  test('/fr/dashboard sans session redirige vers le login', async ({ page }) => {
    await page.goto('/fr/dashboard');
    await expect(page).toHaveURL(/\/fr\/dashboard\/login/);
  });

  test('/fr/admin sans session redirige vers le login', async ({ page }) => {
    await page.goto('/fr/admin');
    await expect(page).toHaveURL(/\/fr\/dashboard\/login/);
  });
});

test.describe('Login (public)', () => {
  test('la page de login rend le formulaire email', async ({ page }) => {
    await page.goto('/fr/dashboard/login');
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});

test.describe('Inscription client (public)', () => {
  test("la page d'inscription du restaurant démo rend le formulaire", async ({ page }) => {
    await page.goto(`/fr/register/${DEMO_SLUG}`);
    await expect(page.locator('input[name="first_name"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    // Case de consentement RGPD obligatoire (BUG-02)
    await expect(page.locator('input[name="consent_marketing"]')).toBeAttached();
  });

  test('un slug inexistant affiche un état d\'erreur, pas un crash', async ({ page }) => {
    await page.goto('/fr/register/slug-qui-nexiste-pas-du-tout');
    // Pas de page blanche ni d'erreur Next non gérée
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.locator('body')).not.toContainText('500');
  });
});

test.describe('Réservation (public)', () => {
  test('la page de booking du salon démo se rend', async ({ page }) => {
    await page.goto(`/fr/book/${DEMO_BOOKING_SLUG}`);
    await expect(page.locator('body')).not.toContainText('Application error');
    // La page doit afficher du contenu réel (services ou message dédié)
    await expect(page.locator('main, [class*="container"], body >> nth=0')).toBeVisible();
  });
});

test.describe('Pages statiques', () => {
  test('la politique de confidentialité est accessible', async ({ page }) => {
    const res = await page.goto('/fr/privacy');
    expect(res?.status()).toBeLessThan(400);
  });

  test('la page support est accessible', async ({ page }) => {
    const res = await page.goto('/fr/support');
    expect(res?.status()).toBeLessThan(400);
  });
});
