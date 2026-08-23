import type { MonthlyEmissionsResponse } from "../api/types.js";
import { formatPercentChange } from "./format.js";

export {
  countAiReviewIncidents,
  PSYCHOSOCIAL_YES,
  SEVERITY_POSSIBLY_INCONSISTENT,
  ANALYSIS_COMPLETE,
} from "./aiDisplay.js";

export interface MarchActivityShift {
  fromMonth: string;
  toMonth: string;
  scope1FromTonnes: number;
  scope1ToTonnes: number;
  scope2FromTonnes: number;
  scope2ToTonnes: number;
  scope1ChangeLabel: string;
  scope2ChangeLabel: string;
  derivedFrom: string;
}

const FEB_2026 = "2026-02";
const MAR_2026 = "2026-03";

export function computeMarchActivityShift(
  monthly: MonthlyEmissionsResponse,
): MarchActivityShift | null {
  const feb = monthly.months.find((m) => m.month === FEB_2026);
  const mar = monthly.months.find((m) => m.month === MAR_2026);
  if (!feb || !mar) {
    return null;
  }

  return {
    fromMonth: FEB_2026,
    toMonth: MAR_2026,
    scope1FromTonnes: feb.scope1TonnesCo2e,
    scope1ToTonnes: mar.scope1TonnesCo2e,
    scope2FromTonnes: feb.scope2TonnesCo2e,
    scope2ToTonnes: mar.scope2TonnesCo2e,
    scope1ChangeLabel: formatPercentChange(feb.scope1TonnesCo2e, mar.scope1TonnesCo2e),
    scope2ChangeLabel: formatPercentChange(feb.scope2TonnesCo2e, mar.scope2TonnesCo2e),
    derivedFrom:
      "Derived from monthly Scope 1 and Scope 2 emissions (Feb 2026 → Mar 2026) using fixed emission factors.",
  };
}
