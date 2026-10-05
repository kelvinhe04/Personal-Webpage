const themeToggle = document.getElementById("themeToggle");
const languageToggle = document.getElementById("languageToggle");
const goTopBtn = document.querySelector(".go-top-btn");
const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
).matches;

// Theme Toggle
themeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    document.body.classList.toggle("light-mode");
    const icon = themeToggle.querySelector("i");
    icon.classList.toggle("fa-sun");
    icon.classList.toggle("fa-moon");
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
    // Update Load More button
    updateProjectsButtonText();

    // Update Load More Certificates button
    updateCertificatesButtonText();

    // Update "Show more" buttons in the experience timeline
    updateReadMoreButtons();

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

    // Only show the button where the text actually overflows the clamp
    const refresh = () => {
        document.querySelectorAll(".read-more-btn").forEach((btn) => {
            const desc = btn.previousElementSibling;
            const clamped = desc.classList.contains("is-clamped");
            btn.hidden = clamped && desc.scrollHeight <= desc.clientHeight + 2;
        });
    };
    refresh();
    window.addEventListener("resize", refresh);
    if (document.fonts) document.fonts.ready.then(refresh);
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

// Navbar scroll effect
window.addEventListener("scroll", () => {
    const navbar = document.querySelector(".navbar");
    if (window.scrollY > 50) {
        navbar.classList.add("scrolled");
    } else {
        navbar.classList.remove("scrolled");
    }
});

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

// Active navigation link highlighting
window.addEventListener("scroll", () => {
    const sections = document.querySelectorAll("section[id]");
    const navLinks = document.querySelectorAll(".nav-link");

    let current = "";
    sections.forEach((section) => {
        const sectionTop = section.offsetTop - 100;
        const sectionHeight = section.clientHeight;
        if (
            window.scrollY >= sectionTop &&
            window.scrollY < sectionTop + sectionHeight
        ) {
            current = section.getAttribute("id");
        }
    });

    navLinks.forEach((link) => {
        link.classList.remove("active");
        if (link.getAttribute("href") === `#${current}`) {
            link.classList.add("active");
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
                }, index * 150); // 150ms delay entre cada elemento
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
        ".project-card:not(.hidden-project), .tech-category, .about-content, .contact-content, .timeline-item, .certificate-card, .honor-card",
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

// Hover effects for project cards
document.addEventListener("DOMContentLoaded", () => {
    const projectCards = document.querySelectorAll(".project-card");

    projectCards.forEach((card) => {
        card.addEventListener("mouseenter", () => {
            card.style.transform = "translateY(-10px) scale(1.02)";
        });

        card.addEventListener("mouseleave", () => {
            card.style.transform = "translateY(0) scale(1)";
        });
    });
});

// Tech items hover effect
document.addEventListener("DOMContentLoaded", () => {
    const techItems = document.querySelectorAll(".tech-item");

    techItems.forEach((item) => {
        item.addEventListener("mouseenter", () => {
            item.style.transform = "translateX(10px)";
            item.style.background = "rgba(var(--accent-rgb), 0.15)";
        });

        item.addEventListener("mouseleave", () => {
            item.style.transform = "translateX(0)";
            item.style.background = "rgba(255, 255, 255, 0.02)";
        });
    });
});

// Social links hover effect
document.addEventListener("DOMContentLoaded", () => {
    const socialLinks = document.querySelectorAll(".social-link");

    socialLinks.forEach((link) => {
        link.addEventListener("mouseenter", () => {
            link.style.transform = "translateY(-5px) scale(1.1)";
        });

        link.addEventListener("mouseleave", () => {
            link.style.transform = "translateY(0) scale(1)";
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

// Performance optimization: Throttle scroll events
function throttle(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply throttling to scroll events
function updateGoTopButtonVisibility() {
    if (!goTopBtn) return;

    if (window.scrollY > 400) {
        goTopBtn.classList.add("show");
    } else {
        goTopBtn.classList.remove("show");
    }
}

const throttledScrollHandler = throttle(() => {
    // Navbar scroll effect
    const navbar = document.querySelector(".navbar");
    if (window.scrollY > 50) {
        navbar.classList.add("scrolled");
    } else {
        navbar.classList.remove("scrolled");
    }

    // Active navigation link highlighting
    const sections = document.querySelectorAll("section[id]");
    const navLinks = document.querySelectorAll(".nav-link");

    let current = "";
    sections.forEach((section) => {
        const sectionTop = section.offsetTop - 100;
        const sectionHeight = section.clientHeight;
        if (
            window.scrollY >= sectionTop &&
            window.scrollY < sectionTop + sectionHeight
        ) {
            current = section.getAttribute("id");
        }
    });

    navLinks.forEach((link) => {
        link.classList.remove("active");
        if (link.getAttribute("href") === `#${current}`) {
            link.classList.add("active");
        }
    });

    updateGoTopButtonVisibility();
}, 16); // ~60fps

window.addEventListener("scroll", throttledScrollHandler);
updateGoTopButtonVisibility();

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

// ============================
// LOAD MORE PROJECTS FUNCTIONALITY
// ============================

function updateProjectsButtonText() {
    const loadMoreBtn = document.getElementById("load-more-btn");
    if (!loadMoreBtn || loadMoreBtn.style.visibility === "hidden") return;
    if (loadMoreBtn.classList.contains("loading")) return;

    const remaining = Array.from(
        document.querySelectorAll(".hidden-project"),
    ).filter((p) => p.style.display !== "block").length;

    if (remaining > 0) {
        loadMoreBtn.innerHTML =
            currentLanguage === "es"
                ? `<i class="fas fa-plus"></i> Cargar Más Proyectos (${remaining})`
                : `<i class="fas fa-plus"></i> Load More Projects (${remaining})`;
    } else {
        loadMoreBtn.innerHTML =
            currentLanguage === "es"
                ? '<i class="fas fa-check"></i> Todos los Proyectos Cargados'
                : '<i class="fas fa-check"></i> All Projects Loaded';
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const loadMoreBtn = document.getElementById("load-more-btn");
    const hiddenProjects = document.querySelectorAll(".hidden-project");
    let currentlyVisible = 0;
    const projectsPerLoad = 3; // Cargar 3 proyectos a la vez

    if (loadMoreBtn && hiddenProjects.length > 0) {
        loadMoreBtn.addEventListener("click", function () {
            if (loadMoreBtn.classList.contains("loading")) return;
            // Agregar clase loading
            loadMoreBtn.classList.add("loading");
            loadMoreBtn.innerHTML =
                currentLanguage === "es"
                    ? '<i class="fas fa-spinner fa-spin"></i> Cargando...'
                    : '<i class="fas fa-spinner fa-spin"></i> Loading...';

            // Simular delay de carga
            setTimeout(() => {
                // Determinar cuántos proyectos mostrar
                const projectsToShow = Math.min(
                    projectsPerLoad,
                    hiddenProjects.length - currentlyVisible,
                );

                // Mostrar los próximos proyectos con animación suave
                for (
                    let i = currentlyVisible;
                    i < currentlyVisible + projectsToShow;
                    i++
                ) {
                    if (hiddenProjects[i]) {
                        // Hacer visible el elemento pero mantenerlo invisible
                        hiddenProjects[i].style.display = "block";

                        // Forzar un reflow para que el display:block tome efecto
                        hiddenProjects[i].offsetHeight;

                        // Agregar delay escalonado para animación suave
                        setTimeout(
                            () => {
                                hiddenProjects[i].classList.add("show");
                            },
                            (i - currentlyVisible) * 200,
                        ); // Aumentado a 200ms para más suavidad
                    }
                }

                currentlyVisible += projectsToShow;

                // Actualizar el botón
                loadMoreBtn.classList.remove("loading");

                if (currentlyVisible >= hiddenProjects.length) {
                    // Todos los proyectos están visibles
                    loadMoreBtn.innerHTML =
                        currentLanguage === "es"
                            ? '<i class="fas fa-check"></i> Todos los Proyectos Cargados'
                            : '<i class="fas fa-check"></i> All Projects Loaded';
                    loadMoreBtn.style.background = "var(--glass-bg)";
                    loadMoreBtn.style.color = "var(--text-secondary)";
                    loadMoreBtn.style.pointerEvents = "none";

                    // Ocultar el botón SIN afectar el layout después de un momento
                    setTimeout(() => {
                        loadMoreBtn.style.visibility = "hidden";
                        loadMoreBtn.style.opacity = "0";
                    }, 1500);
                } else {
                    // Aún hay más proyectos por cargar
                    updateProjectsButtonText();
                }
            }, 300); // Delay reducido a 300ms
        });
    }
});

// Function to update certificates button text
function updateCertificatesButtonText() {
    const loadMoreCertBtn = document.getElementById(
        "load-more-certificates-btn",
    );
    if (loadMoreCertBtn && loadMoreCertBtn.style.visibility !== "hidden") {
        const remainingCerts = document.querySelectorAll(
            ".hidden-certificate:not(.show)",
        ).length;
        const isMobile = window.innerWidth <= 480;

        if (remainingCerts > 0) {
            if (isMobile) {
                const certText = remainingCerts === 1 ? "Cert" : "Certs";
                loadMoreCertBtn.innerHTML =
                    currentLanguage === "es"
                        ? `<i class="fas fa-plus"></i> <span class="cert-btn-text">Más ${certText} (${remainingCerts})</span>`
                        : `<i class="fas fa-plus"></i> <span class="cert-btn-text">More ${certText} (${remainingCerts})</span>`;
            } else {
                const certText =
                    remainingCerts === 1
                        ? currentLanguage === "es"
                            ? "restante"
                            : "remaining"
                        : currentLanguage === "es"
                          ? "restantes"
                          : "remaining";
                loadMoreCertBtn.innerHTML =
                    currentLanguage === "es"
                        ? `<i class="fas fa-plus"></i> <span class="cert-btn-text">Cargar Más Certificados (${remainingCerts} ${certText})</span>`
                        : `<i class="fas fa-plus"></i> <span class="cert-btn-text">Load More Certificates (${remainingCerts} ${certText})</span>`;
            }
        } else {
            if (isMobile) {
                loadMoreCertBtn.innerHTML =
                    currentLanguage === "es"
                        ? '<i class="fas fa-check"></i> Todo Cargado'
                        : '<i class="fas fa-check"></i> All Loaded';
            } else {
                loadMoreCertBtn.innerHTML =
                    currentLanguage === "es"
                        ? '<i class="fas fa-check"></i> Todos los Certificados Cargados'
                        : '<i class="fas fa-check"></i> All Certificates Loaded';
            }
        }
    }
}

// LOAD MORE CERTIFICATES FUNCTIONALITY
// ============================

document.addEventListener("DOMContentLoaded", function () {
    const loadMoreCertBtn = document.getElementById(
        "load-more-certificates-btn",
    );
    const hiddenCertificates = document.querySelectorAll(".hidden-certificate");
    let currentlyVisibleCerts = 0;
    const certificatesPerLoad = 2; // Cargar 4 certificados a la vez

    // Inicializar el texto del botón de certificados
    updateCertificatesButtonText();

    if (loadMoreCertBtn && hiddenCertificates.length > 0) {
        loadMoreCertBtn.addEventListener("click", function () {
            // Prevenir múltiples clicks
            if (loadMoreCertBtn.classList.contains("loading")) {
                return;
            }

            // Agregar clase loading
            loadMoreCertBtn.classList.add("loading");
            loadMoreCertBtn.innerHTML =
                currentLanguage === "es"
                    ? '<i class="fas fa-spinner fa-spin"></i> Cargando...'
                    : '<i class="fas fa-spinner fa-spin"></i> Loading...';

            // Simular delay de carga
            setTimeout(() => {
                // Determinar cuántos certificados mostrar
                const certificatesToShow = Math.min(
                    certificatesPerLoad,
                    hiddenCertificates.length - currentlyVisibleCerts,
                );

                // Si no hay certificados para mostrar, salir
                if (certificatesToShow <= 0) {
                    loadMoreCertBtn.classList.remove("loading");
                    updateCertificatesButtonText();
                    return;
                }

                // Mostrar los próximos certificados con animación suave
                const batchStartIndex = currentlyVisibleCerts;

                for (
                    let i = batchStartIndex;
                    i < batchStartIndex + certificatesToShow;
                    i++
                ) {
                    if (hiddenCertificates[i]) {
                        // Hacer visible el elemento
                        hiddenCertificates[i].style.display = "flex";
                        hiddenCertificates[i].offsetHeight; // Forzar reflow

                        // Remover la clase hidden-certificate para que updateCertificatesButtonText lo cuente bien
                        hiddenCertificates[i].classList.remove(
                            "hidden-certificate",
                        );

                        // Agregar delay escalonado para animación suave
                        setTimeout(
                            () => {
                                hiddenCertificates[i].classList.add("show");
                            },
                            (i - batchStartIndex) * 200,
                        );
                    }
                }

                // Actualizar contador global
                currentlyVisibleCerts += certificatesToShow;

                // Remover loading y actualizar texto inmediatamente
                loadMoreCertBtn.classList.remove("loading");

                // Actualizar estado del botón basado en los que quedan
                const remaining =
                    hiddenCertificates.length - currentlyVisibleCerts;

                if (remaining <= 0) {
                    loadMoreCertBtn.innerHTML =
                        currentLanguage === "es"
                            ? '<i class="fas fa-check"></i> Todos los Certificados Cargados'
                            : '<i class="fas fa-check"></i> All Certificates Loaded';

                    // Aplicar estilos de completado
                    loadMoreCertBtn.style.transition = "none";
                    loadMoreCertBtn.style.background = "var(--glass-bg)";
                    loadMoreCertBtn.style.color = "var(--text-secondary)";
                    loadMoreCertBtn.style.pointerEvents = "none";

                    // Ocultar el botón después de un momento
                    setTimeout(() => {
                        loadMoreCertBtn.style.transition =
                            "opacity 0.5s ease, visibility 0.5s";
                        loadMoreCertBtn.style.visibility = "hidden";
                        loadMoreCertBtn.style.opacity = "0";
                    }, 1500);
                } else {
                    updateCertificatesButtonText();
                }
            }, 300);
        });
    }
});

// Update certificates button text on window resize
window.addEventListener("resize", function () {
    updateCertificatesButtonText();
});

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
