#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

const STORAGE_STATE_PATH = path.resolve(__dirname, '..', '.tiktok-storage.json');
const USER_DATA_DIR = path.resolve(__dirname, '..', '.tiktok-browser');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const USERNAME = process.argv[2];
const MAX_VIDEOS = Number(getArgValue('--max') || '0');
const DELAY_MS = Number(getArgValue('--delay') || '4500');
const PREVIEW_ONLY = process.argv.includes('--preview');

if (!USERNAME) {
  console.error('Usage: node scripts/tiktok-make-videos-private.js <username> [--preview] [--max=10] [--delay=4500]');
  process.exit(1);
}

function getArgValue(name) {
  const arg = process.argv.find((value) => value.startsWith(name + '='));
  return arg ? arg.split('=')[1] : undefined;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

async function saveStorageState(context) {
  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved session to ${STORAGE_STATE_PATH}`);
}

async function waitForManualLogin(page, context) {
  console.log('\nPlease log in to TikTok in the opened browser window.');
  console.log('When you are fully logged in, return here and press ENTER.');
  await prompt('> ');
  await saveStorageState(context);
}

async function ensureSession(page, context) {
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    await page.goto('https://www.tiktok.com/login', { waitUntil: 'networkidle' });
    await waitForManualLogin(page, context);
    return;
  }

  await page.goto('https://www.tiktok.com/', { waitUntil: 'networkidle' });
  const loggedIn = await page.$('a[href*="/@' + USERNAME + '"]');
  if (!loggedIn) {
    console.warn('Saved TikTok session did not appear valid. Logging in again.');
    fs.unlinkSync(STORAGE_STATE_PATH);
    await page.goto('https://www.tiktok.com/login', { waitUntil: 'networkidle' });
    await waitForManualLogin(page, context);
  }
}

async function collectVideoUrls(page) {
  const profileUrl = `https://www.tiktok.com/@${USERNAME}/video`;
  console.log(`Navigating to profile videos: ${profileUrl}`);
  await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(4000);

  const profileVideoLinkSelector = `a[href*="/@${USERNAME}/video/"]`;
  const curUrl = page.url();
  if (!curUrl.includes(`/@${USERNAME}/video`)) {
    console.warn(`  Warning: navigation redirected to ${curUrl}. This may affect video scraping.`);
  }

  await page.waitForFunction(
    (selector) => document.querySelectorAll(selector).length > 0,
    profileVideoLinkSelector,
    { timeout: 60000 },
  );

  const urls = new Set();
  let lastHeight = 0;

  while (urls.size < 200) {
    const newUrls = await page.$$eval(profileVideoLinkSelector, (anchors) =>
      anchors
        .map((anchor) => {
          try {
            return new URL(anchor.href, window.location.origin).href;
          } catch {
            return null;
          }
        })
        .filter(Boolean),
    );
    newUrls.forEach((href) => urls.add(href));

    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === lastHeight) break;
    lastHeight = currentHeight;
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(1500);
  }

  const finalUrls = Array.from(urls).slice(0, MAX_VIDEOS || undefined);
  console.log(`Found ${finalUrls.length} video URLs.`);
  return finalUrls;
}

async function clickIfExists(page, selector, options = {}) {
  const el = await page.$(selector);
  if (!el) return false;
  await el.click(options);
  return true;
}

async function changeVideoToPrivate(page, videoUrl) {
  console.log(`\nProcessing ${videoUrl}`);
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Try actions that reveal the privacy dialog.
  const actionSelectors = [
    'button:has-text("Edit")',
    'button:has-text("More actions")',
    'button[aria-label*="More"]',
    'button[aria-label*="more"]',
    'button:has-text("...")',
    'button[class*="menu"]',
    '[data-testid="more-button"]',
    'button[data-testid*="more"]',
    'div[role="button"]:has-text("...")',
  ];

  let actionClicked = false;
  for (const selector of actionSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        console.log(`  Clicking action selector: ${selector}`);
        await element.click({ force: true });
        actionClicked = true;
        break;
      }
    } catch (e) {
      // Continue
    }
  }

  if (!actionClicked) {
    console.warn('  Could not click any action selector. Trying page-evaluation fallback.');
    try {
      const clicked = await page.evaluate(() => {
        const patterns = [/more/i, /actions/i, /edit/i, /^\.+$/];
        const candidates = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"], a[role="button"]'));
        for (const el of candidates) {
          const text = (el.innerText || '').trim();
          const label = (el.getAttribute('aria-label') || '').trim();
          if (patterns.some((p) => p.test(text)) || patterns.some((p) => p.test(label))) {
            el.click();
            return true;
          }
        }
        return false;
      });
      if (clicked) {
        actionClicked = true;
        console.log('  Page-evaluation fallback clicked an action button.');
      }
    } catch (_) {
      // ignore
    }
  }

  await page.waitForTimeout(1500);

  const popupHandle = await page.evaluateHandle(() => {
    const dialogTexts = ['Privacy settings', 'Who can watch this video', 'Only you', 'Only me'];
    const elements = Array.from(document.querySelectorAll('div'));
    return elements.find((el) => {
      const text = el.innerText || '';
      return dialogTexts.some((phrase) => text.includes(phrase));
    }) || null;
  });

  const popupVisible = await popupHandle.evaluate((node) => !!node && node.nodeType === 1);

  if (popupVisible) {
    console.log('  Found popup container by text content.');
  } else {
    console.warn('  Could not locate a popup container by text. Falling back to page-wide selectors.');
  }

  const optionSelectors = [
    'button:has-text("Only you")',
    'span:has-text("Only you")',
    'div:has-text("Only you")',
    'button:has-text("Only me")',
    'span:has-text("Only me")',
    'div:has-text("Only me")',
    'text="Only you"',
    'text="Only me"',
  ];

  let selectedPrivate = false;

  if (popupVisible) {
    for (const selector of optionSelectors) {
      try {
        const handle = await popupHandle.$(selector);
        if (handle) {
          console.log(`  Clicking privacy option inside popup: ${selector}`);
          await handle.click({ force: true });
          selectedPrivate = true;
          break;
        }
      } catch (e) {
        // Continue
      }
    }
  }

  if (!selectedPrivate) {
    for (const selector of optionSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          console.log(`  Clicking privacy option page-wide: ${selector}`);
          await element.click({ force: true });
          selectedPrivate = true;
          break;
        }
      } catch (e) {
        // Continue
      }
    }
  }

  if (!selectedPrivate) {
    console.warn('  Unable to find or click "Only you" / "Only me".');
    console.warn(`    Current URL: ${page.url()}`);
    console.warn(`    Page title: ${await page.title()}`);
    try {
      const snippet = await page.evaluate(() => {
        const dialog = Array.from(document.querySelectorAll('div')).find((el) => /Privacy settings|Who can watch this video/i.test(el.innerText || ''));
        return dialog ? dialog.innerText.slice(0, 300) : 'no matching dialog text found';
      });
      console.warn(`    Dialog snippet: ${snippet}`);
    } catch (e) {
      console.warn('    Could not extract dialog snippet.');
    }
    return false;
  }

  if (!selectedPrivate) {
    console.warn('  Unable to find or click "Only you" / "Only me".');
    console.warn(`    Current URL: ${page.url()}`);
    console.warn(`    Page title: ${await page.title()}`);
    try {
      const snippet = await page.evaluate(() => {
        const dialog = Array.from(document.querySelectorAll('div')).find((el) => /Privacy settings|Who can watch this video/i.test(el.innerText || ''));
        return dialog ? dialog.innerText.slice(0, 300) : 'no matching dialog text found';
      });
      console.warn(`    Dialog snippet: ${snippet}`);
    } catch (e) {
      console.warn('    Could not extract dialog snippet.');
    }
    return false;
  }

  await page.waitForTimeout(1000);

  const confirmSelectors = [
    'button:has-text("Done")',
    'button:has-text("Save")',
    'button:has-text("Confirm")',
    'button:has-text("Submit")',
  ];

  let confirmed = false;
  for (const selector of confirmSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        console.log(`  Clicking confirmation button: ${selector}`);
        await element.click({ force: true });
        confirmed = true;
        break;
      }
    } catch (e) {
      // Continue
    }
  }

  if (!confirmed) {
    console.warn('  No confirmation button found; the setting may auto-save.');
  }

  await page.waitForTimeout(DELAY_MS);
  console.log('  ✓ Privacy update attempted for this video.');
  return true;
}

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    userAgent: USER_AGENT,
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const page = await context.newPage();

  try {
    await ensureSession(page, context);
    const videoUrls = await collectVideoUrls(page);

    if (videoUrls.length === 0) {
      console.error('No videos were found to process. Verify the username and that the account has posted videos.');
      process.exit(1);
    }

    console.log('\nVideos:');
    videoUrls.forEach((url, index) => console.log(`${index + 1}. ${url}`));

    if (PREVIEW_ONLY) {
      console.log('\nPreview-only mode enabled. No privacy changes were made.');
      process.exit(0);
    }

    const confirm = await prompt('\nProceed to attempt making these videos private? (yes/no) ');
    if (!/^y(es)?$/i.test(confirm)) {
      console.log('Aborted by user. No changes were made.');
      process.exit(0);
    }

    for (const videoUrl of videoUrls) {
      await changeVideoToPrivate(page, videoUrl);
    }

    console.log('\nDone. Review your TikTok profile to verify the changes.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await context.close();
  }
})();
