import type { LocationItem } from "../types/trend.js";

export function parseLocations(raw: unknown): LocationItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const r = item as Record<string, unknown>;
    const woeid = Number(r["woeid"]);
    if (!woeid) return [];

    const placeType = r["placeType"];
    return [
      {
        name: String(r["name"] ?? ""),
        woeid,
        country: r["country"] != null ? String(r["country"]) : null,
        countryCode: r["countryCode"] != null ? String(r["countryCode"]) : null,
        placeType: {
          code:
            typeof placeType === "object" && placeType !== null
              ? Number((placeType as Record<string, unknown>)["code"]) || null
              : null,
          name:
            typeof placeType === "object" && placeType !== null
              ? String((placeType as Record<string, unknown>)["name"] ?? "")
              : null,
        },
        url: r["url"] != null ? String(r["url"]) : null,
        parentid: r["parentid"] != null ? Number(r["parentid"]) || null : null,
      },
    ];
  });
}

export function parseAutoCompleteLocations(raw: unknown): LocationItem[] {
  // guide/explore_locations_with_auto_complete response structure (unverified)
  // Falls back to parseLocations if the shape matches v1.1 available()
  if (Array.isArray(raw)) return parseLocations(raw);

  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    // Try common wrapper shapes
    if (Array.isArray(r["locations"])) return parseLocations(r["locations"]);
    if (Array.isArray(r["data"])) return parseLocations(r["data"]);
  }

  return [];
}

export function filterLocationsByName(
  locations: LocationItem[],
  query: string,
): LocationItem[] {
  const q = query.toLowerCase();
  return locations.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      (l.country ?? "").toLowerCase().includes(q),
  );
}
