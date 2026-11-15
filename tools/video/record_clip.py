"""Records the short clips that play inside the project thumbnails.

    python tools/video/record_clip.py pokemon   assets/video/pokemon.mp4
    python tools/video/record_clip.py intellidocs assets/video/intellidocs.mp4

Each clip is 100 frames at 14 fps, 944x590 (the size of the screen drawn in
the thumbnails), and ends where it starts so it loops. The page is driven
frame by frame - move the pointer, take a picture - so the result does not
depend on how fast this machine is. Needs playwright and ffmpeg.
"""
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

VIEW = {"width": 1280, "height": 800}
FRAMES = 100
FPS = 14

CURSOR_JS = """() => {
    if (document.getElementById('rec-cursor')) return;
    const c = document.createElement('div');
    c.id = 'rec-cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:22px;height:22px;will-change:transform';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l16 9.5-7 1.6L9.6 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
}"""


class Clip:
    def __init__(self, page, folder):
        self.page = page
        self.folder = folder
        self.n = 0
        self.x = VIEW["width"] * 0.82
        self.y = VIEW["height"] * 0.9

    def cursor(self):
        self.page.evaluate(CURSOR_JS)
        self.page.evaluate(
            "([x, y]) => { const c = document.getElementById('rec-cursor'); if (c) c.style.transform = `translate(${x}px, ${y}px)`; }",
            [self.x, self.y],
        )

    def shot(self):
        self.cursor()
        self.page.screenshot(path=str(self.folder / f"f{self.n:03d}.png"))
        self.n += 1

    def hold(self, frames):
        for _ in range(frames):
            self.page.wait_for_timeout(40)
            self.shot()

    def move(self, x, y, frames):
        x0, y0 = self.x, self.y
        for i in range(1, frames + 1):
            t = i / frames
            e = t * t * (3 - 2 * t)
            self.x = x0 + (x - x0) * e
            # a hand does not move in a straight line
            self.y = y0 + (y - y0) * e - math.sin(t * math.pi) * 14
            self.page.mouse.move(self.x, self.y)
            self.page.wait_for_timeout(30)
            self.shot()

    def centre(self, locator):
        box = locator.bounding_box()
        return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

    def click(self, settle=350):
        self.page.mouse.click(self.x, self.y)
        self.page.wait_for_timeout(settle)
        self.shot()


def pokemon(page, clip):
    page.goto("https://pokemon-battle-rooms-frontend.onrender.com/", wait_until="domcontentloaded", timeout=120000)
    page.get_by_role("button", name="Ver planes PRO").wait_for(timeout=90000)
    page.wait_for_timeout(2500)
    home = (clip.x, clip.y)
    clip.hold(6)
    clip.move(*clip.centre(page.get_by_role("button", name="Ver planes PRO")), 12)
    clip.click()
    clip.hold(3)
    clip.move(*clip.centre(page.get_by_text("Batallas 1v1 en tiempo real")), 9)
    clip.hold(3)
    clip.move(*clip.centre(page.get_by_text("Sprites shiny animados")), 9)
    clip.hold(5)
    clip.move(*clip.centre(page.get_by_text("Volver")), 10)
    clip.click()
    clip.hold(2)
    clip.move(*clip.centre(page.get_by_role("button", name="Iniciar sesión")), 9)
    clip.click()
    clip.hold(4)
    clip.move(*clip.centre(page.get_by_text("Continuar con Google")), 7)
    clip.hold(4)
    clip.move(*clip.centre(page.get_by_text("Volver")), 8)
    clip.click()
    left = FRAMES - clip.n
    clip.move(*home, max(1, left - 2))
    clip.hold(FRAMES - clip.n)


def intellidocs(page, clip):
    page.goto("https://intellidocs-1.onrender.com/", wait_until="domcontentloaded", timeout=120000)
    page.get_by_text("Browse files").wait_for(timeout=120000)
    # the "running" mark in the corner goes away when the app has settled
    try:
        page.locator('[data-testid="stStatusWidget"]').wait_for(state="hidden", timeout=30000)
    except Exception:
        pass
    page.wait_for_timeout(2500)
    home = (clip.x, clip.y)
    box = page.get_by_placeholder("Ej:", exact=False)
    clip.hold(5)
    bx, by = clip.centre(box)
    clip.move(bx - 40, by, 10)
    clip.click(200)
    text = "¿Qué coche es rojo?"
    for i, ch in enumerate(text):
        page.keyboard.type(ch)
        page.wait_for_timeout(25)
        if i % 2 == 1 or i == len(text) - 1:
            clip.shot()
    clip.hold(4)
    clip.move(*clip.centre(page.get_by_text("Browse files")), 14)
    clip.hold(5)
    # down the side panel and back
    sx, sy = 128, 520
    clip.move(sx, sy, 9)
    for dy in [15, 30, 35, 20, 10, 0, 0, 0, -10, -20, -35, -30, -15]:
        if dy:
            page.mouse.wheel(0, dy)
        page.wait_for_timeout(60)
        clip.shot()
    # leave it as it was found
    box.fill("")
    page.evaluate("() => document.activeElement && document.activeElement.blur()")
    page.wait_for_timeout(600)
    clip.hold(1)
    left = FRAMES - clip.n
    clip.move(*home, max(1, left - 2))
    clip.hold(FRAMES - clip.n)


def pollclass(page, clip):
    page.goto("https://pollclass.vercel.app/", wait_until="domcontentloaded", timeout=120000)
    page.get_by_role("button", name="SOY PROFESOR").wait_for(timeout=90000)
    page.wait_for_timeout(2000)
    # start left of the middle: the thumbnail has a phone drawn over the right
    clip.x, clip.y = 300, 640
    home = (clip.x, clip.y)
    clip.hold(5)
    for door in ("SOY PROFESOR", "SOY ESTUDIANTE"):
        clip.move(*clip.centre(page.get_by_role("button", name=door)), 10)
        clip.hold(2)
        clip.click(600)
        clip.hold(3)
        clip.move(*clip.centre(page.get_by_placeholder("tu@email.com")), 8)
        clip.hold(4)
        clip.move(*clip.centre(page.get_by_text("VOLVER AL INICIO")), 9)
        clip.hold(1)
        clip.click(600)
        clip.hold(2)
    left = FRAMES - clip.n
    clip.move(*home, max(1, left - 2))
    clip.hold(FRAMES - clip.n)


SITES = {"pokemon": pokemon, "intellidocs": intellidocs, "pollclass": pollclass}


def main():
    name, out = sys.argv[1], Path(sys.argv[2])
    folder = Path(tempfile.mkdtemp(prefix="clip_"))
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True, args=["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11"]
        )
        page = browser.new_page(viewport=VIEW)
        clip = Clip(page, folder)
        SITES[name](page, clip)
        browser.close()
    print("frames:", clip.n)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", str(folder / "f%03d.png"),
            "-frames:v", str(FRAMES), "-vf", "scale=944:590:flags=lanczos", "-c:v", "libx264",
            "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "27", "-preset", "veryslow",
            "-movflags", "+faststart", "-an", str(out),
        ],
        check=True,
    )
    if len(sys.argv) > 3:
        shutil.copytree(folder, sys.argv[3], dirs_exist_ok=True)
    shutil.rmtree(folder, ignore_errors=True)
    print("wrote", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
