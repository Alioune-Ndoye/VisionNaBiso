'use client';

import { useEffect, useRef, useState } from 'react';
import { useCallStateHooks } from '@stream-io/video-react-sdk';

const DEEPGRAM_API_KEY = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY!;

interface InsightTip {
  question: string;
  tip: string;
}

interface MeetingIntelligenceProps {
  onTranscriptUpdate?: (transcript: string) => void;
  onQuestionsUpdate?: (questions: string[]) => void;
}

export default function MeetingIntelligence({ onTranscriptUpdate, onQuestionsUpdate }: MeetingIntelligenceProps) {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();

  const [caption, setCaption] = useState('');
  const [tip, setTip] = useState<InsightTip | null>(null);

  const fullTranscriptRef = useRef('');
  const questionsRef = useRef<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const initializedRef = useRef(false);
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // AudioContext must be resumed explicitly — browsers start it suspended
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;

    audioCtx.resume().catch(() => {
      // If resume fails (e.g. not in user-gesture context), try on next user interaction
      const resume = () => { audioCtx.resume(); document.removeEventListener('click', resume); };
      document.addEventListener('click', resume, { once: true });
    });

    const sampleRate = audioCtx.sampleRate;

    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.connect(audioCtx.destination);

    // ── Deepgram WebSocket ─────────────────────────────────────────────────
    // Use ?access_token= in the URL — the subprotocol array method is not
    // reliably supported across all browser/server combinations.
    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?access_token=${DEEPGRAM_API_KEY}` +
        `&encoding=linear16&sample_rate=${sampleRate}&channels=1` +
        `&interim_results=true&punctuate=true&smart_format=true`,
    );
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[VisionNaBiso] Deepgram WS connected');
      // Send a KeepAlive every 8 s so Deepgram doesn't close the socket
      // during natural pauses in conversation (it closes after ~10 s of silence)
      keepAliveIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, 8_000);
    };

    ws.onerror = (e) => console.error('[VisionNaBiso] Deepgram WS error', e);

    ws.onclose = (e) => {
      console.log(`[VisionNaBiso] Deepgram WS closed — code ${e.code}: ${e.reason}`);
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        const text: string = data.channel?.alternatives?.[0]?.transcript ?? '';
        const isFinal: boolean = data.is_final ?? false;

        if (!text) return;

        setCaption(text);

        if (isFinal) {
          fullTranscriptRef.current += text + ' ';
          onTranscriptUpdate?.(fullTranscriptRef.current.trim());
          setTimeout(() => setCaption(''), 2500);

          if (text.trim().endsWith('?')) {
            questionsRef.current = [...questionsRef.current, text.trim()];
            onQuestionsUpdate?.(questionsRef.current);
            try {
              const res = await fetch('/api/insight', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text }),
              });
              const json = await res.json();
              setTip({ question: text, tip: json.tip });
            } catch {
              // Non-fatal
            }
          }
        }
      } catch {
        // Malformed JSON from Deepgram — skip
      }
    };

    // ── PCM capture ────────────────────────────────────────────────────────
    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      ws.send(pcm16.buffer);
    };

    // Capture ref value for use in cleanup (avoids stale-ref lint warning)
    const sourceNodes = sourceNodesRef.current;

    return () => {
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
      ws.close();
      processor.disconnect();
      Array.from(sourceNodes.values()).forEach((s) => s.disconnect());
      sourceNodes.clear();
      audioCtx.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wire / unwire participant audio streams ────────────────────────────────
  useEffect(() => {
    const audioCtx = audioCtxRef.current;
    const processor = processorRef.current;
    if (!audioCtx || !processor) return;

    const currentIds = new Set(participants.map((p) => p.sessionId));

    Array.from(sourceNodesRef.current.entries()).forEach(([id, source]) => {
      if (!currentIds.has(id)) {
        source.disconnect();
        sourceNodesRef.current.delete(id);
      }
    });

    for (const participant of participants) {
      const stream = participant.audioStream;
      if (!stream || sourceNodesRef.current.has(participant.sessionId)) continue;

      try {
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(processor);
        sourceNodesRef.current.set(participant.sessionId, source);
        console.log(`[VisionNaBiso] connected audio for ${participant.sessionId}`);
      } catch (err) {
        console.warn('[VisionNaBiso] could not connect participant audio', err);
      }
    }
  }, [participants]);

  return (
    <>
      {caption && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 px-4">
          <div className="rounded-lg bg-black/80 px-4 py-2 text-center text-base text-white shadow-lg">
            {caption}
          </div>
        </div>
      )}

      {tip && (
        <div className="fixed right-4 top-1/3 z-50 w-72 rounded-lg border border-blue-500 bg-[#1c2b3a] p-4 shadow-xl">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-400">
            AI Insight
          </p>
          <p className="mb-2 text-xs italic text-gray-400">&quot;{tip.question}&quot;</p>
          <p className="text-sm leading-relaxed text-white">{tip.tip}</p>
          <button
            onClick={() => setTip(null)}
            className="mt-3 text-xs text-gray-500 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
