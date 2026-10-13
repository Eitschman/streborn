# Package managers: winget, Homebrew, .deb and Flathub

The desktop app is published to these package managers on top of the GitHub
release and st-reborn.de:

| Platform | Package manager | What users type |
|---|---|---|
| Windows | winget (the Windows Package Manager) | `winget install JRpersonal.STReborn` |
| macOS | Homebrew, own tap | `brew install --cask jrpersonal/tap/st-reborn` |
| Debian, Ubuntu, Mint, Raspberry Pi OS | `.deb` on the release | double click, or `sudo apt install ./STR-Linux-x64.deb` |
| Any Linux | Flathub (once accepted, see below) | `flatpak install flathub de.st_reborn.STReborn` |

After the one-time setup below, every real release updates both by itself
(job `package-managers` in `.github/workflows/release.yml`). A preview release
never reaches either. Each half skips with a notice while its token is
missing, and a failure there never turns the release red.

## Why an own tap and not homebrew/cask

Homebrew's own cask collection only takes a cask submitted by the project's
owner once the repository has at least 225 stars, 90 forks or 90 watchers
(docs.brew.sh/Package-Acceptance-Policy). STR is below that, so it ships in its
own tap, `JRpersonal/homebrew-tap`. Users add nothing by hand: the
`jrpersonal/tap/` prefix in the install command taps it automatically.

## One-time setup

### 1. Homebrew tap

1. Create a new **public** repository `JRpersonal/homebrew-tap` (the name must
   start with `homebrew-`). No template, no README needed.
2. Copy `packaging/homebrew/Casks/st-reborn.rb` from this repository into it
   as `Casks/st-reborn.rb` and commit it on `main`.
3. Create a fine-grained token at
   https://github.com/settings/personal-access-tokens/new:
   - Name: `STR release -> homebrew-tap`
   - Repository access: only `JRpersonal/homebrew-tap`
   - Repository permissions: **Contents: Read and write** (Metadata read-only
     is added automatically), nothing else
   - Expiration: one year
4. Store it in this repository (`JRpersonal/streborn`) under Settings > Secrets
   and variables > Actions as **`HOMEBREW_TAP_TOKEN`**.

Check on a Mac: `brew install --cask jrpersonal/tap/st-reborn`.

### 2. winget

winget only accepts updates for a package that already exists in
`microsoft/winget-pkgs`, so the first version is submitted by hand.

1. Fork https://github.com/microsoft/winget-pkgs to your account
   (`JRpersonal/winget-pkgs`). The release workflow opens its pull requests
   from this fork.
2. Submit v1.0.2 from the prepared manifests in
   `packaging/winget/manifests/j/JRpersonal/STReborn/1.0.2/`:
   - copy that folder to the same path in your fork, on a new branch,
   - `winget validate --manifest <path to the 1.0.2 folder>` must succeed,
   - optional local test: `winget install --manifest <path>` (needs
     `winget settings --enable LocalManifestFiles` once, as admin),
   - open the pull request against `microsoft/winget-pkgs` and wait until the
     maintainers merge it (usually a few days; their bot runs the checks).
3. Create a **classic** token at https://github.com/settings/tokens/new
   (komac needs `public_repo` to push to your fork and open the PR; the
   fine-grained kind cannot open pull requests on repositories you do not own):
   - Note: `STR release -> winget-pkgs`
   - Scope: **`public_repo`** only
   - Expiration: one year
4. Store it in this repository as **`WINGET_TOKEN`**.

From then on each release opens a pull request in `microsoft/winget-pkgs`
with the new version; the winget maintainers merge it.

## What the release job does

- **winget**: downloads komac 2.16.0 (checked against its recorded SHA256)
  and runs `komac update JRpersonal.STReborn --version X.Y.Z --urls
  .../releases/download/vX.Y.Z/STR-Windows.exe --submit`.
- **Homebrew**: reads the SHA256 of `STR-macOS.dmg` from the release's
  `SHA256SUMS`, sets `version` and `sha256` in `Casks/st-reborn.rb` of the tap
  and pushes the commit.

## Things worth knowing

- **winget installs the portable exe**: it lands in
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\JRpersonal.STReborn_<source>\`
  (machine scope: `%ProgramFiles%\WinGet\Packages\...`) and is started with
  the command `streborn`. winget itself does not create a Start menu entry for
  a portable app, so the app creates `ST Reborn.lnk` in the user's Start menu
  on its first start from that folder, once: an entry the user deletes stays
  deleted (flag `wingetStartMenuShortcut` in `app-state.json`).
- **`winget uninstall` leaves that Start menu entry behind.** winget removes
  only the files it installed; the shortcut then points at a missing exe and
  has to be deleted by hand
  (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\ST Reborn.lnk`).
- **A winget install updates through winget.** The app recognises the
  package folder and never swaps its own exe there, because winget's version
  record would stay on the old release. The update button runs
  `winget upgrade --id JRpersonal.STReborn --exact --silent
  --accept-source-agreements --accept-package-agreements` in a hidden helper
  after the app quits, then starts the app again. It first asks winget whether
  it already offers the new version: the winget-pkgs pull request is usually
  merged a few days after a release, and until then the banner says so and
  shows the command instead of quitting for nothing. If winget is missing or
  fails, the banner shows the same command to run by hand. A copy installed
  with `--location` somewhere else is not recognised and updates itself as
  before.
- **The Homebrew app also updates itself.** The cask carries `auto_updates
  true`, so `brew upgrade` leaves an app alone that already updated itself.
- The tokens expire after a year. GitHub mails a reminder; renew them and
  replace the two secrets.

## Linux .deb

Every release carries `STR-Linux-x64.deb` and `STR-Linux-arm64.deb`, built by
`.github/scripts/build-deb.sh` from the same binary as the tar.gz, installed
once on the build runner and checked for missing libraries before it is
published. apt pulls in GTK, WebKitGTK 4.1 and libsoup 3. Nothing needs
setting up.

A copy the .deb installed updates through the next .deb: the app recognises
`/usr/bin/st-reborn` in dpkg's file list (`desktop-app/linuxpkg.go`),
downloads the new .deb from the release manifest (`desktop_linux_deb`,
`desktop_linux_arm64_deb`) and opens it in the system's package installer,
which asks for the password and upgrades the package. It never swaps the
binary behind dpkg's back. There is no apt repository, so `apt upgrade` does
not see new versions; the in-app banner is the update path.

## Flathub

The manifest, desktop entry and metainfo live in `packaging/flatpak/`. The
`flatpak` workflow builds them on every change the way Flathub does, runs
Flathub's linter and checks the app's libraries against the GNOME runtime;
its artifact `st-reborn.flatpak` installs with
`flatpak install --user st-reborn.flatpak` for a test.

The manifest repackages the release tar.gz instead of building from source,
because the app and the speaker agent it embeds must share one build stamp
(CLAUDE.md, "Build version stamping"). That is the first thing to explain in
the submission.

A Flathub copy never downloads its own update: the banner names the new
version and points to the software center, which installs the build Flathub
made from the release.

### One-time submission (by hand, not automated)

1. **Domain verification.** The app ID `de.st_reborn.STReborn` is derived
   from st-reborn.de (the hyphen becomes an underscore). After the app is
   accepted, Flathub's developer portal hands out a token that goes into
   `https://st-reborn.de/.well-known/org.flathub.VerifiedApps.txt` (website
   repository) to get the verified checkmark.
2. **Screenshots.** The metainfo points at `docs/screenshots/en/` through
   raw.githubusercontent.com URLs pinned to a commit, so they never move.
   Flathub mirrors them at build time. Newer screenshots: commit them, then
   bump the commit in the URLs.
3. **aarch64.** Uncomment the arm64 source in the manifest with the first
   release that carries `STR-Linux-arm64.tar.gz`.
4. Fork https://github.com/flathub/flathub, branch off `new-pr`, add the
   three files from `packaging/flatpak/` plus the icons (copy them next to the
   manifest and drop the `../linux/icons/` prefix), and open the pull request
   against `new-pr`. Flathub's reviewers build it and comment.
5. After the merge Flathub creates `flathub/de.st_reborn.STReborn`. From then
   on its external data checker opens a pull request there for every new
   release (`x-checker-data` in the manifest); merging it publishes the
   update. Add the new `<release>` line to the metainfo there as well.

Two finish-args a reviewer may ask about: `--own-name` for Wails' single
instance bus name (without it a second start opens a second window), and
`/media` plus `/run/media` for the USB stick fallback install.
