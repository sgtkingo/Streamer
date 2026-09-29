# First Docker flight

The first production-like local flight completed on 2026-09-29 using Docker
Desktop 4.93.0, Docker Engine 29.8.1 and Compose 5.5.1 on Windows.

## Result

| Check | Result |
| --- | --- |
| Compose configuration and image builds | Pass |
| Private API container health | Pass |
| PWA and same-origin API gateway on `http://localhost:8080` | Pass |
| Persistent SQLite/data volume | Pass |
| Encrypted-file secret backend | Pass |
| Host-native Ollama bridge | Pass |
| Exact `qwen3.5:4b` capability preflight | Pass |
| Desktop and 390 px mobile layout | Pass |

The Ollama flight reported version `0.34.4`, 4.7B Q4_K_M model metadata, a
4096-token context, working structured output and tool calling, and
3,128,038,521 bytes resident in VRAM. The complete cold container preflight
took about 10.49 seconds.

The initial server image exposed a real packaging defect: pnpm had blocked the
native `better-sqlite3` install script. The root package manifest now explicitly
allows only the required `better-sqlite3` and `esbuild` build steps. A clean
rebuild subsequently became healthy and passed the API flight.

## Security observations

The application master key is outside the persistent application volume and
the server receives it as a read-only Compose secret. Docker Desktop may report
Windows bind-mounted files as mode `0777` inside its Linux VM; that display is
not a faithful representation of the Windows ACL. Access must therefore be
controlled on the host as described in [`DEPLOYMENT.md`](DEPLOYMENT.md), and the
key must never be committed or copied into logs.

Only the web gateway publishes a host port. The API and Ollama remain
unpublished by Compose.

## Live discovery follow-up

After the user completed guided setup, a second flight exercised the encrypted
TMDB and Webshare connections plus host Ollama without exposing credentials.
The production coordinator returned live results for an autumn/Sandra Bullock
request: TMDB verified the named person's combined credits and canonical
metadata, while Webshare confirmed playable variants and normalized formats
for `The Blind Side`, `Miss Congeniality`, `Speed` and `The Lake House`.

The live flight exposed two adapter defects that are now regression-tested:

- the free-form agent reply could mention candidates before provider
  validation, so the public reply is now generated only from validated groups;
- Webshare `file_info` uses `<available>` and extension values such as `mkv`, as
  documented by the [official API reference](https://webshare.cz/apidoc/).

Playback itself was deliberately not started during the automated flight,
because a successful start correctly mutates the user's Library and History.
Range, seeking and ticket-expiry behavior remain a separate acceptance gate.

## Reproduce

```powershell
node scripts/generate-master-key.mjs
docker compose up --build --detach
docker compose ps
```

Open `http://localhost:8080`, run the guided setup and enter credentials only
there. Preserve both the `streamerai_data` volume and the master-key file in
separate backups.
