import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createAppLogger } from "../src/index.js";
import { TEST_TOKEN } from "./fixtures.js";

describe("application logger", () => {
  it("redacts known secret fields, query strings and error messages", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createAppLogger({ destination });

    logger.info(
      {
        req: {
          method: "POST",
          url: `/api/v1/integrations/tmdb/check?token=${TEST_TOKEN}`,
          headers: { authorization: `Bearer ${TEST_TOKEN}` },
        },
        body: { readAccessToken: TEST_TOKEN },
        token: TEST_TOKEN,
        err: new Error(`Provider rejected ${TEST_TOKEN}`),
      },
      "redaction check",
    );

    expect(output).not.toContain(TEST_TOKEN);
    expect(output).not.toContain("Provider rejected");
    expect(output).not.toContain("?token=");
    expect(output).toContain("[REDACTED]");
  });
});
