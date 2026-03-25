import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function DELETE(req: NextRequest) {
  try {
    const { callId } = await req.json();

    console.log('[delete-meeting] callId:', callId);

    if (!callId) {
      return NextResponse.json({ error: 'callId is required' }, { status: 400 });
    }

    const secret = process.env.STREAM_SECRET_KEY!;
    const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY!;

    const token = jwt.sign({ server: true }, secret, {
      algorithm: 'HS256',
      noTimestamp: true,
    });

    const url = `https://video.stream-io-api.com/api/v2/video/call/default/${callId}?api_key=${apiKey}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: token,
        'Stream-Auth-Type': 'jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    // 404 means it's already gone — treat as success
    if (response.status === 404) {
      return NextResponse.json({ success: true });
    }

    if (response.status === 403) {
      return NextResponse.json(
        { error: "You don't have permission to delete this meeting" },
        { status: 403 },
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[delete-meeting] Stream error [${response.status}]:`, errorText);
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[delete-meeting] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to delete meeting' }, { status: 500 });
  }
}
