import { NextRequest, NextResponse } from 'next/server';
import { StreamClient } from '@stream-io/node-sdk';

export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get('callId');

  if (!callId) {
    return NextResponse.json({ error: 'callId is required' }, { status: 400 });
  }

  try {
    const client = new StreamClient(
      process.env.NEXT_PUBLIC_STREAM_API_KEY!,
      process.env.STREAM_SECRET_KEY!,
    );

    const streamCall = client.video.call('default', callId);
    const response = await streamCall.listRecordings();

    if (!response.recordings || response.recordings.length === 0) {
      return NextResponse.json(
        { error: 'Recording not ready yet. Check back in a minute.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ url: response.recordings[0].url });
  } catch (error) {
    console.error('Failed to fetch recording:', error);
    return NextResponse.json({ error: 'Failed to fetch recording' }, { status: 500 });
  }
}
