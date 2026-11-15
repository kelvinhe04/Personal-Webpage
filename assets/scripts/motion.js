// ==========================================================================
// Motion layer. Everything here is progressive: it only adds classes and
// decorative nodes, so without this file (or with reduced motion) the page
// falls back to the plain stacked layout.
//
//   scroll     inertial scrolling (Lenis) on mouse / trackpad
//   world      fixed backdrop: the topographic map, which is what the
//              frosted panels blur
//   hero       content drifts away while the map zooms in
//   nav        the bar tightens into a glass capsule, tied to the scroll
//   words      the About text lights up word by word as it is read
//   kinetic    two rows of outlined type driven by scroll speed
//   stack      Experience cards pile up under the navbar
//   pinned     Projects scroll sideways while the page is pinned (a swipe
//              carousel on small screens)
//   deck       Certificates: a pile of cards, parted one by one
//   trail      section rail: where you are, a dot to jump to each
//   cursor     custom pointer with a trail; letters lean towards it
//   moments    photos the pointer knocks about, picks up and throws
//   sound      the katana's sounds, with a switch in the navbar
//   videos     live projects play a recording inside their thumbnail
//   blade.js   the 3D katana and scabbard that travel behind all of it
// ==========================================================================
(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    // Pinning relies on overflow: clip (see motion.css); without it the page
    // keeps the plain layout instead of a broken sticky one.
    const canPin = !reduced && window.CSS && CSS.supports("overflow", "clip");

    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const smooth = (t) => t * t * (3 - 2 * t);
    const lang = () => (root.lang === "es" ? "es" : "en");
    const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
    const make = (tag, cls, html) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (html) el.innerHTML = html;
        return el;
    };
    // write a style only when it changed: most frames it has not
    const put = (el, prop, value) => {
        const cache = el.__fx || (el.__fx = {});
        if (cache[prop] === value) return;
        cache[prop] = value;
        el.style[prop] = value;
    };

    // ---- one scroll-driven frame loop for every effect -------------------
    // A task returns true while it is still easing towards its target, which
    // keeps the loop alive after the scroll event stream has stopped.
    const tasks = [];
    const measurers = [];
    const relangers = [];
    let sy = window.scrollY;
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let queued = false;
    let lenis = null;

    function tick() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(run);
    }

    let lastRun = 0;
    function run(now) {
        queued = false;
        sy = window.scrollY;
        govern(now - lastRun);
        lastRun = now;
        let again = false;
        for (const task of tasks) if (task(now)) again = true;
        if (again) tick();
    }

    function measureAll() {
        vw = window.innerWidth;
        vh = window.innerHeight;
        sy = window.scrollY;
        for (const m of measurers) m();
        if (lenis) lenis.resize();
        tick();
    }

    let measureTimer = 0;
    const measureSoon = () => {
        clearTimeout(measureTimer);
        measureTimer = setTimeout(measureAll, 140);
    };

    // ---- governor: trade blur for frame rate on slow machines ------------
    // Frosted panels over a moving 3D canvas are the expensive part of this
    // page. If scrolling cannot hold ~40fps the panels go solid and the
    // sword renders at a lower resolution. "?fx=full" keeps everything on.
    const forced = /[?&]fx=(full|lite)/.exec(window.location.search);
    let liteOn = false;
    let sampled = 0;
    let slowFrames = 0;
    let strikes = 0;

    function setLite() {
        if (liteOn) return;
        liteOn = true;
        root.classList.add("lite");
        window.dispatchEvent(new Event("fx:lite"));
    }

    function govern(delta) {
        if (liteOn || forced || reduced || performance.now() < 4000) return;
        // only frames that follow each other say anything about speed
        if (delta > 120) return;
        sampled++;
        if (delta > 25) slowFrames++;
        if (sampled < 80) return;
        strikes = slowFrames > 40 ? strikes + 1 : 0;
        sampled = slowFrames = 0;
        if (strikes >= 2) setLite();
    }

    // ---- scroll: inertia + one way to travel to an anchor ----------------
    const pins = [];

    function initScroll() {
        if (reduced || !fine || typeof window.Lenis !== "function") return;
        // A text box only keeps the wheel while it has somewhere left to
        // scroll that way. (Handing it every wheel event made the page stick
        // whenever the pointer happened to be over the message field.)
        let wheelY = 0;
        window.addEventListener("wheel", (e) => (wheelY = e.deltaY), { capture: true, passive: true });
        const keepsWheel = (node) => {
            if (node.tagName !== "TEXTAREA") return false;
            const room = node.scrollHeight - node.clientHeight;
            if (room <= 1) return false;
            return wheelY < 0 ? node.scrollTop > 0 : node.scrollTop < room - 1;
        };
        try {
            lenis = new window.Lenis({
                autoRaf: true,
                lerp: 0.105,
                wheelMultiplier: 1,
                smoothWheel: true,
                anchors: false,
                prevent: keepsWheel,
            });
        } catch (err) {
            lenis = null;
            return;
        }
        // the mobile menu locks the page while it is open
        new MutationObserver(() => {
            if (document.body.classList.contains("menu-open")) lenis.stop();
            else lenis.start();
        }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    function scrollToY(top) {
        const y = Math.max(0, top);
        if (lenis) {
            lenis.scrollTo(y, { duration: 1.3, easing: (t) => 1 - Math.pow(1 - t, 4) });
        } else {
            window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
        }
    }

    // While a section is pinned its cards are not where the layout says, so
    // anchors into it land on the matching point of the sideways scroll.
    function goTo(hash) {
        if (!hash || hash.length < 2) return false;
        if (hash === "#navbar") {
            scrollToY(0);
            return true;
        }
        let target;
        try {
            target = document.querySelector(hash);
        } catch (err) {
            return false;
        }
        if (!target) return false;
        const pin = pins.find((p) => p.on && (p.sec === target || p.sec.contains(target)));
        if (pin) {
            const card = target === pin.sec ? null : target.closest(pin.cardSel);
            scrollToY(pin.top + (card ? clamp(card.offsetLeft - pin.gutter, 0, pin.travel) : 0) + 2);
        } else {
            scrollToY(docTop(target) - 70);
        }
        return true;
    }
    window.portfolioGoTo = goTo;

    // ---- world: fixed backdrop -------------------------------------------
    const pointer = { x: 0, y: 0, cx: 0, cy: 0 };

    function initWorld() {
        const world = make("div", "world");
        world.setAttribute("aria-hidden", "true");
        const map = make("div", "world-map");
        const topo = $(".hero-topo");
        if (topo) map.append(topo);
        world.append(map);
        document.body.prepend(world);
        if (reduced) return;

        measurers.push(() => {
            if (!topo) return;
            // zoom towards the summit of the map, wherever it sits on screen
            map.style.transform = "none";
            const r = topo.getBoundingClientRect();
            map.style.transformOrigin = `${r.left + r.width * 0.643}px ${r.top + r.height * 0.45}px`;
        });

        tasks.push(() => {
            pointer.cx += (pointer.x - pointer.cx) * 0.06;
            pointer.cy += (pointer.y - pointer.cy) * 0.06;
            const dive = smooth(clamp(sy / vh, 0, 1));
            const past = Math.max(0, sy - vh);
            map.style.transform =
                `translate3d(${(pointer.cx * -18).toFixed(1)}px, ${(pointer.cy * -12 - past * 0.03).toFixed(1)}px, 0) ` +
                `rotate(${(-5 * dive - past * 0.0011).toFixed(3)}deg) scale(${(1 + 1.25 * dive).toFixed(4)})`;
            put(map, "opacity", (1 - 0.5 * dive).toFixed(2));
            return Math.abs(pointer.x - pointer.cx) + Math.abs(pointer.y - pointer.cy) > 0.002;
        });

        if (fine) {
            window.addEventListener(
                "pointermove",
                (e) => {
                    pointer.x = (e.clientX / vw) * 2 - 1;
                    pointer.y = (e.clientY / vh) * 2 - 1;
                    tick();
                },
                { passive: true },
            );
        }
    }

    // ---- hero: drift away on the way out ---------------------------------
    // Transform and opacity only: both stay on the compositor. (A blur here
    // repainted the whole title on every frame of the scroll.)
    function initHero() {
        const content = $(".hero-content");
        const arrow = $(".scroll-arrow");
        if (!content || reduced) return;
        let wasOut = false;
        tasks.push(() => {
            const p = clamp(sy / vh, 0, 1.2);
            const out = p >= 1.1;
            if (out && wasOut) return false;
            wasOut = out;
            content.style.translate = `0 ${(sy * 0.3).toFixed(1)}px`;
            put(content, "opacity", clamp(1 - p * 1.45, 0, 1).toFixed(3));
            content.style.scale = (1 + p * 0.12).toFixed(4);
            put(content, "visibility", p > 0.72 ? "hidden" : "");
            if (arrow) put(arrow, "opacity", clamp(1 - p * 5, 0, 1).toFixed(3));
            return false;
        });
    }

    // ---- nav: the capsule closes in step with the first scroll -----------
    function initNav() {
        const nav = $(".navbar");
        if (!nav || reduced) return;
        let shown = -1;
        tasks.push(() => {
            const p = Math.round(smooth(clamp(sy / 170, 0, 1)) * 1000) / 1000;
            if (p !== shown) {
                shown = p;
                nav.style.setProperty("--nav-p", String(p));
            }
            return false;
        });
    }

    // ---- words: About text lights up as it is read -----------------------
    function initWords() {
        const paras = $$(".about-description");
        if (!paras.length) return;
        let words = [];
        let lit = 0;
        let top = 0;
        let height = 1;
        let auto = 0;
        let autoAt = 0;

        // The language switch replaces each paragraph's text, so this runs
        // again after every change and only rebuilds what was wiped.
        const split = () => {
            words = [];
            paras.forEach((p) => {
                if (!p.querySelector(".w")) {
                    const parts = p.textContent.trim().split(/\s+/);
                    p.textContent = "";
                    parts.forEach((word) => {
                        const span = make("span", "w");
                        span.textContent = word;
                        p.append(span, " ");
                    });
                }
                words.push(...$$(".w", p));
            });
            lit = 0;
            auto = 0;
            words.forEach((w) => w.classList.toggle("on", reduced));
        };
        split();
        relangers.push(split);
        if (reduced) return;

        measurers.push(() => {
            const box = paras[0].parentElement;
            top = docTop(box);
            height = box.offsetHeight;
        });
        tasks.push((now) => {
            // tied to the scroll while the text is coming into view...
            const p = clamp((sy + vh * 0.92 - top) / (height + vh * 0.12), 0, 1);
            let target = clamp(Math.round(p * words.length * 1.08), 0, words.length);
            // ...and once the whole block is on screen it finishes on its own,
            // so the text is never left half-lit while someone is reading it
            const inView = top >= sy && top + height <= sy + vh;
            if (inView) {
                const dt = autoAt ? Math.min(64, now - autoAt) : 16;
                autoAt = now;
                auto = Math.min(words.length, Math.max(auto, lit) + (dt * words.length) / 1100);
                target = Math.max(target, Math.floor(auto));
            } else {
                auto = 0;
                autoAt = 0;
            }
            if (target !== lit) {
                const from = Math.min(lit, target);
                const to = Math.max(lit, target);
                for (let i = from; i < to; i++) words[i].classList.toggle("on", target > lit);
                lit = target;
            }
            return inView && lit < words.length;
        });
    }

    // ---- kinetic: outlined type driven by scroll -------------------------
    function initKinetic() {
        const tech = $("#technologies");
        if (!tech) return;
        const band = make("div", "kinetic");
        band.setAttribute("aria-hidden", "true");
        const ROWS = [
            ["REACT", "TYPESCRIPT", "PYTHON", "VUE", "FASTAPI", "POSTGIS", "DOCKER"],
            ["FULL STACK", "REAL-TIME", "AI AGENTS", "WEBSOCKETS", "GIS", "PANAMÁ"],
        ];
        const rows = ROWS.map((list, r) => {
            const row = make("div", "kinetic-row");
            const unit = make(
                "div",
                "kinetic-unit",
                list
                    .map((w, i) => `<span class="${(i + r) % 2 ? "is-solid" : ""}">${w}</span><i></i>`)
                    .join(""),
            );
            row.append(unit);
            band.append(row);
            return { row, unit, width: 1 };
        });
        tech.before(band);
        if (reduced) return;

        let top = 0;
        let height = 1;
        let vel = 0;
        let lastY = sy;
        measurers.push(() => {
            top = docTop(band);
            height = band.offsetHeight;
            rows.forEach((r) => {
                r.width = r.unit.offsetWidth || 1;
                const need = Math.ceil(vw / r.width) + 2;
                while (r.row.children.length < need) r.row.append(r.unit.cloneNode(true));
                while (r.row.children.length > need) r.row.lastChild.remove();
            });
        });
        tasks.push(() => {
            vel += (sy - lastY - vel) * 0.18;
            lastY = sy;
            if (sy + vh > top - 200 && sy < top + height + 200) {
                const skew = clamp(vel * 0.3, -11, 11);
                rows.forEach((r, i) => {
                    const off = (sy * (0.42 + i * 0.12)) % r.width;
                    const x = i % 2 ? off - r.width : -off;
                    r.row.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0) skewX(${(i % 2 ? skew : -skew).toFixed(2)}deg)`;
                });
            }
            return Math.abs(vel) > 0.08;
        });
    }

    // ---- sections: watermark glyph + cut-in title ------------------------
    function initSections() {
        // One character per section, written the same in simplified Chinese,
        // traditional Chinese and Japanese.
        const GLYPHS = {
            about: "我",
            technologies: "技",
            experience: "道",
            projects: "作",
            certificates: "印",
            honors: "光",
            contact: "信",
        };
        const glyphs = [];
        $$("section.section[id]").forEach((sec) => {
            const g = GLYPHS[sec.id];
            const host = $(".container", sec);
            if (!g || !host) return;
            const el = make("span", "sec-glyph");
            el.setAttribute("aria-hidden", "true");
            el.textContent = g;
            host.append(el);
            glyphs.push({ el, sec, top: 0, height: 1 });
        });

        // Titles start clipped away, and a fully clipped element never counts
        // as intersecting for IntersectionObserver - so this is scroll-driven.
        const titles = $$(".section-title").map((el) => ({ el, top: 0, done: false }));

        if (reduced) return;
        measurers.push(() => {
            glyphs.forEach((g) => {
                g.top = docTop(g.sec);
                g.height = g.sec.offsetHeight;
            });
            titles.forEach((t) => (t.top = docTop(t.el)));
        });
        tasks.push(() => {
            titles.forEach((t) => {
                if (t.done || sy + vh * 0.86 < t.top) return;
                t.done = true;
                t.el.classList.add("is-cut");
            });
            glyphs.forEach((g) => {
                if (sy + vh < g.top || sy > g.top + g.height) return;
                const span = Math.min(g.height, vh * 1.6);
                const p = clamp((sy + vh / 2 - (g.top + span / 2)) / vh, -1.2, 1.2);
                g.el.style.transform = `translate3d(0, ${(p * -90).toFixed(1)}px, 0)`;
            });
            return false;
        });
    }

    // ---- tech: the row at reading height is the one in focus -------------
    function initTech() {
        const grid = $(".tech-grid");
        const rows = $$(".tech-category", grid || document);
        if (!grid || !rows.length || reduced || !("IntersectionObserver" in window)) return;
        const seen = new Set();
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    e.target.classList.toggle("is-focus", e.isIntersecting);
                    if (e.isIntersecting) seen.add(e.target);
                    else seen.delete(e.target);
                });
                grid.classList.toggle("has-focus", seen.size > 0);
            },
            { rootMargin: "-38% 0px -38% 0px" },
        );
        rows.forEach((r) => io.observe(r));
    }

    // ---- photo: parallax inside its frame --------------------------------
    function initPhoto() {
        const img = $(".profile-img");
        const frame = $(".about-image");
        if (!img || !frame || reduced) return;
        let top = 0;
        let height = 1;
        measurers.push(() => {
            top = docTop(frame);
            height = frame.offsetHeight;
        });
        tasks.push(() => {
            if (sy + vh < top || sy > top + height) return false;
            const p = (top + height / 2 - sy - vh / 2) / vh;
            img.style.translate = `0 ${(p * -46).toFixed(1)}px`;
            return false;
        });
    }

    // ---- stack: Experience cards pile up ---------------------------------
    function initStack() {
        const timeline = $(".timeline");
        if (!timeline) return;
        const items = $$(".timeline-item", timeline);
        const cards = items.map((it) => $(".timeline-content", it));
        if (items.length < 2 || cards.some((c) => !c)) return;
        const wide = window.matchMedia("(min-width: 900px)");
        const BASE = 96;
        const STEP = 16;
        let on = false;
        let cardH = 1;
        let top = 0;
        let height = 1;

        const measure = () => {
            timeline.classList.remove("stack-on");
            timeline.style.removeProperty("--stack-h");
            on = false;
            if (canPin && wide.matches) {
                cardH = Math.max(...cards.map((c) => c.offsetHeight));
                // only stack when the whole pile fits under the navbar
                on = cardH + BASE + STEP * (items.length - 1) + 28 <= vh;
            }
            if (on) {
                timeline.classList.add("stack-on");
                timeline.style.setProperty("--stack-h", `${cardH}px`);
                items.forEach((it, i) => it.style.setProperty("--i", String(i)));
            } else {
                cards.forEach((c) => {
                    c.style.scale = "";
                    c.style.removeProperty("--dim");
                });
            }
            top = docTop(timeline);
            height = timeline.offsetHeight;
        };
        measurers.push(measure);
        // "Show more" changes a card's height: re-evaluate the pile
        timeline.addEventListener("click", (e) => {
            if (e.target.closest(".read-more-btn")) setTimeout(measureAll, 0);
        });

        tasks.push(() => {
            if (!on || sy + vh < top || sy > top + height) return false;
            const cover = items.map((it, i) => {
                if (i === 0) return 0;
                const stick = BASE + i * STEP;
                return 1 - clamp((it.getBoundingClientRect().top - stick) / (cardH * 0.85), 0, 1);
            });
            let depth = 0;
            for (let i = items.length - 1; i >= 0; i--) {
                put(cards[i], "scale", (1 - 0.045 * depth).toFixed(4));
                const dim = clamp(depth * 0.42, 0, 0.8).toFixed(3);
                const cache = cards[i].__fx;
                if (cache.dim !== dim) {
                    cache.dim = dim;
                    cards[i].style.setProperty("--dim", dim);
                }
                depth += cover[i];
            }
            return false;
        });
    }

    // ---- pinned: a section that scrolls sideways -------------------------
    // Wide screens: the section is pinned and the vertical scroll drives the
    // track. Small screens: the track is a native swipe carousel (CSS) and
    // this only keeps the counter in step with it.

    // Projects: cards are dealt in from the right and tuck away on the left.
    function dealIn(cards, x) {
        for (const c of cards) {
            const left = c.left - x;
            if (left > vw + 80 || left + c.width < -80) {
                if (c.shown) {
                    c.shown = false;
                    put(c.el, "visibility", "hidden");
                }
                continue;
            }
            if (!c.shown) {
                c.shown = true;
                put(c.el, "visibility", "");
            }
            const e = smooth(clamp((left - vw * 0.58) / (vw * 0.42), 0, 1));
            const l = clamp(-left / c.width, 0, 1);
            put(c.el, "translate", `0 ${(e * 84).toFixed(1)}px`);
            put(c.el, "rotate", `${(e * 6).toFixed(2)}deg`);
            put(c.el, "scale", (1 - l * 0.1).toFixed(4));
            put(c.el, "opacity", (1 - l * 0.8 - e * 0.3).toFixed(3));
        }
    }

    // `pin: false` keeps a section in the normal flow on wide screens and only
    // gives it the swipe carousel (and its counter) on small ones.
    function initPinned({ id, gridSel, cardSel, effect, onFocus, pin: pinnable = true }) {
        const sec = $(id);
        const cont = sec && $(".container", sec);
        const grid = sec && $(gridSel, sec);
        if (!sec || !cont || !grid) return;
        const fits = window.matchMedia("(min-width: 900px) and (min-height: 560px)");
        const ui = make(
            "div",
            "hs-ui",
            '<span class="hs-count"><b>01</b><i>/</i><em>01</em></span>' +
                '<span class="hs-bar"><span></span></span>' +
                '<span class="hs-hint"></span>',
        );
        ui.setAttribute("aria-hidden", "true");
        const countNow = $("b", ui);
        const countAll = $("em", ui);
        const bar = $(".hs-bar span", ui);
        const hint = $(".hs-hint", ui);
        grid.after(ui);

        const pin = { sec, cardSel, on: false, top: 0, travel: 0, gutter: 0 };
        pins.push(pin);
        let x = 0;
        let cards = [];
        let shown = -1;
        let focused = null;

        const setHint = () => {
            const es = lang() === "es";
            hint.textContent = pin.on
                ? es ? "sigue bajando →" : "keep scrolling →"
                : es ? "desliza →" : "swipe →";
        };
        relangers.push(setHint);

        const count = (i) => {
            if (i === shown) return;
            shown = i;
            countNow.textContent = String(i + 1).padStart(2, "0");
        };
        const reset = () => {
            grid.style.transform = "";
            grid.style.perspectiveOrigin = "";
            cards.forEach((c) => {
                for (const p of ["translate", "rotate", "scale", "opacity", "transform", "visibility"]) {
                    c.el.style[p] = "";
                }
                c.el.__fx = {};
            });
            grid.__fx = {};
        };
        const disable = () => {
            sec.classList.remove("hscroll");
            sec.style.height = "";
            reset();
            pin.on = false;
            x = 0;
        };

        const measure = () => {
            const want = pinnable && canPin && fits.matches;
            if (want && !pin.on) {
                sec.classList.add("hscroll");
                pin.on = true;
            }
            if (!want && pin.on) disable();
            const els = $$(cardSel, grid).filter((c) => c.offsetWidth > 0);
            countAll.textContent = String(els.length).padStart(2, "0");
            setHint();
            if (!pin.on) {
                cards = els.map((el) => ({ el }));
                return;
            }

            reset();
            sec.style.height = "";
            // the pinned frame must fit on screen, otherwise use the grid
            if (cont.scrollHeight > cont.clientHeight + 6) {
                disable();
                cards = els.map((el) => ({ el }));
                setHint();
                return;
            }
            pin.gutter = parseFloat(getComputedStyle(grid).paddingLeft) || 0;
            pin.travel = Math.max(0, grid.offsetWidth - vw);
            sec.style.height = `${vh + pin.travel}px`;
            pin.top = docTop(sec);
            cards = els.map((el) => ({
                el,
                left: el.offsetLeft,
                width: el.offsetWidth,
                shown: true,
            }));
            shown = -1;
        };
        measurers.push(measure);

        tasks.push(() => {
            if (!pin.on) return false;
            if (sy + vh < pin.top - 300 || sy > pin.top + pin.travel + vh + 300) {
                if (onFocus && focused) onFocus((focused = null));
                return false;
            }
            const target = clamp(sy - pin.top, 0, pin.travel);
            // Lenis already eases the scroll; without it the track eases here
            const d = target - x;
            x = lenis || Math.abs(d) < 0.4 ? target : x + d * 0.16;
            grid.style.transform = `translate3d(${(-x).toFixed(1)}px, 0, 0)`;
            put(bar, "transform", `scaleX(${pin.travel ? (x / pin.travel).toFixed(4) : 1})`);
            effect(cards, x, grid);

            count(pin.travel ? Math.round((x / pin.travel) * (cards.length - 1)) : 0);
            if (onFocus) {
                let best = null;
                let bestD = Infinity;
                for (const c of cards) {
                    const d = Math.abs(c.left + c.width / 2 - x - vw / 2);
                    if (d < bestD) {
                        bestD = d;
                        best = c.el;
                    }
                }
                const pinnedNow = sy >= pin.top && sy <= pin.top + pin.travel;
                const el = pinnedNow ? best : null;
                if (el !== focused) onFocus((focused = el));
            }
            ui.classList.toggle("is-moving", x > 12);
            return x !== target;
        });

        // swipe carousel: the counter follows the native scroll
        let swipeQueued = false;
        grid.addEventListener(
            "scroll",
            () => {
                if (pin.on || swipeQueued) return;
                swipeQueued = true;
                requestAnimationFrame(() => {
                    swipeQueued = false;
                    const max = grid.scrollWidth - grid.clientWidth;
                    if (max <= 0) return;
                    const f = clamp(grid.scrollLeft / max, 0, 1);
                    bar.style.transform = `scaleX(${f.toFixed(4)})`;
                    count(Math.round(f * (cards.length - 1)));
                    ui.classList.toggle("is-moving", grid.scrollLeft > 12);
                });
            },
            { passive: true },
        );

        // keyboard: tabbing into an off-screen card brings it into view
        grid.addEventListener("focusin", (e) => {
            if (!pin.on) return;
            const card = e.target.closest(cardSel);
            if (!card) return;
            const left = card.offsetLeft - x;
            if (left >= 0 && left + card.offsetWidth <= vw) return;
            window.scrollTo({
                top: pin.top + clamp(card.offsetLeft - pin.gutter, 0, pin.travel),
                behavior: "auto",
            });
        });
    }

    // ---- trail: section rail ---------------------------------------------
    // Which section you are in, out of how many, with a dot to jump to each.
    function initTrail() {
        const links = $$(".nav-menu .nav-link").filter((l) =>
            document.querySelector(l.getAttribute("href")),
        );
        if (!links.length) return;
        const pad = (n) => String(n).padStart(2, "0");

        const rail = make(
            "nav",
            "trail",
            `<span class="trail-alt"><b>01</b><i></i><em>${pad(links.length)}</em></span>` +
                '<div class="trail-track"><span class="trail-fill"></span><ol></ol></div>',
        );
        const list = $("ol", rail);
        const fill = $(".trail-fill", rail);
        const now = $(".trail-alt b", rail);
        const stops = links.map((link) => {
            const hash = link.getAttribute("href");
            const li = make("li");
            const a = make("a", "", '<span class="trail-dot"></span><span class="trail-label"></span>');
            a.href = hash;
            a.addEventListener("click", (e) => {
                e.preventDefault();
                goTo(hash);
            });
            li.append(a);
            list.append(li);
            return { link, a, label: $(".trail-label", a), el: document.querySelector(hash), top: 0 };
        });
        const bar = make("div", "trail-bar", "<span></span>");
        bar.setAttribute("aria-hidden", "true");
        const barFill = bar.firstChild;
        document.body.append(rail, bar);

        const label = () => {
            rail.setAttribute(
                "aria-label",
                lang() === "es" ? "Progreso por secciones" : "Section progress",
            );
            stops.forEach((s) => {
                const text = s.link.textContent.trim();
                s.label.textContent = text;
                s.a.setAttribute("aria-label", text);
            });
        };
        label();
        relangers.push(label);

        let max = 1;
        let active = -2;
        measurers.push(() => {
            stops.forEach((s) => (s.top = docTop(s.el)));
            max = Math.max(1, root.scrollHeight - vh);
        });
        tasks.push(() => {
            const overall = clamp(sy / max, 0, 1);
            const pos = sy + vh * 0.4;
            let k = -1;
            for (let i = 0; i < stops.length; i++) if (pos >= stops[i].top) k = i;
            let f = 0;
            if (k >= 0) {
                const end = k + 1 < stops.length ? stops[k + 1].top : max + vh * 0.4;
                const frac = clamp((pos - stops[k].top) / Math.max(1, end - stops[k].top), 0, 1);
                f = clamp((k + frac) / (stops.length - 1), 0, 1);
            }
            fill.style.transform = `scaleY(${f.toFixed(4)})`;
            barFill.style.transform = `scaleX(${overall.toFixed(4)})`;
            if (k !== active) {
                active = k;
                now.textContent = pad(Math.max(k, 0) + 1);
                stops.forEach((s, i) => {
                    s.a.classList.toggle("is-active", i === k);
                    s.a.classList.toggle("is-past", i < k);
                });
            }
            rail.classList.toggle("is-on", sy > vh * 0.55);
            return false;
        });
    }

    // ---- footer: oversized wordmark rising into place --------------------
    function initFooter() {
        const footer = $(".footer");
        if (!footer) return;
        const mark = make("div", "footer-mark", "<span>KELVIN HE</span>");
        mark.setAttribute("aria-hidden", "true");
        footer.prepend(mark);
        if (reduced) return;
        const word = mark.firstChild;
        let top = 0;
        let height = 1;
        measurers.push(() => {
            top = docTop(footer);
            height = footer.offsetHeight;
        });
        tasks.push(() => {
            if (sy + vh < top) return false;
            const f = clamp((sy + vh - top) / height, 0, 1);
            word.style.transform = `translate3d(0, ${((1 - f) * 38).toFixed(2)}%, 0)`;
            return false;
        });
    }

    // ---- pointer: light on the glass, tilt, magnets -----------------------
    function initPointer() {
        if (!fine) return;
        const SHEEN =
            ".project-card, .certificate-card, .honor-card, .timeline-content, .contact-form .form";
        const TILT = ".profile-card, .certificate-card";
        let ev = null;
        let pending = false;
        let tilted = null;

        const apply = () => {
            pending = false;
            const t = ev.target instanceof Element ? ev.target : null;
            const lit = t && t.closest(SHEEN);
            if (lit) {
                const r = lit.getBoundingClientRect();
                lit.style.setProperty("--mx", `${(ev.clientX - r.left).toFixed(0)}px`);
                lit.style.setProperty("--my", `${(ev.clientY - r.top).toFixed(0)}px`);
            }
            const tilt = (!reduced && t && t.closest(TILT)) || null;
            if (tilted && tilted !== tilt) {
                tilted.style.rotate = "";
                tilted = null;
            }
            if (tilt) {
                const r = tilt.getBoundingClientRect();
                const dx = (ev.clientX - r.left) / r.width - 0.5;
                const dy = (ev.clientY - r.top) / r.height - 0.5;
                const deg = Math.hypot(dx, dy) * 9;
                tilt.style.rotate = `${(-dy).toFixed(3)} ${dx.toFixed(3)} 0 ${deg.toFixed(2)}deg`;
                tilted = tilt;
            }
        };
        document.addEventListener(
            "pointermove",
            (e) => {
                ev = e;
                if (pending) return;
                pending = true;
                requestAnimationFrame(apply);
            },
            { passive: true },
        );
        document.documentElement.addEventListener("pointerleave", () => {
            if (tilted) tilted.style.rotate = "";
            tilted = null;
        });

        if (reduced) return;
        $$(".hero-buttons .btn, .social-link").forEach((b) => {
            b.addEventListener("pointermove", (e) => {
                const r = b.getBoundingClientRect();
                const dx = (e.clientX - r.left) / r.width - 0.5;
                const dy = (e.clientY - r.top) / r.height - 0.5;
                b.style.translate = `${(dx * 14).toFixed(1)}px ${(dy * 10).toFixed(1)}px`;
            });
            b.addEventListener("pointerleave", () => (b.style.translate = ""));
        });
    }

    // ---- sound: the sword has a voice ------------------------------------
    // The cut and the draw are recordings of a real blade (assets/audio);
    // the blade going home is synthesised - filtered noise for the air it
    // moves, a few inharmonic partials for the ring of the steel - and so
    // are the other two until their files have arrived, or if they never do.
    // Only plays in answer to something the visitor does, and has a switch.
    let playSfx = () => {};

    function initSound() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC || reduced) return;
        let on = true;
        try {
            on = localStorage.getItem("sound") !== "off";
        } catch (err) {
            // storage blocked: sound stays on for this visit
        }
        let ctx = null;
        let master = null;
        let noise = null;

        // Fetched and decoded once the page has settled, long before the
        // first click that could want them. (An offline context decodes
        // without needing a gesture, and its buffers play in any context.)
        const FILES = {
            slash: "assets/audio/slash.mp3",
            draw: "assets/audio/draw.mp3",
            // the first part of the draw, made into a loop (the steel sliding)
            scrape: "assets/audio/scrape.wav",
        };
        const buffers = {};
        const asked = {};
        const loadSamples = () => {
            const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            if (!Offline || !on) return;
            const decoder = new Offline(2, 2, 44100);
            Object.entries(FILES).forEach(([name, url]) => {
                if (asked[name]) return;
                asked[name] = true;
                fetch(url)
                    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
                    .then(
                        (data) =>
                            new Promise((resolve, reject) => {
                                const p = decoder.decodeAudioData(data, resolve, reject);
                                if (p && p.then) p.then(resolve, reject);
                            }),
                    )
                    .then((buf) => (buffers[name] = buf))
                    .catch(() => (asked[name] = false));
            });
        };
        if (document.readyState === "complete") setTimeout(loadSamples, 600);
        else window.addEventListener("load", () => setTimeout(loadSamples, 600), { once: true });
        // a recording: `rate` shifts it a little so no two cuts sound the same
        const sample = (name, t, gain, rate = 1) => {
            const src = ctx.createBufferSource();
            src.buffer = buffers[name];
            src.playbackRate.value = rate;
            const g = ctx.createGain();
            g.gain.value = gain;
            src.connect(g).connect(master);
            src.start(t);
        };

        const open = () => {
            if (!on) return null;
            if (!ctx) {
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = 0.3;
                master.connect(ctx.destination);
                const len = Math.floor(ctx.sampleRate * 1.5);
                noise = ctx.createBuffer(1, len, ctx.sampleRate);
                const data = noise.getChannelData(0);
                for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            }
            if (ctx.state === "suspended") ctx.resume().catch(() => {});
            return ctx.state === "running" ? ctx : null;
        };

        // air: noise through a band that sweeps up and back down
        const air = (t, dur, f0, f1, f2, gain, q = 1.4) => {
            const src = ctx.createBufferSource();
            src.buffer = noise;
            src.loop = true;
            const band = ctx.createBiquadFilter();
            band.type = "bandpass";
            band.Q.value = q;
            band.frequency.setValueAtTime(f0, t);
            band.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45);
            band.frequency.exponentialRampToValueAtTime(f2, t + dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(band).connect(g).connect(master);
            src.start(t, Math.random());
            src.stop(t + dur + 0.05);
        };
        // steel: partials that are not multiples of each other, ringing out
        const steel = (t, gain, dur, pitch = 1) => {
            [2093, 3136, 4435, 5919, 7458].forEach((f, i) => {
                const osc = ctx.createOscillator();
                osc.frequency.value = f * pitch * (1 + (Math.random() - 0.5) * 0.012);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(gain / (1 + i * 0.9), t + 0.006);
                g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - i * 0.12));
                osc.connect(g).connect(master);
                osc.start(t);
                osc.stop(t + dur + 0.05);
            });
        };
        // the guard meeting the mouth of the scabbard
        const thud = (t, gain) => {
            const osc = ctx.createOscillator();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(190, t);
            osc.frequency.exponentialRampToValueAtTime(70, t + 0.09);
            const g = ctx.createGain();
            g.gain.setValueAtTime(gain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
            osc.connect(g).connect(master);
            osc.start(t);
            osc.stop(t + 0.15);
        };
        // The blade leaving the scabbard, going home, and the cut.
        const SOUNDS = {
            slash: (t, v) => {
                if (buffers.slash) {
                    sample("slash", t, 1.9 * v, 0.96 + Math.random() * 0.08);
                    return;
                }
                air(t, 0.3, 700, 5600, 1500, 0.5, 1.1);
                steel(t + 0.08, 0.09, 1.2, 1.12);
            },
            draw: (t, v) => {
                if (buffers.draw) {
                    sample("draw", t, 1.7 * v);
                    return;
                }
                air(t, 0.42, 1800, 5200, 7000, 0.3, 2.2);
                steel(t + 0.3, 0.07, 1.1, 1.2);
            },
            // only the end of the draw: the point coming out of the mouth
            ring: (t, v) => {
                if (!buffers.draw) {
                    steel(t, 0.07 * v, 1.1, 1.2);
                    return;
                }
                const src = ctx.createBufferSource();
                src.buffer = buffers.draw;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(1.8 * v, t + 0.03);
                src.connect(g).connect(master);
                src.start(t, 0.6);
            },
            sheath: (t) => {
                air(t, 0.26, 5200, 2400, 1500, 0.24, 2);
                thud(t + 0.24, 0.5);
                steel(t + 0.24, 0.03, 0.3, 0.6);
            },
        };
        const lastAt = {};
        // `delay` (seconds) lets a sound land on a moment that is still to come
        playSfx = (name, v = 1, delay = 0) => {
            if (!SOUNDS[name]) return;
            const c = open();
            if (!c) return;
            // never two of the same on top of each other
            const stamp = performance.now();
            if (stamp - (lastAt[name] || 0) < 120) return;
            lastAt[name] = stamp;
            SOUNDS[name](c.currentTime + 0.01 + delay, v);
        };
        window.addEventListener("blade:sfx", (e) => playSfx(e.detail.name, e.detail.v));

        // The steel sliding in the scabbard: a loop that is only as loud (and
        // as quick) as the blade is moving, so it follows the scroll and
        // stops when the scroll does.
        let sliding = null;
        let slidingOff = 0;
        const stopSliding = () => {
            clearTimeout(slidingOff);
            if (!sliding) return;
            sliding.src.stop();
            sliding = null;
        };
        window.addEventListener("blade:scrape", (e) => {
            const v = e.detail.v;
            if (!sliding) {
                if (v <= 0 || !buffers.scrape) return;
                const c = open();
                if (!c) return;
                const src = c.createBufferSource();
                src.buffer = buffers.scrape;
                src.loop = true;
                const g = c.createGain();
                g.gain.value = 0;
                src.connect(g).connect(master);
                src.start(0, Math.random() * 0.3);
                sliding = { src, g };
            }
            clearTimeout(slidingOff);
            sliding.g.gain.setTargetAtTime(v * 1.5, ctx.currentTime, 0.045);
            sliding.src.playbackRate.setTargetAtTime(0.8 + 0.45 * v, ctx.currentTime, 0.08);
            if (v <= 0) slidingOff = setTimeout(stopSliding, 700);
        });
        // browsers only let sound start from a gesture
        window.addEventListener("pointerdown", open, { passive: true });
        window.addEventListener("keydown", open, { passive: true });

        // the switch lives next to the theme one
        const themeBtn = $("#themeToggle");
        const holder = themeBtn && themeBtn.parentElement;
        if (!holder) return;
        const wrap = make("div");
        const btn = make("a", "themeToggle soundToggle", '<i class="fas" aria-hidden="true"></i>');
        btn.href = "#";
        btn.setAttribute("role", "button");
        wrap.append(btn);
        holder.before(wrap);
        const paint = () => {
            const es = lang() === "es";
            btn.firstChild.className = `fas ${on ? "fa-volume-up" : "fa-volume-mute"}`;
            btn.setAttribute("aria-pressed", String(on));
            btn.setAttribute(
                "aria-label",
                on ? (es ? "Silenciar sonido" : "Mute sound") : es ? "Activar sonido" : "Turn sound on",
            );
        };
        paint();
        relangers.push(paint);
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            on = !on;
            try {
                localStorage.setItem("sound", on ? "on" : "off");
            } catch (err) {
                // not persisted, still applies now
            }
            paint();
            // turning it on answers with the blade being drawn
            if (on) {
                loadSamples();
                playSfx("draw", 0.5);
            } else {
                stopSliding();
            }
        });
    }

    // ---- cursor: a point, a ring that follows, and a cut of light --------
    // The point sits exactly on the pointer (so does its label: no lag); the
    // ring eases behind it; fast moves leave a thin slash that fades.
    function initCursor() {
        if (!fine || reduced) return;
        const dot = make("div", "cur-dot", '<span class="cur-label"></span>');
        const ring = make("div", "cur-ring");
        const trail = make("canvas", "cur-trail");
        const label = dot.firstChild;
        [dot, ring, trail].forEach((el) => el.setAttribute("aria-hidden", "true"));
        document.body.append(trail, ring, dot);
        root.classList.add("has-cursor");
        const ctx = trail.getContext("2d");

        let tw = 0;
        let th = 0;
        let scale = 1;
        const size = () => {
            scale = Math.min(window.devicePixelRatio || 1, 1.5);
            tw = window.innerWidth;
            th = window.innerHeight;
            trail.width = Math.round(tw * scale);
            trail.height = Math.round(th * scale);
        };
        size();
        window.addEventListener("resize", size);

        const TEXT = {
            demo: { en: "Open demo ↗", es: "Abrir demo ↗" },
            over: { en: "Drag me", es: "Arrástrame" },
            held: { en: "Throw!", es: "¡Lánzame!" },
        };
        const LIFE = 260;
        const pts = [];
        let x = -100;
        let y = -100;
        let rx = -100;
        let ry = -100;
        let seen = false;
        let raf = 0;
        let mode = "";
        let blade = "";

        const setMode = (m) => {
            if (m === mode) return;
            mode = m;
            root.dataset.cursor = m;
            label.textContent = TEXT[m] ? TEXT[m][lang()] : "";
        };
        relangers.push(() => {
            label.textContent = TEXT[mode] ? TEXT[mode][lang()] : "";
        });
        const classify = (t) => {
            if (blade) return blade;
            if (!(t instanceof Element)) return "";
            if (t.closest("input, textarea, select")) return "text";
            if (t.closest(".moment")) return t.closest(".is-held") ? "held" : "over";
            if (t.closest(".project-card.has-demo .project-image")) return "demo";
            if (t.closest("a, button, label, [role='button'], .project-card.has-demo")) return "link";
            return "";
        };

        const draw = (now) => {
            raf = 0;
            rx += (x - rx) * 0.3;
            ry += (y - ry) * 0.3;
            ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
            while (pts.length && now - pts[0].t > LIFE) pts.shift();
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            ctx.clearRect(0, 0, tw, th);
            if (pts.length > 1) {
                const light = document.body.classList.contains("light-mode");
                ctx.lineCap = "round";
                ctx.globalCompositeOperation = light ? "source-over" : "lighter";
                for (let i = 1; i < pts.length; i++) {
                    const a = pts[i - 1];
                    const b = pts[i];
                    const k = 1 - (now - b.t) / LIFE; // 1 at the head, 0 at the tail
                    if (k <= 0) continue;
                    ctx.strokeStyle = light
                        ? `rgba(0, 119, 182, ${(k * 0.5).toFixed(3)})`
                        : `rgba(80, 215, 255, ${(k * 0.65).toFixed(3)})`;
                    ctx.lineWidth = 0.6 + k * k * 4;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
            if (pts.length || Math.abs(x - rx) + Math.abs(y - ry) > 0.3) raf = requestAnimationFrame(draw);
        };
        const kick = () => {
            if (!raf) raf = requestAnimationFrame(draw);
        };

        window.addEventListener(
            "pointermove",
            (e) => {
                if (e.pointerType === "touch") return;
                x = e.clientX;
                y = e.clientY;
                if (!seen) {
                    seen = true;
                    rx = x;
                    ry = y;
                }
                root.classList.add("cursor-on");
                dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                const last = pts[pts.length - 1];
                if (!last || Math.hypot(x - last.x, y - last.y) > 3) {
                    pts.push({ x, y, t: performance.now() });
                    if (pts.length > 64) pts.shift();
                }
                setMode(classify(e.target));
                kick();
            },
            { passive: true },
        );
        window.addEventListener("blade:hover", (e) => {
            blade = e.detail.state;
            setMode(blade || classify(document.elementFromPoint(x, y)));
        });
        // scrolling moves the page under a still pointer
        let scrollQueued = false;
        window.addEventListener(
            "scroll",
            () => {
                if (scrollQueued || !seen) return;
                scrollQueued = true;
                requestAnimationFrame(() => {
                    scrollQueued = false;
                    setMode(classify(document.elementFromPoint(x, y)));
                });
            },
            { passive: true },
        );
        window.addEventListener("pointerdown", () => root.classList.add("cursor-down"));
        window.addEventListener("pointerup", () => root.classList.remove("cursor-down"));
        document.documentElement.addEventListener("pointerleave", () => root.classList.remove("cursor-on"));
    }

    // ---- letters: type that leans towards the pointer ---------------------
    function initLetters() {
        // Titles are split into letters; a language change replaces the text,
        // so the split runs again and only rebuilds what was wiped.
        const titles = $$(".section-title");
        const split = () =>
            titles.forEach((h) => {
                if (h.querySelector(".ch")) return;
                const text = h.textContent.trim().replace(/\s+/g, " ");
                h.setAttribute("aria-label", text);
                h.textContent = "";
                text.split(" ").forEach((word, i) => {
                    if (i) h.append(" ");
                    const w = make("span", "wd");
                    w.setAttribute("aria-hidden", "true");
                    for (const c of word) {
                        const s = make("span", "ch");
                        s.textContent = c;
                        w.append(s);
                    }
                    h.append(w);
                });
            });
        split();
        relangers.push(split);
        if (!fine || reduced) return;

        const hero = $(".hero-title");
        const groups = titles.map((host) => ({ host, sel: ".ch", R: 120, on: false }));
        if (hero) groups.push({ host: hero, sel: ".highlight .hero-char", R: 210, on: false });
        let ev = null;
        let pending = false;

        const apply = () => {
            pending = false;
            for (const g of groups) {
                const r = g.host.getBoundingClientRect();
                const inside =
                    r.bottom > 0 &&
                    r.top < vh &&
                    ev.clientX > r.left - g.R &&
                    ev.clientX < r.right + g.R &&
                    ev.clientY > r.top - g.R &&
                    ev.clientY < r.bottom + g.R;
                if (!inside) {
                    if (g.on) {
                        g.on = false;
                        $$(g.sel, g.host).forEach((c) => {
                            c.__p = "";
                            c.style.removeProperty("--p");
                        });
                    }
                    continue;
                }
                g.on = true;
                for (const c of $$(g.sel, g.host)) {
                    const b = c.getBoundingClientRect();
                    const d = Math.hypot(
                        ev.clientX - (b.left + b.width / 2),
                        ev.clientY - (b.top + b.height / 2),
                    );
                    const p = smooth(clamp(1 - d / g.R, 0, 1)).toFixed(2);
                    if (c.__p !== p) {
                        c.__p = p;
                        c.style.setProperty("--p", p);
                    }
                }
            }
        };
        window.addEventListener(
            "pointermove",
            (e) => {
                if (e.pointerType === "touch") return;
                ev = e;
                if (pending) return;
                pending = true;
                requestAnimationFrame(apply);
            },
            { passive: true },
        );
    }

    // ---- theme: the switch is a cut ---------------------------------------
    // script.js hands the actual change over; here it happens inside a view
    // transition. The sword comes down the diagonal of the screen (blade.js,
    // which draws it above the page for as long as this lasts) and the new
    // theme opens outwards from the line it leaves - first where the blade
    // went in, then all the way along.
    // ("?cut=8" plays it eight times slower, to look at it frame by frame.)
    const slowCut = Number((/[?&]cut=([\d.]+)/.exec(window.location.search) || [])[1]) || 1;
    const CUT = { wind: 250 * slowCut, strike: 190 * slowCut, exit: 230 * slowCut, open: 560 * slowCut };
    CUT.total = CUT.wind + CUT.strike + CUT.open;
    // When to start the sound of a cut (seconds from now) so that it is
    // heard as the blade comes down: the recording peaks 0.14 s in.
    const SLASH_AT = () => Math.max(0, (CUT.wind + CUT.strike * 0.45) / 1000 - 0.14);

    function initThemeCut() {
        let busy = false;
        const signal = (phase) =>
            window.dispatchEvent(new CustomEvent("blade:cut", { detail: { phase, timing: CUT } }));

        window.portfolioThemeCut = (apply) => {
            if (busy) return;
            if (reduced || !document.startViewTransition) {
                apply();
                return;
            }
            busy = true;
            const sword = root.classList.contains("has-blade");
            root.classList.add("theme-cut");
            root.classList.toggle("theme-cut-blade", sword);
            // told before the page changes, so it keeps its finish until it
            // has left the screen
            signal("arm");
            let vt;
            try {
                vt = document.startViewTransition(apply);
            } catch (err) {
                apply();
            }
            const done = () => {
                root.classList.remove("theme-cut", "theme-cut-blade");
                busy = false;
            };
            if (!vt) {
                signal("cancel");
                done();
                return;
            }
            vt.ready
                .then(() => {
                    // A band along the top-right / bottom-left diagonal, as a
                    // four-cornered shape: zero wide at first, opening at the
                    // end the blade enters by, then to the whole screen.
                    const w = window.innerWidth;
                    const h = window.innerHeight;
                    const len = Math.hypot(w, h);
                    const dx = -w / len;
                    const dy = h / len;
                    const full = ((w * h) / len) * 1.08;
                    const band = (a, b) => {
                        const pt = (along, off) =>
                            `${(w / 2 + dx * along - dy * off).toFixed(1)}px ${(h / 2 + dy * along + dx * off).toFixed(1)}px`;
                        return `polygon(${pt(-len, a)}, ${pt(len, b)}, ${pt(len, -b)}, ${pt(-len, -a)})`;
                    };
                    const t0 = CUT.wind + CUT.strike * 0.35;
                    const t1 = CUT.wind + CUT.strike;
                    root.animate(
                        [
                            { clipPath: band(0, 0), offset: 0 },
                            { clipPath: band(0, 0), offset: t0 / CUT.total, easing: "ease-out" },
                            {
                                clipPath: band(full * 0.16, 0),
                                offset: t1 / CUT.total,
                                easing: "cubic-bezier(0.3, 0.5, 0.15, 1)",
                            },
                            { clipPath: band(full, full), offset: 1 },
                        ],
                        { duration: CUT.total, pseudoElement: "::view-transition-new(root)", fill: "both" },
                    );
                    signal(sword ? "go" : "cancel");
                    playSfx("slash", 1, SLASH_AT());
                })
                .catch(() => signal("cancel"));
            vt.finished.then(done, done);
        };
    }

    // ---- honors: each row's photo swings as it travels up the screen ------
    function initHonors() {
        const rows = $$(".honor-card")
            .map((el) => ({ el, shot: $(".honor-shot", el), top: 0, h: 1 }))
            .filter((r) => r.shot);
        if (!rows.length || reduced) return;
        measurers.push(() =>
            rows.forEach((r) => {
                r.top = docTop(r.el);
                r.h = r.el.offsetHeight;
            }),
        );
        tasks.push(() => {
            rows.forEach((r, i) => {
                if (sy + vh < r.top - 120 || sy > r.top + r.h + 120) return;
                const p = clamp((r.top + r.h / 2 - sy - vh / 2) / vh, -1, 1);
                const dir = i % 2 ? -1 : 1;
                put(r.shot, "rotate", `${(dir * (3 + p * 9)).toFixed(2)}deg`);
                put(r.shot, "translate", `0 ${(p * 34).toFixed(1)}px`);
            });
            return false;
        });
    }

    // ---- moments: photos the pointer knocks about ---------------------------
    // Loose prints on a table. The pointer shoves the ones its path crosses
    // (harder the faster it goes), they knock into each other, and one can
    // be picked up and thrown. They stay where they end up - until the page
    // scrolls, which is when each one goes back to its place.
    function initMoments() {
        const row = $(".moments-row");
        const figs = $$(".moment", row || document);
        if (!row || !figs.length) return;
        const TILT = [-7, 5, -4, 8, -6, 4];
        const DRIFT = [34, -22, 46, -30, 26, -38];
        const items = figs.map((el, i) => {
            const tilt = TILT[i % TILT.length];
            el.style.setProperty("--r", `${tilt}deg`);
            return {
                el, i, tilt,
                x: 0, y: 0, vx: 0, vy: 0, // where the pointer has taken it, in px
                r: 0, vr: 0, // and how far it has turned, in degrees
                held: false, parked: false,
                px: 0, py: 0, pt: 0,
                bx: 0, by: 0, w: 1, h: 1, drift: 0,
            };
        });
        if (reduced) return;

        let top = 0;
        let height = 1;
        let parkedAt = 0;
        let swordInHand = false;
        // where a photo's middle is on screen right now
        const centre = (it) => [it.bx + it.x, it.by - window.scrollY + it.y + it.drift];

        measurers.push(() => {
            top = docTop(row);
            height = row.offsetHeight;
            items.forEach((it) => {
                const r = it.el.getBoundingClientRect();
                it.bx = r.left + r.width / 2 - it.x;
                it.by = r.top + r.height / 2 + window.scrollY - it.y - it.drift;
                it.w = it.el.offsetWidth;
                it.h = it.el.offsetHeight;
            });
        });
        tasks.push(() => {
            if (sy + vh < top - 300 || sy > top + height + 300) return false;
            const p = clamp((top + height / 2 - sy - vh / 2) / vh, -1, 1);
            items.forEach((it) => {
                it.drift = p * DRIFT[it.i % DRIFT.length];
                put(it.el, "translate", `0 ${it.drift.toFixed(1)}px`);
            });
            return false;
        });

        let loop = 0;
        let lastT = 0;
        const step = (now) => {
            loop = 0;
            const dt = Math.min(0.04, (now - lastT) / 1000 || 0.016);
            lastT = now;
            for (const it of items) {
                if (it.held) {
                    // carried: it leans into the direction it is moving
                    it.r += (clamp(it.vx * 0.012, -16, 16) - it.r) * Math.min(1, dt * 10);
                    it.vr = 0;
                    continue;
                }
                if (it.parked) {
                    // left where it landed: it only slides to a stop
                    const drag = Math.exp(-dt * 3.2);
                    it.vx *= drag;
                    it.vy *= drag;
                    it.vr *= Math.exp(-dt * 3.8);
                } else {
                    // a spring pulls it back to where it hangs
                    it.vx += (-70 * it.x - 9 * it.vx) * dt;
                    it.vy += (-70 * it.y - 9 * it.vy) * dt;
                    it.vr += (-60 * it.r - 9 * it.vr) * dt;
                }
                it.x += it.vx * dt;
                it.y += it.vy * dt;
                it.r += it.vr * dt;
                if (it.parked) {
                    // the edges of the screen are the edges of the table
                    const [cx, cy] = centre(it);
                    const mx = it.w * 0.3;
                    if (cx < mx || cx > vw - mx) {
                        it.x += (cx < mx ? mx : vw - mx) - cx;
                        if ((cx < mx) === it.vx < 0) it.vx *= -0.5;
                    }
                    const lo = 70 + it.h * 0.2;
                    const hi = vh - it.h * 0.2;
                    if (cy < lo || cy > hi) {
                        it.y += (cy < lo ? lo : hi) - cy;
                        if ((cy < lo) === it.vy < 0) it.vy *= -0.5;
                    }
                }
            }
            // prints that run into each other pass the push on
            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    const a = items[i];
                    const b = items[j];
                    // on their way home they pass through each other: only
                    // one that was pushed or is being carried can knock another
                    if (!(a.parked || a.held || b.parked || b.held)) continue;
                    const [ax, ay] = centre(a);
                    const [bx, by] = centre(b);
                    const dx = bx - ax;
                    const dy = by - ay;
                    const d = Math.hypot(dx, dy) || 1;
                    const reach = (a.w + a.h + b.w + b.h) * 0.19;
                    if (d >= reach) continue;
                    const nx = dx / d;
                    const ny = dy / d;
                    const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                    if (closing > -40) continue;
                    const push = closing * 0.78;
                    if (!a.held) {
                        a.vx += push * nx * (b.held ? 2 : 1);
                        a.vy += push * ny * (b.held ? 2 : 1);
                        a.vr += push * 0.12;
                        a.parked = true;
                    }
                    if (!b.held) {
                        b.vx -= push * nx * (a.held ? 2 : 1);
                        b.vy -= push * ny * (a.held ? 2 : 1);
                        b.vr -= push * 0.12;
                        b.parked = true;
                    }
                    parkedAt = window.scrollY;
                }
            }
            let alive = false;
            for (const it of items) {
                const away = it.parked ? 0 : Math.abs(it.x) + Math.abs(it.y) + Math.abs(it.r) * 3;
                const busy = it.held || away > 0.3 || Math.abs(it.vx) + Math.abs(it.vy) > 4 || Math.abs(it.vr) > 3;
                if (busy) {
                    alive = true;
                } else {
                    it.vx = it.vy = it.vr = 0;
                    if (!it.parked) it.x = it.y = it.r = 0;
                }
                it.el.style.setProperty("--dx", `${it.x.toFixed(1)}px`);
                it.el.style.setProperty("--dy", `${it.y.toFixed(1)}px`);
                it.el.style.setProperty("--dr", `${it.r.toFixed(2)}deg`);
            }
            if (alive) loop = requestAnimationFrame(step);
        };
        const kick = () => {
            if (loop) return;
            lastT = performance.now();
            loop = requestAnimationFrame(step);
        };

        // scrolling is what sends them home
        window.addEventListener(
            "scroll",
            () => {
                if (Math.abs(window.scrollY - parkedAt) <= 4) return;
                let any = false;
                for (const it of items) {
                    if (it.parked && !it.held) {
                        it.parked = false;
                        any = true;
                    }
                }
                if (any) kick();
            },
            { passive: true },
        );

        // The pointer as something solid: a print is pushed where the
        // pointer's path actually crosses it, never from a distance. The
        // path is walked in short steps so a fast sweep does not jump over.
        let was = null;
        window.addEventListener("blade:hover", (e) => {
            swordInHand = e.detail.state === "held";
        });
        window.addEventListener(
            "pointermove",
            (e) => {
                if (e.pointerType === "touch") return;
                const from = was;
                was = { x: e.clientX, y: e.clientY, t: e.timeStamp };
                if (!from || e.timeStamp - from.t > 120 || swordInHand) return;
                if (items.some((it) => it.held)) return;
                const rowTop = top - window.scrollY;
                if (e.clientY < rowTop - 320 || e.clientY > rowTop + height + 320) return;
                const dx = e.clientX - from.x;
                const dy = e.clientY - from.y;
                const ms = Math.max(8, e.timeStamp - from.t);
                const vx = clamp((dx / ms) * 1000, -2800, 2800);
                const vy = clamp((dy / ms) * 1000, -2800, 2800);
                // moving slowly it is a hand reaching for one, not a shove
                if (Math.hypot(vx, vy) < 240) return;
                const steps = clamp(Math.ceil(Math.hypot(dx, dy) / 10), 1, 14);
                let hit = false;
                for (const it of items) {
                    const [cx, cy] = centre(it);
                    const ang = ((it.tilt + it.r) * Math.PI) / 180;
                    const ca = Math.cos(ang);
                    const sa = Math.sin(ang);
                    for (let s = 1; s <= steps; s++) {
                        const px = from.x + (dx * s) / steps - cx;
                        const py = from.y + (dy * s) / steps - cy;
                        if (Math.abs(px * ca + py * sa) > it.w / 2 || Math.abs(py * ca - px * sa) > it.h / 2) continue;
                        // it leaves with most of the pointer's speed, turning
                        // if it was caught off-centre
                        it.vx += (vx * 0.8 - it.vx) * 0.6;
                        it.vy += (vy * 0.8 - it.vy) * 0.6;
                        it.vr = clamp(it.vr + (px * vy - py * vx) * 0.0024, -540, 540);
                        it.parked = true;
                        hit = true;
                        break;
                    }
                }
                if (hit) {
                    parkedAt = window.scrollY;
                    kick();
                }
            },
            { passive: true },
        );

        items.forEach((it) => {
            it.el.addEventListener("pointerdown", (e) => {
                if (e.pointerType === "touch" || e.button !== 0) return;
                e.preventDefault();
                it.el.setPointerCapture(e.pointerId);
                it.held = true;
                it.px = e.clientX;
                it.py = e.clientY;
                it.pt = e.timeStamp;
                it.vx = it.vy = 0;
                it.el.classList.add("is-held");
                kick();
            });
            it.el.addEventListener("pointermove", (e) => {
                if (!it.held) return;
                const dt = Math.max(8, e.timeStamp - it.pt) / 1000;
                const dx = e.clientX - it.px;
                const dy = e.clientY - it.py;
                it.x += dx;
                it.y += dy;
                it.vx = it.vx * 0.5 + (dx / dt) * 0.5;
                it.vy = it.vy * 0.5 + (dy / dt) * 0.5;
                it.px = e.clientX;
                it.py = e.clientY;
                it.pt = e.timeStamp;
            });
            const drop = (e) => {
                if (!it.held) return;
                it.held = false;
                it.el.classList.remove("is-held");
                // a pause before letting go is setting it down, not a throw
                const still = e && e.timeStamp - it.pt > 90;
                it.vx = still ? 0 : clamp(it.vx, -3600, 3600);
                it.vy = still ? 0 : clamp(it.vy, -3600, 3600);
                it.parked = true;
                parkedAt = window.scrollY;
                kick();
            };
            it.el.addEventListener("pointerup", drop);
            it.el.addEventListener("pointercancel", drop);
            it.el.addEventListener("lostpointercapture", drop);
        });
    }

    // ---- videos: the screenshot of a live project starts playing ----------
    // A short recording of the real site being scrolled sits exactly over the
    // screen drawn in the thumbnail. It plays on hover, or while its card is
    // the one in the middle of the pinned track; nothing loads before that.
    let focusCard = () => {};

    function initVideos() {
        const saveData = navigator.connection && navigator.connection.saveData;
        const imgs = $$(".project-img[data-video]");
        if (!imgs.length || reduced || saveData) return;
        const items = new Map();

        const update = (it) => {
            const want = it.hover || it.focus;
            if (want && !it.video) {
                const v = document.createElement("video");
                v.className = "project-video";
                v.muted = true;
                v.loop = true;
                v.playsInline = true;
                v.preload = "auto";
                v.setAttribute("aria-hidden", "true");
                v.src = it.img.dataset.video;
                v.addEventListener("playing", () => it.box.classList.toggle("is-playing", it.hover || it.focus));
                it.box.append(v);
                it.video = v;
            }
            if (!it.video) return;
            if (want) {
                const p = it.video.play();
                if (p) p.catch(() => {});
            } else {
                it.video.pause();
                it.box.classList.remove("is-playing");
            }
        };

        imgs.forEach((img) => {
            const card = img.closest(".project-card");
            const it = { card, img, box: img.parentElement, video: null, hover: false, focus: false };
            items.set(card, it);
            it.box.classList.add("has-video");
            card.addEventListener("pointerenter", (e) => {
                if (e.pointerType === "touch") return;
                it.hover = true;
                update(it);
            });
            card.addEventListener("pointerleave", () => {
                it.hover = false;
                update(it);
            });
        });

        focusCard = (el) => {
            items.forEach((it, card) => {
                const f = card === el;
                if (f === it.focus) return;
                it.focus = f;
                update(it);
            });
        };

        // swipe carousel: the card that is fully in view plays
        const grid = $(".projects-grid");
        if (grid && "IntersectionObserver" in window) {
            const io = new IntersectionObserver(
                (entries) =>
                    entries.forEach((en) => {
                        const pinned = grid.closest(".hscroll");
                        if (pinned) return;
                        const it = items.get(en.target);
                        if (!it) return;
                        it.focus = en.isIntersecting;
                        update(it);
                    }),
                { root: grid, threshold: 0.8 },
            );
            items.forEach((it, card) => io.observe(card));
        }
    }

    // ---- deck: Certificates, cut through one by one ------------------------
    // Wide screens: the section is pinned and the cards lie in a pile, one
    // showing at a time. Each step of the scroll is a cut: the card on top
    // parts along the diagonal the sword lies on, its two halves slide away,
    // and the next one is there underneath. Scrolling back puts it together.
    // Small screens keep the swipe carousel (initPinned with pin: false,
    // which also made the counter this uses).
    function initDeck() {
        const sec = $("#certificates");
        const cont = sec && $(".container", sec);
        const grid = sec && $(".certificates-grid", sec);
        const ui = sec && $(".hs-ui", sec);
        const cards = grid ? $$(".certificate-card", grid) : [];
        if (cards.length < 2 || !cont || !ui || reduced) return;
        const fits = window.matchMedia("(min-width: 900px) and (min-height: 560px)");
        const countNow = $(".hs-count b", ui);
        const bar = $(".hs-bar span", ui);
        const hint = $(".hs-hint", ui);
        const n = cards.length;
        const items = cards.map((el) => {
            const slash = make("i", "cert-slash");
            slash.setAttribute("aria-hidden", "true");
            el.append(slash);
            return { el, slash, pieces: null, cutting: false };
        });
        const pin = { sec, cardSel: ".certificate-card", on: false, top: 0, travel: 0, gutter: 0 };
        pins.push(pin);
        // the stretch of each step in which the cut happens: the rest of it
        // is a whole card to read
        const CUT0 = 0.28;
        const CUT1 = 0.78;
        let step = 1;
        let shown = -1;
        let lastY = sy;
        let lastT = 0;
        let speed = 0;

        const dropPieces = (it) => {
            if (!it.cutting) return;
            it.cutting = false;
            it.pieces.forEach((p) => (p.style.display = "none"));
            it.el.style.visibility = "";
            if (it.el.__fx) it.el.__fx.visibility = "";
        };
        const forget = (it) => {
            dropPieces(it);
            if (it.pieces) it.pieces.forEach((p) => p.remove());
            it.pieces = null;
        };
        // the two halves of a card, on either side of the screen's diagonal
        const build = (it) => {
            const el = it.el;
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            const st = getComputedStyle(el);
            const bl = parseFloat(st.borderLeftWidth) || 0;
            const bt = parseFloat(st.borderTopWidth) || 0;
            const len = Math.hypot(vw, vh);
            const tx = -vw / len;
            const ty = vh / len;
            // the normal points up and to the left
            const nx = -ty;
            const ny = tx;
            const far = Math.hypot(w, h) + 80;
            const pt = (along, off) =>
                `${(w / 2 + tx * along + nx * off).toFixed(1)}px ${(h / 2 + ty * along + ny * off).toFixed(1)}px`;
            const copies = [el.cloneNode(true), el.cloneNode(true)];
            it.pieces = [1, -1].map((side, i) => {
                const piece = document.createElement("cut-piece");
                piece.setAttribute("aria-hidden", "true");
                piece.style.cssText =
                    `left:${-bl}px;top:${-bt}px;width:${w}px;height:${h}px;display:none;` +
                    `clip-path:polygon(${pt(-far, 0)}, ${pt(far, 0)}, ${pt(far, far * side)}, ${pt(-far, far * side)})`;
                const copy = copies[i];
                copy.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
                copy.querySelectorAll("a, button").forEach((node) => node.setAttribute("tabindex", "-1"));
                copy.classList.add("cut-copy");
                piece.append(copy);
                piece.cut = { side, tx, ty, nx, ny, w };
                return piece;
            });
            el.append(...it.pieces);
        };
        const cutTo = (it, c) => {
            if (!it.pieces) build(it);
            if (!it.cutting) {
                it.cutting = true;
                it.pieces.forEach((p) => (p.style.display = ""));
                it.el.style.visibility = "hidden";
            }
            const fade = clamp(1 - (c - 0.5) / 0.5, 0, 1);
            it.pieces.forEach((p) => {
                const k = p.cut;
                // apart across the cut, and slipping along it in opposite ways
                const off = c * k.w * 0.42 * k.side;
                const slip = -c * 70 * k.side;
                const x = k.nx * off + k.tx * slip;
                const y = k.ny * off + k.ty * slip;
                p.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(-9 * c * k.side).toFixed(2)}deg)`;
                p.style.opacity = fade.toFixed(3);
            });
        };

        const setHint = () => {
            if (pin.on) hint.textContent = lang() === "es" ? "sigue bajando ↓" : "keep scrolling ↓";
        };
        relangers.push(setHint);

        const reset = () => {
            items.forEach((it) => {
                forget(it);
                for (const p of ["transform", "opacity", "visibility", "pointerEvents", "zIndex"]) it.el.style[p] = "";
                it.el.__fx = {};
            });
        };
        const disable = () => {
            pin.on = false;
            sec.classList.remove("deck");
            sec.style.height = "";
            reset();
        };

        measurers.push(() => {
            const want = canPin && fits.matches;
            if (!want) {
                if (pin.on) disable();
                return;
            }
            pin.on = true;
            sec.classList.add("deck");
            sec.style.height = "";
            reset();
            // the pinned frame must fit on screen, otherwise use the grid
            if (cont.scrollHeight > cont.clientHeight + 6) {
                disable();
                return;
            }
            step = Math.round(vh * 0.62);
            pin.travel = step * (n - 1);
            sec.style.height = `${vh + pin.travel}px`;
            pin.top = docTop(sec);
            items.forEach((it, j) => (it.el.style.zIndex = String(n - j)));
            // the line of the cut runs the way the screen's diagonal does
            grid.style.setProperty("--cut-angle", `${((Math.atan2(vh, -vw) * 180) / Math.PI).toFixed(2)}deg`);
            shown = -1;
            setHint();
        });

        tasks.push((now) => {
            if (!pin.on) return false;
            const ms = lastT ? now - lastT : 16;
            if (ms > 0) speed = ((sy - lastY) / ms) * 1000;
            lastY = sy;
            lastT = now;
            if (sy + vh < pin.top - 200 || sy > pin.top + pin.travel + vh + 200) return false;
            const P = clamp((sy - pin.top) / step, 0, n - 1);
            // the card being cut (the last one never is)
            const k = Math.min(n - 2, Math.floor(P));
            const c = smooth(clamp((P - k - CUT0) / (CUT1 - CUT0), 0, 1));
            items.forEach((it, j) => {
                const d = j - k - c; // 0: on top of the pile
                if (j < k || d > 3.4 || (j === k && c >= 1)) {
                    dropPieces(it);
                    put(it.el, "visibility", "hidden");
                    return;
                }
                if (j === k) {
                    if (c > 0) {
                        // the blade has just gone in: light along the cut
                        if (!it.cutting && speed > 0) {
                            it.slash.animate(
                                [
                                    { opacity: 0, scale: "0.05 1" },
                                    { opacity: 1, scale: "1 1", offset: 0.3 },
                                    { opacity: 0, scale: "1.05 1" },
                                ],
                                { duration: 460, easing: "ease-out" },
                            );
                            if (speed < 5000) playSfx("slash", 0.4);
                        }
                        it.el.__fx.visibility = "hidden";
                        cutTo(it, c);
                    } else {
                        dropPieces(it);
                        put(it.el, "visibility", "");
                    }
                    put(it.el, "transform", "none");
                    put(it.el, "opacity", "1");
                    put(it.el, "pointerEvents", "");
                    return;
                }
                dropPieces(it);
                put(it.el, "visibility", "");
                put(it.el, "transform", `translate3d(0, ${(d * 16).toFixed(1)}px, 0) scale(${(1 - d * 0.05).toFixed(4)})`);
                put(it.el, "opacity", clamp(3.4 - d, 0, 1).toFixed(3));
                put(it.el, "pointerEvents", d > 0.5 ? "none" : "");
            });
            const at = k + c;
            const i = Math.round(at);
            if (i !== shown) {
                shown = i;
                countNow.textContent = String(i + 1).padStart(2, "0");
            }
            put(bar, "transform", `scaleX(${(at / (n - 1)).toFixed(4)})`);
            ui.classList.toggle("is-moving", P > 0.06);
            return false;
        });

        // Never left on a half-cut card: when the scroll comes to rest in
        // the middle of a cut it finishes it, or takes it back.
        let idle = 0;
        const settle = () => {
            if (!pin.on) return;
            const y = window.scrollY;
            if (y <= pin.top || y >= pin.top + pin.travel) return;
            const P = (y - pin.top) / step;
            const k = Math.floor(P);
            const f = P - k;
            if (f <= CUT0 || f >= CUT1) return;
            const to = pin.top + (k + (f < (CUT0 + CUT1) / 2 ? 0.16 : 0.9)) * step;
            if (lenis) lenis.scrollTo(to, { duration: 0.55, easing: (t) => 1 - Math.pow(1 - t, 3) });
            else window.scrollTo({ top: to, behavior: "smooth" });
        };
        window.addEventListener(
            "scroll",
            () => {
                if (!pin.on) return;
                clearTimeout(idle);
                idle = setTimeout(settle, 190);
            },
            { passive: true },
        );

        // keyboard: tabbing into a card further down the pile brings it up
        grid.addEventListener("focusin", (e) => {
            if (!pin.on) return;
            const j = items.findIndex((it) => it.el.contains(e.target) && !e.target.closest("cut-piece"));
            if (j < 0) return;
            const P = (window.scrollY - pin.top) / step;
            if (Math.abs(P - j) < 0.25) return;
            window.scrollTo({ top: pin.top + j * step + 2, behavior: "auto" });
        });
    }

    // ---- sparks: a burst of them from a point on the screen ----------------
    function burst(x, y, count = 16) {
        const host = make("div", "cv-sparks");
        host.setAttribute("aria-hidden", "true");
        host.style.left = `${x}px`;
        host.style.top = `${y}px`;
        for (let i = 0; i < count; i++) {
            const s = make("i");
            const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const d = 60 + Math.random() * 90;
            s.style.setProperty("--dx", `${(Math.cos(a) * d).toFixed(0)}px`);
            s.style.setProperty("--dy", `${(Math.sin(a) * d * 0.7).toFixed(0)}px`);
            s.style.setProperty("--r", `${(a * 57.3).toFixed(0)}deg`);
            s.style.animationDelay = `${(Math.random() * 90).toFixed(0)}ms`;
            host.append(s);
        }
        document.body.append(host);
        setTimeout(() => host.remove(), 1100);
    }

    // ---- CV: the button answers the click --------------------------------
    // The link still downloads the file on its own; this is only feedback:
    // a cut of light, sparks, the label confirming, and the sword's flourish.
    function initCV() {
        const btn = $(".btn-cv");
        const icon = btn && $("i", btn);
        const label = btn && $("span", btn);
        if (!btn || !icon || !label) return;
        const TEXT = {
            en: ["Downloading…", "CV downloaded"],
            es: ["Descargando…", "CV descargado"],
        };
        let busy = false;

        btn.addEventListener("click", () => {
            if (busy) return;
            busy = true;
            const iconWas = icon.className;
            btn.style.minWidth = `${btn.offsetWidth}px`;
            btn.classList.add("is-loading");
            label.textContent = TEXT[lang()][0];
            if (!reduced) {
                const r = btn.getBoundingClientRect();
                burst(r.left + r.width / 2, r.top + r.height / 2);
                window.dispatchEvent(new Event("blade:slash"));
            }
            setTimeout(() => {
                btn.classList.remove("is-loading");
                btn.classList.add("is-done");
                icon.className = "fas fa-check";
                label.textContent = TEXT[lang()][1];
            }, 1150);
            setTimeout(() => {
                btn.classList.remove("is-done");
                icon.className = iconWas;
                label.textContent = label.getAttribute(`data-${lang()}`) || label.textContent;
                btn.style.minWidth = "";
                busy = false;
            }, 3600);
        });
    }

    // ---- boot ------------------------------------------------------------
    function boot() {
        root.classList.add("fx");
        if (forced && forced[1] === "lite") setLite();
        initScroll();
        // these change the page height, so they are measured first
        initStack();
        initPinned({
            id: "#projects",
            gridSel: ".projects-grid",
            cardSel: ".project-card",
            effect: dealIn,
            onFocus: (el) => focusCard(el),
        });
        initPinned({
            id: "#certificates",
            gridSel: ".certificates-grid",
            cardSel: ".certificate-card",
            effect: () => {},
            pin: false,
        });
        initDeck();
        initWorld();
        initHero();
        initNav();
        initWords();
        initKinetic();
        initSections();
        initLetters();
        initTech();
        initHonors();
        initMoments();
        initVideos();
        initPhoto();
        initTrail();
        initFooter();
        initPointer();
        initSound();
        initCursor();
        initThemeCut();
        initCV();

        measureAll();
        window.addEventListener("scroll", tick, { passive: true });
        window.addEventListener("resize", measureSoon);
        window.addEventListener("load", measureAll);
        if (document.fonts) document.fonts.ready.then(measureAll);
        if ("ResizeObserver" in window) new ResizeObserver(measureSoon).observe(document.body);
        new MutationObserver(() => {
            relangers.forEach((fn) => fn());
            measureSoon();
        }).observe(root, { attributes: true, attributeFilter: ["lang"] });

        // the 3D katana: needs WebGL, and never runs under reduced motion
        const saveData = navigator.connection && navigator.connection.saveData;
        if (!reduced && !saveData && window.WebGLRenderingContext) {
            const start = () =>
                import("./blade.js")
                    .then((m) => m.initBlade())
                    .then((ok) => {
                        if (ok) root.classList.add("has-blade");
                    })
                    .catch(() => {});
            if (document.readyState === "complete") start();
            else window.addEventListener("load", start, { once: true });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
