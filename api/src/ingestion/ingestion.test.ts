import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { readCsvWithPhysicalRows, physicalSourceRow } from "./csv-reader.js";
import { parseFlexibleDate } from "./normalize/dates.js";
import { parseCurrency } from "./normalize/currency.js";
import { quantityToLitres } from "./normalize/units.js";
import { normaliseSeverity } from "./normalize/severity.js";
import { isExactDuplicate, findExactDuplicateSourceRows } from "./quality/duplicates.js";
import { buildFileHeaderTrimIssues } from "./quality/issues.js";
import { parseElectricityCsv } from "./parsers/electricity.js";
import { FUEL_COLUMNS, parseFuelCsv } from "./parsers/fuel.js";
import type { CsvPhysicalRow } from "./types.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fuelCsvPath = path.join(repoRoot, "data/fuel_deliveries.csv");

describe("quantityToLitres", () => {
  it("converts kL to litres by multiplying by 1000", () => {
    expect(quantityToLitres("84.03", "kL")).toBe(84030);
  });

  it("normalises L, litres and Litres to litres unchanged", () => {
    expect(quantityToLitres("100", "L")).toBe(100);
    expect(quantityToLitres("100", "litres")).toBe(100);
    expect(quantityToLitres("100", "Litres")).toBe(100);
  });
});

describe("parseFlexibleDate", () => {
  it("parses ISO dates to exact delivery_date", () => {
    const parsed = parseFlexibleDate("2025-12-19");
    expect(parsed.deliveryDate).toBe("2025-12-19");
    expect(parsed.datePrecision).toBe("day");
    expect(parsed.isMonthOnly).toBe(false);
  });

  it("parses DD/MM/YYYY dates", () => {
    const parsed = parseFlexibleDate("21/05/2026");
    expect(parsed.deliveryDate).toBe("2026-05-21");
    expect(parsed.reportingMonth).toBe("2026-05-01");
  });

  it("parses Mon-YY as month-only with null delivery_date", () => {
    const parsed = parseFlexibleDate("Oct-25");
    expect(parsed.deliveryDate).toBeNull();
    expect(parsed.reportingMonth).toBe("2025-10-01");
    expect(parsed.datePrecision).toBe("month");
    expect(parsed.isMonthOnly).toBe(true);
  });
});

describe("parseCurrency", () => {
  it("parses plain, dollar and comma formatted currency", () => {
    expect(parseCurrency("132182.58")).toBe(132182.58);
    expect(parseCurrency("$182,946.64")).toBe(182946.64);
  });

  it("preserves negative credit/reversal values", () => {
    expect(parseCurrency("$-23,375.00")).toBe(-23375);
    expect(parseCurrency("-12500")).toBe(-12500);
  });
});

describe("normaliseSeverity", () => {
  it("maps mixed severity formats to ranks 1-3", () => {
    expect(normaliseSeverity("Low")).toEqual({ severityNormalised: 1, severityLabel: "Low" });
    expect(normaliseSeverity("1")).toEqual({ severityNormalised: 1, severityLabel: "Low" });
    expect(normaliseSeverity("Medium")).toEqual({
      severityNormalised: 2,
      severityLabel: "Medium",
    });
    expect(normaliseSeverity("2")).toEqual({ severityNormalised: 2, severityLabel: "Medium" });
    expect(normaliseSeverity("3")).toEqual({ severityNormalised: 3, severityLabel: "High" });
  });
});

describe("header trim quality issues", () => {
  it("creates fixed issues when raw headers contain whitespace", () => {
    const issues = buildFileHeaderTrimIssues(
      [" Delivery Date", "Fuel Type "],
      ["Delivery Date", "Fuel Type"],
      "fuel_deliveries",
      "fuel_deliveries.csv",
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      action: "fixed",
      issueCode: "HEADER_OR_VALUE_TRIM",
      sourceRow: null,
      entityId: null,
      originalValue: " Delivery Date",
      cleanedValue: "Delivery Date",
    });
  });

  it("creates no header issues when headers are already clean", () => {
    const parsed = parseElectricityCsv(
      "meter_id,meter_description,period,consumption,unit\nMTR-01,Plant,2025-01,100,kWh\n",
      "electricity_meter_readings.csv",
    );
    expect(parsed.headerIssues).toHaveLength(0);
  });

  it("includes fuel header trim issues from the real CSV", () => {
    const content = readFileSync(fuelCsvPath, "utf8");
    const parsed = parseFuelCsv(content, "fuel_deliveries.csv");
    expect(parsed.headerIssues.length).toBeGreaterThan(0);
    expect(parsed.headerIssues.every((issue) => issue.sourceRow === null)).toBe(true);
    expect(
      parsed.headerIssues.some(
        (issue) =>
          issue.originalValue === " Delivery Date" &&
          issue.cleanedValue === "Delivery Date",
      ),
    ).toBe(true);
  });
});

describe("exact duplicate detection", () => {
  it("marks later exact copies as duplicates using physical source rows", () => {
    const content = readFileSync(fuelCsvPath, "utf8");
    const { rows } = readCsvWithPhysicalRows(content);
    const firstSeen = findExactDuplicateSourceRows(rows, [...FUEL_COLUMNS]);

    const inv40497Rows = rows.filter(
      (row: CsvPhysicalRow) => row.cells["Invoice No"] === "INV-40497",
    );
    expect(inv40497Rows.length).toBe(2);

    const [first, second] = inv40497Rows;
    expect(first?.sourceRow).toBe(6);
    expect(second?.sourceRow).toBe(24);
    expect(isExactDuplicate(first!, [...FUEL_COLUMNS], firstSeen)).toBe(false);
    expect(isExactDuplicate(second!, [...FUEL_COLUMNS], firstSeen)).toBe(true);
  });

  it("includes the canonical source row in duplicate issue explanations", () => {
    const content = readFileSync(fuelCsvPath, "utf8");
    const parsed = parseFuelCsv(content, "fuel_deliveries.csv");
    const duplicateIssue = parsed.rows
      .flatMap((row) => row.issues)
      .find((issue) => issue.issueCode === "EXACT_DUPLICATE");

    expect(duplicateIssue?.explanation).toContain("Exact duplicate of source row 6");
  });
});

describe("parseFuelCsv credit reversal", () => {
  it("preserves negative INV-41777 quantity and flags credit reversal", () => {
    const content = readFileSync(fuelCsvPath, "utf8");
    const parsed = parseFuelCsv(content, "fuel_deliveries.csv");
    const credit = parsed.rows.find((row) => row.invoiceNo === "INV-41777");
    expect(credit).toBeDefined();
    expect(credit?.quantityLitres).toBe(-12500);
    expect(credit?.costAud).toBe(-23375);
    expect(
      credit?.issues.some((issue) => issue.issueCode === "CREDIT_REVERSAL"),
    ).toBe(true);
  });
});

describe("physical source-row numbering", () => {
  it("treats header as line 1 and first data row as line 2", () => {
    expect(physicalSourceRow(0)).toBe(2);
    const content = "a,b\n1,2\n3,4\n";
    const { rows, rawHeaders, headers } = readCsvWithPhysicalRows(content);
    expect(rawHeaders).toEqual(["a", "b"]);
    expect(headers).toEqual(["a", "b"]);
    expect(rows[0]?.sourceRow).toBe(2);
    expect(rows[1]?.sourceRow).toBe(3);
  });
});

/**
 * Transaction rollback and failed-run recording require a live PostgreSQL connection.
 * Those behaviours will be integration-tested in Checkpoint 4.
 */
