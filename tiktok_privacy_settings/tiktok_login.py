#!/usr/local/bin/python3
"""
TikTok Login Setup
==================
Opens Chromium, lets you log in to TikTok manually, and saves the session.
Run this ONCE, then you can run the main script without logging in again.

USAGE:
  python tiktok_login.py

HOW IT WORKS:
  1. Opens Chromium browser
  2. Waits for you to log in to TikTok manually
  3. Saves your session to ~/.tiktok_privacy_manager_session.json
  4. Exits
  
That's it. Session persists for future runs.
"""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright


STORAGE_STATE_PATH = Path.home() / ".tiktok_privacy_manager_session.json"


async def main():
    print("=" * 70)
    print("TikTok Login Setup")
    print("=" * 70)
    print(f"\nSession will be saved to: {STORAGE_STATE_PATH}\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        # Open in incognito/private mode (fresh context with no cached cookies)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            ignore_https_errors=True  # Sometimes helps with TikTok
        )
        page = await context.new_page()

        try:
            print("→ Opening TikTok login page...")
            await page.goto("https://www.tiktok.com/login", wait_until="networkidle", timeout=30000)

            print("\n" + "=" * 70)
            print("⚠️  Please log in to TikTok in the browser window.")
            print("   When you are fully logged in, return here and press ENTER.")
            print("=" * 70 + "\n")

            input("Press ENTER when logged in... ")

            # Save the session
            await context.storage_state(path=str(STORAGE_STATE_PATH))

            print(f"\n✅ Session saved to {STORAGE_STATE_PATH}")
            print("You can now run the main script without logging in again:\n")
            print("  python tiktok_make_private.py adaugo_ezenwanyi --preview")
            print("  python tiktok_make_private.py adaugo_ezenwanyi\n")

        except KeyboardInterrupt:
            print("\n⚠️  Interrupted. Session not saved.")
        except Exception as e:
            print(f"\n❌ Error: {e}")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
