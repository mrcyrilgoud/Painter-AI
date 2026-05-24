import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AIGenerateRequest, AIVariation } from "../ai/types";
import { uid } from "../utils/canvas";

const MAX_PERSISTED = 200;

export type ChatMessage =
  | { id: string; role: "user"; text: string; timestamp: number }
  | { id: string; role: "assistant"; kind: "text"; text: string; timestamp: number; streaming?: boolean }
  | {
      id: string;
      role: "assistant";
      kind: "op-proposal";
      request: AIGenerateRequest;
      confidence: number;
      timestamp: number;
      via?: "chat" | "cmdk";
      status: "pending" | "generating" | "ready" | "committed" | "dismissed";
      progress?: number;
      variations?: AIVariation[];
      committedVariationIndex?: number;
    }
  | { id: string; role: "system"; kind: "action-log"; text: string; timestamp: number };

type OpProposalMsg = Extract<ChatMessage, { kind: "op-proposal" }>;
type AssistantTextMsg = Extract<ChatMessage, { role: "assistant"; kind: "text" }>;

type PersistedOpProposal = Omit<OpProposalMsg, "request" | "variations"> & {
  request: Omit<AIGenerateRequest, "source" | "mask">;
};

type PersistedChatMessage =
  | Extract<ChatMessage, { role: "user" }>
  | Extract<ChatMessage, { role: "assistant"; kind: "text" }>
  | PersistedOpProposal
  | Extract<ChatMessage, { role: "system" }>;

interface ChatState {
  messages: ChatMessage[];
  appendUser: (text: string) => string;
  appendAssistantText: (chunk: string, streaming?: boolean) => string;
  upsertAssistantTextChunk: (id: string, chunk: string, streaming?: boolean) => void;
  appendOpProposal: (msg: Omit<OpProposalMsg, "id" | "timestamp">) => string;
  updateOpProposal: (id: string, patch: Partial<OpProposalMsg>) => void;
  appendActionLog: (text: string) => string;
  clear: () => void;
}

function partializeMessages(messages: ChatMessage[]): PersistedChatMessage[] {
  return messages.slice(-MAX_PERSISTED).map((m) => {
    if (m.role !== "assistant" || m.kind !== "op-proposal") return m;
    const { variations: _v, request, ...rest } = m;
    const status =
      m.status === "pending" || m.status === "generating" ? "dismissed" : m.status;
    const { source: _s, mask: _mask, ...reqRest } = request;
    return {
      ...rest,
      status,
      request: reqRest,
    };
  });
}

function rehydrateMessages(stored: PersistedChatMessage[]): ChatMessage[] {
  return stored.map((m) => {
    if (m.role !== "assistant" || m.kind !== "op-proposal") return m as ChatMessage;
    return m as unknown as ChatMessage;
  });
}

const createChat = () =>
  create<ChatState>()(
    persist(
      (set) => ({
        messages: [],
        appendUser: (text: string) => {
          const id = uid();
          set((s) => ({
            messages: [...s.messages, { id, role: "user", text, timestamp: Date.now() }],
          }));
          return id;
        },
        appendAssistantText: (chunk: string, streaming = false) => {
          const id = uid();
          set((s) => ({
            messages: [
              ...s.messages,
              { id, role: "assistant", kind: "text", text: chunk, timestamp: Date.now(), streaming },
            ],
          }));
          return id;
        },
        upsertAssistantTextChunk: (id: string, chunk: string, streaming = false) => {
          set((s) => {
            const idx = s.messages.findIndex(
              (m) => m.id === id && m.role === "assistant" && m.kind === "text",
            );
            if (idx < 0) return s;
            const target = s.messages[idx] as AssistantTextMsg;
            if (chunk === "" && target.streaming === streaming) return s;
            const next = s.messages.slice();
            next[idx] = { ...target, text: target.text + chunk, streaming };
            return { messages: next };
          });
        },
        appendOpProposal: (msg) => {
          const id = uid();
          set((s) => ({
            messages: [
              ...s.messages,
              { ...(msg as OpProposalMsg), id, timestamp: Date.now() },
            ],
          }));
          return id;
        },
        updateOpProposal: (id: string, patch: Partial<OpProposalMsg>) => {
          set((s) => {
            const idx = s.messages.findIndex(
              (m) => m.id === id && m.role === "assistant" && m.kind === "op-proposal",
            );
            if (idx < 0) return s;
            const target = s.messages[idx] as OpProposalMsg;
            let changed = false;
            for (const k in patch) {
              if ((patch as Record<string, unknown>)[k] !== (target as Record<string, unknown>)[k]) {
                changed = true;
                break;
              }
            }
            if (!changed) return s;
            const next = s.messages.slice();
            next[idx] = { ...target, ...patch } as OpProposalMsg;
            return { messages: next };
          });
        },
        appendActionLog: (text: string) => {
          const id = uid();
          set((s) => ({
            messages: [...s.messages, { id, role: "system", kind: "action-log", text, timestamp: Date.now() }],
          }));
          return id;
        },
        clear: () => set({ messages: [] }),
      }),
      {
        name: "painter-ai:chat",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ messages: partializeMessages(state.messages) }),
        merge: (persisted, current) => {
          const p = persisted as { messages?: PersistedChatMessage[] } | undefined;
          if (!p?.messages) return current;
          return {
            ...current,
            messages: rehydrateMessages(p.messages),
          };
        },
      },
    ),
  );

type Store = ReturnType<typeof createChat>;
const g = globalThis as unknown as { __painterChatStore?: Store };
export const useChatStore: Store = g.__painterChatStore ?? (g.__painterChatStore = createChat());
