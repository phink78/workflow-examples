'use client';

import type { UIMessage, UIDataTypes, ChatStatus } from 'ai';
import { useChat } from '@ai-sdk/react';
import { WorkflowChatTransport } from '@workflow/ai';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

/**
 * Read the run ID from the URL query string.
 */
function getRunIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('run');
}

/**
 * Set or clear the run ID in the URL query string (replaceState, no navigation).
 */
function setRunIdInUrl(runId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (runId) {
    url.searchParams.set('run', runId);
  } else {
    url.searchParams.delete('run');
  }
  window.history.replaceState({}, '', url.toString());
}

/**
 * Options for the useMultiTurnChat hook
 */
export interface UseMultiTurnChatOptions<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when a chat turn finishes */
  onFinish?: (data: { messages: UIMessage<TMetadata, UIDataTypes>[] }) => void;
  endpoint: string;
  sessionIdHeader: string;
}

/**
 * Return type for the useMultiTurnChat hook
 */
export interface UseMultiTurnChatReturn<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  /** All messages in the conversation */
  messages: UIMessage<TMetadata, UIDataTypes>[];
  /** Current chat status */
  status: ChatStatus;
  /** Any error that occurred */
  error: Error | undefined;
  /** Current workflow run ID (null if no active session) */
  runId: string | null;
  /** Whether we're currently in an active session */
  isActive: boolean;
  /** Message currently being sent (shown as pending) */
  pendingMessage: string | null;
  /**
   * Send a message. If no session exists, starts a new one.
   * If a session exists, sends as a follow-up.
   */
  sendMessage: (text: string) => Promise<void>;
  /** Stop the current streaming response */
  stop: () => void;
  /** End the current session and start fresh */
  endSession: () => Promise<void>;
}

/**
 * Interface for user message data from the workflow stream
 */
interface UserMessageData {
  type: 'user-message';
  id: string;
  content: string;
  timestamp: number;
}

/**
 * Check if a message part is a user-message marker
 */
function isUserMessageMarker(
  part: unknown
): part is { type: 'data-workflow'; data: UserMessageData } {
  if (typeof part !== 'object' || part === null) return false;
  const p = part as Record<string, unknown>;
  if (p.type !== 'data-workflow' || !('data' in p)) return false;
  const data = p.data as Record<string, unknown>;
  return data?.type === 'user-message';
}

/**
 * A hook that wraps useChat to provide multi-turn chat session management.
 *
 * Session state is stored entirely in the URL query parameter `?run=<id>`.
 * Copying the URL at any point gives a resumable link.
 */
export function useMultiTurnChat<
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
>(
  options: UseMultiTurnChatOptions<TMetadata> = {
    endpoint: '/api/chat',
    sessionIdHeader: 'x-workflow-run-id',
  }
): UseMultiTurnChatReturn<TMetadata> {
  const { onError, onFinish } = options;

  // Track the current workflow run ID
  const [runId, setRunId] = useState<string | null>(null);
  // Track whether we should resume an existing session
  const [shouldResume, setShouldResume] = useState(false);
  // Track the message currently being sent (for immediate UI feedback)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  // Track sent messages to avoid duplicates
  const sentMessagesRef = useRef<Set<string>>(new Set());
  // Track which message content we've seen from stream (to clear pending)
  const seenFromStreamRef = useRef<Set<string>>(new Set());

  // Initialize from URL query param on mount
  useEffect(() => {
    const urlRunId = getRunIdFromUrl();
    if (urlRunId) {
      setRunId(urlRunId);
      setShouldResume(true);
    }
  }, []);

  // Create the transport with handlers
  const transport = useMemo(
    () =>
      new WorkflowChatTransport({
        api: options.endpoint,
        onChatSendMessage: (response) => {
          const workflowRunId = response.headers.get(options.sessionIdHeader);
          if (workflowRunId) {
            setRunId(workflowRunId);
            setRunIdInUrl(workflowRunId);
          }
        },
        onChatEnd: () => {
          setRunId(null);
          sentMessagesRef.current.clear();
          seenFromStreamRef.current.clear();
          setPendingMessage(null);
          setRunIdInUrl(null);
        },
        prepareReconnectToStreamRequest: ({ api, ...rest }) => {
          const currentRunId = getRunIdFromUrl();
          if (!currentRunId) {
            throw new Error('No active workflow run ID found in URL');
          }
          return {
            ...rest,
            api: `${options.endpoint}/${encodeURIComponent(currentRunId)}/stream`,
          };
        },
        maxConsecutiveErrors: 5,
      }),
    []
  );

  const {
    messages: rawMessages,
    sendMessage: baseSendMessage,
    status,
    error,
    stop,
    setMessages,
  } = useChat<UIMessage<TMetadata, UIDataTypes>>({
    resume: shouldResume,
    onError: (err) => {
      console.error('Chat error:', err);
      setPendingMessage(null);
      onError?.(err);
    },
    onFinish: (data) => {
      onFinish?.(data);
    },
    transport,
  });

  // Process messages from the stream.
  const messages = useMemo(() => {
    const result: UIMessage<TMetadata, UIDataTypes>[] = [];
    const seenMessageIds = new Set<string>();
    const seenObservabilityEvents = new Set<string>();

    for (const msg of rawMessages) {
      if (msg.role === 'user') {
        continue;
      }

      if (msg.role === 'assistant') {
        let currentAssistantParts: typeof msg.parts = [];
        let partIndex = 0;

        for (const part of msg.parts) {
          if (isUserMessageMarker(part)) {
            const data = part.data;

            if (seenMessageIds.has(data.id)) {
              continue;
            }
            seenMessageIds.add(data.id);

            if (currentAssistantParts.length > 0) {
              result.push({
                ...msg,
                id: `${msg.id}-part-${partIndex++}`,
                parts: currentAssistantParts,
              });
              currentAssistantParts = [];
            }

            seenFromStreamRef.current.add(data.content);

            if (pendingMessage === data.content) {
              setPendingMessage(null);
            }

            result.push({
              id: data.id,
              role: 'user',
              parts: [{ type: 'text', text: data.content }],
            } as UIMessage<TMetadata, UIDataTypes>);
            continue;
          }

          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'data-workflow' &&
            'data' in part
          ) {
            const data = part.data as Record<string, unknown>;
            const eventKey = JSON.stringify(data);
            if (seenObservabilityEvents.has(eventKey)) {
              continue;
            }
            seenObservabilityEvents.add(eventKey);
          }

          currentAssistantParts.push(part);
        }

        if (currentAssistantParts.length > 0) {
          result.push({
            ...msg,
            id: partIndex > 0 ? `${msg.id}-part-${partIndex}` : msg.id,
            parts: currentAssistantParts,
          });
        }
      }
    }

    return result;
  }, [rawMessages, pendingMessage]);

  // Send a follow-up message to the existing workflow
  const sendFollowUp = useCallback(
    async (text: string) => {
      if (!runId) {
        throw new Error('No active session to send follow-up to');
      }

      const sendKey = `${runId}-${text}-${Date.now()}`;
      if (sentMessagesRef.current.has(sendKey)) {
        return;
      }
      sentMessagesRef.current.add(sendKey);

      const response = await fetch(
        `${options.endpoint}/${encodeURIComponent(runId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        }
      );

      if (!response.ok) {
        sentMessagesRef.current.delete(sendKey);
        const errorData = await response.json();
        throw new Error(
          errorData.details || 'Failed to send follow-up message'
        );
      }
    },
    [runId, options.endpoint]
  );

  // Main send message function
  const sendMessage = useCallback(
    async (text: string) => {
      setPendingMessage(text);

      try {
        if (runId) {
          await sendFollowUp(text);
        } else {
          await baseSendMessage({
            text,
            metadata: { createdAt: Date.now() } as unknown as TMetadata,
          });
        }
      } catch (err) {
        setPendingMessage(null);
        throw err;
      }
    },
    [runId, baseSendMessage, sendFollowUp]
  );

  // End the current session
  const endSession = useCallback(async () => {
    if (runId) {
      try {
        await fetch(`${options.endpoint}/${encodeURIComponent(runId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '/done' }),
        });
      } catch (err) {
        console.error('Error ending session:', err);
      }
    }
    setRunId(null);
    setShouldResume(false);
    sentMessagesRef.current.clear();
    seenFromStreamRef.current.clear();
    setPendingMessage(null);
    setMessages([]);
    stop();
    setRunIdInUrl(null);
  }, [runId, setMessages, stop]);

  return {
    messages,
    status,
    error,
    runId,
    isActive: !!runId,
    pendingMessage,
    sendMessage,
    stop,
    endSession,
  };
}
