import type { Context } from "hono";
import {
  defaultProviderModel,
  pickProvider,
  type ImageProviderId,
} from "../imageApi/index.js";
import { config } from "../config.js";
import { generateQueueSnapshot } from "./generateQueueInstance.js";

export async function statusRoute(c: Context) {
  const providerId = config.imageProvider as ImageProviderId;
  const provider = pickProvider(null);
  const ready = provider.isReady();
  return c.json({
    provider: providerId,
    providerName: provider.name,
    model: defaultProviderModel(providerId),
    ready: ready.ready,
    reason: ready.reason,
    queue: generateQueueSnapshot(),
  });
}
