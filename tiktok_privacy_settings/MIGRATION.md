# Migration Guide: Node.js → Python

Quick reference for switching from the Node.js version to the Python version.

## Installation Changes

### Before (Node.js)
```bash
npm install playwright
npx playwright install chromium
```

### After (Python)
```bash
pip install -r requirements.txt
playwright install chromium
```

---

## Command Changes

### Before (Node.js)
```bash
node scripts/tiktok-make-videos-private.js adaugo_ezenwanyi --preview
```

### After (Python)
```bash
python tiktok_make_private.py adaugo_ezenwanyi --preview
```

---

## Session File Location Changes

| Version | Session File Location |
|---------|----------------------|
| **Node.js** | `./.tiktok-storage.json` (project folder) |
| **Python** | `~/.tiktok_privacy_manager_session.json` (home directory) |

**Why the change?**
- Matches your caption scraper's pattern (persistent context in home dir)
- Keeps session out of project folder (safer)
- Won't accidentally commit session to git

---

## Flag Syntax Changes

| Feature | Node.js | Python |
|---------|---------|--------|
| Max videos | `--max=10` | `--max=10` or `--max 10` |
| Delay | `--delay=6000` | `--delay=6000` or `--delay 6000` |
| Preview | `--preview` | `--preview` |

Python accepts both `--flag=value` and `--flag value` syntax.

---

## Code Structure Comparison

### Session Management

**Node.js:**
```javascript
const context = await browser.newContext({ 
  storageState: STORAGE_STATE_PATH 
});
await context.storageState({ path: STORAGE_STATE_PATH });
```

**Python:**
```python
context = await browser.new_context(
    storage_state=str(STORAGE_STATE_PATH)
)
await context.storage_state(path=str(STORAGE_STATE_PATH))
```

### Scrolling

**Node.js:**
```javascript
await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
await page.waitForTimeout(1500);
```

**Python:**
```python
await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
await asyncio.sleep(1.5)
```

### Selectors

**Node.js:**
```javascript
const element = await page.$('button:has-text("Edit")');
if (element) await element.click();
```

**Python:**
```python
element = await page.query_selector('button:has-text("Edit")')
if element:
    await element.click()
```

---

## What Stayed the Same

- **Selector strategy** — same fallback arrays for buttons
- **Delay logic** — same 4.5s default between videos
- **Preview mode** — same confirmation workflow
- **Error handling** — same graceful degradation
- **UI approach** — still clicks through TikTok's actual interface

---

## Benefits of Python Version

1. **Matches your existing tooling** — same patterns as caption scraper
2. **argparse** — cleaner CLI parsing than `process.argv`
3. **Type hints** — better IDE autocomplete
4. **One language** — all your TikTok tools in Python now
5. **Session isolation** — home directory instead of project folder

---

## Running Both Versions

You can keep both if you want:

```bash
# Node.js version
node scripts/tiktok-make-videos-private.js adaugo_ezenwanyi --preview

# Python version
python tiktok_make_private.py adaugo_ezenwanyi --preview
```

They use different session files, so they won't conflict.

---

## Next Steps

1. **Test with preview mode first:**
   ```bash
   python tiktok_make_private.py adaugo_ezenwanyi --preview
   ```

2. **Try a small batch:**
   ```bash
   python tiktok_make_private.py adaugo_ezenwanyi --max=3
   ```

3. **If all looks good, delete the Node.js version:**
   ```bash
   rm -rf node_modules/ package*.json scripts/
   ```
