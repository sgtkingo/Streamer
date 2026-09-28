import type { IntegrationConnectionStatus } from "../stores/integration-state-store.js";

export interface IntegrationCatalogItem {
  id: "tmdb";
  name: string;
  description: string;
  category: "metadata";
  required: boolean;
  status: IntegrationConnectionStatus;
  configured: boolean;
  setup: {
    credentialType: "api_read_access_token";
    documentationUrl: string;
    automatedCheck: boolean;
    steps: string[];
  };
}

export function tmdbCatalogItem(
  status: IntegrationConnectionStatus,
  configured: boolean,
): IntegrationCatalogItem {
  return {
    id: "tmdb",
    name: "The Movie Database (TMDB)",
    description:
      "Primary source for titles, artwork, release dates, cast and discovery.",
    category: "metadata",
    required: true,
    status,
    configured,
    setup: {
      credentialType: "api_read_access_token",
      documentationUrl: "https://developer.themoviedb.org/docs/getting-started",
      automatedCheck: true,
      steps: [
        "Create or sign in to a TMDB account.",
        "Open API settings and copy the API Read Access Token.",
        "Paste it in StreamerAI; the app verifies it before saving.",
      ],
    },
  };
}
