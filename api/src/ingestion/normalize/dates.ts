import type { DatePrecision } from "../../domain/constants.js";

export interface ParsedDate {
  deliveryDate: string | null;
  reportingMonth: string | null;
  datePrecision: DatePrecision | null;
  isMonthOnly: boolean;
}

const MONTH_MAP: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MON_YY = /^([A-Za-z]{3})-(\d{2})$/;

function toIsoDate(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function monthAnchor(year: string, month: string): string {
  return `${year}-${month.padStart(2, "0")}-01`;
}

export function parseFlexibleDate(raw: string): ParsedDate {
  const value = raw.trim();
  if (!value) {
    return {
      deliveryDate: null,
      reportingMonth: null,
      datePrecision: null,
      isMonthOnly: false,
    };
  }

  if (ISO_DATE.test(value)) {
    const reportingMonth = `${value.slice(0, 7)}-01`;
    return {
      deliveryDate: value,
      reportingMonth,
      datePrecision: "day",
      isMonthOnly: false,
    };
  }

  const ddmmyyyy = DDMMYYYY.exec(value);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const deliveryDate = toIsoDate(year!, month!, day!);
    return {
      deliveryDate,
      reportingMonth: monthAnchor(year!, month!),
      datePrecision: "day",
      isMonthOnly: false,
    };
  }

  const monYy = MON_YY.exec(value);
  if (monYy) {
    const [, mon, yy] = monYy;
    const month = MONTH_MAP[mon!];
    if (!month) {
      throw new Error(`Unrecognised month token: ${mon}`);
    }
    const year = `20${yy}`;
    return {
      deliveryDate: null,
      reportingMonth: monthAnchor(year, month),
      datePrecision: "month",
      isMonthOnly: true,
    };
  }

  throw new Error(`Unparseable date: ${raw}`);
}

export function parseIncidentDate(raw: string): string {
  const parsed = parseFlexibleDate(raw);
  if (!parsed.deliveryDate) {
    throw new Error(`Incident date must be an exact day: ${raw}`);
  }
  return parsed.deliveryDate;
}

export function parsePeriodMonth(raw: string): string {
  const value = raw.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Unparseable electricity period: ${raw}`);
  }
  return `${match[1]}-${match[2]}-01`;
}

export function monthKeyFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}
