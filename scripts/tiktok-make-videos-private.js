#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

const STORAGE_STATE_PATH = path.resolve(__dirname, '..', '.tiktok-storage.json');
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
  const profileUrl = `https://www.tiktok.com/@${USERNAME}`;
  console.log(`Navigating to profile: ${profileUrl}`);
  await page.goto(profileUrl, { waitUntil: 'networkidle' });

  await page.waitForSelector('a[href*="/video/"]', { timeout: 30000 });

  const urls = new Set();
  let lastHeight = 0;

  while (urls.size < 200) {
    const newUrls = await page.$$eval('a[href*="/video/"]', (anchors) =>
      anchors.map((anchor) => anchor.href).filter(Boolean),
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
  await page.goto(videoUrl, { waitUntil: 'networkidle' });

  // The TikTok edit UI can vary, so this tries several paths.
  const editSelectors = [
    'button:has-text("Edit")',
    'button:has-text("Manage")',
    '[aria-label="Edit"]',
    'div:has-text("Edit video")',
    'button:has-text("More actions")',
  ];

  let opened = false;
  for (const selector of editSelectors) {
    const element = await page.$(selector);
    if (element) {
      await element.click();
      opened = true;
      break;
    }
  }

  if (!opened) {
    console.warn('Unable to open edit menu for this video. The page structure may have changed.');
    return false;
  }

  await page.waitForTimeout(1200);

  const onlyYouSelectors = [
    'text=Only you',
    'button:has-text("Only you")',
    'span:has-text("Only you")',
    'li:has-text("Only you")',
  ];

  let selectedOnlyYou = false;
  for (const selector of onlyYouSelectors) {
    const element = await page.$(selector);
    if (element) {
      await element.click();
      selectedOnlyYou = true;
      break;
    }
  }

  if (!selectedOnlyYou) {
    console.warn('Unable to select "Only you". The privacy dialog may be different for your account.');
    return false;
  }

  const doneSelectors = [
    'button:has-text("Done")',
    'button:has-text("Save")',
    'button:has-text("Publish")',
    'button:has-text("Confirm")',
  ];

  let saved = false;
  for (const selector of doneSelectors) {
    const element = await page.$(selector);
    if (element) {
      await element.click();
      saved = true;
      break;
    }
  }

  if (!saved) {
    console.warn('Could not find a save/confirm button after selecting Private.');
    return false;
  }

  await page.waitForTimeout(DELAY_MS);
  console.log('Privacy set to Private for this video (or attempted).');
  return true;
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: fs.existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined });
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
    await browser.close();
  }
})();
