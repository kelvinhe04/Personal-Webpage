const themeToggle = document.getElementById("themeToggle");
const languageToggle = document.getElementById("languageToggle");
const goTopBtn = document.querySelector(".go-top-btn");
const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
).matches;

// Theme Toggle
themeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    const apply = () => {
        document.body.classList.toggle("light-mode");
        const icon = themeToggle.querySelector("i");
        icon.classList.toggle("fa-sun");
        icon.classList.toggle("fa-moon");
    };
    // motion.js reveals the new theme with a cut across the page, if loaded
    if (window.portfolioThemeCut) window.portfolioThemeCut(apply);
    else apply();
});

// Language Toggle - Initialize immediately
// Saved choice first; otherwise the browser's preferred language (Spanish
// if any of the user's languages is Spanish, English for everyone else)
function detectLanguage() {
    try {
        const saved = localStorage.getItem("language");
        if (saved === "es" || saved === "en") return saved;
    } catch (e) {
        // storage blocked (private mode): fall through to the browser language
    }
    const prefs =
        navigator.languages && navigator.languages.length
            ? navigator.languages
            : [navigator.language || "en"];
    return prefs.some((l) => String(l).toLowerCase().startsWith("es"))
        ? "es"
        : "en";
}

let currentLanguage = detectLanguage();

// Function to change language
function changeLanguage(lang) {
    currentLanguage = lang;
    try {
        localStorage.setItem("language", lang);
    } catch (e) {
        // storage blocked: the choice just won't persist
    }
    document.documentElement.lang = lang;

    // Update language label and active color
    if (languageToggle) {
        const label = languageToggle.querySelector(".language-label");
        if (label) label.textContent = lang === "es" ? "ES" : "EN";
        languageToggle.style.color = lang === "es" ? "var(--accent-color)" : "";
    }

    // Update all elements with language attributes
    const elements = document.querySelectorAll("[data-en][data-es]");
    elements.forEach((element) => {
        const text = element.getAttribute(`data-${lang}`);
        if (text) {
            element.textContent = text;
        }
    });

    // Update specific complex elements
    updateComplexElements(lang);
}

// Function to update complex elements that need special handling
function updateComplexElements(lang) {
    // Point the CV download button to the CV in the current language
    document.querySelectorAll("[data-cv-en][data-cv-es]").forEach((link) => {
        link.setAttribute("href", link.getAttribute(`data-cv-${lang}`));
    });

    // Update "Show more" buttons in the experience timeline (the text
    // length changes with the language, so re-check which ones are needed)
    updateReadMoreButtons();
    refreshReadMore();

    // Update form placeholders
    const formInputs = document.querySelectorAll(".form-input");
    formInputs.forEach((input) => {
        const name = input.getAttribute("name");
        if (name === "from_name") {
            input.placeholder = lang === "es" ? "Tu nombre" : "Your name";
        } else if (name === "reply_to") {
            input.placeholder = lang === "es" ? "Tu email" : "Your email";
        } else if (name === "subject") {
            input.placeholder = lang === "es" ? "Asunto" : "Subject";
        } else if (name === "message") {
            input.placeholder = lang === "es" ? "Tu mensaje" : "Your message";
        }
    });

    // Update submit button
    const submitBtn = document.getElementById("submit-btn");
    if (submitBtn && !submitBtn.disabled) {
        submitBtn.textContent =
            lang === "es" ? "Enviar Mensaje" : "Send Message";
    }
}

// Language toggle event listener
if (languageToggle) {
    languageToggle.addEventListener("click", (e) => {
        e.preventDefault();
        const newLang = currentLanguage === "en" ? "es" : "en";
        changeLanguage(newLang);
        typeHeroTitle(newLang);
    });
}

// ============================
// HERO TYPING EFFECT
// ============================
//
// The full title is rendered up front as one <span> per character, all
// invisible, and the characters are revealed one by one. Because the text
// already occupies its final space, nothing reflows while typing: words
// never jump to the next line mid-word and the subtitle/buttons below
// don't shift down. Timing is driven by requestAnimationFrame against a
// precomputed schedule, so a busy main thread (images decoding, fonts
// loading) makes the animation catch up instead of stuttering.

const HERO_NAME = "Kelvin He";
const HERO_GREETING = { en: "Hello, I'm ", es: "Hola, soy " };
const TYPE_SPEED = 62; // ms per character - steady, human cadence
const TYPE_COMMA_PAUSE = 200; // short beat after "Hello,"
const TYPE_START_DELAY = 250;

let typingRun = 0; // bumped on every new run to cancel the previous one

function buildHeroTitle(greeting) {
    const title = document.querySelector(".hero-title");
    if (!title) return null;

    title.setAttribute("aria-label", greeting + HERO_NAME);
    title.textContent = "";

    const chars = [];
    [
        [greeting, "hero-greeting"],
        [HERO_NAME, "highlight"],
    ].forEach(([text, className]) => {
        const group = document.createElement("span");
        group.className = className;
        group.setAttribute("aria-hidden", "true");
        for (const ch of text) {
            const charEl = document.createElement("span");
            charEl.className = "hero-char";
            charEl.textContent = ch;
            group.appendChild(charEl);
            chars.push(charEl);
        }
        title.appendChild(group);
    });

    title.classList.add("is-ready");
    return { title, chars };
}

function moveCaret(chars, index) {
    chars.forEach((c) => c.classList.remove("has-caret", "has-caret-start"));
    if (index < 0) {
        chars[0].classList.add("has-caret-start");
    } else {
        chars[index].classList.add("has-caret");
    }
}

function typeHeroTitle(lang) {
    const run = ++typingRun;
    const built = buildHeroTitle(HERO_GREETING[lang] || HERO_GREETING.en);
    if (!built) return;
    const { title, chars } = built;

    if (prefersReducedMotion) {
        chars.forEach((c) => c.classList.add("is-typed"));
        moveCaret(chars, chars.length - 1);
        return;
    }

    // Precompute when each character appears (ms from start)
    const schedule = [];
    let t = 0;
    chars.forEach((c, i) => {
        schedule.push(t);
        t += TYPE_SPEED;
        if (c.textContent === "," && i < chars.length - 1) {
            t += TYPE_COMMA_PAUSE;
        }
    });

    title.classList.add("is-typing");
    moveCaret(chars, -1);

    // Wait for Inter (capped, so a slow font never blocks the hero)
    const fontsReady = Promise.race([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, 800)),
    ]);

    fontsReady.then(() => {
        if (run !== typingRun) return;
        let start = null;
        let shown = 0;

        function frame(now) {
            if (run !== typingRun) return;
            if (start === null) start = now + TYPE_START_DELAY;
            const elapsed = now - start;

            while (shown < chars.length && schedule[shown] <= elapsed) {
                chars[shown].classList.add("is-typed");
                shown++;
            }
            if (shown > 0) moveCaret(chars, shown - 1);

            if (shown < chars.length) {
                requestAnimationFrame(frame);
            } else {
                title.classList.remove("is-typing");
            }
        }

        requestAnimationFrame(frame);
    });
}

// Initialize language and typing effect on page load
document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.lang = currentLanguage;

    // Initialize language for all elements
    const elements = document.querySelectorAll("[data-en][data-es]");
    elements.forEach((element) => {
        const text = element.getAttribute(`data-${currentLanguage}`);
        if (text) {
            element.textContent = text;
        }
    });

    // Update language label
    if (languageToggle) {
        const label = languageToggle.querySelector(".language-label");
        if (label) label.textContent = currentLanguage === "es" ? "ES" : "EN";
        languageToggle.style.color =
            currentLanguage === "es" ? "var(--accent-color)" : "";
    }

    setupReadMore();

    // Update complex elements (forms, buttons, etc.)
    updateComplexElements(currentLanguage);

    typeHeroTitle(currentLanguage);
});

// ============================
// MOUSE GLOW EFFECT
// ============================
//
// A single fixed element moved with transform (compositor-only). The old
// version wrote CSS variables on <html> on every mousemove, which forced a
// style recalculation of the whole page each time and made other
// animations (like the hero typing) drop frames.

if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const glow = document.createElement("div");
    glow.className = "cursor-glow";
    glow.setAttribute("aria-hidden", "true");
    document.body.appendChild(glow);

    let glowX = 0;
    let glowY = 0;
    let glowFrame = null;

    document.addEventListener(
        "mousemove",
        (e) => {
            glowX = e.clientX;
            glowY = e.clientY;
            if (glowFrame === null) {
                glowFrame = requestAnimationFrame(() => {
                    glow.style.transform = `translate3d(${glowX}px, ${glowY}px, 0)`;
                    glowFrame = null;
                });
            }

            // Always on once the cursor has been seen (stays where the
            // cursor last was, also when it rests or leaves the window)
            glow.classList.add("is-active");
        },
        { passive: true },
    );
}

// ============================
// EXPERIENCE "SHOW MORE"
// ============================

function setupReadMore() {
    document.querySelectorAll(".timeline-description").forEach((desc) => {
        if (desc.nextElementSibling?.classList.contains("read-more-btn")) {
            return;
        }
        desc.classList.add("is-clamped");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "read-more-btn";
        btn.setAttribute("aria-expanded", "false");
        desc.after(btn);

        btn.addEventListener("click", () => {
            const expanded = desc.classList.toggle("is-clamped") === false;
            btn.setAttribute("aria-expanded", String(expanded));
            updateReadMoreButtons();
        });
    });

    refreshReadMore();
    // Only a change of width can change where a description wraps. (A
    // phone's address bar coming and going is a resize too, and this was
    // measuring every description on each one, in the middle of a scroll.)
    let width = window.innerWidth;
    window.addEventListener("resize", () => {
        if (window.innerWidth === width) return;
        width = window.innerWidth;
        refreshReadMore();
    });
    window.addEventListener("load", refreshReadMore);
    if (document.fonts) document.fonts.ready.then(refreshReadMore);
}

// Only show the button where the text actually overflows the clamp. An
// expanded description is clamped for the measurement and put back.
function refreshReadMore() {
    document.querySelectorAll(".read-more-btn").forEach((btn) => {
        const desc = btn.previousElementSibling;
        if (!desc) return;
        const expanded = !desc.classList.contains("is-clamped");
        if (expanded) desc.classList.add("is-clamped");
        const fits = desc.scrollHeight <= desc.clientHeight + 2;
        if (expanded && !fits) desc.classList.remove("is-clamped");
        if (expanded && fits) btn.setAttribute("aria-expanded", "false");
        btn.hidden = fits;
    });
}

function updateReadMoreButtons() {
    document.querySelectorAll(".read-more-btn").forEach((btn) => {
        const expanded = btn.getAttribute("aria-expanded") === "true";
        const label = expanded
            ? currentLanguage === "es"
                ? "Mostrar menos"
                : "Show less"
            : currentLanguage === "es"
              ? "Mostrar más"
              : "Show more";
        btn.innerHTML = `<span>${label}</span> <i class="fas fa-chevron-${expanded ? "up" : "down"}" aria-hidden="true"></i>`;
    });
}

// Mobile menu toggle
const hamburger = document.querySelector(".hamburger");
const navMenu = document.querySelector(".nav-menu");

function setMenuOpen(open) {
    hamburger.classList.toggle("active", open);
    navMenu.classList.toggle("active", open);
    hamburger.setAttribute("aria-expanded", String(open));
    // Lock page scroll behind the full-screen mobile menu
    document.body.classList.toggle("menu-open", open);
}

hamburger.addEventListener("click", () => {
    setMenuOpen(!navMenu.classList.contains("active"));
});

hamburger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setMenuOpen(!navMenu.classList.contains("active"));
    }
});

// Close mobile menu when clicking on a link
document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
        const href = this.getAttribute("href");
        if (href === "#") return; // buttons like the theme/language toggles
        e.preventDefault();
        // motion.js (smooth scrolling, pinned sections) takes over if loaded
        if (window.portfolioGoTo && window.portfolioGoTo(href)) return;
        const target = document.querySelector(href);
        if (target) {
            // getBoundingClientRect works for nested targets too (offsetTop
            // is relative to the nearest positioned ancestor, not the page)
            // The navbar itself (logo and "go to top" button link to it) is
            // position:fixed, so its rect is always 0 - scroll to the top.
            const offsetTop =
                target.id === "navbar"
                    ? 0
                    : target.getBoundingClientRect().top + window.scrollY - 70; // Account for fixed navbar
            window.scrollTo({
                top: offsetTop,
                behavior: prefersReducedMotion ? "auto" : "smooth",
            });
        }
    });
});

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            // Si es un contenedor con múltiples elementos (como projects-grid)
            const isContainer =
                entry.target.classList.contains("about-content") ||
                entry.target.classList.contains("contact-content");

            if (isContainer) {
                // Animar directamente sin delay
                entry.target.classList.add("fade-in-up");
            } else {
                // Para elementos individuales, agregar delay si hay múltiples
                const siblings = entry.target.parentElement.querySelectorAll(
                    ".project-card, .tech-category",
                );
                const index = Array.from(siblings).indexOf(entry.target);

                setTimeout(() => {
                    entry.target.classList.add("fade-in-up");
                }, Math.min(index, 3) * 150); // 150ms delay entre cada elemento
            }

            // Desconectar el observer para este elemento después de animar
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener("DOMContentLoaded", () => {
    // Excluir proyectos ocultos del observer para evitar doble animación
    const animateElements = document.querySelectorAll(
        ".project-card, .tech-category, .about-content, .contact-content, .timeline-item, .certificate-card, .honor-card",
    );
    animateElements.forEach((el) => {
        observer.observe(el);
    });
});

// Form submission handling
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("contact-form");
    const submitBtn = document.getElementById("submit-btn");

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const name = form
                .querySelector('input[name="from_name"]')
                .value.trim();
            const email = form
                .querySelector('input[name="reply_to"]')
                .value.trim();
            const subject = form
                .querySelector('input[name="subject"]')
                .value.trim();
            const message = form
                .querySelector('textarea[name="message"]')
                .value.trim();

            if (!name || !email || !subject || !message) {
                showNotification(
                    "Por favor, completa todos los campos.",
                    "error",
                );
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showNotification(
                    "Por favor, introduce un email válido.",
                    "error",
                );
                return;
            }

            if (name.length < 2) {
                showNotification(
                    "El nombre debe tener al menos 2 caracteres.",
                    "error",
                );
                return;
            }

            if (subject.length < 3) {
                showNotification(
                    "El asunto debe tener al menos 3 caracteres.",
                    "error",
                );
                return;
            }

            if (message.length < 10) {
                showNotification(
                    "El mensaje debe tener al menos 10 caracteres.",
                    "error",
                );
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Enviando...';

            try {
                const payload = JSON.stringify({
                    from_name: name,
                    reply_to: email,
                    subject,
                    message,
                });

                const response = await fetch("/api/send-contact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: payload,
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    showNotification(result.message, "success");
                    form.reset();
                } else {
                    showNotification(
                        result.message || "Error al enviar el mensaje. Inténtalo de nuevo.",
                        "error",
                    );
                }
            } catch (error) {
                console.error("Error sending email:", error);
                showNotification(
                    "Error al enviar el mensaje. Inténtalo de nuevo.",
                    "error",
                );
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Enviar Mensaje";
            }
        });
    }
});

// Notification system
function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Check if mobile device
    const isMobile = window.innerWidth <= 768;
    const isSmallMobile = window.innerWidth <= 480;

    // Styles for notification
    Object.assign(notification.style, {
        position: "fixed",
        top: isMobile ? "80px" : "100px",
        right: isMobile ? "10px" : "20px",
        left: isMobile ? "10px" : "auto",
        padding: isSmallMobile
            ? "0.7rem 1rem"
            : isMobile
              ? "0.8rem 1.2rem"
              : "1rem 1.5rem",
        borderRadius: "8px",
        color: "white",
        fontWeight: "500",
        fontSize: isSmallMobile ? "0.85rem" : isMobile ? "0.9rem" : "1rem",
        zIndex: "10000",
        transform: "translateX(100%)",
        transition: "transform 0.3s ease",
        maxWidth: isMobile ? "calc(100% - 20px)" : "300px",
        wordWrap: "break-word",
    });

    // Set background color based on type
    switch (type) {
        case "success":
            notification.style.background =
                "linear-gradient(135deg, #4CAF50, #45a049)";
            break;
        case "error":
            notification.style.background =
                "linear-gradient(135deg, #f44336, #d32f2f)";
            break;
        default:
            notification.style.background =
                "linear-gradient(135deg, #00C6FF, #0072ff)";
    }

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        if (isMobile) {
            notification.style.transform = "translateX(0)";
            notification.style.right = "10px";
            notification.style.left = "10px";
        } else {
            notification.style.transform = "translateX(0)";
        }
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = "translateX(100%)";
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Counter animation for stats
function animateCounter(element, target, duration = 2000) {
    let start = 0;
    const increment = target / (duration / 16);
    const originalText = element.textContent;
    const hasPlus = originalText.includes("+");
    const hasPercent = originalText.includes("%");

    function updateCounter() {
        start += increment;
        if (start < target) {
            let displayText = Math.floor(start);
            if (hasPlus) displayText += "+";
            if (hasPercent) displayText += "%";
            element.textContent = displayText;
            requestAnimationFrame(updateCounter);
        } else {
            let finalText = target;
            if (hasPlus) finalText += "+";
            if (hasPercent) finalText += "%";
            element.textContent = finalText;
        }
    }

    updateCounter();
}

// Observe stats section for counter animation
const statsObserver = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const statNumbers =
                    entry.target.querySelectorAll(".stat-number");
                statNumbers.forEach((stat) => {
                    const text = stat.textContent;
                    const number = parseInt(text.replace(/\D/g, ""));
                    if (number) {
                        animateCounter(stat, number);
                    }
                });
                statsObserver.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.5 },
);

document.addEventListener("DOMContentLoaded", () => {
    const statsSection = document.querySelector(".stats");
    if (statsSection) {
        statsObserver.observe(statsSection);
    }
});

// Clicking a project card opens its live demo (cards with a real Demo link only)
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".project-card").forEach((card) => {
        const demoLink = [...card.querySelectorAll(".project-link")].find(
            (link) =>
                link.querySelector('span[data-en="Demo"]') &&
                link.getAttribute("href") !== "#",
        );
        if (!demoLink) return;

        card.classList.add("has-demo");
        card.addEventListener("click", (event) => {
            // Let the card's own links/buttons work normally and don't hijack text selection
            if (event.target.closest("a, button")) return;
            if (window.getSelection().toString()) return;
            window.open(demoLink.href, "_blank", "noopener");
        });
    });
});

// Loading animation
window.addEventListener("load", () => {
    document.body.classList.add("loaded");

    // Add a subtle fade-in effect to the entire page
    const style = document.createElement("style");
    style.textContent = `
        body {
            opacity: 0;
            transition: opacity 0.5s ease;
        }
        body.loaded {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);
});

// Keyboard navigation support
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        // Close mobile menu if open
        setMenuOpen(false);
    }
});

// Scroll state: navbar style, active link and the "go to top" button.
// One pass per frame, and nothing is queried from the DOM while scrolling.
const navbarEl = document.querySelector(".navbar");
const navLinkEls = [...document.querySelectorAll(".nav-link")];
const navSections = navLinkEls
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
let activeSection = null;
let scrollQueued = false;
// Where each section starts on the page, measured when the layout changes
// - not on every frame. Asking the browser for positions (or for the scroll
// position) after the frame's effects have moved things makes it restyle
// the page first: on a phone that cost more than the rest of the frame.
let sectionTops = [];
let scrollNow = window.scrollY;

function measureSections() {
    const y = window.scrollY;
    sectionTops = navSections.map((section) => section.getBoundingClientRect().top + y);
}

function updateScrollState() {
    scrollQueued = false;
    const y = scrollNow;
    navbarEl.classList.toggle("scrolled", y > 50);
    if (goTopBtn) goTopBtn.classList.toggle("show", y > 400);

    let current = null;
    navSections.forEach((section, i) => {
        if (sectionTops[i] - y <= 110) current = section;
    });
    if (current !== activeSection) {
        const from = navSections.indexOf(activeSection);
        const to = navSections.indexOf(current);
        activeSection = current;
        const hash = current ? `#${current.id}` : "";
        navLinkEls.forEach((link) =>
            link.classList.toggle("active", link.getAttribute("href") === hash),
        );
        // Every section on the way from the old one to the new one gets its
        // dot lit for a moment, one after the other. A jump across the page
        // is over a section in a frame or two - too short to see otherwise.
        const step = to > from ? 1 : -1;
        let order = 0;
        for (let i = from + step; i !== to + step; i += step) {
            if (i >= 0 && i !== to) flashNavLink(i, order++);
            if (i === to && i >= 0) flashNavLink(i, order);
        }
    }
}

// `navSections` and `navLinkEls` are in the same order
const navFlashTimers = [];

function flashNavLink(index, order) {
    const section = navSections[index];
    const link = navLinkEls.find(
        (l) => l.getAttribute("href") === `#${section.id}`,
    );
    if (!link) return;
    clearTimeout(navFlashTimers[index]);
    setTimeout(() => link.classList.add("is-passed"), order * 45);
    navFlashTimers[index] = setTimeout(
        () => link.classList.remove("is-passed"),
        order * 45 + 330,
    );
}

window.addEventListener(
    "scroll",
    () => {
        // read here, before the frame's effects change anything
        scrollNow = window.scrollY;
        if (scrollQueued) return;
        scrollQueued = true;
        requestAnimationFrame(updateScrollState);
    },
    { passive: true },
);
// The sections move when the page is laid out again: the pinned sections
// get their height, images and fonts arrive, the window changes width.
const remeasureSections = () => {
    measureSections();
    scrollNow = window.scrollY;
    updateScrollState();
};
if ("ResizeObserver" in window) new ResizeObserver(remeasureSections).observe(document.body);
window.addEventListener("load", remeasureSections);
measureSections();
updateScrollState();

// ============================
// PROTECCIÓN CONTRA COPIA
// ============================

// Prevenir clic derecho
document.addEventListener("contextmenu", function (e) {
    if (isCopyAllowed(e.target)) return;
    e.preventDefault();
    return false;
});

// Prevenir arrastre de imágenes
document.addEventListener("dragstart", function (e) {
    if (e.target.tagName === "IMG") {
        e.preventDefault();
        return false;
    }
});

// Campos de formulario y datos de contacto siempre se pueden seleccionar/copiar
function isCopyAllowed(target) {
    return (
        target instanceof Element &&
        (target.closest("input, textarea, select") ||
            target.closest(".selectable"))
    );
}

// Prevenir teclas de desarrollador comunes
document.addEventListener("keydown", function (e) {
    if (isCopyAllowed(e.target)) return;
    // F12 - PERMITIDO para desarrollo
    // if (e.keyCode === 123) {
    //     e.preventDefault();
    //     return false;
    // }

    // Ctrl+Shift+I (Inspector)
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
        e.preventDefault();
        return false;
    }
    // Ctrl+Shift+C (Seleccionar elemento)
    if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
        e.preventDefault();
        return false;
    }
    // Ctrl+Shift+J (Consola)
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
        e.preventDefault();
        return false;
    }
    // Ctrl+U (Ver código fuente)
    if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
        return false;
    }
    // Ctrl+S (Guardar página)
    if (e.ctrlKey && e.keyCode === 83) {
        e.preventDefault();
        return false;
    }
    // Ctrl+A (Seleccionar todo) - opcional
    if (e.ctrlKey && e.keyCode === 65) {
        e.preventDefault();
        return false;
    }
    // Ctrl+C (Copiar) - opcional
    if (e.ctrlKey && e.keyCode === 67) {
        e.preventDefault();
        return false;
    }
});

// Prevenir selección de texto con mouse
document.addEventListener("selectstart", function (e) {
    // Permitir selección en campos de formulario y datos de contacto
    if (isCopyAllowed(e.target.nodeType === 3 ? e.target.parentElement : e.target)) {
        return true;
    }
    e.preventDefault();
    return false;
});

// Mensaje de advertencia si se intenta abrir herramientas de desarrollador
let devtools = {
    open: false,
    orientation: null,
};

const threshold = 160;

setInterval(function () {
    if (
        window.outerHeight - window.innerHeight > threshold ||
        window.outerWidth - window.innerWidth > threshold
    ) {
        if (!devtools.open) {
            devtools.open = true;
            console.clear();
            console.warn("🚨 Herramientas de desarrollador detectadas");
            console.warn("⚠️  Este sitio está protegido contra copia");
            // Opcional: redirigir o mostrar mensaje
            // alert('Las herramientas de desarrollador están deshabilitadas en este sitio.');
        }
    } else {
        devtools.open = false;
    }
}, 500);


// Limpiar consola periódicamente
setInterval(function () {
    console.clear();
}, 2000);

// Dynamic Year based on Panama Timezone
function updateYear() {
    const yearElement = document.getElementById("year");
    if (yearElement) {
        // Get date in Panama timezone
        const date = new Date();
        const panamaDate = new Date(
            date.toLocaleString("en-US", { timeZone: "America/Panama" }),
        );
        yearElement.textContent = panamaDate.getFullYear();
    }
}

// Initialize year
document.addEventListener("DOMContentLoaded", updateYear);
