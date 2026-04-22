'use client';

import { Call, CallRecording } from '@stream-io/video-react-sdk';

import Loader from './Loader';
import { useGetCalls } from '@/hooks/useGetCalls';
import MeetingCard from './MeetingCard';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './ui/use-toast';

interface RecordingEntry {
  recording: CallRecording;
  callId: string;
}


const CallList = ({ type }: { type: 'ended' | 'upcoming' | 'recordings' }) => {
  const router = useRouter();
  const { toast } = useToast();
  const { endedCalls, upcomingCalls, callRecordings, isLoading } =
    useGetCalls();
  const [recordingEntries, setRecordingEntries] = useState<RecordingEntry[]>([]);
  const [deletedCallIds, setDeletedCallIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('deletedMeetings') ?? '[]');
    if (stored.length > 0) setDeletedCallIds(new Set<string>(stored));
  }, []);

  const persistDelete = (callId: string) => {
    setDeletedCallIds((prev) => {
      const next = new Set(prev).add(callId);
      localStorage.setItem('deletedMeetings', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleDeleteMeeting = async (callId: string) => {
    if (type === 'ended') {
      persistDelete(callId);
      toast({ title: 'Meeting removed' });
      return;
    }

    // type === 'upcoming'
    try {
      const res = await fetch('/api/delete-meeting', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      });

      if (res.status === 403) {
        const data = await res.json();
        toast({ title: data.error ?? "You don't have permission to delete this meeting" });
        return;
      }

      if (!res.ok && res.status !== 404) {
        const data = await res.json();
        throw new Error(data.error ?? 'Delete failed');
      }

      persistDelete(callId);
      toast({ title: 'Meeting cancelled' });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to delete meeting. Please try again.',
      });
    }
  };

  const getCalls = () => {
    switch (type) {
      case 'ended':
        return endedCalls;
      case 'recordings':
        return recordingEntries.map((e) => e.recording);
      case 'upcoming':
        return upcomingCalls;
      default:
        return [];
    }
  };

  const getNoCallsMessage = () => {
    switch (type) {
      case 'ended':
        return 'No Previous Calls';
      case 'upcoming':
        return 'No Upcoming Calls';
      case 'recordings':
        return 'No Recordings';
      default:
        return '';
    }
  };

  useEffect(() => {
    const fetchRecordings = async () => {
      const callData = await Promise.all(
        callRecordings?.map((meeting) =>
          meeting.queryRecordings().then((res) => ({
            callId: meeting.id,
            recordings: res.recordings,
          })),
        ) ?? [],
      );

      const entries: RecordingEntry[] = callData
        .filter((d) => d.recordings.length > 0)
        .flatMap((d) =>
          d.recordings.map((recording) => ({
            recording,
            callId: d.callId,
          })),
        );

      setRecordingEntries(entries);
    };

    if (type === 'recordings') {
      fetchRecordings();
    }
  }, [type, callRecordings]);

  if (isLoading) return <Loader />;

  const allCalls = getCalls() ?? [];
  const calls =
    type === 'recordings'
      ? allCalls
      : (allCalls as Call[]).filter((c) => !deletedCallIds.has(c.id));
  const noCallsMessage = getNoCallsMessage();

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {calls && calls.length > 0 ? (
        calls.map((meeting: Call | CallRecording) => {
          const entry =
            type === 'recordings'
              ? recordingEntries.find(
                  (e) => e.recording === (meeting as CallRecording),
                )
              : undefined;

          const handleDelete =
            type === 'recordings' && entry !== undefined
              ? async () => {
                  const { callId, recording } = entry;
                  const sessionId = (recording as any).session_id;

                  const res = await fetch('/api/delete-recording', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      callId,
                      sessionId,
                      filename: recording.filename,
                    }),
                  });

                  if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error ?? 'Delete failed');
                  }

                  setRecordingEntries((prev) =>
                    prev.filter((e) => e.recording !== recording),
                  );

                  toast({ title: 'Recording deleted' });
                }
              : type === 'upcoming' || type === 'ended'
                ? () => handleDeleteMeeting((meeting as Call).id)
                : undefined;

          return (
            <MeetingCard
              key={
                type === 'recordings'
                  ? (meeting as CallRecording).url
                  : (meeting as Call).id
              }
              icon={
                type === 'ended'
                  ? '/icons/previous.svg'
                  : type === 'upcoming'
                    ? '/icons/upcoming.svg'
                    : '/icons/recordings.svg'
              }
              title={
                (meeting as Call).state?.custom?.description ||
                (meeting as CallRecording).filename?.substring(0, 20) ||
                'No Description'
              }
              date={
                (meeting as Call).state?.startsAt?.toLocaleString() ||
                (meeting as CallRecording).start_time?.toLocaleString()
              }
              isPreviousMeeting={type === 'ended'}
              link={
                type === 'recordings'
                  ? (meeting as CallRecording).url
                  : `${typeof window !== 'undefined' ? window.location.origin : ''}/meeting/${(meeting as Call).id}`
              }
              buttonIcon1={
                type === 'recordings' ? '/icons/play.svg' : undefined
              }
              buttonText={type === 'recordings' ? 'Play' : 'Start'}
              handleClick={
                type === 'recordings'
                  ? () => router.push(`${(meeting as CallRecording).url}`)
                  : () => router.push(`/meeting/${(meeting as Call).id}`)
              }
              onDelete={handleDelete}
              meetingType={type}
            />
          );
        })
      ) : (
        <h1 className="text-2xl font-bold text-white">{noCallsMessage}</h1>
      )}
    </div>
  );
};

export default CallList;
