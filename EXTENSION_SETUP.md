# VaultX Browser Extension — Setup Guide

The VaultX extension works on **Chrome, Edge, Brave, and any Chromium-based browser**.
It is not yet on the Chrome Web Store, so installation takes about 60 seconds manually.

---

## Step 1 — Download

1. Go to [github.com/jayesh-thar/vaultx/releases](https://github.com/jayesh-thar/vaultx/releases)
2. Under the latest release, click **Assets** and download `vaultx-extension-vX.X.X.zip`
3. Unzip it — you'll get a folder containing `manifest.json` and other files
4. Keep this folder somewhere permanent (Desktop, Documents) — don't delete it after installing

---

## Step 2 — Load in your browser

### Chrome / Brave

1. Open `chrome://extensions` in the address bar
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked**
4. Select the unzipped folder (the one containing `manifest.json`)

### Microsoft Edge

1. Open `edge://extensions`
2. Toggle **Developer mode** ON (bottom-left sidebar)
3. Click **Load unpacked**
4. Select the unzipped folder

> **Edge shows a "Developer mode extensions" warning every time you start the browser.**
> This is normal for sideloaded extensions — Microsoft shows this on all non-Store extensions.
> Click "Don't show again" if available, or dismiss it each time. This warning disappears once
> the extension is published to the Edge Add-ons store.

---

## Step 3 — Pin it

Click the puzzle-piece icon in the toolbar → find **VaultX** → click the pin.
This keeps it one click away.

---

## Step 4 — Sign in

1. Click the VaultX icon in your toolbar
2. Log in with your email and master password
3. Don't have an account? Click **Create account** to register on the web app first

---

## What it does

**Autofill** — When you visit a site where you have a saved login, a small
"🔐 VaultX — Autofill available" panel appears. Click an entry to fill the form.
You can also open the popup and click **Fill** from there.

**Auto-save** — When you fill out a login or register on any site, VaultX
automatically detects the form and saves your credentials. You'll see a green
"✓ Saved" toast at the bottom-right. Click **Cancel** within 5 seconds if you
don't want it saved.

**Auto-update** — If you log in with credentials that already exist in your vault
and the password hasn't changed, nothing happens (silent). If the password changed,
VaultX shows "✓ Updated" and saves the new one.

**Card PIN** — Payment cards are protected by a separate 4–8 digit PIN.
Set it up in Settings → Security after saving your first card.

**Session** — Your login persists for 15 days. After that you'll be asked to
re-enter your master password. You'll get a notification 24 hours before expiry.

---

## Updating to a new version

1. Download the new zip from [Releases](https://github.com/jayesh-thar/vaultx/releases)
2. Unzip, replacing your old folder
3. Go to `chrome://extensions` (or `edge://extensions`)
4. Click the **↻ refresh** icon on the VaultX card
5. Your saved vault data is unaffected — it lives on the server, not in the extension

---

## Troubleshooting

**"Manifest file is missing"** — You selected the wrong folder. Select the folder
that directly contains `manifest.json`, not a parent folder or the zip itself.

**Autofill doesn't appear** — The extension only shows autofill when a login form
is actually visible on the page. Try opening the popup and clicking **Fill** manually.

**"Network error" or can't log in** — The free-tier backend may be sleeping.
Wait 10–15 seconds and try again.

**Forgot master password** — Use the web app's [Forgot Password](https://vaultx-jayesh.vercel.app/forgot-password) page.
Upload your recovery key file to recover your vault intact, or use email OTP to reset
(note: OTP reset clears your vault — it's zero-knowledge).

---

## Questions or bugs?

[Open an issue on GitHub](https://github.com/jayesh-thar/vaultx/issues)
