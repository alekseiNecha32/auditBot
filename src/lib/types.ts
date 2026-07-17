export type ResolvedInput =
  | { type: "url"; url: string }
  | { type: "name_city"; name: string; city: string };

export interface HoursCompleteness {
  hasHours: boolean;
  daysWithHours: number;
  totalDays: 7;
  openNow: boolean | null;
}

export interface BusinessProfile {
  placeId: string;
  name: string;
  address: string | null;
  isTarget: boolean;
  lat: number | null;
  lng: number | null;
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
  mostRecentReviewDate: string | null;
  photoCount: number | null;
  photoCountIsCapped: boolean;
  hours: HoursCompleteness | null;
  ownerResponseRate: null;
  website: string | null;
  phone: string | null;
  mapsUrl: string | null;
}

export interface WebsiteCheck {
  requestedUrl: string;
  finalUrl: string | null;
  reachable: boolean;
  ssl: boolean;
  pageSpeedScoreMobile: number | null;
  pageSpeedScoreDesktop: number | null;
  mobileFriendly: boolean | null;
  visiblePhone: string | null;
  visibleEmail: string | null;
  onlineOrderingDetected: boolean;
  onlineOrderingEvidence: string | null;
  visibleDeliveryFee: string | null;
  seo: OnPageSeoSignals;
  errors: string[];
}

export interface OnPageSeoSignals {
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaDescriptionLength: number | null;
  h1Count: number;
  h1Text: string | null;
  hasLocalBusinessStructuredData: boolean;
  matchedFloristKeywords: string[];
}

export type WalkStepName =
  | "homepage"
  | "found_shop_entry"
  | "product_page"
  | "added_to_cart"
  | "viewed_cart"
  | "reached_checkout"
  | "guest_checkout_available"
  | "account_required"
  | "reached_payment_stage";

export interface CheckoutWalkStep {
  step: WalkStepName;
  success: boolean;
  detail: string;
}

export interface DeviceWalkResult {
  device: "mobile" | "desktop";
  steps: CheckoutWalkStep[];
  furthestStep: WalkStepName | null;
  friction: string[];
  error: string | null;
}

export interface SiteWalkResult {
  attempted: boolean;
  mobile: DeviceWalkResult | null;
  desktop: DeviceWalkResult | null;
  onlineOrderingConfirmed: boolean;
  notes: string[];
}

export interface AiVisibilityRun {
  prompt: string;
  run: number;
  response: string;
  mentionedBusinesses: string[];
  otherMentionedBusinesses: string[];
}

export interface AiVisibilityResult {
  model: string;
  prompts: string[];
  runsPerPrompt: number;
  raw: AiVisibilityRun[];
  mentionCounts: Record<string, number>;
  // Business-sounding names the AI mentioned that aren't in our tracked
  // competitor list — heuristically extracted, may include false positives.
  otherMentionsSummary: Record<string, number>;
  totalRuns: number;
  errors: string[];
}

export interface CollectedData {
  input: ResolvedInput;
  target: BusinessProfile;
  competitors: BusinessProfile[];
  website: WebsiteCheck | null;
  siteWalk: SiteWalkResult | null;
  competitorWebsites: Array<{ placeId: string; name: string; website: WebsiteCheck | null }>;
  aiVisibility: AiVisibilityResult;
  collectedAt: string;
  warnings: string[];
}

export interface ComparisonRow {
  metric: string;
  values: string[];
}

export interface ReportGap {
  rank: number;
  title: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  evidence: string;
  steps: string[];
}

export interface AuditReport {
  generatedAt: string;
  businessName: string;
  city: string | null;
  comparison: {
    businesses: string[];
    rows: ComparisonRow[];
  };
  gaps: ReportGap[];
  notes: string[];
}

export type ReportStatus =
  | "pending"
  | "resolving"
  | "collecting"
  | "synthesizing"
  | "complete"
  | "error";

export interface ReportRecord {
  slug: string;
  status: ReportStatus;
  input: ResolvedInput;
  collected: CollectedData | null;
  report: AuditReport | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
