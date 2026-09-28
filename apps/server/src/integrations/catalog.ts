import type {
  IntegrationDescriptor,
  IntegrationId,
} from "@streamer-ai/contracts";
import type { IntegrationConnectionStatus } from "../stores/integration-state-store.js";

export interface IntegrationCatalogItem {
  id: IntegrationId;
  name: string;
  description: string;
  category: IntegrationDescriptor["kind"];
  required: boolean;
  status: IntegrationConnectionStatus;
  configured: boolean;
  setup: {
    mode: IntegrationDescriptor["setupMode"];
    documentationUrl: string | null;
    automatedCheck: boolean;
    canAutoDetect: boolean;
    supportsDisconnect: boolean;
  };
}

/** Public UI model generated from the shared registry, never provider secrets. */
export function integrationCatalogItem(
  descriptor: IntegrationDescriptor,
  status: IntegrationConnectionStatus,
  configured: boolean,
): IntegrationCatalogItem {
  return {
    id: descriptor.id,
    name: descriptor.name.en,
    description: descriptor.description.en,
    category: descriptor.kind,
    required: !descriptor.optional,
    status,
    configured,
    setup: {
      mode: descriptor.setupMode,
      documentationUrl: descriptor.documentationUrl ?? null,
      automatedCheck: descriptor.automatedChecks,
      canAutoDetect: descriptor.canAutoDetect,
      supportsDisconnect: descriptor.supportsDisconnect,
    },
  };
}
