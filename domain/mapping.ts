import type { ValueFormat } from "@/data/schemas";

export type Transform =
  | { type: "direct" }
  | { type: "currency_minor_units" }
  | { type: "lookup"; table: Record<string, string> }
  | { type: "date_format"; from: "MM/DD/YYYY" | "DD.MM.YYYY" }
  | { type: "country_iso3" }
  | { type: "phone_e164" }
  | { type: "coalesce"; fallback: string }
  | { type: "uppercase" };

export type TransformType = Transform["type"];

export const TRANSFORM_META: Record<TransformType, { label: string; description: string; output: ValueFormat | "same" }> = {
  direct: { label: "Direct", description: "Copy the value unchanged.", output: "same" },
  currency_minor_units: {
    label: "Currency normalization",
    description: "Major units to integer minor units (x100), including zero-decimal currencies.",
    output: "minor_units",
  },
  lookup: { label: "Lookup", description: "Translate source codes through a value table.", output: "enum" },
  date_format: { label: "Date format", description: "Reformat a source date to ISO 8601 (YYYY-MM-DD).", output: "iso_date" },
  country_iso3: { label: "Country code", description: "ISO 3166 alpha-2 to alpha-3.", output: "iso3" },
  phone_e164: { label: "Phone E.164", description: "Normalize phone numbers to +<country><number>.", output: "e164_phone" },
  coalesce: { label: "Fallback", description: "Use a second source field when the first is empty.", output: "same" },
  uppercase: { label: "Uppercase", description: "Trim and uppercase a code value.", output: "code" },
};

export type MappingStatus =
  | "mapped"
  | "needs_transformation"
  | "missing_source"
  | "missing_destination"
  | "customer_decision"
  | "invalid"
  | "optional";

export interface FieldMapping {
  destKey: string;
  source: string | null;
  transform: Transform;
  markedOptional?: boolean;
  customerInputRequested?: boolean;
  savedReusable?: boolean;
  updatedAt?: string;
}

export type CountryMappings = Record<string, FieldMapping>;

export interface MappingSuggestion {
  destKey: string;
  source: string;
  transform: Transform;
  confidence: number; // 0..100
  reason: string;
}

export interface Coverage {
  filled: number;
  total: number;
  /** Records where the transformation itself failed. */
  errors: number;
  firstError?: string;
  /** Records where this mapping yields an empty value but a fallback source has one. */
  fallbackCandidate?: { source: string; fills: number; gaps: number };
}
