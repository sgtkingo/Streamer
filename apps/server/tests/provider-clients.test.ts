import { describe, expect, it } from "vitest";
import {
  TmdbApiClient,
  type ProviderFetch,
} from "../src/integrations/tmdb-api-client.js";
import { TmdbMetadataProvider } from "../src/integrations/tmdb-metadata-provider.js";
import {
  WebshareClient,
  WebshareResponseError,
  WEBSHARE_WST_SECRET_KEY,
} from "../src/integrations/webshare-client.js";
import { WebshareMediaProvider } from "../src/integrations/webshare-media-provider.js";
import {
  NonPersistentMemorySecretStore,
  TMDB_READ_TOKEN_SECRET_KEY,
} from "../src/index.js";

function response(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

describe("provider HTTP clients", () => {
  it("resolves the TMDB token at the boundary and never puts it in the URL", async () => {
    const secrets = new NonPersistentMemorySecretStore();
    const token = "sentinel-tmdb-token-never-in-url";
    await secrets.set(TMDB_READ_TOKEN_SECRET_KEY, token);
    let requestedUrl = "";
    let authorization = "";
    const fetch: ProviderFetch = async (url, init) => {
      requestedUrl = url;
      authorization = init.headers.authorization ?? "";
      return response(200, '{"page":1,"results":[]}');
    };
    const client = new TmdbApiClient({
      secretStore: secrets,
      fetch,
      baseUrl: "https://tmdb.test/3",
    });

    await client.searchMovie({
      query: "Arrival",
      year: 2016,
      language: "cs-CZ",
    });

    expect(requestedUrl).toContain("/search/movie");
    expect(requestedUrl).toContain("query=Arrival");
    expect(requestedUrl).not.toContain(token);
    expect(authorization).toBe(`Bearer ${token}`);
  });

  it("normalizes TMDB candidates with stable refs and source provenance", async () => {
    const secrets = new NonPersistentMemorySecretStore();
    await secrets.set(TMDB_READ_TOKEN_SECRET_KEY, "test-token");
    const client = new TmdbApiClient({
      secretStore: secrets,
      fetch: async () =>
        response(
          200,
          JSON.stringify({
            results: [
              {
                id: 329865,
                title: "Arrival",
                original_title: "Arrival",
                release_date: "2016-11-10",
              },
            ],
          }),
        ),
      baseUrl: "https://tmdb.test/3",
    });
    const provider = new TmdbMetadataProvider({
      client,
      now: () => new Date("2026-09-28T12:00:00.000Z"),
    });

    const result = await provider.search(
      {
        query: "Arrival",
        kind: "movie",
        year: 2016,
        person: null,
        locale: "cs",
        limit: 5,
      },
      {
        requestId: "request-0001",
        profileId: "default",
        locale: "cs",
        deadlineAt: "2099-01-01T00:00:00.000Z",
        secretRef: null,
      },
    );

    expect(result).toMatchObject([
      {
        ref: { providerId: "tmdb", externalId: "329865", entityType: "movie" },
        title: "Arrival",
        year: 2016,
        provenance: { providerId: "tmdb", validationState: "derived" },
      },
    ]);
  });

  it("rechecks Webshare restrictions and returns only a same-origin playback ticket", async () => {
    const secrets = new NonPersistentMemorySecretStore();
    await secrets.set(WEBSHARE_WST_SECRET_KEY, "test-wst");
    const fetch: ProviderFetch = async (url) => {
      if (url.includes("/file_info/")) {
        return response(
          200,
          "<response><status>OK</status><name>Arrival.2016.1080p.x264.mkv</name><type>video</type><size>123</size><downloadable>1</downloadable><password>0</password><copyrighted>0</copyrighted></response>",
        );
      }
      return response(
        200,
        "<response><status>OK</status><link>https://cdn.webshare.cz/secret-direct-link</link></response>",
      );
    };
    const client = new WebshareClient({
      secretStore: secrets,
      fetch,
      baseUrl: "https://webshare.test/api",
    });
    let capturedDirectUrl = "";
    const provider = new WebshareMediaProvider({
      client,
      issuePlaybackTicket: (input) => {
        capturedDirectUrl = input.directUrl;
        return `/api/v1/playback/grants/${input.grantId}`;
      },
      now: () => new Date("2026-09-28T12:00:00.000Z"),
    });
    const grant = await provider.createPlayback(
      {
        profileId: "default",
        titleId: "sai:title:arrival",
        variant: {
          providerId: "webshare",
          candidateId: "file-1",
          variantId: "file-1",
        },
        startPositionSeconds: 0,
      },
      {
        requestId: "request-0001",
        profileId: "default",
        locale: "cs",
        deadlineAt: "2099-01-01T00:00:00.000Z",
        secretRef: null,
      },
    );

    expect(capturedDirectUrl).toBe(
      "https://cdn.webshare.cz/secret-direct-link",
    );
    expect(grant.url).toMatch(/^\/api\/v1\/playback\/grants\//);
    expect(grant.url).not.toContain("secret-direct-link");
  });

  it("rejects TMDB calls when the integration is not configured", async () => {
    const client = new TmdbApiClient({
      secretStore: new NonPersistentMemorySecretStore(),
      fetch: async () => response(200, "{}"),
      baseUrl: "https://tmdb.test/3",
    });

    await expect(client.getMovie(1)).rejects.toMatchObject({
      providerId: "tmdb",
      kind: "not-configured",
    });
  });

  it("parses bounded Webshare video results and keeps WST in a header", async () => {
    const secrets = new NonPersistentMemorySecretStore();
    const token = "sentinel-webshare-wst";
    await secrets.set(WEBSHARE_WST_SECRET_KEY, token);
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetch: ProviderFetch = async (url, init) => {
      calls.push({ url, headers: init.headers });
      return response(
        200,
        "<response><status>OK</status><total>1</total><file><ident>abc</ident><name>Arrival.2016.1080p.mkv</name><type>video</type><size>123</size><password>0</password><positive_votes>9</positive_votes><negative_votes>1</negative_votes></file></response>",
      );
    };
    const client = new WebshareClient({
      secretStore: secrets,
      fetch,
      baseUrl: "https://webshare.test/api",
    });

    const result = await client.search({ query: "Arrival 2016" });

    expect(result).toMatchObject({
      total: 1,
      items: [{ ident: "abc", name: "Arrival.2016.1080p.mkv", size: 123 }],
    });
    expect(calls[0]?.url).not.toContain(token);
    expect(calls[0]?.headers.wst).toBe(token);
  });

  it("treats a Webshare FATAL payload inside HTTP 200 as a provider error", async () => {
    const client = new WebshareClient({
      secretStore: new NonPersistentMemorySecretStore(),
      fetch: async () =>
        response(
          200,
          "<response><status>FATAL</status><code>SEARCH_FATAL_1</code><message>Failure</message></response>",
        ),
      baseUrl: "https://webshare.test/api",
    });

    await expect(client.search({ query: "test" })).rejects.toBeInstanceOf(
      WebshareResponseError,
    );
  });

  it("never returns an unallowlisted Webshare playback URL", async () => {
    const secrets = new NonPersistentMemorySecretStore();
    await secrets.set(WEBSHARE_WST_SECRET_KEY, "test-wst");
    const client = new WebshareClient({
      secretStore: secrets,
      fetch: async () =>
        response(
          200,
          "<response><status>OK</status><link>https://evil.example/video</link></response>",
        ),
      baseUrl: "https://webshare.test/api",
    });

    await expect(client.createVideoLink("abc")).rejects.toMatchObject({
      providerId: "webshare",
      kind: "invalid-response",
    });
  });
});
