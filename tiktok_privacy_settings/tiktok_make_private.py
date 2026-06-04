#!/usr/bin/env python3
"""
TikTok Bulk Privacy Manager
============================
Automate changing multiple TikTok videos to private using browser automation.

SETUP (run once):
  pip install playwright
  playwright install chromium

USAGE:
  python tiktok_make_private.py <username> [--preview] [--max=10] [--delay=4500]

EXAMPLES:
  # Preview mode (see what will change without making changes)
  python tiktok_make_private.py adaugo_ezenwanyi --preview

  # Test with 3 videos
  python tiktok_make_private.py adaugo_ezenwanyi --max=3

  # Full run (asks for confirmation)
  python tiktok_make_private.py adaugo_ezenwanyi

  # Custom delay between videos
  python tiktok_make_private.py adaugo_ezenwanyi --delay=6000

HOW IT WORKS:
  Opens a real browser, logs you in once (manual login), saves the session,
  then iterates through your videos and clicks through the UI to change
  privacy settings to "Only you" (Private).

SAFETY:
  - Manual login (script never touches your password)
  - Preview mode to see what will change
  - Confirmation prompt before making changes
  - Rate limiting with configurable delays
  - Session persistence (login once, reuse)
"""

import asyncio
import argparse
import sys
from pathlib import Path
from typing import List, Optional
from playwright.async_api import async_playwright, Page, BrowserContext


# ── CONFIG ─────────────────────────────────────────────────────────────────────
STORAGE_STATE_PATH = Path.home() / ".tiktok_privacy_manager_session.json"
DEFAULT_DELAY_MS = 4500  # 4.5 seconds between videos
# ───────────────────────────────────────────────────────────────────────────────


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Bulk change TikTok videos to private",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s adaugo_ezenwanyi --preview
  %(prog)s adaugo_ezenwanyi --max=5
  %(prog)s adaugo_ezenwanyi --delay=6000
        """
    )
    parser.add_argument(
        "username",
        help="Your TikTok @username (without the @)"
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Show list of videos without making changes (dry run)"
    )
    parser.add_argument(
        "--max",
        type=int,
        default=0,
        help="Only process first N videos (0 = all videos)"
    )
    parser.add_argument(
        "--delay",
        type=int,
        default=DEFAULT_DELAY_MS,
        help=f"Wait time between videos in milliseconds (default: {DEFAULT_DELAY_MS})"
    )
    return parser.parse_args()


async def wait_for_manual_login(page: Page, context: BrowserContext):
    """Pause and ask user to log in manually, then save session."""
    print("\n⚠️  You need to log in to TikTok.")
    print("   The browser window is open — please log in manually.")
    print("   When you are fully logged in, return here and press ENTER.")
    input("Press ENTER when logged in... ")

    # Save the session state
    await context.storage_state(path=str(STORAGE_STATE_PATH))
    print(f"✅ Session saved to {STORAGE_STATE_PATH}")


async def ensure_session(page: Page, context: BrowserContext, username: str):
    """
    Check if user is logged in. If not, prompt for manual login.
    Uses saved session state if available.
    """
    if not STORAGE_STATE_PATH.exists():
        print("No saved session found. Opening login page...")
        await page.goto("https://www.tiktok.com/login", wait_until="networkidle", timeout=30000)
        await wait_for_manual_login(page, context)
        return

    # Test if saved session is still valid
    await page.goto("https://www.tiktok.com/", wait_until="networkidle", timeout=30000)

    # Check if profile link exists (indicates logged in)
    profile_link = await page.query_selector(f'a[href*="/@{username}"]')

    if not profile_link:
        print("⚠️  Saved session expired. Logging in again...")
        STORAGE_STATE_PATH.unlink(missing_ok=True)
        await page.goto("https://www.tiktok.com/login", wait_until="networkidle", timeout=30000)
        await wait_for_manual_login(page, context)


async def collect_video_urls(page: Page, username: str, max_videos: int = 0) -> List[str]:
    """
    Navigate to profile and scroll to collect all video URLs.
    Returns list of video URLs.
    """
    profile_url = f"https://www.tiktok.com/@{username}"
    print(f"\n→ Navigating to profile: {profile_url}")
    await page.goto(profile_url, wait_until="networkidle", timeout=30000)

    # Wait for videos to load
    try:
        await page.wait_for_selector('a[href*="/video/"]', timeout=30000)
    except Exception as e:
        print(f"❌ Error: Could not find video links. Profile may be private or empty.")
        return []

    video_urls = set()
    last_height = 0
    scroll_attempts = 0
    max_scrolls = 60  # Safety cap

    print("Scrolling to load all videos...")

    while scroll_attempts < max_scrolls:
        # Collect all video links currently visible
        links = await page.eval_on_selector_all(
            'a[href*="/video/"]',
            "elements => elements.map(el => el.href)"
        )

        # Filter to only this user's videos
        new_links = {
            link for link in links
            if f"@{username}/video/" in link
        }

        prev_count = len(video_urls)
        video_urls.update(new_links)

        # Check if we got new videos
        if len(video_urls) == prev_count and scroll_attempts > 5:
            print("  No new videos found after scrolling")
            break

        # Check if we've reached max_videos
        if max_videos > 0 and len(video_urls) >= max_videos:
            break

        # Scroll down
        current_height = await page.evaluate("() => document.body.scrollHeight")
        if current_height == last_height and scroll_attempts > 5:
            break

        last_height = current_height
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(1.5)
        scroll_attempts += 1

    final_urls = sorted(video_urls)
    if max_videos > 0:
        final_urls = final_urls[:max_videos]

    print(f"✅ Found {len(final_urls)} video URLs")
    return final_urls


async def change_video_to_private(page: Page, video_url: str, delay_ms: int) -> bool:
    """
    Navigate to video, open edit menu, change privacy to "Only you", and save.
    Returns True if successful, False otherwise.
    """
    print(f"\n→ Processing: {video_url}")

    try:
        await page.goto(video_url, wait_until="networkidle", timeout=20000)
    except Exception as e:
        print(f"  ❌ Error loading page: {e}")
        return False

    # Try to find and click the Edit/Manage button
    edit_selectors = [
        'button:has-text("Edit")',
        'button:has-text("Manage")',
        '[aria-label="Edit"]',
        'div:has-text("Edit video")',
        'button:has-text("More actions")',
        '[data-e2e="video-more-button"]',
        'button[aria-label="Actions"]',
    ]

    opened = False
    for selector in edit_selectors:
        try:
            element = await page.query_selector(selector)
            if element:
                await element.click()
                opened = True
                print("  ✓ Opened edit menu")
                break
        except Exception:
            continue

    if not opened:
        print("  ⚠️  Unable to open edit menu. UI may have changed.")
        return False

    # Wait for menu to appear
    await asyncio.sleep(1.2)

    # Try to find and click "Only you" (Private option)
    privacy_selectors = [
        'text=Only you',
        'button:has-text("Only you")',
        'span:has-text("Only you")',
        'li:has-text("Only you")',
        '[data-e2e="privacy-only-you"]',
        'div:has-text("Only you")',
    ]

    selected_private = False
    for selector in privacy_selectors:
        try:
            element = await page.query_selector(selector)
            if element:
                await element.click()
                selected_private = True
                print("  ✓ Selected 'Only you' (Private)")
                break
        except Exception:
            continue

    if not selected_private:
        print("  ⚠️  Unable to select 'Only you'. Privacy dialog may be different.")
        return False

    # Wait a bit for UI to update
    await asyncio.sleep(0.8)

    # Try to find and click Save/Done/Confirm button
    save_selectors = [
        'button:has-text("Done")',
        'button:has-text("Save")',
        'button:has-text("Publish")',
        'button:has-text("Confirm")',
        '[data-e2e="edit-video-confirm"]',
        'button[type="submit"]',
    ]

    saved = False
    for selector in save_selectors:
        try:
            element = await page.query_selector(selector)
            if element:
                await element.click()
                saved = True
                print("  ✓ Clicked save button")
                break
        except Exception:
            continue

    if not saved:
        print("  ⚠️  Could not find save/confirm button.")
        return False

    # Wait for the configured delay before next video
    await asyncio.sleep(delay_ms / 1000.0)
    print("  ✅ Privacy changed to Private (or attempted)")
    return True


async def main():
    """Main entry point."""
    args = parse_args()

    print("=" * 70)
    print("TikTok Bulk Privacy Manager")
    print("=" * 70)

    async with async_playwright() as p:
        # Launch browser with saved session if available
        storage_state = str(
            STORAGE_STATE_PATH) if STORAGE_STATE_PATH.exists() else None

        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            storage_state=storage_state,
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()

        try:
            # Ensure we're logged in
            await ensure_session(page, context, args.username)

            # Collect all video URLs
            video_urls = await collect_video_urls(page, args.username, args.max)

            if not video_urls:
                print("\n❌ No videos found. Check username and profile visibility.")
                return

            # Show the list
            print("\n" + "=" * 70)
            print(f"Found {len(video_urls)} videos:")
            print("=" * 70)
            for i, url in enumerate(video_urls, 1):
                print(f"{i:3d}. {url}")

            if args.preview:
                print("\n✅ Preview mode — no changes were made.")
                return

            # Ask for confirmation
            print("\n" + "=" * 70)
            confirm = input(
                "Proceed to make these videos private? (yes/no): ").strip().lower()

            if confirm not in ("yes", "y"):
                print("❌ Aborted by user. No changes were made.")
                return

            # Process each video
            print("\n" + "=" * 70)
            print("Processing videos...")
            print("=" * 70)

            success_count = 0
            fail_count = 0

            for i, video_url in enumerate(video_urls, 1):
                print(f"\n[{i}/{len(video_urls)}]")
                success = await change_video_to_private(page, video_url, args.delay)
                if success:
                    success_count += 1
                else:
                    fail_count += 1

            # Summary
            print("\n" + "=" * 70)
            print("SUMMARY")
            print("=" * 70)
            print(f"✅ Successfully processed: {success_count}")
            print(f"⚠️  Failed or skipped:     {fail_count}")
            print("\nReview your TikTok profile to verify the changes.")

        except KeyboardInterrupt:
            print("\n\n⚠️  Interrupted by user. Exiting...")
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}")
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
