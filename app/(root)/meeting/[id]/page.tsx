'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  CallingState,
  StreamCall,
  StreamTheme,
  useCallStateHooks,
} from '@stream-io/video-react-sdk';
import { useParams } from 'next/navigation';
import { Loader, Sparkles, Zap, Lightbulb, MessageCircleQuestion } from 'lucide-react';

import { useGetCallById } from '@/hooks/useGetCallById';
import Alert from '@/components/Alert';
import MeetingSetup from '@/components/MeetingSetup';
import MeetingRoom from '@/components/MeetingRoom';
import MeetingIntelligence from '@/components/MeetingIntelligence';
import { Badge } from '@/components/ui/badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionItem {
  task: string;
  owner: string;
  deadline: string | null;
}

interface AlternativeApproach {
  topic: string;
  currentApproach: string;
  alternative: string;
  tradeoff: string;
}

interface Sentiment {
  label: 'collaborative' | 'tense' | 'undecided' | 'mixed';
  explanation: string;
}

interface AnalysisResult {
  summary: string;
  actionItems: ActionItem[];
  alternativeApproaches: AlternativeApproach[];
  sentiment: Sentiment;
}

type CallPhase = 'setup' | 'in-call' | 'analyzing' | 'report' | 'error' | 'no-transcript';

// ─── InCallView ───────────────────────────────────────────────────────────────
// Rendered inside <StreamCall> so it can access Stream hooks.
// Monitors calling state and fires onCallEnd when the user leaves.

interface InCallViewProps {
  onCallEnd: (liveTranscript: string) => void;
  liveTranscriptRef: React.MutableRefObject<string>;
  liveQuestionsRef: React.MutableRefObject<string[]>;
}

const InCallView = ({ onCallEnd, liveTranscriptRef, liveQuestionsRef }: InCallViewProps) => {
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();

  const [aiEnabled, setAiEnabled] = useState(false);
  const wasJoinedRef = useRef(false);
  const hasEndedRef = useRef(false);

  useEffect(() => {
    if (callingState === CallingState.JOINED) {
      wasJoinedRef.current = true;
      return;
    }
    // Trigger only after having been joined, and only once
    if (wasJoinedRef.current && !hasEndedRef.current) {
      hasEndedRef.current = true;
      onCallEnd(liveTranscriptRef.current);
    }
  }, [callingState, onCallEnd, liveTranscriptRef]);

  // While not yet joined, show nothing (MeetingRoom handles its own loader)
  if (!wasJoinedRef.current && callingState !== CallingState.JOINED) {
    return <Loader />;
  }

  // After leaving, return null — the parent will show the analyzing/report UI
  if (hasEndedRef.current) return null;

  return (
    <>
      <MeetingRoom
        aiEnabled={aiEnabled}
        onAiToggle={setAiEnabled}
        onLeave={() => {
          // Let callingState change handle the transition; no router push needed
        }}
      />
      {aiEnabled && (
        <MeetingIntelligence
          onTranscriptUpdate={(t) => {
            liveTranscriptRef.current = t;
          }}
          onQuestionsUpdate={(q) => {
            liveQuestionsRef.current = q;
          }}
        />
      )}
    </>
  );
};

// ─── Post-meeting Report ──────────────────────────────────────────────────────

const ReportView = ({
  data,
  callId,
  questions,
}: {
  data: AnalysisResult;
  callId: string;
  questions: string[];
}) => {
  const handleDownload = () => {
    const json = JSON.stringify({ ...data, questions }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-report-${callId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derive "Key Moments" — up to 3 topics from alternativeApproaches, topped up by action item tasks
  const keyMoments: string[] = [
    ...(data.alternativeApproaches?.map((a) => a.topic) ?? []),
    ...(data.actionItems?.map((a) => a.task) ?? []),
  ].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 3);

  // Derive plain-English observations from alternativeApproaches + sentiment
  const observations: string[] = [
    ...(data.alternativeApproaches?.slice(0, 2).map(
      (a) =>
        `The team spent significant time on "${a.topic}" and ultimately chose ${a.currentApproach}. An alternative worth considering is ${a.alternative}.`,
    ) ?? []),
    ...(data.sentiment
      ? [
          `The overall meeting tone was ${data.sentiment.label}. ${data.sentiment.explanation}`,
        ]
      : []),
  ].slice(0, 3);

  const momentIcons = [Zap, Lightbulb, Sparkles];

  return (
    <div className="min-h-screen bg-dark-1 p-6 text-white">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Meeting Intelligence Report</h1>
            <p className="mt-1 text-sm text-gray-400">VisionNaBiso Analysis</p>
          </div>
          <button
            onClick={handleDownload}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Download Report
          </button>
        </div>

        {/* AI Conversation Insights — shown first */}
        <section className="rounded-xl border border-purple-500/30 bg-[#0d1b2a] p-6">
          <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-purple-300">
            <Sparkles className="h-5 w-5 text-purple-400" />
            AI Conversation Insights
          </h2>

          {/* Key Moments */}
          {keyMoments.length > 0 && (
            <div className="mb-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-purple-400">
                Key Moments
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {keyMoments.map((moment, i) => {
                  const Icon = momentIcons[i] ?? Sparkles;
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-purple-500/20 bg-[#131f2e] p-3"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                      <p className="text-sm text-gray-200">{moment}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* What the AI Noticed */}
          {observations.length > 0 && (
            <div className="mb-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-purple-400">
                What the AI Noticed
              </p>
              <div className="space-y-3">
                {observations.map((obs, i) => (
                  <p key={i} className="text-sm leading-relaxed text-gray-300 border-l-2 border-purple-500/40 pl-3">
                    {obs}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Questions Raised */}
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-purple-400">
              <MessageCircleQuestion className="h-3.5 w-3.5" />
              Questions Raised
            </p>
            {questions.length > 0 ? (
              <ul className="space-y-2">
                {questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="mt-0.5 text-purple-400">?</span>
                    {q}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No questions were detected during this meeting.</p>
            )}
          </div>
        </section>

        {/* Summary */}
        <section className="rounded-xl border border-white/10 bg-dark-2 p-6">
          <h2 className="mb-3 text-lg font-semibold text-blue-400">Summary</h2>
          <p className="leading-relaxed text-gray-200">{data.summary}</p>
        </section>

        {/* Action Items */}
        <section className="rounded-xl border border-white/10 bg-dark-2 p-6">
          <h2 className="mb-4 text-lg font-semibold text-blue-400">Action Items</h2>
          {data.actionItems && data.actionItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-gray-400">
                    <th className="pb-3 pr-4 font-medium">Task</th>
                    <th className="pb-3 pr-4 font-medium">Owner</th>
                    <th className="pb-3 font-medium">Deadline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.actionItems.map((item, i) => (
                    <tr key={i} className="text-gray-200">
                      <td className="py-3 pr-4">{item.task}</td>
                      <td className="py-3 pr-4 text-blue-300">{item.owner}</td>
                      <td className="py-3 text-gray-400">{item.deadline ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400">No action items identified.</p>
          )}
        </section>

        {/* Alternative Approaches */}
        <section className="rounded-xl border border-white/10 bg-dark-2 p-6">
          <h2 className="mb-4 text-lg font-semibold text-blue-400">Alternative Approaches</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {data.alternativeApproaches?.map((alt, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/10 bg-dark-1 p-4 space-y-3"
              >
                <p className="text-sm font-semibold text-white">{alt.topic}</p>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                    Chosen
                  </p>
                  <p className="text-sm text-gray-300">{alt.currentApproach}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-400 mb-1">
                    Alternative
                  </p>
                  <p className="text-sm text-gray-300">{alt.alternative}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-yellow-500 mb-1">
                    Trade-off
                  </p>
                  <p className="text-sm text-gray-400">{alt.tradeoff}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sentiment */}
        <section className="rounded-xl border border-white/10 bg-dark-2 p-6">
          <h2 className="mb-3 text-lg font-semibold text-blue-400">Meeting Sentiment</h2>
          {data.sentiment && (
            <div className="flex items-start gap-4">
              <Badge variant={data.sentiment.label} className="mt-1 shrink-0 capitalize">
                {data.sentiment.label}
              </Badge>
              <p className="text-sm leading-relaxed text-gray-300">{data.sentiment.explanation}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// ─── MeetingPage ──────────────────────────────────────────────────────────────

const MeetingPage = () => {
  const { id } = useParams();
  const callId = Array.isArray(id) ? id[0] : (id as string);

  const { isLoaded, user } = useUser();
  const { call, isCallLoading } = useGetCallById(id);

  const [callPhase, setCallPhase] = useState<CallPhase>('setup');
  const [reportData, setReportData] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isRetryRecording, setIsRetryRecording] = useState(false);

  // Holds live transcript/questions accumulated by MeetingIntelligence during the call
  const liveTranscriptRef = useRef('');
  const liveQuestionsRef = useRef<string[]>([]);
  // Preserved after StreamCall unmounts so retry can still access them
  const savedLiveTranscriptRef = useRef('');
  const savedQuestionsRef = useRef<string[]>([]);

  // ── Post-meeting pipeline ──────────────────────────────────────────────────

  const runAnalysisPipeline = useCallback(
    async (liveTranscript: string) => {
      setCallPhase('analyzing');
      setAnalysisError(null);

      try {
        let transcript = '';

        // Step 1 — fetch recording URL
        const recRes = await fetch(`/api/recording?callId=${callId}`);

        if (recRes.ok) {
          const { url } = await recRes.json();

          // Step 2 — transcribe with Deepgram pre-recorded
          const txRes = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recordingUrl: url }),
          });

          if (!txRes.ok) {
            const err = await txRes.json();
            throw new Error(err.error ?? 'Transcription failed');
          }

          const { transcript: tx } = await txRes.json();
          transcript = tx;
        } else {
          const err = await recRes.json();

          if (recRes.status === 404) {
            // Recording not processed yet — use live transcript as fallback
            if (liveTranscript) {
              transcript = liveTranscript;
            } else {
              setAnalysisError(err.error ?? 'Recording not ready yet. Check back in a minute.');
              setIsRetryRecording(true);
              setCallPhase('error');
              return;
            }
          } else {
            throw new Error(err.error ?? 'Failed to fetch recording');
          }
        }

        if (!transcript.trim()) {
          setCallPhase('no-transcript');
          return;
        }

        // Step 3 — analyze with Gemini
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript }),
        });

        if (!analyzeRes.ok) {
          const err = await analyzeRes.json();
          throw new Error(err.error ?? 'Analysis failed');
        }

        const result: AnalysisResult = await analyzeRes.json();
        setReportData(result);
        setCallPhase('report');

        // Build participant list from Stream call members
        try {
          const membersRes = await call?.queryMembers({});
          const emailParticipants = (membersRes?.members ?? [])
            .map((m) => ({
              name: m.user.name ?? m.user.id,
              email: (m.user.custom?.email as string) ?? '',
            }))
            .filter((p) => p.email.includes('@'));

          // Always include current Clerk user as fallback
          const currentUserEmail = user?.emailAddresses?.[0]?.emailAddress;
          if (currentUserEmail && !emailParticipants.find((p) => p.email === currentUserEmail)) {
            emailParticipants.push({
              name: user?.fullName ?? 'You',
              email: currentUserEmail,
            });
          }

          if (emailParticipants.length > 0) {
            // Fire and forget — don't block report rendering
            fetch('/api/send-meeting-report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                participants: emailParticipants,
                callId,
                analysis: result,
                questions: savedQuestionsRef.current,
                meetingDate: new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
              }),
            })
              .then((r) => r.json())
              .then((d) => console.log('[email] result:', d))
              .catch((e) => console.error('[email] failed:', e));
          }
        } catch (emailErr) {
          console.error('[email] participant lookup failed:', emailErr);
        }
      } catch (error) {
        setAnalysisError(error instanceof Error ? error.message : 'An unexpected error occurred');
        setCallPhase('error');
      }
    },
    [callId],
  );

  // Fired by InCallView when callingState leaves JOINED
  const handleCallEnd = useCallback(
    (liveTranscript: string) => {
      savedLiveTranscriptRef.current = liveTranscript;
      savedQuestionsRef.current = liveQuestionsRef.current;
      runAnalysisPipeline(liveTranscript);
    },
    [runAnalysisPipeline],
  );

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (!isLoaded || isCallLoading) return <Loader />;

  if (!call)
    return (
      <p className="text-center text-3xl font-bold text-white">Call Not Found</p>
    );

  const notAllowed =
    call.type === 'invited' &&
    (!user || !call.state.members.find((m) => m.user.id === user.id));

  if (notAllowed) return <Alert title="You are not allowed to join this meeting" />;

  // ── Post-call UI ───────────────────────────────────────────────────────────

  if (callPhase === 'analyzing') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-dark-1 text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <p className="text-lg font-medium">Analyzing your meeting...</p>
        <p className="text-sm text-gray-400">Fetching transcript and running AI analysis</p>
      </div>
    );
  }

  if (callPhase === 'no-transcript') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-dark-1 text-white">
        <p className="text-xl font-semibold">No transcript captured.</p>
        <p className="text-sm text-gray-400">
          Either the recording is not available yet or no audio was detected.
        </p>
      </div>
    );
  }

  if (callPhase === 'error') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-dark-1 text-white">
        <p className="text-xl font-semibold text-red-400">Analysis Error</p>
        <p className="max-w-md text-center text-sm text-gray-300">{analysisError}</p>
        {isRetryRecording && (
          <button
            onClick={() => {
              setIsRetryRecording(false);
              runAnalysisPipeline(savedLiveTranscriptRef.current);
            }}
            className="mt-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (callPhase === 'report' && reportData) {
    return <ReportView data={reportData} callId={callId} questions={savedQuestionsRef.current} />;
  }

  // ── Active call UI ─────────────────────────────────────────────────────────

  return (
    <main className="h-screen w-full">
      <StreamCall call={call}>
        <StreamTheme>
          {callPhase === 'setup' ? (
            <MeetingSetup setIsSetupComplete={() => setCallPhase('in-call')} />
          ) : (
            <InCallView
              onCallEnd={handleCallEnd}
              liveTranscriptRef={liveTranscriptRef}
              liveQuestionsRef={liveQuestionsRef}
            />
          )}
        </StreamTheme>
      </StreamCall>
    </main>
  );
};

export default MeetingPage;
