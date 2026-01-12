(function () {
  function ready() {
    const root = document.documentElement;
    const themeToggle = document.querySelector("[data-theme-toggle]");
    const themeLabel = document.querySelector("[data-theme-label]");
    const paletteButtons = document.querySelectorAll("[data-palette-option]");
    const fontInc = document.querySelector("[data-font-inc]");
    const fontDec = document.querySelector("[data-font-dec]");
    const settingsToggle = document.querySelector("[data-settings-toggle]");
    const settingsMenu = document.querySelector("[data-settings-menu]");
    const hamburger = document.querySelector("[data-hamburger]");
    const mobileMenu = document.querySelector("[data-mobile-menu]");
    const backToTop = document.querySelector("[data-back-to-top]");

    const storedTheme = localStorage.getItem("theme");
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = storedTheme || (prefersDark ? "dark" : "light");
    applyTheme(initialTheme);

    const storedPalette = localStorage.getItem("palette");
    const initialPalette = storedPalette || "rose";
    applyPalette(initialPalette);

    const storedScale = parseFloat(localStorage.getItem("fontScale"));
    applyScale(Number.isFinite(storedScale) ? storedScale : 1);

    if (themeToggle) {
      themeToggle.addEventListener("click", function () {
        const nextTheme =
          root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
      });
    }

    if (paletteButtons.length) {
      paletteButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          applyPalette(button.getAttribute("data-palette-option"));
        });
      });
    }

    if (fontInc) {
      fontInc.addEventListener("click", function () {
        applyScale(currentScale() + 0.05);
      });
    }

    if (fontDec) {
      fontDec.addEventListener("click", function () {
        applyScale(currentScale() - 0.05);
      });
    }

    if (settingsToggle && settingsMenu) {
      settingsToggle.addEventListener("click", function (event) {
        event.stopPropagation();
        settingsMenu.classList.toggle("open");
      });

      document.addEventListener("click", function (event) {
        if (
          !settingsMenu.contains(event.target) &&
          !settingsToggle.contains(event.target)
        ) {
          settingsMenu.classList.remove("open");
        }
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          settingsMenu.classList.remove("open");
        }
      });
    }

    if (hamburger && mobileMenu) {
      hamburger.addEventListener("click", function () {
        hamburger.classList.toggle("open");
        mobileMenu.classList.toggle("open");
      });

      mobileMenu.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          hamburger.classList.remove("open");
          mobileMenu.classList.remove("open");
        });
      });
    }

    const currentPath = location.pathname.split("/").pop() || "home.html";
    const normalizedPath =
      currentPath === "btec-major.html" ? "btec.html" : currentPath;
    document.querySelectorAll(".nav-link, .mobile-link").forEach(function (el) {
      const href = el.getAttribute("href") || "";
      if (href.includes(normalizedPath)) {
        el.classList.add("active");
      }
    });

    if (backToTop) {
      window.addEventListener("scroll", function () {
        backToTop.classList.toggle("show", window.scrollY > 400);
      });

      backToTop.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    const animatedElements = document.querySelectorAll("[data-animate]");
    if ("IntersectionObserver" in window && animatedElements.length) {
      const observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("in-view");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2 }
      );

      animatedElements.forEach(function (el) {
        observer.observe(el);
      });
    } else {
      animatedElements.forEach(function (el) {
        el.classList.add("in-view");
      });
    }

    document.body.classList.add("page-loaded");

    function applyTheme(theme) {
      root.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
      if (themeLabel) {
        themeLabel.textContent =
          theme === "dark" ? "الوضع النهاري" : "الوضع الليلي";
      }
    }

    function applyPalette(palette) {
      if (!palette) {
        return;
      }
      root.setAttribute("data-palette", palette);
      localStorage.setItem("palette", palette);
      updatePaletteButtons(palette);
    }

    function updatePaletteButtons(activePalette) {
      if (!paletteButtons.length) {
        return;
      }
      paletteButtons.forEach(function (button) {
        button.classList.toggle(
          "active",
          button.getAttribute("data-palette-option") === activePalette
        );
      });
    }

    function applyScale(scale) {
      const clamped = Math.min(1.2, Math.max(0.85, Number(scale.toFixed(2))));
      root.style.setProperty("--font-scale", clamped);
      localStorage.setItem("fontScale", clamped.toString());
      if (fontDec) {
        fontDec.disabled = clamped <= 0.85;
      }
      if (fontInc) {
        fontInc.disabled = clamped >= 1.2;
      }
    }

    function currentScale() {
      const value = parseFloat(
        getComputedStyle(root).getPropertyValue("--font-scale")
      );
      return Number.isFinite(value) ? value : 1;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
