import { describe, expect, it } from "vitest";
import { errorMessage } from "./format";

describe("Mail Breeze error messages", () => {
  it("keeps the actionable message without RPC transport metadata", () => {
    expect(
      errorMessage(
        new Error(
          "Request failed: Outlook ist noch nicht eingerichtet. requestType=plugin.rpc.invoke.request code=handler_error",
        ),
      ),
    ).toBe("Outlook ist noch nicht eingerichtet.");
    expect(
      errorMessage(
        new Error("Request failed: Verbindung unterbrochen. requestType=plugin.rpc.invoke.request"),
      ),
    ).toBe("Verbindung unterbrochen.");
  });

  it("preserves ordinary errors and non-error failures", () => {
    expect(errorMessage(new Error("Microsoft konnte nicht erreicht werden (503)."))).toBe(
      "Microsoft konnte nicht erreicht werden (503).",
    );
    expect(errorMessage("Anmeldecode abgelaufen.")).toBe("Anmeldecode abgelaufen.");
  });
});
