import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'This endpoint has been replaced by /api/auth/verify-code' },
    { status: 410 }
  );
}
