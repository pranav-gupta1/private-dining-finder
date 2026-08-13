import { describe, expect, it } from "vitest";

import type { Evidence, SourceKind } from "@/lib/types";
import { resolveFieldTrust, trustForEvidence, weakest } from "@/lib/trust/trust";

const NOW = new Date("2026-08-13T12:00:00Z");

function evidence(
  sourceKind: SourceKind,
  observedAt: string,
  overrides: Partial<Evidence> = {},
): Evidence {
  return {
    field: "space.capacity",
    spaceId: null,
    menuId: null,
    sourceKind,
    sourceUrl: "https://example.com/private-events",
    sourceTitle: null,
    snippet: null,
    observedAt,
    ...overrides,
  };
}

describe("trustForEvidence", () => {
  it("treats first-party sources as verified", () => {
    expect(trustForEvidence(evidence("venue_site", "2026-08-01"), NOW)).toBe("verified");
    expect(trustForEvidence(evidence("venue_document", "2026-08-01"), NOW)).toBe("verified");
    expect(trustForEvidence(evidence("phone_call", "2026-08-01"), NOW)).toBe("verified");
  });

  it("treats third-party sources as likely", () => {
    expect(trustForEvidence(evidence("booking_platform", "2026-08-01"), NOW)).toBe("likely");
    expect(trustForEvidence(evidence("directory", "2026-08-01"), NOW)).toBe("likely");
    expect(trustForEvidence(evidence("editorial", "2026-08-01"), NOW)).toBe("likely");
  });

  it("never lets our own estimates present as anything but unverified", () => {
    expect(trustForEvidence(evidence("inferred", "2026-08-13"), NOW)).toBe("unverified");
  });

  it("downgrades a first-party source once it is over 18 months old", () => {
    // A capacity the venue published two years ago is a weaker claim than the
    // same capacity published last month, even though the source is identical.
    expect(trustForEvidence(evidence("venue_site", "2024-09-01"), NOW)).toBe("likely");
  });

  it("downgrades twice past three years", () => {
    expect(trustForEvidence(evidence("venue_site", "2022-01-01"), NOW)).toBe("unverified");
    expect(trustForEvidence(evidence("booking_platform", "2022-01-01"), NOW)).toBe("unverified");
  });

  it("does not downgrade below unverified", () => {
    expect(trustForEvidence(evidence("inferred", "2015-01-01"), NOW)).toBe("unverified");
  });
});

describe("resolveFieldTrust", () => {
  it("returns unverified with a call-them reason when nothing is published", () => {
    const result = resolveFieldTrust([], "space.capacity", NOW);
    expect(result.level).toBe("unverified");
    expect(result.reason).toMatch(/confirm with the venue/i);
    expect(result.best).toBeNull();
  });

  it("takes the strongest source rather than averaging", () => {
    const result = resolveFieldTrust(
      [
        evidence("directory", "2026-08-01"),
        evidence("venue_site", "2026-08-01"),
        evidence("inferred", "2026-08-01"),
      ],
      "space.capacity",
      NOW,
    );
    // A first-party number is not made less true by a directory disagreeing.
    expect(result.level).toBe("verified");
    expect(result.best?.sourceKind).toBe("venue_site");
  });

  it("promotes to verified when two independent third parties agree", () => {
    const result = resolveFieldTrust(
      [
        evidence("booking_platform", "2026-08-01", { sourceUrl: "https://thevendry.com/x" }),
        evidence("directory", "2026-08-01", { sourceUrl: "https://www.cvent.com/y" }),
      ],
      "space.capacity",
      NOW,
    );
    expect(result.level).toBe("verified");
    expect(result.reason).toMatch(/two independent listings/i);
  });

  it("does not promote when both listings come from the same host", () => {
    const result = resolveFieldTrust(
      [
        evidence("booking_platform", "2026-08-01", { sourceUrl: "https://tagvenue.com/a" }),
        evidence("booking_platform", "2026-08-01", { sourceUrl: "https://tagvenue.com/b" }),
      ],
      "space.capacity",
      NOW,
    );
    // Two pages of the same aggregator are one source, not two.
    expect(result.level).toBe("likely");
  });

  it("ignores evidence for other fields", () => {
    const result = resolveFieldTrust(
      [evidence("venue_site", "2026-08-01", { field: "venue.contact" })],
      "space.capacity",
      NOW,
    );
    expect(result.level).toBe("unverified");
  });

  it("explains the staleness penalty in the reason", () => {
    const result = resolveFieldTrust(
      [evidence("venue_site", "2024-09-01")],
      "space.capacity",
      NOW,
    );
    expect(result.level).toBe("likely");
    expect(result.reason).toMatch(/18 months/);
  });
});

describe("weakest", () => {
  it("picks the least trustworthy label", () => {
    expect(weakest("verified", "likely")).toBe("likely");
    expect(weakest("verified", "verified")).toBe("verified");
    expect(weakest("likely", "unverified", "verified")).toBe("unverified");
  });

  it("defaults to unverified with no input", () => {
    expect(weakest()).toBe("unverified");
  });
});
