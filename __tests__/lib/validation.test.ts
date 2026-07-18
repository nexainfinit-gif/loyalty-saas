import { registerSlugSchema, parseBody } from '@/lib/validation';

describe('registerSlugSchema', () => {
  const validData = {
    first_name: 'Marie',
    email: 'marie@example.com',
    birth_date: '1985-12-01',
    phone: '+33612345678',
    consent_marketing: true,
  };

  it('accepts valid data', () => {
    const result = registerSlugSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails when email is missing', () => {
    const { email, ...noEmail } = validData;
    const result = registerSlugSchema.safeParse(noEmail);
    expect(result.success).toBe(false);

    if (!result.success) {
      const fieldNames = result.error.issues.map((i) => i.path[0]);
      expect(fieldNames).toContain('email');
    }
  });
});

describe('parseBody', () => {
  it('returns { success: true, data } for valid input', () => {
    const result = parseBody(registerSlugSchema, {
      first_name: 'Luc',
      email: 'luc@example.com',
      birth_date: '1990-01-01',
      consent_marketing: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.first_name).toBe('Luc');
      expect(result.data.email).toBe('luc@example.com');
      expect(result.data.consent_marketing).toBe(true);
    }
  });

  it('rejects registration without explicit marketing consent (RGPD — BUG-02)', () => {
    const result = parseBody(registerSlugSchema, {
      first_name: 'Luc',
      email: 'luc@example.com',
      // consent_marketing intentionally omitted — must be rejected
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Vous devez accepter les conditions');
    }
  });

  it('rejects consent_marketing: false (RGPD — explicit true required)', () => {
    const result = parseBody(registerSlugSchema, {
      first_name: 'Luc',
      email: 'luc@example.com',
      consent_marketing: false,
    });

    expect(result.success).toBe(false);
  });

  it('returns { success: false, error } for invalid input', () => {
    const result = parseBody(registerSlugSchema, { first_name: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const failed = result as { success: false; error: string };
      expect(typeof failed.error).toBe('string');
      expect(failed.error.length).toBeGreaterThan(0);
    }
  });
});
