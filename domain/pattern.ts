import type { CountryCode } from "@/data/countries";
import type { TransformType } from "./mapping";

export type Reusability = "reusable" | "configurable" | "customer_specific" | "unsupported";

export const REUSABILITY_LABEL: Record<Reusability, string> = {
  reusable: "Reusable as-is",
  configurable: "Configurable",
  customer_specific: "Customer-specific",
  unsupported: "Unsupported",
};

export interface PatternEntry {
  country: CountryCode;
  destKey: string;
  source: string | null;
  transform: TransformType;
  reusability: Reusability;
  why: string;
}

export interface ChecklistStep {
  group: string;
  label: string;
  done: boolean;
}

export interface IntegrationPattern {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  countries: CountryCode[];
  counts: {
    standardMappings: number;
    customMappings: number;
    countryRules: number;
    webhookSubscriptions: number;
    edgeCases: number;
    checklistSteps: number;
  };
  reusability: Record<Reusability, number>;
  entries: PatternEntry[];
  edgeCases: { title: string; detail: string }[];
  checklist: ChecklistStep[];
  subscriptions: string[];
}
