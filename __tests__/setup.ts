// Global test setup — provides dummy env vars so modules don't crash on import
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.GOOGLE_WALLET_ISSUER_ID = 'test-issuer';
process.env.GOOGLE_WALLET_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
process.env.GOOGLE_WALLET_PRIVATE_KEY = 'test-private-key';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake';
