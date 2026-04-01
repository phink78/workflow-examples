"use client";

import { useState } from "react";
import { CheckCircleIcon, CopyIcon, WebhookIcon } from "lucide-react";

interface WebhookWaitingProps {
  toolCallId: string;
  input?: {
    description: string;
  };
  output?: string;
}

export function WebhookWaiting({
  toolCallId,
  input,
  output,
}: WebhookWaitingProps) {
  const [copied, setCopied] = useState(false);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/hooks/webhook/${encodeURIComponent(toolCallId)}`
      : `/api/hooks/webhook/${encodeURIComponent(toolCallId)}`;

  const curlExample = `curl -X POST ${webhookUrl} -H "Content-Type: application/json" -d '{"status": "done"}'`;

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Webhook has been called — show the received payload
  if (output) {
    let parsed: any;
    try {
      parsed = typeof output === "string" ? JSON.parse(output) : output;
    } catch {
      parsed = output;
    }

    return (
      <div className="border rounded-lg p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-green-600">
          <CheckCircleIcon className="size-4" />
          Webhook received
        </div>
        {input?.description && (
          <p className="text-sm text-muted-foreground">{input.description}</p>
        )}
        {parsed?.body && (
          <pre className="text-xs bg-muted/50 rounded-md p-2 overflow-auto max-h-40">
            {typeof parsed.body === "string"
              ? parsed.body
              : JSON.stringify(parsed.body, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  // Waiting for webhook call
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <WebhookIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Waiting for webhook</span>
      </div>

      {input?.description && (
        <p className="text-sm text-muted-foreground">{input.description}</p>
      )}

      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          Webhook URL
        </div>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-muted/50 rounded-md px-2 py-1.5 flex-1 break-all select-all">
            {webhookUrl}
          </code>
          <button
            type="button"
            onClick={() => handleCopy(webhookUrl)}
            className="shrink-0 p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            title="Copy URL"
          >
            {copied ? (
              <CheckCircleIcon className="size-3.5 text-green-500" />
            ) : (
              <CopyIcon className="size-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          Example
        </div>
        <pre
          className="text-[10px] bg-muted/50 rounded-md p-2 overflow-x-auto cursor-pointer hover:bg-muted/75 transition-colors"
          onClick={() => handleCopy(curlExample)}
          title="Click to copy"
        >
          {curlExample}
        </pre>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
        <span className="size-1.5 rounded-full bg-yellow-500" />
        Waiting for external call...
      </div>
    </div>
  );
}
