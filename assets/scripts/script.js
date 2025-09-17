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
const form = document.querySelector(".form");
if (form) {
    form.addEventListener("submit", (e) => {
        e.preventDefault();

        // Get form data
        const formData = new FormData(form);
        const name = form.querySelector('input[type="text"]').value;
        const email = form.querySelector('input[type="email"]').value;
        const subject = form.querySelectorAll('input[type="text"]')[1].value;
        const message = form.querySelector("textarea").value;

        // Simple validation
        if (!name || !email || !subject || !message) {
            showNotification("Please fill in all fields", "error");
            return;
        }

        // Simulate form submission
        showNotification("Message sent successfully!", "success");
        form.reset();
    });
}

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

    function updateCounter() {
        start += increment;
        if (start < target) {
            element.textContent =
                Math.floor(start) +
                (element.textContent.includes("+") ? "+" : "");
            requestAnimationFrame(updateCounter);
        } else {
            element.textContent =
                target + (element.textContent.includes("+") ? "+" : "");
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
