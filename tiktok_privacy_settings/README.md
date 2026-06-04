# TikTok Bulk Privacy Manager

Automate changing multiple TikTok videos to private using browser automation. No API keys, no credential storage — just you, Playwright, and a lot of clicking you don't have to do.

---

## What This Does

- Opens a real browser with a persistent profile (avoids bot detection)
- You log in to TikTok manually once — session is saved in the browser profile
- Scrapes your profile for all video URLs
- Opens each video and changes privacy to "Only you" (Private)
- Includes safety features: preview mode, confirmation prompts, rate limiting

---

## Prerequisites

- **Python 3.8+** ([download here](https://www.python.org/downloads/))
- **pip** (comes with Python)
- A TikTok account with videos you want to make private

---

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Install Chromium browser (one-time setup)
playwright install chromium
```

---

## Usage

### Basic Command Structure

```bash
python tiktok_make_private.py <username> [options]
```

Replace `<username>` with your TikTok username (without the `@`).

### Examples

**Preview mode** (see what will change without making any changes):
```bash
python tiktok_make_private.py your_username --preview
```

**Test with 3 videos first**:
```bash
python tiktok_make_private.py your_username --max=3
```

**Full run** (you'll be asked to confirm before changes are made):
```bash
python tiktok_make_private.py your_username
```

**Custom delay between videos** (default is 4.5 seconds):
```bash
python tiktok_make_private.py your_username --delay=6000
```

**Attach to an already-open Chrome browser** (best for avoiding detection):
```bash
python tiktok_make_private.py your_username --attach
```

---

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `<username>` | Your TikTok @username (without the @) | — |
| `--preview` | Show list of videos without making changes | off |
| `--max N` | Only process first N videos | all videos |
| `--delay MS` | Wait time between videos in milliseconds | 4500 (4.5s) |
| `--attach` | Attach to an already-running Chrome with remote debugging enabled | off |
| `--cdp-port N` | CDP port to use with `--attach` | 9222 |
| `--chrome` | Launch system Google Chrome instead of Playwright's Chromium | off |

---

## How It Works

### First Run (Manual Login)
1. Script opens a Chromium window with a **persistent browser profile**
2. TikTok opens — log in manually (SMS code, email, whatever TikTok requires)
3. Press ENTER in the terminal when fully logged in
4. Future runs reuse the same browser profile — no re-login needed

### Why Persistent Profile?
A persistent profile stores cookies, localStorage, and browser fingerprint data between runs. TikTok sees it as a real returning browser, not a fresh automation instance — significantly reducing bot detection.

The profile is saved to:
```
~/.tiktok_browser_profile/
```

### Subsequent Runs
1. Script loads the saved browser profile (already logged in)
2. Navigates to your profile
3. Scrolls to load all videos
4. Shows you the list and asks for confirmation
5. Opens each video → clicks Edit → selects "Only you" → saves
6. Waits between videos to avoid rate limiting

---

## Avoiding Bot Detection

This script uses several techniques to appear human to TikTok:

- **Persistent browser profile** — same fingerprint, cookies, and history every run
- **Automation flag hidden** — disables the `navigator.webdriver` property TikTok checks
- **Manual login** — you log in yourself; the script never touches your password
- **Rate limiting** — configurable delay between videos (default 4.5s)

### Using `--attach` (Most Human-Looking Option)

For maximum stealth, attach to your real Chrome browser:

1. Quit Chrome completely
2. Relaunch it with remote debugging:
   ```bash
   open -a "Google Chrome" --args --remote-debugging-port=9222
   ```
3. Log into TikTok in that window as normal
4. Run the script:
   ```bash
   python tiktok_make_private.py your_username --attach
   ```

This reuses your real Chrome session, fingerprint, and cookies — indistinguishable from normal browsing.

---

## Safety Features

### 1. Preview Mode
```bash
--preview
```
- Shows you exactly which videos will be affected
- Makes **zero changes** to your account
- Use this first to verify the script found the right videos

### 2. Confirmation Prompt
- After collecting videos, script asks: "Proceed? (yes/no)"
- You must type `yes` or `y` to continue
- Anything else aborts with no changes

### 3. Rate Limiting
- Default 4.5-second delay between videos
- Configurable via `--delay` flag
- Increase if TikTok starts rate limiting: `--delay=8000`

### 4. No Credential Storage
- Script never touches your password
- You log in through TikTok's real UI
- Session stored in your local browser profile

### 5. Selector Fallbacks
- TikTok's UI varies by region, account type, and A/B tests
- Script tries multiple selectors to find buttons
- Logs warnings if elements aren't found (doesn't crash)

### 6. Summary Report
- Shows success/failure count at the end
- Clear visual feedback with ✅ and ⚠️ indicators

---

## Troubleshooting

### "Maximum number of attempts reached"
**Cause:** TikTok is rate-limiting login attempts, usually triggered by multiple failed logins from an automation browser.

**Fix:**
- Wait 30–60 minutes before trying again
- Use the persistent profile (default behavior) — don't clear it between runs
- Try `--attach` to use your real Chrome session

### "Unable to open edit menu for this video"
**Cause:** TikTok changed their UI, or your account type (business/creator) has a different layout.

**Fix:**
1. Open one of your videos manually in the browser
2. Check what the "Edit" button text/label looks like
3. Update the `edit_selectors` list in the script (around line 210)

### Script finds 0 videos
**Causes:**
- Wrong username (check spelling, no `@`)
- TikTok changed their video URL structure

**Fix:**
- Verify: `https://www.tiktok.com/@YourUsername`
- Check that videos load when you visit your profile manually
- The script will print sample links found on the page to help debug

### "Saved session expired" / Keeps asking to log in
**Cause:** Browser profile got corrupted or TikTok invalidated the session.

**Fix:**
```bash
rm -rf ~/.tiktok_browser_profile
```
Then run the script again and log in fresh.

### Videos still showing as public after script runs
**Cause:** TikTok UI flow changed, or script couldn't find the "Save" button.

**Fix:**
- Check the script output for ⚠️ warnings
- Manually verify 2–3 videos
- Update `privacy_selectors` or `save_selectors` in the script if needed

---

## Limitations

- **UI dependency:** If TikTok changes their website layout, selectors may break
- **Speed:** Intentionally slow (~4.5s per video) to avoid rate limits
- **No undo:** Script doesn't back up original privacy settings
- **Account types:** Tested on personal accounts; creator/business accounts may have different UI

---

## When to Use This

✅ **Good for:**
- Bulk-archiving old content
- Cleaning up your profile before a rebrand
- Making everything private while you curate what stays public

❌ **Not good for:**
- Deleting videos (use TikTok's built-in bulk delete)
- Scheduling privacy changes
- Enterprise/agency account management (use TikTok's official tools)

---

## Security Notes

- **Browser profile:** `~/.tiktok_browser_profile/` contains session data that can access your account. Don't share it or commit it to version control.
- **Manual login only:** The script never asks for your password. If something claims to need it, don't use it.
- **Rate limits:** TikTok may temporarily restrict your account if requests come too fast. Use the default delay or increase it.

---

## FAQ

**Q: Does this violate TikTok's Terms of Service?**  
A: Automation is generally discouraged by TikTok's ToS. Use at your own risk. This script mimics human behavior and doesn't abuse APIs, but TikTok could still flag your account.

**Q: Can I make videos public again after?**  
A: Yes — modify the script to select "Everyone" instead of "Only you" in the privacy dropdown (around line 240).

**Q: Can I run this on multiple accounts?**  
A: Yes, but you'll need separate browser profiles. Change `BROWSER_PROFILE_DIR` in the script per account.

**Q: What if I want to delete videos instead?**  
A: Use TikTok's built-in feature: Settings → Privacy → Download your data → Delete multiple videos.

**Q: Can I schedule this to run automatically?**  
A: Not recommended — manual login may be required periodically, and TikTok's UI changes can break selectors.

---

## Architecture Notes

### Browser Automation
Uses Playwright's `launch_persistent_context` to maintain a real browser profile across runs. Automation detection flags are hidden via `--disable-blink-features=AutomationControlled`.

### Async Flow
- `async_playwright()` context manager
- `asyncio.sleep()` for rate limiting
- `asyncio.run(main())` entry point

### Error Handling
- Try/except around page loads and selectors
- Multiple selector fallbacks per UI element
- Continues processing even if individual videos fail
- Summary report at the end

---

## License

MIT — do whatever you want with it, but no warranties. If TikTok restricts your account, that's on you.

---

## Contributing

Found a bug or TikTok changed their UI? Open an issue or PR with:
- Updated selectors
- Error logs
- Screenshots of the new UI

---

## Credits

Built with [Playwright](https://playwright.dev/) for browser automation.  
Inspired by the need to bulk-manage content without clicking hundreds of times.
