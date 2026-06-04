# TikTok Bulk Privacy Manager

Automate changing multiple TikTok videos to private using browser automation. No API keys, no credential storage — just you, Playwright, and a lot of clicking you don't have to do.

**Python version** — matches the architecture of the TikTok caption scraper.

---

## What This Does

- Logs into TikTok (you log in manually once, session gets saved)
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

### Examples

**Preview mode** (see what will change without making changes):
```bash
python tiktok_make_private.py adaugo_ezenwanyi --preview
```

**Test with 3 videos first**:
```bash
python tiktok_make_private.py adaugo_ezenwanyi --max=3
```

**Full run** (you'll be asked to confirm before changes are made):
```bash
python tiktok_make_private.py adaugo_ezenwanyi
```

**Custom delay between videos** (default is 4.5 seconds):
```bash
python tiktok_make_private.py adaugo_ezenwanyi --delay=6000
```

**Combine options**:
```bash
python tiktok_make_private.py adaugo_ezenwanyi --max=10 --delay=3000
```

---

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `<username>` | Your TikTok @username (without the @) | — |
| `--preview` | Show list of videos without making changes | off |
| `--max N` | Only process first N videos | all videos |
| `--delay MS` | Wait time between videos in milliseconds | 4500 (4.5s) |

---

## How It Works

### First Run (Manual Login)
1. Script opens a browser window to TikTok login
2. You log in manually (SMS code, email verification, whatever TikTok requires)
3. Script saves your session to `~/.tiktok_privacy_manager_session.json`
4. Future runs reuse this session (no re-login needed)

### Subsequent Runs
1. Script loads saved session
2. Navigates to your profile
3. Scrolls to load all videos
4. Shows you the list and asks for confirmation
5. Opens each video → clicks Edit → selects "Only you" → saves
6. Waits 4.5 seconds between videos to avoid rate limiting

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
- Typing anything else aborts with no changes

### 3. Rate Limiting
- Default 4.5-second delay between videos
- Prevents TikTok from flagging your account as a bot
- Configurable via `--delay` flag

### 4. No Credential Storage
- Script never touches your password
- You log in through TikTok's real UI
- Session cookies stored locally in `~/.tiktok_privacy_manager_session.json`

### 5. Selector Fallbacks
- TikTok's UI varies by region, account type, A/B tests
- Script tries multiple ways to find buttons
- Logs warnings if it can't find elements (doesn't crash)

### 6. Summary Report
- Shows success/failure count at the end
- Clear visual feedback with ✅ and ⚠️ indicators

---

## Files Created

```
~/.tiktok_privacy_manager_session.json  # Saved login session
```

This file contains cookies that can access your account. Keep it secret, don't commit to version control.

---

## Troubleshooting

### "Unable to open edit menu for this video"
**Cause:** TikTok changed their UI, or you have a different account type (business/creator).

**Fix:**
1. Open one of your videos manually
2. Check what the "Edit" button text/label is
3. Update the `edit_selectors` list in the script (around line 210)

### "Saved session expired"
**Cause:** TikTok logged you out (sessions expire after some days).

**Fix:**
- Delete `~/.tiktok_privacy_manager_session.json`
- Run script again — it will prompt for manual login

### Script finds 0 videos
**Causes:**
- Wrong username (check spelling, don't include the @)
- Profile is private (script can't scrape private profiles if not logged in as that user)
- TikTok changed their video URL structure

**Fix:**
- Verify your username: `https://www.tiktok.com/@YourUsername`
- Check that videos load when you visit your profile manually

### Rate limiting / "Too many requests"
**Cause:** Running the script too many times too fast.

**Fix:**
- Increase delay: `--delay=8000` (8 seconds)
- Run in smaller batches: `--max=10`
- Wait 30 minutes before retrying

### Videos still showing as public after script runs
**Cause:** TikTok UI flow changed, or script couldn't find the "Save" button.

**Fix:**
- Check the script output for ⚠️ warnings
- Manually verify 2-3 videos to see if privacy changed
- Open browser DevTools and inspect the privacy dropdown HTML
- Update the `privacy_selectors` or `save_selectors` lists in the script

---

## Comparison: Python vs Node.js

| Feature | Python Version (this) | Node.js Version (original) |
|---------|----------------------|---------------------------|
| **Dependencies** | `playwright-python` | `playwright` (npm) |
| **Session storage** | `~/.tiktok_privacy_manager_session.json` | `.tiktok-storage.json` |
| **Syntax** | async/await (Python) | async/await (JavaScript) |
| **CLI args** | argparse | process.argv |
| **Code style** | Matches caption scraper | Original implementation |

Both versions work identically — this Python version just matches your existing TikTok tooling better.

---

## Limitations

- **UI dependency:** If TikTok changes their website layout, selectors may break
- **Speed:** Intentionally slow (4.5s per video) to avoid rate limits
- **No undo:** Script doesn't back up original privacy settings
- **Account types:** Tested on personal accounts; creator/business accounts may have different UI

---

## When to Use This

✅ **Good for:**
- Bulk-archiving old content
- Cleaning up your profile before a rebrand
- Making everything private while you curate what stays public

❌ **Not good for:**
- Deleting videos (use TikTok's bulk delete feature)
- Scheduling privacy changes (no cron/automation support)
- Enterprise/agency account management (use TikTok's official tools)

---

## Security Notes

- **Session file:** `~/.tiktok_privacy_manager_session.json` contains cookies that can access your account. Keep it secret.
- **Manual login:** Script never asks for your password. If it does, something is wrong.
- **Rate limits:** TikTok may temporarily restrict your account if you spam requests. Use delays.

---

## FAQ

**Q: Why Python instead of Node.js?**  
A: This matches the architecture of your TikTok caption scraper. If you already have `playwright-python` installed, this slots right in.

**Q: Can I run this on multiple accounts?**  
A: Yes, but you'll need to manually switch between session files. The session is stored in your home directory.

**Q: Does this violate TikTok's Terms of Service?**  
A: Automation is generally discouraged by TikTok's ToS. Use at your own risk. This script mimics human behavior and doesn't abuse APIs, but TikTok could still flag your account.

**Q: Can I make videos public again after?**  
A: Yes, but you'd need to modify the script to select "Everyone" instead of "Only you" in the privacy dropdown (around line 240).

**Q: What if I want to delete videos instead?**  
A: Don't use this script. TikTok has a built-in bulk delete feature in Settings → Privacy → Download your data → Delete multiple videos.

**Q: Can I schedule this to run automatically?**  
A: Not recommended. Manual login is required, and TikTok's UI changes would break automation. This is a one-time bulk operation tool.

---

## Architecture Notes

### Session Management
Uses Playwright's `storage_state` feature to save/load browser cookies and localStorage. Session persists in your home directory for privacy (not in project folder).

### Async Flow
- `async_playwright()` context manager
- `asyncio.sleep()` for delays
- `asyncio.run(main())` entry point
- Matches the async pattern from your caption scraper

### Error Handling
- Try/except around page loads
- Selector fallbacks (tries multiple ways to find buttons)
- Continues processing even if individual videos fail
- Shows summary report at end

---

## License

MIT — do whatever you want with it, but no warranties. If TikTok bans your account, that's on you.

---

## Contributing

Found a bug? TikTok changed their UI? Open an issue or PR with:
- Updated selectors
- Error logs
- Screenshots of the new UI

---

## Credits

Built with [Playwright](https://playwright.dev/) for browser automation.  
Inspired by the need to bulk-manage content without clicking 847 times.  
Python version matches the architecture of the TikTok caption scraper.
