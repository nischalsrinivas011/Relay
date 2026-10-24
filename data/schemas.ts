// Source (AcmeHR) and destination field catalogues.
// SIMULATED: the destination schema is a synthetic stand-in modelled on Remote's
// country-specific JSON-Schema forms (GET /v1/countries/{country_code}/{form}).
// Field keys here are illustrative and are not Remote's published contract.

import type { CountryCode } from "./countries";

/** Value format tags. A direct mapping is valid only when formats are compatible. */
export type ValueFormat =
  | "text"
  | "email"
  | "iso_date"
  | "us_date"
  | "major_units"
  | "minor_units"
  | "currency_code"
  | "iso2"
  | "iso3"
  | "e164_phone"
  | "code"
  | "enum";

export interface SourceField {
  key: string;
  label: string;
  group: "Employee" | "Job" | "Compensation" | "Address" | "Tax" | "Benefits" | "Entity" | "Custom";
  format: ValueFormat;
  custom?: boolean;
}

export const SOURCE_FIELDS: SourceField[] = [
  { key: "employee.id", label: "Employee ID", group: "Employee", format: "code" },
  { key: "employee.full_name", label: "Full name", group: "Employee", format: "text" },
  { key: "employee.preferred_name", label: "Preferred name", group: "Employee", format: "text" },
  { key: "employee.work_email", label: "Work email", group: "Employee", format: "email" },
  { key: "employee.personal_email", label: "Personal email", group: "Employee", format: "email" },
  { key: "employee.birth_date", label: "Birth date (MM/DD/YYYY)", group: "Employee", format: "us_date" },
  { key: "employee.nationality", label: "Nationality", group: "Employee", format: "iso2" },
  { key: "employee.work_phone", label: "Work phone", group: "Employee", format: "e164_phone" },
  { key: "employee.mobile_phone", label: "Mobile phone", group: "Employee", format: "e164_phone" },
  { key: "employee.tax_category", label: "Tax category", group: "Employee", format: "code" },
  { key: "job.position", label: "Position", group: "Job", format: "text" },
  { key: "job.department", label: "Department", group: "Job", format: "text" },
  { key: "job.start_date", label: "Start date", group: "Job", format: "iso_date" },
  { key: "job.employment_type", label: "Employment type (FT/PT)", group: "Job", format: "code" },
  { key: "job.flsa_code", label: "FLSA code (E/N)", group: "Job", format: "code" },
  { key: "job.manager_id", label: "Manager ID", group: "Job", format: "code" },
  { key: "comp.base_salary", label: "Base salary", group: "Compensation", format: "major_units" },
  { key: "comp.currency", label: "Salary currency", group: "Compensation", format: "currency_code" },
  { key: "comp.pay_frequency", label: "Pay frequency", group: "Compensation", format: "code" },
  { key: "address.line1", label: "Address line 1", group: "Address", format: "text" },
  { key: "address.city", label: "City", group: "Address", format: "text" },
  { key: "address.postcode", label: "Postcode", group: "Address", format: "text" },
  { key: "address.state", label: "State", group: "Address", format: "code" },
  { key: "address.province_code", label: "Province code", group: "Address", format: "code" },
  { key: "address.country_code", label: "Country (ISO-2)", group: "Address", format: "iso2" },
  { key: "tax.ssn", label: "SSN", group: "Tax", format: "text" },
  { key: "tax.sin", label: "SIN", group: "Tax", format: "text" },
  { key: "tax.ni_number", label: "NI number", group: "Tax", format: "text" },
  { key: "tax.uk_tax_code", label: "UK tax code", group: "Tax", format: "code" },
  { key: "tax.steuer_id", label: "Steuer-ID", group: "Tax", format: "text" },
  { key: "tax.de_tax_class", label: "Lohnsteuerklasse", group: "Tax", format: "code" },
  { key: "benefits.health_insurer", label: "Health insurer", group: "Benefits", format: "text" },
  { key: "entity.code", label: "Legal entity code", group: "Entity", format: "code" },
  { key: "custom.cost_center", label: "Cost center", group: "Custom", format: "code", custom: true },
  { key: "custom.sales_region", label: "Sales region", group: "Custom", format: "code", custom: true },
  { key: "custom.badge_number", label: "Badge number", group: "Custom", format: "code", custom: true },
  { key: "custom.okta_id", label: "Okta ID", group: "Custom", format: "code", custom: true },
  { key: "custom.tshirt_size", label: "T-shirt size", group: "Custom", format: "code", custom: true },
  { key: "custom.remote_eligible", label: "Remote eligible", group: "Custom", format: "code", custom: true },
];

export const SOURCE_BY_KEY = Object.fromEntries(SOURCE_FIELDS.map((f) => [f.key, f])) as Record<string, SourceField>;

export interface DestinationField {
  key: string;
  label: string;
  accepts: ValueFormat[];
  /** Countries where the field exists in the destination form. */
  countries: CountryCode[];
  /** Countries where the field is required. */
  requiredIn: CountryCode[];
  pattern?: RegExp;
  enumValues?: string[];
  hint?: string;
  custom?: boolean;
}

const ALL: CountryCode[] = ["US", "CA", "GB", "DE"];

export const DESTINATION_FIELDS: DestinationField[] = [
  { key: "basic_information.name", label: "Full name", accepts: ["text"], countries: ALL, requiredIn: ALL },
  { key: "basic_information.email", label: "Work email", accepts: ["email"], countries: ALL, requiredIn: ALL, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
  { key: "basic_information.personal_email", label: "Personal email", accepts: ["email"], countries: ALL, requiredIn: ALL, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
  { key: "job_title", label: "Job title", accepts: ["text"], countries: ALL, requiredIn: ALL },
  { key: "provisional_start_date", label: "Start date", accepts: ["iso_date"], countries: ALL, requiredIn: ALL, pattern: /^\d{4}-\d{2}-\d{2}$/ },
  { key: "employment_type", label: "Employment type", accepts: ["enum"], countries: ALL, requiredIn: ALL, enumValues: ["full_time", "part_time"] },
  {
    key: "annual_gross_salary",
    label: "Annual gross salary",
    accepts: ["minor_units"],
    countries: ALL,
    requiredIn: ALL,
    hint: "Integer in minor units (major x 100), applied to every currency.",
  },
  { key: "salary_currency", label: "Salary currency", accepts: ["currency_code"], countries: ALL, requiredIn: ALL },
  { key: "personal_details.date_of_birth", label: "Date of birth", accepts: ["iso_date"], countries: ALL, requiredIn: ALL, pattern: /^\d{4}-\d{2}-\d{2}$/ },
  { key: "personal_details.nationality", label: "Nationality", accepts: ["iso3"], countries: ALL, requiredIn: [] },
  { key: "contact_details.mobile_number", label: "Mobile number", accepts: ["e164_phone"], countries: ALL, requiredIn: ["DE"], pattern: /^\+\d{8,15}$/ },
  { key: "address_details.address", label: "Address line", accepts: ["text"], countries: ALL, requiredIn: ALL },
  { key: "address_details.city", label: "City", accepts: ["text"], countries: ALL, requiredIn: ALL },
  { key: "address_details.postal_code", label: "Postal code", accepts: ["text"], countries: ALL, requiredIn: ALL, hint: "Validated against the country postal format." },
  { key: "address_details.country", label: "Country", accepts: ["iso3"], countries: ALL, requiredIn: ALL },
  { key: "address_details.state_or_province", label: "State or province", accepts: ["code"], countries: ["US", "CA"], requiredIn: ["US", "CA"] },
  { key: "legal_entity_id", label: "Legal entity", accepts: ["enum"], countries: ALL, requiredIn: ALL },
  { key: "personal_details.ssn", label: "Social Security number", accepts: ["text"], countries: ["US"], requiredIn: ["US"], pattern: /^\d{3}-\d{2}-\d{4}$/ },
  { key: "contract_details.exempt_status", label: "FLSA exempt status", accepts: ["enum"], countries: ["US"], requiredIn: ["US"], enumValues: ["exempt", "non_exempt"] },
  { key: "personal_details.sin", label: "Social Insurance Number", accepts: ["text"], countries: ["CA"], requiredIn: ["CA"], pattern: /^\d{3}-\d{3}-\d{3}$/ },
  {
    key: "tax_job_category",
    label: "Tax job category",
    accepts: ["enum"],
    countries: ["CA"],
    requiredIn: ["CA"],
    enumValues: ["professional", "technical", "sales", "administrative"],
  },
  { key: "personal_details.ni_number", label: "National Insurance number", accepts: ["text"], countries: ["GB"], requiredIn: ["GB"], pattern: /^[A-Z]{2}\d{6}[A-D]$/ },
  { key: "contract_details.tax_code", label: "PAYE tax code", accepts: ["code"], countries: ["GB"], requiredIn: ["GB"], pattern: /^\d{3,4}[A-Z]$/ },
  { key: "personal_details.tax_id", label: "Tax ID (Steuer-ID)", accepts: ["text"], countries: ["DE"], requiredIn: ["DE"], pattern: /^\d{11}$/ },
  { key: "personal_details.tax_class", label: "Tax class", accepts: ["code"], countries: ["DE"], requiredIn: ["DE"], enumValues: ["1", "2", "3", "4", "5", "6"] },
  { key: "benefits.health_insurance_provider", label: "Health insurance provider", accepts: ["text"], countries: ["DE"], requiredIn: ["DE"] },
  { key: "custom_fields.cost_center", label: "Cost center (custom)", accepts: ["code", "text"], countries: ALL, requiredIn: [], custom: true },
  { key: "custom_fields.sales_region", label: "Sales region (custom)", accepts: ["code", "text"], countries: ALL, requiredIn: [], custom: true },
];

export const DEST_BY_KEY = Object.fromEntries(DESTINATION_FIELDS.map((f) => [f.key, f])) as Record<string, DestinationField>;

export const destFieldsFor = (country: CountryCode) => DESTINATION_FIELDS.filter((f) => f.countries.includes(country));

export const LOOKUP_TABLES = {
  tax_category: { PROF: "professional", TECH: "technical", SALES: "sales", ADMIN: "administrative" },
  flsa: { E: "exempt", N: "non_exempt" },
  employment_type: { FT: "full_time", PT: "part_time" },
} as const;
