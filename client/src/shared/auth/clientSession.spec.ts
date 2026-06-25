import { describe, expect, it } from "vitest";
import {
  hasClientSession,
  isMockClientSession,
  shouldRedirectAuthenticatedGuest,
} from "@/shared/auth/clientSession";

const REAL_ACCESS = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1In0.sig";
const REAL_REFRESH = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1In0.refresh";

describe("clientSession", () => {
  it("treats refresh token as session root", () => {
    expect(
      hasClientSession({ accessToken: REAL_ACCESS, refreshToken: REAL_REFRESH }),
    ).toBe(true);
    expect(hasClientSession({ accessToken: REAL_ACCESS })).toBe(false);
    expect(hasClientSession({ refreshToken: REAL_REFRESH })).toBe(true);
  });

  it("rejects orphan access after logout-style clear", () => {
    expect(shouldRedirectAuthenticatedGuest({ accessToken: REAL_ACCESS })).toBe(false);
  });

  it("detects mock tokens", () => {
    expect(
      isMockClientSession({
        accessToken: "mock-jwt-token-for-dev",
        refreshToken: "mock-refresh-token-for-dev",
      }),
    ).toBe(true);
  });
});
