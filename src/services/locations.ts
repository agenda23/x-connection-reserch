import {
  resetApiCallCount,
  getApiCallCount,
  fetchAvailableLocations,
  fetchLocationAutoComplete,
} from "../lib/emusks-client.js";
import {
  parseLocations,
  parseAutoCompleteLocations,
  filterLocationsByName,
} from "../parsers/location.js";
import {
  getExploreSettings,
} from "../lib/emusks-client.js";
import type {
  LocationItem,
  LocationsResponse,
  ExploreSettings,
  SettingsResponse,
} from "../types/trend.js";

export async function listLocations(
  search?: string,
): Promise<LocationsResponse> {
  const requestedAt = new Date().toISOString();
  resetApiCallCount();

  let locations: LocationItem[];

  if (search) {
    try {
      const raw = await fetchLocationAutoComplete(search);
      locations = parseAutoCompleteLocations(raw);
      // fallback: autocomplete returned nothing, filter available() client-side
      if (locations.length === 0) {
        const allRaw = await fetchAvailableLocations();
        locations = filterLocationsByName(parseLocations(allRaw), search);
      }
    } catch {
      // autocomplete endpoint unverified — fall back gracefully
      const allRaw = await fetchAvailableLocations();
      locations = filterLocationsByName(parseLocations(allRaw), search);
    }
  } else {
    const raw = await fetchAvailableLocations();
    locations = parseLocations(raw);
  }

  return {
    ok: true,
    data: { locations },
    meta: {
      requestedAt,
      apiCalls: getApiCallCount(),
      count: locations.length,
    },
  };
}

export async function getSettings(): Promise<SettingsResponse> {
  const requestedAt = new Date().toISOString();
  resetApiCallCount();

  const raw = await getExploreSettings();
  const r = raw as Record<string, unknown> | null;

  const loc = r?.["location"] as Record<string, unknown> | undefined;
  const settings: ExploreSettings = {
    location: loc
      ? {
          woeid: loc["woeid"] != null ? Number(loc["woeid"]) : null,
          name: loc["name"] != null ? String(loc["name"]) : null,
        }
      : null,
    raw,
  };

  return {
    ok: true,
    data: { settings },
    meta: { requestedAt, apiCalls: getApiCallCount() },
  };
}
