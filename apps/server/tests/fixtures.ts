import type { FetchLike, FetchResponseLike } from "../src/index.js";

export const TEST_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.test-read-access-token.signature";

export function tmdbConfiguration() {
  return {
    images: {
      secure_base_url: "https://image.tmdb.org/t/p/",
      poster_sizes: ["w342", "w500"],
      backdrop_sizes: ["w780", "original"],
    },
    change_keys: ["adult", "title"],
  };
}

export function response(status: number, payload: unknown): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

export function fetchReturning(status: number, payload: unknown): FetchLike {
  return async () => response(status, payload);
}
