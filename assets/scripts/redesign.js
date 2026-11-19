// Redesign layer: rotating role line under the hero name.
// Phrases follow the page language (EN/ES) and are re-read on every cycle,
// so switching language takes effect on the next phrase.
(() => {
    const text = document.querySelector(".roles-text");
    const caret = document.querySelector(".roles-caret");
    if (!text || !caret) return;

    const ROLES = [
        {
            en: "Software Development Student @ UTP",
            es: "Estudiante de Desarrollo de Software @ UTP",
        },
        {
            en: "Turning ideas into full-stack apps",
            es: "Convirtiendo ideas en apps full-stack",
        },
        {
            en: "while (alive) { learn(); build(); }",
            es: "while (alive) { aprender(); construir(); }",
        },
        {
            en: "Java · C# · JavaScript · PHP · Python",
            es: "Java · C# · JavaScript · PHP · Python",
        },
        {
            en: "Real-time apps, one commit at a time",
            es: "Apps en tiempo real, un commit a la vez",
        },
        {
            en: "National finalist @ JIC UTP 2026 · RiskTrail",
            es: "Finalista nacional @ JIC UTP 2026 · RiskTrail",
        },
        {
            en: "Spanish, English, Mandarin & Cantonese",
            es: "Español, inglés, mandarín y cantonés",
        },
        {
            en: "git commit -m 'learn something new'",
            es: "git commit -m 'aprender algo nuevo'",
        },
    ];

    const lang = () => (document.documentElement.lang === "es" ? "es" : "en");
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
        text.textContent = ROLES[0][lang()];
        caret.style.display = "none";
        return;
    }

    // While the hero is out of sight (motion.js marks it) nothing is typed:
    // each letter changed the text, and the page had to be laid out again
    // in the middle of whatever was being scrolled.
    const hero = document.getElementById("hero");
    const unseen = async () => {
        while (hero && hero.classList.contains("is-off")) await sleep(300);
    };

    async function loop() {
        // let the name finish typing first
        await sleep(1900);
        for (let i = 0; ; i = (i + 1) % ROLES.length) {
            await unseen();
            const phrase = ROLES[i][lang()];
            caret.classList.add("is-typing");
            for (let n = 1; n <= phrase.length; n++) {
                await unseen();
                text.textContent = phrase.slice(0, n);
                await sleep(55);
            }
            caret.classList.remove("is-typing");
            await sleep(1800);
            caret.classList.add("is-typing");
            for (let n = phrase.length - 1; n >= 0; n--) {
                await unseen();
                text.textContent = phrase.slice(0, n);
                await sleep(22);
            }
            caret.classList.remove("is-typing");
            await sleep(260);
        }
    }

    loop();
})();
