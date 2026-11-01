import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import { Module } from '../../../models';

const { requireAuth } = require('../../../lib/auth');

export async function GET(request) {
  try {
    await connectDB();
    const { role } = requireAuth(request);
    if (role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json(await Module.find({ isActive: true }).sort({ code: 1 }));
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
