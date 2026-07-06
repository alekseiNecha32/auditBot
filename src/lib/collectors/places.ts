import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { BusinessProfile, HoursCompleteness } from "@/lib/types";

const PLACES_BASE = "https://places.googleapis.com/v1";

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "reviews",
  "photos",
  "regularOpeningHours",
  "websiteUri",
  "nationalPhoneNumber",
  "googleMapsUri",
  "primaryType",
].join(",");

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
].join(",");

interface RawPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  reviews?: Array<{ publishTime?: string }>;
  photos?: Array<unknown>;
  regularOpeningHours?: { periods?: Array<{ open?: { day?: number } }> };
}

export class PlacesApiError extends Error {}

async function placesRequest<T>(path: string, init: RequestInit, fieldMask: string): Promise<T> {
  const res = await fetchWithTimeout(
    `${PLACES_BASE}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": fieldMask,
        ...(init.headers ?? {}),
      },
    },
    12000
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PlacesApiError(`Places API ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function textSearchPlaces(query: string): Promise<RawPlace[]> {
  const data = await placesRequest<{ places?: RawPlace[] }>(
    "/places:searchText",
    {
      method: "POST",
      body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
    },
    SEARCH_FIELD_MASK
  );
  return data.places ?? [];
}

export async function nearbySearchPlaces(
  lat: number,
  lng: number,
  includedType: string,
  radiusMeters = 6000
): Promise<RawPlace[]> {
  const data = await placesRequest<{ places?: RawPlace[] }>(
    "/places:searchNearby",
    {
      method: "POST",
      body: JSON.stringify({
        includedTypes: [includedType],
        maxResultCount: 10,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
      }),
    },
    SEARCH_FIELD_MASK
  );
  return data.places ?? [];
}

function computeHoursCompleteness(place: RawPlace): HoursCompleteness | null {
  const periods = place.regularOpeningHours?.periods;
  if (!periods) return null;
  const days = new Set<number>();
  for (const period of periods) {
    if (typeof period.open?.day === "number") days.add(period.open.day);
  }
  return {
    hasHours: days.size > 0,
    daysWithHours: days.size,
    totalDays: 7,
    openNow: null,
  };
}

function toBusinessProfile(place: RawPlace, isTarget: boolean): BusinessProfile {
  const reviewDates = (place.reviews ?? [])
    .map((r) => r.publishTime)
    .filter((d): d is string => Boolean(d))
    .sort();
  const photoCount = place.photos?.length ?? null;

  return {
    placeId: place.id,
    name: place.displayName?.text ?? "Unknown business",
    address: place.formattedAddress ?? null,
    isTarget,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    primaryType: place.primaryType ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    mostRecentReviewDate: reviewDates.length ? reviewDates[reviewDates.length - 1] : null,
    // The Places API only returns metadata for a capped subset of photos (typically
    // up to 10), so this is a floor on the true photo count, not an exact total.
    photoCount,
    photoCountIsCapped: photoCount !== null && photoCount >= 10,
    hours: computeHoursCompleteness(place),
    // Owner reply text/date is not exposed by the Places API's public review
    // object, so this can never be computed from this data source.
    ownerResponseRate: null,
    website: place.websiteUri ?? null,
    phone: place.nationalPhoneNumber ?? null,
    mapsUrl: place.googleMapsUri ?? null,
  };
}

export async function getPlaceDetails(placeId: string, isTarget: boolean): Promise<BusinessProfile> {
  const place = await placesRequest<RawPlace>(`/places/${placeId}`, { method: "GET" }, DETAILS_FIELD_MASK);
  return toBusinessProfile(place, isTarget);
}

export async function findCompetitors(
  target: BusinessProfile,
  maxCount = 5
): Promise<BusinessProfile[]> {
  if (target.lat === null || target.lng === null) return [];
  const type = target.primaryType || "florist";
  const nearby = await nearbySearchPlaces(target.lat, target.lng, type);
  const candidates = nearby.filter((p) => p.id !== target.placeId).slice(0, maxCount);
  const details = await Promise.all(
    candidates.map((c) => getPlaceDetails(c.id, false).catch(() => toBusinessProfile(c, false)))
  );
  return details;
}
