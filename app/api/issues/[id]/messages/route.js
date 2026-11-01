import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import { Issue, IssueMessage } from '../../../../../models';

const { requireAuth } = require('../../../../../lib/auth');

export async function POST(request, { params }) {
  try {
    await connectDB();
    const { userId } = requireAuth(request);

    const { id } = await params;
    const json = await request.json();
    const { body } = json || {};

    if (!body || !String(body).trim()) {
      return NextResponse.json({ message: 'body is required' }, { status: 400 });
    }

    const issue = await Issue.findById(id);
    if (!issue) {
      return NextResponse.json({ message: 'Issue not found' }, { status: 404 });
    }

    const message = await IssueMessage.create({
      issueId: id,
      senderId: userId,
      body: String(body).trim(),
    });

    issue.lastMessageAt = new Date();
    await issue.save();

    const populated = await IssueMessage.findById(message._id).populate(
      'senderId',
      'firstName lastName role'
    );

    return NextResponse.json(populated, { status: 201 });
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { role, userId } = requireAuth(request);
    const { id } = await params;
    const issue = await Issue.findById(id).select('reporterId');

    if (!issue) {
      return NextResponse.json({ message: 'Issue not found' }, { status: 404 });
    }
    if (role !== 'admin' && String(issue.reporterId) !== String(userId)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const messages = await IssueMessage.find({ issueId: id })
      .sort({ createdAt: 1 })
      .populate('senderId', 'firstName lastName role');

    return NextResponse.json(messages);
  } catch (err) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ message: err.message }, { status });
  }
}
