import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { StreamerApi } from './api/client';

function createApi(): StreamerApi {
  return {
    getSetupStatus: vi.fn().mockResolvedValue({ tmdb: 'not-configured', localAi: 'not-configured' }),
    connectTmdb: vi.fn().mockResolvedValue({
      ok: true,
      integrationId: 'tmdb',
      status: 'connected',
      messageCode: 'CONNECTED',
      persistence: 'secure-local'
    }),
    detectLocalAi: vi.fn().mockResolvedValue({ ok: true, message: 'Ready', runtime: 'Ollama', model: 'qwen3.5:4b' }),
    completeSetup: vi.fn().mockResolvedValue(undefined)
  };
}

describe('onboarding', () => {
  it('guides a viewer through all five steps and opens the library', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<App api={api} forceOnboarding />);

    expect(screen.getByRole('heading', { name: /your cinema/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start setup/i }));

    await user.type(screen.getByLabelText(/display name/i), 'Alex');
    await user.click(screen.getByLabelText('Sci-fi'));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByRole('heading', { name: /connect once/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^continue/i }));

    expect(screen.getByRole('heading', { name: /a curator/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('qwen3.5:4b')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^continue/i }));

    expect(screen.getByRole('heading', { name: /welcome home, alex/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enter streamer/i }));

    expect(await screen.findByRole('heading', { name: /good evening, alex/i })).toBeInTheDocument();
    expect(api.completeSetup).toHaveBeenCalledWith(expect.objectContaining({
      profile: expect.objectContaining({ name: 'Alex', preferences: ['Sci-fi'] }),
      localAiEnabled: true
    }));
  });

  it('clears a TMDB token after connecting and never renders it in status UI', async () => {
    const user = userEvent.setup();
    const api = createApi();
    render(<App api={api} forceOnboarding />);

    await user.click(screen.getByRole('button', { name: /start setup/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Alex');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    const secret = 'secret-read-access-token-123';
    const tokenInput = screen.getByLabelText(/tmdb read access token/i);
    await user.type(tokenInput, secret);
    await user.click(screen.getByRole('button', { name: /verify and connect/i }));

    await waitFor(() => expect(screen.getByText(/connection verified/i)).toBeInTheDocument());
    expect(api.connectTmdb).toHaveBeenCalledWith(secret);
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(within(screen.getByRole('status')).queryByText(secret)).not.toBeInTheDocument();
  });

  it('clearly identifies development-only memory storage', async () => {
    const user = userEvent.setup();
    const api = createApi();
    vi.mocked(api.connectTmdb).mockResolvedValue({
      ok: true,
      integrationId: 'tmdb',
      status: 'connected',
      messageCode: 'CONNECTED',
      persistence: 'memory'
    });
    render(<App api={api} forceOnboarding />);

    await user.click(screen.getByRole('button', { name: /start setup/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Alex');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.type(screen.getByLabelText(/tmdb read access token/i), 'development-token-long-enough');
    await user.click(screen.getByRole('button', { name: /verify and connect/i }));

    expect(await screen.findByText(/held in memory only/i)).toBeInTheDocument();
  });
});
