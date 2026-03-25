"use client";

import Image from "next/image";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { AlertDialog } from "./ui/alert-dialog";
import { avatarImages } from "@/constants";
import { useToast } from "./ui/use-toast";

interface MeetingCardProps {
  title: string;
  date: string;
  icon: string;
  isPreviousMeeting?: boolean;
  buttonIcon1?: string;
  buttonText?: string;
  handleClick: () => void;
  link: string;
  onDelete?: () => Promise<void>;
  meetingType?: 'upcoming' | 'ended' | 'recordings';
}

const MeetingCard = ({
  icon,
  title,
  date,
  isPreviousMeeting,
  buttonIcon1,
  handleClick,
  link,
  buttonText,
  onDelete,
  meetingType,
}: MeetingCardProps) => {
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDescription =
    meetingType === 'upcoming'
      ? 'Are you sure you want to cancel this meeting? This cannot be undone.'
      : meetingType === 'ended'
        ? 'Are you sure you want to delete this meeting record? This cannot be undone.'
        : 'Are you sure you want to delete this recording? This cannot be undone.';

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
      setShowConfirm(false);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to delete. Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="group relative flex min-h-[258px] w-full flex-col justify-between rounded-[14px] bg-dark-1 px-5 py-8 xl:max-w-[568px]">
      {onDelete && (
        <button
          onClick={() => setShowConfirm(true)}
          aria-label="Delete recording"
          className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-dark-3 hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 className="size-4" />
        </button>
      )}
      <AlertDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={meetingType === 'upcoming' ? 'Cancel Meeting' : 'Delete Meeting'}
        description={confirmDescription}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
      <article className="flex flex-col gap-5">
        <Image src={icon} alt="upcoming" width={28} height={28} />
        <div className="flex justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-base font-normal">{date}</p>
          </div>
        </div>
      </article>
      <article className={cn("flex justify-center relative", {})}>
        <div className="relative flex w-full max-sm:hidden">
          {avatarImages.map((img, index) => (
            <Image
              key={index}
              src={img}
              alt="attendees"
              width={40}
              height={40}
              className={cn("rounded-full", { absolute: index > 0 })}
              style={{ top: 0, left: index * 28 }}
            />
          ))}
          <div className="flex-center absolute left-[136px] size-10 rounded-full border-[5px] border-dark-3 bg-dark-4">
            +5
          </div>
        </div>
        {!isPreviousMeeting && (
          <div className="flex gap-2">
            <Button onClick={handleClick} className="rounded bg-blue-1 px-6">
              {buttonIcon1 && (
                <Image src={buttonIcon1} alt="feature" width={20} height={20} />
              )}
              &nbsp; {buttonText}
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast({
                  title: "Link Copied",
                });
              }}
              className="bg-dark-4 px-6"
            >
              <Image
                src="/icons/copy.svg"
                alt="feature"
                width={20}
                height={20}
              />
              &nbsp; Copy Link
            </Button>
          </div>
        )}
      </article>
    </section>
  );
};

export default MeetingCard;
