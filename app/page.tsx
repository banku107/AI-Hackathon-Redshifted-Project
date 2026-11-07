"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  CaretRight,
  DeviceMobile,
  ImageSquare,
  PaperPlaneTilt,
  SealCheck,
  SpeakerHigh,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { AppBar } from "@/components/app-bar";
import { CheckSkeleton } from "@/components/check-skeleton";
import { SettingsMenu } from "@/components/settings-menu";
import { Timeline } from "@/components/timeline";
import { VerdictCard } from "@/components/verdict-card";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useAppState } from "@/lib/app-state";
import type { AgentRequest, InputImage, Language } from "@/lib/contract";
import { broadcastFamilyAlert } from "@/lib/family-sync";
import { readFamilyContact } from "@/lib/family-contact";
import { fileToInputImage } from "@/lib/image";
import { localeFor } from "@/lib/i18n";
import { DEMO_BUTTONS, MOCK_STREAMS, type MockScenario } from "@/lib/mock-events";
import { playMock, runAgent } from "@/lib/run-stream";
import {
  extractFrames,
  type FrameExtraction,
} from "@/lib/video-frames";
import { uploadVideo } from "@/lib/video-upload";
import { cn } from "@/lib/utils";

type Mode = "message" | "picture" | "video";
type Step = "input" | "reading" | "result";

const MODES: { value: Mode; label: string; icon: typeof PaperPlaneTilt }[] = [
  { value: "message", label: "A message", icon: PaperPlaneTilt },
  { value: "picture", label: "A picture", icon: ImageSquare },
  { value: "video", label: "A video", icon: VideoCamera },
];

const PROMISES = [
  { icon: DeviceMobile, text: "Works on any phone" },
  { icon: SealCheck, text: "Free, no account" },
  { icon: SpeakerHigh, text: "Can be read out loud" },
];

export default function HomePage() {
  const { run, beginRun, resetRun, applyEvent, language } = useAppState();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("message");
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ name: string; preview: string; data: InputImage } | null>(null);
  const [video, setVideo] = useState<{
    name: string;
    result: FrameExtraction;
    file: File;
    videoId: string | null;
  } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [alreadyActed, setAlreadyActed] = useState(false);
  const [actionDetails, setActionDetails] = useState("");

  const [step, setStep] = useState<Step>("input");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const [lastRequest, setLastRequest] = useState<AgentRequest | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Push the verdict to the family screen. The alert arrives after the verdict
  // in the stream, so both have to be present before we can send it.
  const { familyAlert, verdict, alertResult } = run;
  useEffect(() => {
    if (!familyAlert || !verdict) return;
    broadcastFamilyAlert({
      alert: familyAlert,
      sentAt: Date.now(),
      reasons: verdict.reasons,
      nextSteps: verdict.nextSteps,
      sourceText: run.sourceText,
    });
  }, [familyAlert, verdict, run.sourceText]);

  useEffect(() => {
    if (step !== "result" || !resultRef.current) return;
    // Smooth scrolling is motion, so honour the reader's reduced-motion choice.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultRef.current.scrollIntoView({
      block: "start",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [step]);

  const hasContent =
    (mode === "message" && text.trim().length > 4) ||
    (mode === "picture" && Boolean(image)) ||
    (mode === "video" && Boolean(video));

  const runInvestigation = useCallback(
    async (request: AgentRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLastRequest(request);

      setNotice(
        request.demo ? "Demo mode: this replays a recorded check, not a live one." : null,
      );
      setBusy(true);
      setStep("reading");
      beginRun(request.text ?? "");

      // The stream always ends with a "done" event. If it stops before that,
      // the connection dropped and whatever arrived is not a finished answer.
      let finished = false;
      try {
        await runAgent(request, {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "done") finished = true;
            applyEvent(event);
          },
        });
        if (!finished && !controller.signal.aborted) {
          setNotice("Connection lost. Please don't act on the message yet.");
        }
      } catch {
        if (controller.signal.aborted) return;
        // Never show a recorded verdict for the reader's own message: it would
        // be an answer about something else. Say so and offer a retry.
        setNotice(
          finished
            ? null
            : "We could not reach the checker. Please don't act on the message yet.",
        );
      }

      if (!controller.signal.aborted) {
        setBusy(false);
        setStep("result");
      }
    },
    [applyEvent, beginRun],
  );

  const handleCheck = () => {
    if (!hasContent) return;

    const familyContact = readFamilyContact();
    const request: AgentRequest = {
      language: language as Language,
      ...(text.trim() ? { text: text.trim() } : {}),
      ...(mode === "picture" && image ? { images: [image.data] } : {}),
      ...(mode === "video" && video
        ? video.videoId
          ? {
              video: {
                videoId: video.videoId,
                frames: video.result.frames,
                frameTimes: video.result.frameTimes,
                durationSec: video.result.durationSec,
                fileName: video.name,
              },
            }
          : {
              // The upload did not go through, so there is no video file for
              // the server to inspect. The frames are the pictures the agent
              // reads anyway, so send them as screenshots and say so.
              text: `${text.trim() ? `${text.trim()}\n\n` : ""}(These are ${video.result.frames.length} pictures taken from a video the person uploaded. The video file itself was not uploaded, so only the pictures can be checked.)`,
              images: video.result.frames.slice(0, 4),
            }
        : {}),
      ...(alreadyActed ? { alreadyActed: true } : {}),
      ...(alreadyActed && actionDetails.trim()
        ? { actionDetails: actionDetails.trim() }
        : {}),
      ...(familyContact ? { familyContact } : {}),
      // ?demo=1 asks the agent route to replay its recording (no internet).
      ...(new URLSearchParams(window.location.search).get("demo") === "1"
        ? { demo: true }
        : {}),
    };

    void runInvestigation(request);
  };

  const handleDemo = (scenario: MockScenario) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setNotice("This is a recorded example, not a live check.");
    setBusy(true);
    setStep("reading");
    beginRun("");
    void playMock(MOCK_STREAMS[scenario], applyEvent, {
      signal: controller.signal,
    }).then(() => {
      if (!controller.signal.aborted) {
        setBusy(false);
        setStep("result");
      }
    });
  };

  const handleRestart = () => {
    abortRef.current?.abort();
    setBusy(false);
    setNotice(null);
    resetRun();
    setStep("input");
    setText("");
    setImage(null);
    setVideo(null);
    setAlreadyActed(false);
    setActionDetails("");
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await fileToInputImage(file);
      // Display the exact bytes the agent will see, so the reader can tell us
      // if something got cropped.
      setImage({
        name: file.name,
        preview: `data:${data.mediaType};base64,${data.base64}`,
        data,
      });
      setMode("picture");
      setNotice(null);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "We could not read that picture.",
      );
    }
  };

  const onPickVideo = async (file: File | undefined) => {
    if (!file) return;
    setExtracting(true);
    setExtractProgress(0);
    setUploadProgress(null);
    setNotice("Pulling the pictures out of your video. That happens on this device.");
    try {
      const result = await extractFrames(file, setExtractProgress);

      // The file checks the agent runs need the clip on this computer. Save it
      // through /api/upload; if that fails, keep going on the frames.
      let videoId: string | null = null;
      setUploadProgress(0);
      const uploaded = await uploadVideo(file, {
        onProgress: setUploadProgress,
      });
      videoId = uploaded?.videoId ?? null;

      setVideo({ name: file.name, result, file, videoId });
      setNotice(
        videoId
          ? null
          : "The pictures are ready. The video file itself could not be saved, so only the pictures will be checked.",
      );
    } catch (error) {
      setVideo(null);
      setNotice(
        error instanceof Error ? error.message : "We could not read that video.",
      );
    } finally {
      setExtracting(false);
      setUploadProgress(null);
    }
  };

  const canCheck = hasContent && !busy && !extracting;

  return (
    <>
      <AppBar />

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-7 sm:px-6 sm:pt-12">
        {step === "input" && (
          /*
           * Two columns above `lg`: the promise stays put on the left while the
           * form sits on the right. Same reading order on a phone, where it
           * simply stacks. The headline is deliberately not centred — a
           * centred hero over a form is the shape every generated page takes.
           */
          <div className="lg:grid lg:grid-cols-[minmax(0,32rem)_minmax(0,24rem)] lg:items-start lg:justify-between lg:gap-12">
            <div className="lg:sticky lg:top-24">
              <h1 className="max-w-[16ch] text-[2.1rem] font-bold leading-[1.08] tracking-tight text-balance sm:text-[2.75rem]">
                Not sure about a message?
              </h1>
              <p className="mt-4 max-w-[38ch] text-lg leading-relaxed text-ink-soft">
                Paste it, or add a picture of it. We read it and tell you, in
                plain words, whether it is a scam.
              </p>

              <ul className="mt-6 space-y-3">
                {PROMISES.map(({ icon: Icon, text: promise }) => (
                  <li
                    key={promise}
                    className="flex items-center gap-3 text-lg font-semibold text-ink-soft"
                  >
                    <Icon size={20} weight="bold" className="shrink-0 text-accent" aria-hidden />
                    {promise}
                  </li>
                ))}
              </ul>

              <div className="mt-8 hidden border-t border-line pt-8 lg:block">
                <DemoList onPick={handleDemo} disabled={busy} />
              </div>
            </div>

            {/* The composer. One border wraps the choice, the input and the
                action, so the screen has one object instead of a stack of
                equally-important cards. */}
            <div className="mt-8 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[0_1px_2px_rgba(9,40,33,0.05)] lg:mt-0">
              <div
                role="tablist"
                aria-label="What are you checking?"
                className="grid grid-cols-3 gap-1 border-b border-line bg-surface-sunk p-1.5"
              >
                {MODES.map(({ value, label, icon: Icon }) => {
                  const selected = mode === value;
                  return (
                    <button
                      key={value}
                      role="tab"
                      type="button"
                      aria-selected={selected}
                      onClick={() => setMode(value)}
                      className={cn(
                        "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[10px] px-1 text-base font-bold transition-colors",
                        selected
                          ? "bg-surface text-ink shadow-[0_1px_2px_rgba(9,40,33,0.12)]"
                          : "text-ink-soft hover:text-ink",
                      )}
                    >
                      <Icon size={20} weight={selected ? "fill" : "regular"} aria-hidden />
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3.5 p-4 sm:p-5">
                {mode === "message" && (
                  <div>
                    <label
                      htmlFor="message-text"
                      className="mb-2 block text-lg font-bold"
                    >
                      Paste the whole message
                    </label>
                    <textarea
                      id="message-text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={6}
                      placeholder="Include the odd parts too. The link, the phone number, the words that worried you."
                      className="w-full resize-y rounded-[var(--radius-control)] border-2 border-line-strong bg-surface px-4 py-3.5 text-lg leading-relaxed text-ink placeholder:text-ink-faint"
                    />
                  </div>
                )}

                {mode === "picture" && (
                  <div className="space-y-3">
                    <label
                      className={cn(
                        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--radius-control)] border-2 border-dashed px-5 py-9 text-center transition-colors",
                        image
                          ? "border-accent bg-accent-soft"
                          : "border-line-strong bg-surface hover:border-ink-faint hover:bg-surface-sunk/60",
                      )}
                    >
                      <ImageSquare size={32} weight="duotone" className="text-accent" aria-hidden />
                      <span className="text-lg font-bold">
                        {image ? "Choose a different picture" : "Add a screenshot"}
                      </span>
                      <span className="max-w-[32ch] text-lg leading-snug text-ink-soft">
                        A screenshot of the text, the email, or the page. We
                        shrink it before it is sent.
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => void onPickImage(e.target.files?.[0])}
                      />
                    </label>

                    {image && (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the exact bytes we send */}
                        <img
                          src={image.preview}
                          alt={`The picture you added: ${image.name}`}
                          className="max-h-64 w-auto max-w-full rounded-[var(--radius-control)] border border-line object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setImage(null)}
                          aria-label="Remove picture"
                          className="absolute right-2 top-2 flex size-12 items-center justify-center rounded-full border border-line bg-surface/95 text-ink shadow-md"
                        >
                          <X size={22} weight="bold" aria-hidden />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {mode === "video" && (
                  <div className="space-y-3">
                    <label
                      className={cn(
                        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--radius-control)] border-2 border-dashed px-5 py-9 text-center transition-colors",
                        video
                          ? "border-accent bg-accent-soft"
                          : "border-line-strong bg-surface hover:border-ink-faint hover:bg-surface-sunk/60",
                      )}
                    >
                      <VideoCamera size={32} weight="duotone" className="text-accent" aria-hidden />
                      <span className="text-lg font-bold">
                        {video ? video.name : "Choose a video"}
                      </span>
                      <span className="max-w-[32ch] text-lg leading-snug text-ink-soft">
                        Up to 60 seconds and 50 MB. The pictures are taken on your
                        own device.
                      </span>
                      <input
                        type="file"
                        accept="video/*"
                        className="sr-only"
                        onChange={(e) => void onPickVideo(e.target.files?.[0])}
                      />
                    </label>

                    {extracting && (
                      <div>
                        <p role="status" className="text-base font-bold text-ink-soft">
                          {uploadProgress === null
                            ? `Taking pictures… ${Math.round(extractProgress * 100)}%`
                            : `Sending the video… ${Math.round(uploadProgress)}%`}
                        </p>
                        <div
                          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunk"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(
                            (uploadProgress ?? extractProgress * 100),
                          )}
                        >
                          <div
                            className="h-full rounded-full bg-accent transition-[width]"
                            style={{
                              width: `${Math.round(uploadProgress ?? extractProgress * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {video && video.result.previews.length > 0 && (
                      <div>
                        <p className="mb-2 text-base font-semibold text-ink-soft">
                          {video.result.previews.length} pictures ready, from a{" "}
                          {Math.round(video.result.durationSec)} second video
                        </p>
                        <ul className="flex gap-2 overflow-x-auto pb-1">
                          {video.result.previews.map((src, index) => (
                            <li key={index} className="shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element -- frame just drawn on this device */}
                              <img
                                src={src}
                                alt={`Picture ${index + 1} from your video`}
                                className="size-20 rounded-lg border border-line object-cover"
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {mode !== "picture" && (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border-2 border-line-strong px-3.5 font-semibold text-ink hover:border-ink-faint">
                      <ImageSquare size={20} weight="bold" aria-hidden />
                      Add a screenshot
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => void onPickImage(e.target.files?.[0])}
                      />
                    </label>
                    {image && (
                      <span className="inline-flex min-h-12 max-w-full items-center gap-1 rounded-full bg-accent-soft py-1 pl-4 pr-1 text-base font-semibold text-accent">
                        <span className="min-w-0 truncate">{image.name}</span>
                        <button
                          type="button"
                          onClick={() => setImage(null)}
                          aria-label="Remove screenshot"
                          className="flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-accent/10"
                        >
                          <X size={20} weight="bold" aria-hidden />
                        </button>
                      </span>
                    )}
                  </div>
                )}

                <div className="border-t border-line pt-4">
                  <label className="flex min-h-14 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={alreadyActed}
                      onChange={(e) => setAlreadyActed(e.target.checked)}
                      className="size-7 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span className="text-lg font-semibold leading-snug">
                      I already replied, paid, or shared information
                    </span>
                  </label>
                  {alreadyActed && (
                    <div className="mt-3">
                      <label htmlFor="action-details" className="sr-only">
                        What did you do?
                      </label>
                      <textarea
                        id="action-details"
                        value={actionDetails}
                        onChange={(e) => setActionDetails(e.target.value)}
                        rows={2}
                        placeholder="For example: I sent one $500 gift card."
                        className="w-full resize-y rounded-[10px] border-2 border-line-strong bg-surface px-3 py-2.5 text-lg text-ink placeholder:text-ink-faint"
                      />
                    </div>
                  )}
                </div>

                {notice && (
                  <p
                    role="status"
                    className="rounded-[10px] border border-warn/40 bg-warn-soft px-4 py-3 text-base font-semibold leading-snug text-warn"
                  >
                    {notice}
                  </p>
                )}
              </div>

              <div className="border-t border-line bg-surface-sunk/50 p-4 sm:p-5">
                <Button size="lg" onClick={handleCheck} disabled={!canCheck} className="w-full">
                  <SealCheck size={24} weight="bold" aria-hidden />
                  {busy ? "Working on it…" : "Check this for me"}
                </Button>
                <p className="mt-3 text-center text-base leading-snug text-ink-soft">
                  Only the words and pictures you add are sent.
                </p>
              </div>
            </div>

            <div className="mt-8 border-t border-line pt-7 lg:hidden">
              <DemoList onPick={handleDemo} disabled={busy} />
            </div>
          </div>
        )}

        {step === "reading" && (
          <div className="mx-auto max-w-2xl space-y-6">
            {notice && (
              <p
                role="status"
                className="rounded-[var(--radius-control)] border border-warn/40 bg-warn-soft px-4 py-3 text-base font-semibold text-warn"
              >
                {notice}
              </p>
            )}

            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6">
              <Timeline
                steps={run.steps}
                heading={run.plan.length > 0 ? "Working through your check" : "Starting the check"}
              />

              {/* Before the first step lands there is nothing to number, so show
                  the rows the answer is about to fill rather than a lone spinner. */}
              {run.steps.length === 0 && <CheckSkeleton />}

              {run.plan.length > 0 && run.steps.length === 0 && (
                <section className="mt-6 border-t border-line pt-5">
                  <h3 className="text-lg font-bold">What we will check</h3>
                  <ol className="mt-3 space-y-2">
                    {run.plan.map((line, index) => (
                      <li key={index} className="text-lg leading-relaxed text-ink-soft">
                        {line}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>

            <Button variant="quiet" onClick={handleRestart}>
              <ArrowCounterClockwise size={20} weight="bold" aria-hidden />
              Stop and start over
            </Button>
          </div>
        )}

        {step === "result" && (
          <div ref={resultRef} className="mx-auto max-w-2xl space-y-6 scroll-mt-24">
            {run.errorMessage && (
              <p
                role="alert"
                className="rounded-[var(--radius-control)] border border-warn/40 bg-warn-soft px-4 py-3 text-base font-semibold text-warn"
              >
                {run.errorMessage}
              </p>
            )}

            {notice && !run.errorMessage && (
              <p
                role="status"
                className="rounded-[var(--radius-control)] border border-line bg-surface-sunk px-4 py-3 text-base font-semibold text-ink-soft"
              >
                {notice}
              </p>
            )}

            {run.verdict ? (
              <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
                <VerdictCard
                  verdict={run.verdict}
                  locale={localeFor(language)}
                  frameUrls={video?.result.previews}
                  onDamageControl={() => router.push("/damage-control")}
                />
              </div>
            ) : (
              <Panel tone="sunk">
                <h2 className="text-xl font-bold">We could not finish the check</h2>
                <p className="mt-2 text-lg leading-relaxed text-ink-soft">
                  Nothing is wrong with what you sent. Try again, and if it keeps
                  happening, call someone you trust before you act on the message.
                </p>
                {lastRequest && (
                  <Button
                    className="mt-4"
                    onClick={() => void runInvestigation(lastRequest)}
                  >
                    <ArrowCounterClockwise size={22} weight="bold" aria-hidden />
                    Try again
                  </Button>
                )}
              </Panel>
            )}

            {alertResult && (
              <section className="rounded-[var(--radius-card)] border border-accent/25 bg-accent-soft p-5">
                <h2 className="flex items-center gap-2 text-lg font-bold text-accent">
                  <SealCheck size={22} weight="bold" aria-hidden />
                  A heads-up was sent
                </h2>
                <p className="mt-2 text-lg leading-relaxed">
                  {run.familyAlert
                    ? `We told ${run.familyAlert.contactName} what you checked.`
                    : "We told your family contact what you checked."}{" "}
                  {alertResult.delivered
                    ? "Open the Family screen on their phone to see it."
                    : "It could not be delivered, so please call them yourself."}
                </p>
              </section>
            )}

            {run.steps.length > 0 && (
              <details className="group rounded-[var(--radius-card)] border border-line bg-surface px-5 py-2">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-lg font-bold marker:content-none">
                  See every step we took
                  <CaretRight
                    size={20}
                    weight="bold"
                    className="shrink-0 text-ink-faint transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    aria-hidden
                  />
                </summary>
                <div className="pb-3 pt-1">
                  <Timeline steps={run.steps} />
                </div>
              </details>
            )}

            <Button variant="secondary" onClick={handleRestart} className="w-full">
              <ArrowCounterClockwise size={20} weight="bold" aria-hidden />
              Check something else
            </Button>
          </div>
        )}
      </main>

      <div className="fixed bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <SettingsMenu />
      </div>
    </>
  );
}

/**
 * Saved examples as a plain list. Three bordered cards of equal size is the
 * default shape for a "try it" strip; a list keeps them secondary to the real
 * input above.
 */
function DemoList({
  onPick,
  disabled,
}: {
  onPick: (scenario: MockScenario) => void;
  disabled: boolean;
}) {
  return (
    <section aria-labelledby="demo-heading">
      <h2 id="demo-heading" className="text-lg font-bold">
        Or try a saved example
      </h2>
      <p className="mt-1.5 text-base leading-snug text-ink-soft">
        No typing needed. These are recordings, not live checks.
      </p>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface">
        {DEMO_BUTTONS.map(({ scenario, label, note }) => (
          <li key={scenario}>
            <button
              type="button"
              onClick={() => onPick(scenario)}
              disabled={disabled}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-sunk disabled:opacity-45"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold leading-snug">{label}</span>
                <span className="mt-0.5 block text-base leading-snug text-ink-soft">
                  {note}
                </span>
              </span>
              <CaretRight
                size={20}
                weight="bold"
                className="shrink-0 text-ink-faint"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
