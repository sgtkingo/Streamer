import type { PlaybackTicketInput } from "../integrations/webshare-media-provider.js";

export interface PlaybackTicketRecord extends PlaybackTicketInput {
  readonly createdAt: string;
  readonly started: boolean;
}

export interface PlaybackTicketStore {
  issue(input: PlaybackTicketInput): string;
  get(grantId: string): PlaybackTicketRecord | null;
  markStarted(grantId: string): boolean;
  revoke(grantId: string): boolean;
  revokeActive(): void;
}

/**
 * Ephemeral single-playback ticket store. Direct provider URLs never reach
 * SQLite, logs, sync, discovery responses or Library records.
 */
export class InMemoryPlaybackTicketStore implements PlaybackTicketStore {
  #active: PlaybackTicketRecord | null = null;

  constructor(private readonly now: () => Date = () => new Date()) {}

  issue(input: PlaybackTicketInput): string {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(input.grantId)) {
      throw new Error("Playback grant id is invalid.");
    }
    const directUrl = new URL(input.directUrl);
    const loopback = ["127.0.0.1", "localhost", "::1"].includes(
      directUrl.hostname,
    );
    if (
      (directUrl.protocol !== "https:" && !loopback) ||
      directUrl.username !== "" ||
      directUrl.password !== ""
    ) {
      throw new Error(
        "Playback direct URL must be secure and credential-free.",
      );
    }
    if (Date.parse(input.expiresAt) <= this.now().getTime()) {
      throw new Error("Playback ticket must expire in the future.");
    }
    this.#active = {
      ...input,
      createdAt: this.now().toISOString(),
      started: false,
    };
    return `/api/v1/playback/grants/${encodeURIComponent(input.grantId)}`;
  }

  get(grantId: string): PlaybackTicketRecord | null {
    if (this.#active === null || this.#active.grantId !== grantId) return null;
    if (Date.parse(this.#active.expiresAt) <= this.now().getTime()) {
      this.#active = null;
      return null;
    }
    return { ...this.#active };
  }

  markStarted(grantId: string): boolean {
    const active = this.get(grantId);
    if (active === null || active.started) return false;
    // The initial grant is short lived; a started playback must survive a film.
    this.#active = {
      ...active,
      started: true,
      expiresAt: new Date(
        this.now().getTime() + 8 * 60 * 60 * 1000,
      ).toISOString(),
    };
    return true;
  }

  revoke(grantId: string): boolean {
    if (this.#active?.grantId !== grantId) return false;
    this.#active = null;
    return true;
  }

  revokeActive(): void {
    this.#active = null;
  }
}
