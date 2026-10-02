# Viewer profiles and account placeholders

StreamerAI has up to five local viewer profiles per installation. Profile
selection is a landing screen with five medallion slots. Choosing a profile
scopes Home, discovery, Library and History to its ID. Creating a profile does
not overwrite the original `default` viewer. A newly created profile opens
onboarding immediately; if setup is interrupted, selecting its medallion
resumes onboarding. On a fresh installation the first viewer sees onboarding
before the profile chooser. The profile record is stored in
the existing SQLite `profiles` table; playback-language and taste settings use
its `preferences_json` field, including a per-profile completion marker.

The avatar menu opens Settings, Preferences, My account and Statistics, plus
Log out / Switch profile. Here, **log out means leaving the active viewer and
returning to the chooser**. It is not a security boundary: authentication,
passwords and photo uploads are intentionally placeholders. Do not treat a
profile as an authenticated account or expose this service publicly on that
assumption.

Settings currently saves interface locale and playback language/subtitle
preferences per viewer. The player prefers the configured primary audio,
then secondary audio, then the first track. When automatic subtitles are
enabled it selects matching embedded text subtitles according to the chosen
audio track. External subtitle search and output-device selection are not
implemented yet and are labelled accordingly. Preferences saves genres and a
free-form taste prompt; injecting that prompt into the agent is future work.

The onboarding profile step uses the same playback-language controls. Running
onboarding again from Settings edits the selected profile and preserves its
separate taste prompt. Connection settings remain installation-wide.
