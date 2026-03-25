import { NextRequest, NextResponse } from 'next/server';

const ANALYSIS_PROMPT = `You are the VisionNaBiso Intelligence Agent. Analyze this meeting transcript and return ONLY a valid JSON object with these keys:
- summary: string (3 sentences, what was decided and why)
- actionItems: array of { task: string, owner: string, deadline: string | null }
- alternativeApproaches: array of exactly 3 objects, each with {
    topic: string (the decision or problem discussed),
    currentApproach: string (what the team chose),
    alternative: string (a different approach they could have taken),
    tradeoff: string (why this alternative might be better or worse)
  }
- sentiment: { label: 'collaborative'|'tense'|'undecided'|'mixed', explanation: string }
Return only raw JSON. No markdown, no backticks, no explanation.`;

async function callGemini(text: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.3,
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function POST(req: NextRequest) {
  const { transcript } = await req.json();

  if (!transcript) {
    return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
  }

  const fullPrompt = `${ANALYSIS_PROMPT}\n\nTranscript:\n${transcript}`;

  let rawJson = await callGemini(fullPrompt);

  // Strip markdown code fences if present
  rawJson = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    // Retry with stricter instruction
    const retryPrompt = `Your last response was not valid JSON. Return only the raw JSON object.\n\n${fullPrompt}`;
    let retryRaw = await callGemini(retryPrompt);
    retryRaw = retryRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    try {
      parsed = JSON.parse(retryRaw);
    } catch {
      return NextResponse.json(
        { error: 'Gemini returned malformed JSON after retry', raw: retryRaw },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(parsed);
}
