import { mockBackend } from "../src/ai/mockBackend";
import { mockCopilot } from "../src/ai/mockCopilot";
import { aiBackendContract } from "./contracts/aiBackend.contract";
import { copilotContract } from "./contracts/copilot.contract";

// Run the behavioural contracts against the in-process mocks. Codex/Cursor/
// OpenAI backends should be plugged into the same factories to verify they
// conform — they're not run here because they require external CLIs/keys.
//
// Segmentation is server-only (POST /ai/segment); see server segment route tests.

aiBackendContract("mockBackend", () => mockBackend);
copilotContract("mockCopilot", () => mockCopilot);
