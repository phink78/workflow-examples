"use client";

import { useMemo, useState } from "react";
import type { UIMessage } from "ai";
import {
  TerminalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  LoaderIcon,
} from "lucide-react";

interface SandboxEvent {
  event: string;
  timestamp: number;
  sandboxId?: string;
  command?: string;
  exitCode?: number;
  fileCount?: number;
  filePaths?: string[];
  phase?: string;
  message?: string;
  status?: string;
}

function extractSandboxEvents(messages: UIMessage[]): SandboxEvent[] {
  const events: SandboxEvent[] = [];
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (
        part.type === "data-workflow" &&
        "data" in part &&
        (part.data as any)?.type === "sandbox-event"
      ) {
        const { type: _, ...rest } = part.data as any;
        events.push(rest as SandboxEvent);
      }
    }
  }
  return events;
}

function getStatusFromEvents(events: SandboxEvent[]): {
  status: string;
  sandboxId: string | null;
  lastCommand: string | null;
  lastExitCode: number | null;
  hasError: boolean;
  lastError: string | null;
} {
  let status = "idle";
  let sandboxId: string | null = null;
  let lastCommand: string | null = null;
  let lastExitCode: number | null = null;
  let hasError = false;
  let lastError: string | null = null;

  for (const ev of events) {
    if (ev.sandboxId) sandboxId = ev.sandboxId;

    switch (ev.event) {
      case "creating":
        status = "creating";
        break;
      case "connecting":
        status = "connecting";
        break;
      case "ready":
        status = "ready";
        break;
      case "writing-files":
        status = "writing files";
        break;
      case "files-written":
        status = "ready";
        break;
      case "running-command":
        status = "running";
        lastCommand = ev.command || null;
        lastExitCode = null;
        break;
      case "command-complete":
        status = "ready";
        lastExitCode = ev.exitCode ?? null;
        break;
      case "error":
        hasError = true;
        lastError = ev.message || ev.phase || "unknown error";
        status = "error";
        break;
    }
  }

  return { status, sandboxId, lastCommand, lastExitCode, hasError, lastError };
}

const statusConfig: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  idle: {
    icon: <CircleIcon className="size-3" />,
    color: "text-muted-foreground",
    label: "Idle",
  },
  creating: {
    icon: <LoaderIcon className="size-3 animate-spin" />,
    color: "text-yellow-500",
    label: "Creating...",
  },
  connecting: {
    icon: <LoaderIcon className="size-3 animate-spin" />,
    color: "text-yellow-500",
    label: "Connecting...",
  },
  ready: {
    icon: <CheckCircleIcon className="size-3" />,
    color: "text-green-500",
    label: "Ready",
  },
  "writing files": {
    icon: <LoaderIcon className="size-3 animate-spin" />,
    color: "text-blue-400",
    label: "Writing files...",
  },
  running: {
    icon: <LoaderIcon className="size-3 animate-spin" />,
    color: "text-blue-400",
    label: "Running...",
  },
  error: {
    icon: <XCircleIcon className="size-3" />,
    color: "text-red-400",
    label: "Error",
  },
};

export function SandboxWidget({ messages }: { messages: UIMessage[] }) {
  const [expanded, setExpanded] = useState(false);

  const events = useMemo(() => extractSandboxEvents(messages), [messages]);
  const { status, sandboxId, lastCommand, lastExitCode, hasError, lastError } =
    useMemo(() => getStatusFromEvents(events), [events]);

  // Don't render if no sandbox events yet
  if (events.length === 0) return null;

  const cfg = statusConfig[status] || statusConfig.idle;

  return (
    <div className="fixed bottom-20 right-4 z-50 w-80">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
        {/* Header — always visible */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <TerminalIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Sandbox</span>
            <span className={`flex items-center gap-1 text-xs ${cfg.color}`}>
              {cfg.icon}
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {sandboxId && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {sandboxId.slice(0, 8)}
              </span>
            )}
            {expanded ? (
              <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronUpIcon className="size-3.5 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
            {/* Last command */}
            {lastCommand && (
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Last command
                </div>
                <code className="text-xs font-mono block truncate">
                  {lastCommand}
                </code>
                {lastExitCode !== null && (
                  <span
                    className={`text-[10px] font-mono ${
                      lastExitCode === 0 ? "text-green-500" : "text-red-400"
                    }`}
                  >
                    exit={lastExitCode}
                  </span>
                )}
              </div>
            )}

            {/* Error display */}
            {hasError && lastError && (
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-red-400">
                  Last error
                </div>
                <pre className="text-[10px] font-mono text-red-400 whitespace-pre-wrap break-all max-h-20 overflow-auto">
                  {lastError}
                </pre>
              </div>
            )}

            {/* Event log */}
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Events ({events.length})
              </div>
              <div className="space-y-px">
                {events
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((ev, i) => {
                    const isError = ev.event === "error";
                    return (
                      <div
                        key={`${ev.timestamp}-${i}`}
                        className={`flex items-center justify-between text-[10px] font-mono py-0.5 ${
                          isError ? "text-red-400" : "text-muted-foreground"
                        }`}
                      >
                        <span className="truncate flex-1">
                          {ev.event}
                          {ev.command && (
                            <span className="opacity-60 ml-1">
                              {ev.command.slice(0, 30)}
                            </span>
                          )}
                          {ev.filePaths && (
                            <span className="opacity-60 ml-1">
                              {ev.filePaths.join(", ")}
                            </span>
                          )}
                          {ev.exitCode !== undefined && (
                            <span
                              className={`ml-1 ${
                                ev.exitCode === 0
                                  ? "text-green-500"
                                  : "text-red-400"
                              }`}
                            >
                              exit={ev.exitCode}
                            </span>
                          )}
                          {isError && ev.message && (
                            <span className="ml-1 opacity-80">
                              {ev.message.split("\n")[0].slice(0, 50)}
                            </span>
                          )}
                        </span>
                        <span className="ml-2 opacity-50 shrink-0">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
