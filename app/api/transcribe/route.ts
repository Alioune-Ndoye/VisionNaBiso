import { NextRequest, NextResponse } from 'next/server';

// Deepgram pre-recorded transcription can take 30–90 s for longer meetings.
// Raise the Next.js route execution limit so it doesn't time out.
export const maxDuration = 120;

interface DeepgramWord {
  word: string;
  speaker: number;
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript: string;
        words?: DeepgramWord[];
      }>;
    }>;
  };
  error?: string;
}

function buildDiarizedTranscript(words: DeepgramWord[]): string {
  if (!words || words.length === 0) return '';

  let transcript = '';
  let currentSpeaker = -1;
  let currentSegment = '';

  for (const w of words) {
    if (w.speaker !== currentSpeaker) {
      if (currentSegment.trim()) {
        transcript += `Speaker ${currentSpeaker}: ${currentSegment.trim()}\n\n`;
      }
      currentSpeaker = w.speaker;
      currentSegment = '';
    }
    currentSegment += w.word + ' ';
  }

  if (currentSegment.trim()) {
    transcript += `Speaker ${currentSpeaker}: ${currentSegment.trim()}`;
  }

  return transcript.trim();
}

export async function POST(req: NextRequest) {
  const { recordingUrl } = await req.json();

  if (!recordingUrl) {
    return NextResponse.json({ error: 'recordingUrl is required' }, { status: 400 });
  }

  const response = await fetch(
    'https://api.deepgram.com/v1/listen?punctuate=true&diarize=true&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: recordingUrl }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { error: `Deepgram transcription failed: ${text}` },
      { status: response.status },
    );
  }

  const data: DeepgramResponse = await response.json();
  const channel = data.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];

  if (!alternative) {
    return NextResponse.json({ error: 'No transcription result returned' }, { status: 500 });
  }

  const words = alternative.words ?? [];
  const transcript =
    words.length > 0 ? buildDiarizedTranscript(words) : (alternative.transcript ?? '');

  return NextResponse.json({ transcript });
}
