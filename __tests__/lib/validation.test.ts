import { registerSchema, registerSlugSchema, parseBody } from '@/lib/validation';

describe('registerSchema', () => {
  const validData = {
    restaurantSlug: 'my-restaurant',
    firstName: 'Jean',
    lastName: 'Dupont',
    email: 'jean@example.com',
    birthDate: '1990-05-15',
    postalCode: '75001',
    marketingConsent: true,
  };

  it('accepts valid data', () => {
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('fails when required fields are missing', () => {
    const result = registerSchema.safeParse({});
    expect(result.success).toBe(false);

    if (!result.success) {
      const fieldNames = result.error.issues.map((i) => i.path[0]);
      expect(fieldNames).toContain('restaurantSlug');
      expect(fieldNames).toContain('firstName');
      expect(fieldNames).toContain('lastName');
      expect(fieldNames).toContain('email');
      expect(fieldNames).toContain('marketingConsent');
    }
  });

  it('fails when email is invalid', () => {
    const result = registerSchema.safeParse({ ...validData, email: 'not-an-email' });
    expect(result.success).toBe(false);

    if (!result.success) {
      const emailIssue = result.error.issues.find((i) => i.path[0] === 'email');
      expect(emailIssue).toBeDefined();
      expect(emailIssue!.message).toBe('Adresse email invalide');
    }
  });
});

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
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.first_name).toBe('Luc');
      expect(result.data.email).toBe('luc@example.com');
      // Optional field defaults
      expect(result.data.consent_marketing).toBe(false);
    }
  });

  it('returns { success: false, error } for invalid input', () => {
    const result = parseBody(registerSlugSchema, { first_name: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
