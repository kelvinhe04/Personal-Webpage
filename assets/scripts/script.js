const themeToggle = document.getElementById("themeToggle");

// Theme Toggle
themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("light-mode");
    const icon = themeToggle.querySelector("i");
    icon.classList.toggle("fa-sun");
    icon.classList.toggle("fa-moon");
});

// Mouse glow effect
document.addEventListener("mousemove", (e) => {
    const mouseX = (e.clientX / window.innerWidth) * 100;
    const mouseY = (e.clientY / window.innerHeight) * 100;

    document.documentElement.style.setProperty("--mouse-x", `${mouseX}%`);
    document.documentElement.style.setProperty("--mouse-y", `${mouseY}%`);
});

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

hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("active");
    navMenu.classList.toggle("active");
});

// Close mobile menu when clicking on a link
document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
        hamburger.classList.remove("active");
        navMenu.classList.remove("active");
    });
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute("href"));
        if (target) {
            const offsetTop = target.offsetTop - 70; // Account for fixed navbar
            window.scrollTo({
                top: offsetTop,
                behavior: "smooth",
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
            entry.target.classList.add("fade-in-up");
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener("DOMContentLoaded", () => {
    const animateElements = document.querySelectorAll(
        ".project-card, .tech-category, .about-content, .contact-content"
    );
    animateElements.forEach((el) => {
        observer.observe(el);
    });
});

// Form submission handling
document.addEventListener("DOMContentLoaded", () => {
    // Initialize EmailJS
    emailjs.init("fF75M6sSU67LLEEQF"); // Reemplaza con tu PUBLIC KEY de EmailJS (no el service ID)

    const form = document.getElementById("contact-form");
    const submitBtn = document.getElementById("submit-btn");

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            // Validar campos
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

            // Validación básica
            if (!name || !email || !subject || !message) {
                showNotification(
                    "Por favor, completa todos los campos.",
                    "error"
                );
                return;
            }

            // Validación de email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showNotification(
                    "Por favor, introduce un email válido.",
                    "error"
                );
                return;
            }

            // Validación de longitud mínima
            if (name.length < 2) {
                showNotification(
                    "El nombre debe tener al menos 2 caracteres.",
                    "error"
                );
                return;
            }

            if (subject.length < 3) {
                showNotification(
                    "El asunto debe tener al menos 3 caracteres.",
                    "error"
                );
                return;
            }

            if (message.length < 10) {
                showNotification(
                    "El mensaje debe tener al menos 10 caracteres.",
                    "error"
                );
                return;
            }

            // Deshabilitar el botón y mostrar estado de carga
            submitBtn.disabled = true;
            submitBtn.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Enviando...';

            try {
                // Enviar email usando EmailJS
                const result = await emailjs.sendForm(
                    "service_9ave0ys", // Tu Service ID va aquí
                    "template_n9lja1l", // Reemplaza con tu Template ID
                    form
                );

                console.log("Email sent successfully:", result);
                showNotification(
                    "¡Mensaje enviado exitosamente! Te responderé pronto.",
                    "success"
                );
                form.reset();
            } catch (error) {
                console.error("Error sending email:", error);
                let errorMessage =
                    "Error al enviar el mensaje. Inténtalo de nuevo.";

                // Manejo específico de errores
                if (error.status === 422) {
                    errorMessage =
                        "Configuración de EmailJS incorrecta. Contacta al administrador.";
                } else if (error.status === 400) {
                    errorMessage = "Datos del formulario inválidos.";
                } else if (!navigator.onLine) {
                    errorMessage =
                        "Sin conexión a internet. Verifica tu conexión.";
                }

                showNotification(errorMessage, "error");
            } finally {
                // Restaurar el botón
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

    // Styles for notification
    Object.assign(notification.style, {
        position: "fixed",
        top: "100px",
        right: "20px",
        padding: "1rem 1.5rem",
        borderRadius: "8px",
        color: "white",
        fontWeight: "500",
        zIndex: "10000",
        transform: "translateX(100%)",
        transition: "transform 0.3s ease",
        maxWidth: "300px",
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
        notification.style.transform = "translateX(0)";
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = "translateX(100%)";
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Parallax effect for hero section
window.addEventListener("scroll", () => {
    const scrolled = window.pageYOffset;
    const hero = document.querySelector(".hero");
    if (hero) {
        const rate = scrolled * -0.5;
        hero.style.transform = `translateY(${rate}px)`;
    }
});

// Typing effect for hero title
function typeWriter(element, text, speed = 100) {
    let i = 0;
    element.innerHTML = "";

    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }

    type();
}

// Initialize typing effect when page loads
document.addEventListener("DOMContentLoaded", () => {
    const heroTitle = document.querySelector(".hero-title");
    if (heroTitle) {
        const originalText = heroTitle.textContent;

        typeWriter(heroTitle, originalText, 50);
    }
});

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
    { threshold: 0.5 }
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
            item.style.background = "rgba(0, 198, 255, 0.15)";
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
        hamburger.classList.remove("active");
        navMenu.classList.remove("active");
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
}, 16); // ~60fps

window.addEventListener("scroll", throttledScrollHandler);

// ============================
// PROTECCIÓN CONTRA COPIA
// ============================

// Prevenir clic derecho
document.addEventListener("contextmenu", function (e) {
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

// Prevenir teclas de desarrollador comunes
document.addEventListener("keydown", function (e) {
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
    // Permitir selección en campos de formulario
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
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

document.addEventListener("DOMContentLoaded", function () {
    const loadMoreBtn = document.getElementById("load-more-btn");
    const hiddenProjects = document.querySelectorAll(".hidden-project");
    let currentlyVisible = 0;
    const projectsPerLoad = 3; // Cargar 3 proyectos a la vez

    if (loadMoreBtn && hiddenProjects.length > 0) {
        loadMoreBtn.addEventListener("click", function () {
            // Agregar clase loading
            loadMoreBtn.classList.add("loading");
            loadMoreBtn.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Loading...';

            // Simular delay de carga
            setTimeout(() => {
                // Determinar cuántos proyectos mostrar
                const projectsToShow = Math.min(
                    projectsPerLoad,
                    hiddenProjects.length - currentlyVisible
                );

                // Mostrar los próximos proyectos
                for (
                    let i = currentlyVisible;
                    i < currentlyVisible + projectsToShow;
                    i++
                ) {
                    if (hiddenProjects[i]) {
                        hiddenProjects[i].style.display = "block";

                        // Agregar delay escalonado para animación
                        setTimeout(() => {
                            hiddenProjects[i].classList.add("show");
                        }, (i - currentlyVisible) * 150);
                    }
                }

                currentlyVisible += projectsToShow;

                // Actualizar el botón
                loadMoreBtn.classList.remove("loading");

                if (currentlyVisible >= hiddenProjects.length) {
                    // Todos los proyectos están visibles
                    loadMoreBtn.innerHTML =
                        '<i class="fas fa-check"></i> All Projects Loaded';
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
                    const remaining = hiddenProjects.length - currentlyVisible;
                    loadMoreBtn.innerHTML = `<i class="fas fa-plus"></i> Load More Projects (${remaining} remaining)`;
                }
            }, 300); // Delay reducido a 300ms
        });
    }
});
