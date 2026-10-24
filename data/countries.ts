// Synthetic reference data for the Acme Global demo customer.
// Country codes in Remote's API are ISO 3166-1 alpha-3; AcmeHR stores alpha-2.

export type CountryCode = "US" | "CA" | "GB" | "DE";

export interface Country {
  code: CountryCode;
  iso3: string;
  name: string;
  currency: "USD" | "CAD" | "GBP" | "EUR";
  headcount: number;
  postalPattern: RegExp;
}

export const COUNTRIES: Country[] = [
  { code: "US", iso3: "USA", name: "United States", currency: "USD", headcount: 1200, postalPattern: /^\d{5}$/ },
  { code: "CA", iso3: "CAN", name: "Canada", currency: "CAD", headcount: 450, postalPattern: /^[A-Z]\d[A-Z] \d[A-Z]\d$/ },
  { code: "GB", iso3: "GBR", name: "United Kingdom", currency: "GBP", headcount: 400, postalPattern: /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/ },
  { code: "DE", iso3: "DEU", name: "Germany", currency: "EUR", headcount: 350, postalPattern: /^\d{5}$/ },
];

export const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c])) as Record<CountryCode, Country>;

export const ISO2_TO_ISO3: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.iso3]));

/** Fixed demo FX rates for reporting only. Not live rates. */
export const DEMO_FX_TO_USD: Record<string, number> = { USD: 1, CAD: 0.73, GBP: 1.27, EUR: 1.08 };

export interface LegalEntity {
  code: string; // AcmeHR entity code
  id: string; // destination legal entity id (synthetic)
  name: string;
  country: CountryCode;
  provisioned: boolean; // configured in the Remote-compatible destination
}

export const LEGAL_ENTITIES: LegalEntity[] = [
  { code: "ACME-US", id: "le_us_7f3a", name: "Acme Global Inc.", country: "US", provisioned: true },
  { code: "ACME-CA-ON", id: "le_ca_19bd", name: "Acme Global Canada Ltd.", country: "CA", provisioned: true },
  { code: "ACME-CA-QC", id: "le_ca_qc_pending", name: "Acme Global Québec Inc.", country: "CA", provisioned: false },
  { code: "ACME-UK", id: "le_gb_02c1", name: "Acme Global UK Ltd.", country: "GB", provisioned: true },
  { code: "ACME-DE", id: "le_de_5e90", name: "Acme Germany GmbH", country: "DE", provisioned: true },
];
