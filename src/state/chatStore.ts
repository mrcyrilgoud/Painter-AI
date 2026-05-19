import { create } from "zustand";
import type { AIGenerateRequest, AIVariation } from "../ai/types";
import { uid } from "../utils/canvas";

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

const createChat = () =>
  create<ChatState>((set) => ({
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
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === id && m.role === "assistant" && m.kind === "text"
            ? ({ ...m, text: m.text + chunk, streaming } as AssistantTextMsg)
            : m,
        ),
      }));
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
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === id && m.role === "assistant" && m.kind === "op-proposal"
            ? ({ ...m, ...patch } as OpProposalMsg)
            : m,
        ),
      }));
    },
    appendActionLog: (text: string) => {
      const id = uid();
      set((s) => ({
        messages: [...s.messages, { id, role: "system", kind: "action-log", text, timestamp: Date.now() }],
      }));
      return id;
    },
    clear: () => set({ messages: [] }),
  }));

type Store = ReturnType<typeof createChat>;
const g = globalThis as unknown as { __painterChatStore?: Store };
export const useChatStore: Store = g.__painterChatStore ?? (g.__painterChatStore = createChat());
