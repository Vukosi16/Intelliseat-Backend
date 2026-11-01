import { NextResponse } from 'next/server';
import { QUALIFICATIONS } from '../../../models';
import { requireAuth } from '../../../lib/auth';

export async function GET(request) {
  try {
    const { role } = requireAuth(request);
    if (role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(QUALIFICATIONS);
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: error.message }, { status });
  }
}
