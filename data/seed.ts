// Deterministic synthetic workforce for Acme Global. All people are fictional.
// 2,400 records are generated at runtime from a fixed seed rather than stored.

import { COUNTRIES, LEGAL_ENTITIES, type CountryCode } from "./countries";
import { LOOKUP_TABLES } from "./schemas";
import type { SourceRecord } from "@/domain/employment";
import type { CountryMappings, FieldMapping, Transform } from "@/domain/mapping";
import { mulberry32 } from "@/lib/utils";

const FIRST: Record<CountryCode, string[]> = {
  US: ["Marcus", "Elena", "Jordan", "Aisha", "Daniel", "Mei", "Carlos", "Hannah", "Tyrone", "Grace", "Omar", "Lauren", "Kevin", "Sofia", "Andre", "Rachel", "Diego", "Natalie", "Samuel", "Priyanka"],
  CA: ["Émilie", "Liam", "Chloé", "Noah", "Avery", "Mathieu", "Simran", "Ethan", "Gabrielle", "Owen", "Harpreet", "Julien"],
  GB: ["Oliver", "Amelia", "Harry", "Isla", "George", "Freya", "Arjun", "Poppy", "Callum", "Imogen", "Kwame", "Niamh"],
  DE: ["Lukas", "Felix", "Lea", "Jonas", "Mia", "Leon", "Sophie", "Maximilian", "Hannah", "Paul", "Emilia", "Elias", "Clara"],
};
const LAST: Record<CountryCode, string[]> = {
  US: ["Whitfield", "Okafor", "Brennan", "Castillo", "Nakamura", "Holloway", "Reyes", "Patel", "Lindqvist", "Morales", "Washington", "Kowalski", "Abernathy", "Tran", "Delgado", "Mercer", "Osei"],
  CA: ["Tremblay", "Gagnon", "Roy", "Côté", "Bouchard", "MacDonald", "Singh", "Leblanc", "Fraser", "Chen", "Bergeron", "Campbell"],
  GB: ["Thompson", "Evans", "Clarke", "Hughes", "Ahmed", "Wright", "Bennett", "O'Neill", "Fletcher", "Hussain", "Robertson", "Pemberton"],
  DE: ["Schmidt", "Schneider", "Fischer", "Weber", "Becker", "Hoffmann", "Schäfer", "Koch", "Richter", "Wolf", "Neumann", "Braun", "Zimmermann"],
};
const CITIES: Record<CountryCode, string[]> = {
  US: ["Austin", "Denver", "Chicago", "Seattle", "Atlanta", "Boston"],
  CA: ["Toronto", "Vancouver", "Calgary", "Ottawa"],
  GB: ["London", "Manchester", "Leeds", "Bristol", "Glasgow"],
  DE: ["Berlin", "Munich", "Hamburg", "Cologne", "Leipzig"],
};
const US_STATES = ["TX", "CO", "IL", "WA", "GA", "MA"];
const CA_PROVINCES = ["ON", "BC", "AB", "ON"];
const STREETS = ["Maple", "Harbor", "Station", "Linden", "Garden", "Mill", "Park", "Bridge"];
const DEPARTMENTS: { name: string; titles: string[]; band: [number, number] }[] = [
  { name: "Engineering", titles: ["Software Engineer", "Senior Software Engineer", "Staff Engineer", "Engineering Manager"], band: [95, 185] },
  { name: "Sales", titles: ["Account Executive", "Senior Account Executive", "Sales Development Rep", "Sales Manager"], band: [60, 140] },
  { name: "Customer Success", titles: ["Customer Success Manager", "Support Specialist", "Implementation Consultant"], band: [55, 110] },
  { name: "Finance", titles: ["Financial Analyst", "Payroll Specialist", "Controller"], band: [65, 150] },
  { name: "People", titles: ["People Partner", "Recruiter", "HR Operations Specialist"], band: [55, 120] },
  { name: "Operations", titles: ["Operations Analyst", "Program Manager", "Facilities Coordinator"], band: [50, 125] },
];
const COUNTRY_SALARY_FACTOR: Record<CountryCode, number> = { US: 1000, CA: 1100, GB: 650, DE: 720 };
const INSURERS = ["Techniker Krankenkasse", "AOK Nordost", "Barmer", "DAK-Gesundheit"];

/** Fixed demo scenarios, keyed by country and index. Kept disjoint on purpose. */
export const SCENARIO_INDEX = {
  US: { invalidSsn: [101, 202] },
  CA: { missingTaxCategory: range(10, 18), quebecEntity: range(30, 4), usdSalary: [40, 41] },
  GB: { missingNi: range(5, 9), badPostcode: [50, 51] },
  DE: { missingWorkPhone: [0, 60, 61], badTaxId: [70, 71] },
} as const;

function range(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => start + i);
}

const ascii = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z]/g, "")
    .toLowerCase();

const pad = (n: number, w: number) => String(n).padStart(w, "0");

function phone(country: CountryCode, r: () => number) {
  const n = (w: number) => pad(Math.floor(r() * 10 ** w), w);
  switch (country) {
    case "US":
      return `+1415555${n(4)}`;
    case "CA":
      return `+1416555${n(4)}`;
    case "GB":
      return `+447700900${n(3)}`;
    case "DE":
      return `+49151${n(8)}`;
  }
}

function postcode(country: CountryCode, r: () => number) {
  const L = () => "ABCEGHJKLMNPRSTVXY"[Math.floor(r() * 18)];
  const d = () => Math.floor(r() * 10);
  switch (country) {
    case "US":
    case "DE":
      return pad(10000 + Math.floor(r() * 89999), 5);
    case "CA":
      return `${L()}${d()}${L()} ${d()}${L()}${d()}`;
    case "GB":
      return `${["SW", "M", "LS", "BS", "G"][Math.floor(r() * 5)]}${d()} ${d()}${L()}${L()}`;
  }
}

function dateUS(r: () => number, from: number, to: number) {
  const y = from + Math.floor(r() * (to - from));
  return `${pad(1 + Math.floor(r() * 12), 2)}/${pad(1 + Math.floor(r() * 28), 2)}/${y}`;
}

function dateISO(r: () => number, from: number, to: number) {
  const y = from + Math.floor(r() * (to - from));
  return `${y}-${pad(1 + Math.floor(r() * 12), 2)}-${pad(1 + Math.floor(r() * 28), 2)}`;
}

let cached: SourceRecord[] | null = null;

export function generateWorkforce(): SourceRecord[] {
  if (cached) return cached;
  const out: SourceRecord[] = [];
  let idCounter = 10001;
  const usedEmails = new Set<string>();

  for (const c of COUNTRIES) {
    const r = mulberry32(0xacde + c.headcount);
    for (let i = 0; i < c.headcount; i++) {
      let first = FIRST[c.code][Math.floor(r() * FIRST[c.code].length)];
      let last = LAST[c.code][Math.floor(r() * LAST[c.code].length)];
      let dept = DEPARTMENTS[Math.floor(r() * DEPARTMENTS.length)];
      let title = dept.titles[Math.floor(r() * dept.titles.length)];
      if (c.code === "US" && i === 0) [first, last, dept, title] = ["Priya", "Sharma", DEPARTMENTS[1], "Senior Account Executive"];
      if (c.code === "DE" && i === 0) [first, last, dept, title] = ["Anna", "Müller", DEPARTMENTS[3], "Payroll Specialist"];

      let handle = `${ascii(first)}.${ascii(last)}`;
      let k = 2;
      while (usedEmails.has(handle)) handle = `${ascii(first)}.${ascii(last)}${k++}`;
      usedEmails.add(handle);

      const salary = Math.round((dept.band[0] + r() * (dept.band[1] - dept.band[0])) * COUNTRY_SALARY_FACTOR[c.code] / 100) * 100;
      const entity =
        c.code === "US" ? "ACME-US" : c.code === "CA" ? "ACME-CA-ON" : c.code === "GB" ? "ACME-UK" : "ACME-DE";
      const cityIdx = Math.floor(r() * CITIES[c.code].length);

      const v: Record<string, string | null> = {
        "employee.id": `AH-${idCounter}`,
        "employee.full_name": `${first} ${last}`,
        "employee.preferred_name": r() < 0.3 ? first : null,
        "employee.work_email": `${handle}@acmeglobal.example`,
        "employee.personal_email": `${handle}@mail.example`,
        "employee.birth_date": dateUS(r, 1966, 2002),
        "employee.nationality": c.code,
        "employee.work_phone": phone(c.code, r),
        "employee.mobile_phone": phone(c.code, r),
        "employee.tax_category": ["PROF", "TECH", "SALES", "ADMIN"][Math.floor(r() * 4)],
        "job.position": title,
        "job.department": dept.name,
        "job.start_date": dateISO(r, 2016, 2026),
        "job.employment_type": r() < 0.92 ? "FT" : "PT",
        "job.flsa_code": dept.name === "Operations" && r() < 0.5 ? "N" : "E",
        "job.manager_id": `AH-${10001 + Math.floor(r() * 300)}`,
        "comp.base_salary": String(salary),
        "comp.currency": c.currency,
        "comp.pay_frequency": c.code === "US" || c.code === "CA" ? "biweekly" : "monthly",
        "address.line1": `${1 + Math.floor(r() * 240)} ${STREETS[Math.floor(r() * STREETS.length)]} ${c.code === "DE" ? "Straße" : "Street"}`,
        "address.city": CITIES[c.code][cityIdx],
        "address.postcode": postcode(c.code, r),
        "address.state": c.code === "US" ? US_STATES[cityIdx] : null,
        "address.province_code": c.code === "CA" ? CA_PROVINCES[cityIdx] : null,
        "address.country_code": c.code,
        "tax.ssn": c.code === "US" ? `9${pad(Math.floor(r() * 100), 2)}-${pad(Math.floor(r() * 100), 2)}-${pad(Math.floor(r() * 10000), 4)}` : null,
        "tax.sin": c.code === "CA" ? `9${pad(Math.floor(r() * 100), 2)}-${pad(Math.floor(r() * 1000), 3)}-${pad(Math.floor(r() * 1000), 3)}` : null,
        "tax.ni_number": c.code === "GB" ? `QQ${pad(Math.floor(r() * 1e6), 6)}${"ABCD"[Math.floor(r() * 4)]}` : null,
        "tax.uk_tax_code": c.code === "GB" ? "1257L" : null,
        "tax.steuer_id": c.code === "DE" ? `${1 + Math.floor(r() * 9)}${pad(Math.floor(r() * 1e10), 10)}` : null,
        "tax.de_tax_class": c.code === "DE" ? String(1 + Math.floor(r() * 5)) : null,
        "benefits.health_insurer": c.code === "DE" ? INSURERS[Math.floor(r() * INSURERS.length)] : null,
        "entity.code": entity,
        "custom.cost_center": `CC-${1000 + DEPARTMENTS.indexOf(dept) * 10 + Math.floor(r() * 5)}`,
        "custom.sales_region": dept.name === "Sales" ? `${c.code}-${["NORTH", "SOUTH", "EAST", "WEST"][Math.floor(r() * 4)]}` : null,
        "custom.badge_number": pad(Math.floor(r() * 1e6), 6),
        "custom.okta_id": `00u${Math.floor(r() * 1e9).toString(36)}`,
        "custom.tshirt_size": ["S", "M", "L", "XL"][Math.floor(r() * 4)],
        "custom.remote_eligible": r() < 0.6 ? "Y" : "N",
      };

      applyScenarios(c.code, i, v);
      out.push({ id: v["employee.id"]!, country: c.code, values: v });
      idCounter++;
    }
  }
  cached = out;
  return out;
}

function applyScenarios(country: CountryCode, i: number, v: Record<string, string | null>) {
  const has = (list: readonly number[]) => list.includes(i);
  if (country === "US" && has(SCENARIO_INDEX.US.invalidSsn)) v["tax.ssn"] = "123456789";
  if (country === "CA") {
    if (has(SCENARIO_INDEX.CA.missingTaxCategory)) v["employee.tax_category"] = null;
    if (has(SCENARIO_INDEX.CA.quebecEntity)) {
      v["entity.code"] = "ACME-CA-QC";
      v["address.province_code"] = "QC";
      v["address.city"] = "Montréal";
    }
    if (has(SCENARIO_INDEX.CA.usdSalary)) v["comp.currency"] = "USD";
  }
  if (country === "GB") {
    if (has(SCENARIO_INDEX.GB.missingNi)) v["tax.ni_number"] = null;
    if (has(SCENARIO_INDEX.GB.badPostcode)) v["address.postcode"] = "SW1A1AA";
  }
  if (country === "DE") {
    if (has(SCENARIO_INDEX.DE.missingWorkPhone)) v["employee.work_phone"] = null;
    if (has(SCENARIO_INDEX.DE.badTaxId)) v["tax.steuer_id"] = "4711081512";
  }
}

export const ENTITY_LOOKUP: Record<string, string> = Object.fromEntries(LEGAL_ENTITIES.map((e) => [e.code, e.id]));

const m = (destKey: string, source: string | null, transform: Transform = { type: "direct" }): FieldMapping => ({
  destKey,
  source,
  transform,
});

/** Initial mappings as an integration engineer would leave them after a first pass. */
export function initialMappings(): Record<CountryCode, CountryMappings> {
  const common = (): FieldMapping[] => [
    m("basic_information.name", "employee.full_name"),
    m("basic_information.email", "employee.work_email"),
    m("basic_information.personal_email", "employee.personal_email"),
    m("job_title", "job.position"),
    m("provisional_start_date", "job.start_date"),
    m("employment_type", "job.employment_type", { type: "lookup", table: { ...LOOKUP_TABLES.employment_type } }),
    m("annual_gross_salary", "comp.base_salary", { type: "currency_minor_units" }),
    m("salary_currency", "comp.currency"),
    m("personal_details.date_of_birth", "employee.birth_date", { type: "date_format", from: "MM/DD/YYYY" }),
    m("personal_details.nationality", "employee.nationality", { type: "country_iso3" }),
    m("contact_details.mobile_number", "employee.work_phone"),
    m("address_details.address", "address.line1"),
    m("address_details.city", "address.city"),
    m("address_details.postal_code", "address.postcode"),
    m("address_details.country", "address.country_code", { type: "country_iso3" }),
    m("legal_entity_id", "entity.code", { type: "lookup", table: { ...ENTITY_LOOKUP } }),
    m("custom_fields.cost_center", "custom.cost_center"),
    m("custom_fields.sales_region", null),
  ];
  const specific: Record<CountryCode, FieldMapping[]> = {
    US: [
      m("address_details.state_or_province", "address.state"),
      m("personal_details.ssn", "tax.ssn"),
      m("contract_details.exempt_status", "job.flsa_code", { type: "lookup", table: { ...LOOKUP_TABLES.flsa } }),
    ],
    CA: [
      // Gap on purpose: AcmeHR stores Canadian provinces in a different field than US states.
      m("address_details.state_or_province", null),
      m("personal_details.sin", "tax.sin"),
      m("tax_job_category", "employee.tax_category", { type: "lookup", table: { ...LOOKUP_TABLES.tax_category } }),
    ],
    GB: [m("personal_details.ni_number", "tax.ni_number"), m("contract_details.tax_code", "tax.uk_tax_code")],
    DE: [
      m("personal_details.tax_id", "tax.steuer_id"),
      m("personal_details.tax_class", "tax.de_tax_class"),
      m("benefits.health_insurance_provider", "benefits.health_insurer"),
    ],
  };
  const out = {} as Record<CountryCode, CountryMappings>;
  for (const c of COUNTRIES) {
    out[c.code] = Object.fromEntries([...common(), ...specific[c.code]].map((x) => [x.destKey, x]));
  }
  return out;
}
