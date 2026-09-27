import { z } from "zod";

export const SUPPORTED_LOCALES = ["en", "cs", "de"] as const;

export const SupportedLocaleSchema = z.enum(SUPPORTED_LOCALES);

export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>;

/**
 * Public copy is intentionally complete in every supported language. This keeps
 * provider-specific text out of UI components and prevents an onboarding flow
 * from silently falling back to an untranslated technical error.
 */
export const LocalizedTextSchema = z
  .object({
    en: z.string().trim().min(1),
    cs: z.string().trim().min(1),
    de: z.string().trim().min(1),
  })
  .strict();

export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
