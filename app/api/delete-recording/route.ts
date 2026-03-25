import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function DELETE(req: NextRequest) {
  try {
    const { callId, sessionId, filename } = await req.json();

    console.log('[delete-recording] request:', { callId, sessionId, filename });

    if (!callId || !sessionId || !filename) {
      return NextResponse.json(
        { error: 'callId, sessionId, and filename are required' },
        { status: 400 },
      );
    }

    const secret = process.env.STREAM_SECRET_KEY!;
    const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY!;

    const token = jwt.sign({ server: true }, secret, {
      algorithm: 'HS256',
      noTimestamp: true,
    });

    const url = `https://video.stream-io-api.com/api/v2/video/call/default/${callId}/${sessionId}/recordings/${filename}?api_key=${apiKey}`;

    console.log('[delete] calling URL:', url);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: token,
        'Stream-Auth-Type': 'jwt',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Stream delete recording failed [${response.status}]:`,
        errorText,
        { callId, sessionId, filename },
      );
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete recording:', error);
    return NextResponse.json(
      { error: 'Failed to delete recording' },
      { status: 500 },
    );
  }
}
