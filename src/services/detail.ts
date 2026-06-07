import { AppError } from "../lib/errors.js";
import {
  resetApiCallCount,
  getApiCallCount,
  fetchTrendById,
} from "../lib/emusks-client.js";
import { parseTrendDetail } from "../parsers/detail.js";
import type { DetailResponse } from "../types/trend.js";

export async function getTrendDetail(
  id: string,
  raw?: boolean,
): Promise<DetailResponse> {
  const requestedAt = new Date().toISOString();

  if (!id?.trim()) {
    throw new AppError("INVALID_PARAMS", "--id is required");
  }

  resetApiCallCount();

  let rawData: unknown;
  try {
    rawData = await fetchTrendById(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("rate") || msg.includes("429")) {
      throw new AppError("RATE_LIMITED", `Rate limited: ${msg}`);
    }
    if (msg.toLowerCase().includes("auth") || msg.includes("401")) {
      throw new AppError("AUTH_FAILED", `Auth error: ${msg}`);
    }
    throw new AppError("INVALID_PARAMS", `Could not fetch trend "${id}": ${msg}`);
  }

  const apiCalls = getApiCallCount();
  const detail = parseTrendDetail(rawData, id);
  if (raw) detail._raw = rawData;

  return {
    ok: true,
    data: { detail },
    meta: { requestedAt, apiCalls },
  };
}
