import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    APP_URL: process.env['APP_URL'] ?? 'NOT_SET',
    NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'] ?? 'NOT_SET',
    hardcoded: 'https://app.rebites.be',
    commit: '93dfe15',
    timestamp: new Date().toISOString(),
  });
}
