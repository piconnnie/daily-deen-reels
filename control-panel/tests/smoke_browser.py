"""Boots the real control panel (stlite from the CDN) in headless Chromium,
opens the sample-data mode, visits every tab, presses a confirm flow and fails
on any Python exception shown by Streamlit. Saves screenshots.

    python control-panel/tests/smoke_browser.py <site-dir> <screenshot-dir>
"""
from __future__ import annotations

import functools
import http.server
import re
import sys
import threading
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

site, shots = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
shots.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_address[1]}/index.html"

BOOT_MS = 240_000  # Pyodide + Streamlit download on a cold runner
problems: list[str] = []


def no_exceptions(page, where):
    n = page.locator('[data-testid="stException"]').count()
    if n:
        problems.append(f"{where}: {n} exception(s): {page.locator('[data-testid=stException]').first.inner_text()[:800]}")


with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, viewport in (("desktop", {"width": 1280, "height": 900}), ("phone", {"width": 390, "height": 844})):
        page = browser.new_page(viewport=viewport)
        console = []
        page.on("console", lambda m: console.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.goto(url)
        expect(page.get_by_text("DEEN control panel").first).to_be_visible(timeout=BOOT_MS)
        no_exceptions(page, f"{name}/connect")
        page.screenshot(path=str(shots / f"{name}-0-connect.png"), full_page=True)

        page.get_by_role("button", name="Explore with sample data (no token)").click()
        expect(page.get_by_text("Drafts in queue")).to_be_visible(timeout=60_000)
        no_exceptions(page, f"{name}/overview")
        page.screenshot(path=str(shots / f"{name}-1-overview.png"), full_page=True)

        for i, tab in enumerate(["Review", "Make a reel", "Queue", "Settings"], start=2):
            page.get_by_role("tab", name=re.compile(rf"^{re.escape(tab)}")).click()
            page.wait_for_timeout(1500)
            no_exceptions(page, f"{name}/{tab}")
            page.screenshot(path=str(shots / f"{name}-{i}-{tab.lower().replace(' ', '-')}.png"), full_page=True)

        if name == "desktop":
            # A full confirm flow: Approve → Yes → demo notice, still no exceptions.
            page.get_by_role("tab", name=re.compile(r"^Review")).click()
            page.get_by_role("button", name="✅ Approve").click()
            page.get_by_role("button", name="Yes, do it").click()
            expect(page.get_by_text("Demo mode — nothing changed").first).to_be_visible(timeout=30_000)
            no_exceptions(page, "desktop/approve")
            page.get_by_role("tab", name="Settings").click()
            page.get_by_role("button", name="Save settings").click()
            page.wait_for_timeout(1500)
            no_exceptions(page, "desktop/settings-save")
            page.screenshot(path=str(shots / "desktop-6-after-actions.png"), full_page=True)
        if console:
            print(f"[{name}] browser console errors (informational):\n  " + "\n  ".join(console[:20]))
        page.close()
    browser.close()

srv.shutdown()
if problems:
    print("SMOKE TEST FAILED:\n- " + "\n- ".join(problems))
    sys.exit(1)
print(f"Smoke test passed. Screenshots in {shots}")
