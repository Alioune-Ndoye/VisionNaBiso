import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text) {
    return NextResponse.json({ tip: '' });
  }

  const prompt = `You are the VisionNaBiso Intelligence Agent. A meeting participant just asked: "${text}"
Give a concise, practical insight or tip to help the team address this question effectively.
Respond in 2-3 sentences. No markdown, no preamble.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 512,
            temperature: 0.3,
          },
        }),
      },
    );

    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);

    const data = await res.json();
    const tip: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No insight available.';

    return NextResponse.json({ tip });
  } catch {
    return NextResponse.json({ tip: 'Unable to generate insight at this time.' });
  }
}
