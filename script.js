/* ==================================================
   EMOTIQ AI — APPLICATION LOGIC
   ================================================== */

(() => {
  "use strict";

  const API_URL = "https://emotiq-api.onrender.com/predict";
  const MAX_CHARS = 600;

  const EMOTION_META = {
    joy:      { color: "var(--e-joy)",      hex: "#e0ac48" },
    love:     { color: "var(--e-love)",     hex: "#e8779a" },
    surprise: { color: "var(--e-surprise)", hex: "#45c2d6" },
    fear:     { color: "var(--e-fear)",     hex: "#9d7ee8" },
    anger:    { color: "var(--e-anger)",    hex: "#e2604c" },
    sadness:  { color: "var(--e-sadness)",  hex: "#6c8cff" },
  };

  const EMOTION_ORDER = ["joy", "love", "surprise", "fear", "anger", "sadness"];

  // Maps a raw probability (0–1) to a fill opacity (0–1).
  // Purely a function of the actual value returned by the API — no
  // emotion name or percentage is ever hardcoded. Uses a square-root
  // curve so the top prediction reads as a prominent, near-full-color
  // fill while low-probability bars stay tastefully muted rather than
  // jumping straight to full saturation. A probability of 0 always
  // resolves to 0 width, so it renders with no visible fill at all.
  function probabilityToFillOpacity(value) {
    if (!value || value <= 0) return 0;
    const FLOOR = 0.12; // lowest opacity a non-zero probability can have
    const intensity = FLOOR + Math.sqrt(value) * (1 - FLOOR);
    return Math.min(1, Math.max(FLOOR, intensity));
  }

  // ---- DOM refs ----
  const form = document.getElementById("analyzeForm");
  const textInput = document.getElementById("textInput");
  const charCount = document.getElementById("charCount");
  const inputError = document.getElementById("inputError");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const chips = document.querySelectorAll(".chip");
  const retryBtn = document.getElementById("retryBtn");

  const states = {
    idle: document.getElementById("stateIdle"),
    loading: document.getElementById("stateLoading"),
    success: document.getElementById("stateSuccess"),
    error: document.getElementById("stateError"),
  };

  const resultEmotion = document.getElementById("resultEmotion");
  const emotionDot = document.getElementById("emotionDot");
  const emotionName = document.getElementById("emotionName");
  const confidenceValue = document.getElementById("confidenceValue");
  const confidenceFill = document.getElementById("confidenceFill");
  const confidenceBarWrap = document.getElementById("confidenceBarWrap");
  const distributionList = document.getElementById("distributionList");
  const analyzedText = document.getElementById("analyzedText");
  const errorMessage = document.getElementById("errorMessage");

  let isSubmitting = false;

  // ==================================================
  // STATE MANAGEMENT
  // Exactly one of idle / loading / success / error is visible.
  // ==================================================

  function setPredictionState(name) {
    // Hide every state container first, then show ONLY the requested one.
    // Both the `hidden` attribute (for a11y/semantics) and an explicit
    // inline `display` are set, so visibility can't be silently overridden
    // by any CSS rule elsewhere (this was the root cause of the bug).
    Object.entries(states).forEach(([key, el]) => {
      if (!el) return;
      const isActive = key === name;
      el.hidden = !isActive;
      el.style.display = isActive ? "" : "none";
    });
  }

  // ==================================================
  // CHARACTER COUNTER + VALIDATION
  // ==================================================

  function updateCharCount() {
    const len = textInput.value.length;
    charCount.textContent = `${len} / ${MAX_CHARS}`;
  }

  function showInputError(message) {
    inputError.textContent = message;
    inputError.classList.add("visible");
    textInput.setAttribute("aria-invalid", "true");
  }

  function clearInputError() {
    inputError.textContent = "";
    inputError.classList.remove("visible");
    textInput.removeAttribute("aria-invalid");
  }

  textInput.addEventListener("input", () => {
    updateCharCount();
    if (textInput.value.trim().length > 0) clearInputError();
  });

  // ==================================================
  // EXAMPLE CHIPS
  // ==================================================

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      textInput.value = chip.dataset.text || "";
      updateCharCount();
      clearInputError();
      textInput.focus();
    });
  });

  // ==================================================
  // RETRY BUTTON
  // ==================================================

  retryBtn.addEventListener("click", () => {
    setPredictionState("idle");
    textInput.focus();
  });

  // ==================================================
  // RENDERING — SUCCESS STATE
  // ==================================================

  function renderResult(data) {
    const emotionKey = String(data.predicted_emotion || "").toLowerCase();
    const meta = EMOTION_META[emotionKey] || { color: "var(--accent)", hex: "#6c8cff" };

    // Set the CSS custom property used by dot / name / confidence bar
    resultEmotion.closest(".state-success").style.setProperty(
      "--current-emotion-color",
      meta.color
    );

    emotionName.textContent = (data.predicted_emotion || "unknown").toUpperCase();

    const confidencePct = Math.round((Number(data.confidence) || 0) * 100);
    confidenceValue.textContent = `${confidencePct}%`;
    confidenceBarWrap.setAttribute("aria-valuenow", String(confidencePct));

    // Reset fill to 0 first, then animate to value on next frame
    confidenceFill.style.width = "0%";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        confidenceFill.style.width = `${confidencePct}%`;
      });
    });

    // Build distribution list, sorted by probability desc
    const probs = data.probabilities || {};
    const entries = EMOTION_ORDER
      .filter((k) => k in probs)
      .map((k) => ({ key: k, value: Number(probs[k]) || 0 }))
      .sort((a, b) => b.value - a.value);

    // Include any keys not in our known order (defensive)
    Object.keys(probs).forEach((k) => {
      if (!EMOTION_ORDER.includes(k)) {
        entries.push({ key: k, value: Number(probs[k]) || 0 });
      }
    });

    distributionList.innerHTML = "";

    entries.forEach((entry, idx) => {
      const pct = Math.round(entry.value * 100);
      const emMeta = EMOTION_META[entry.key] || { color: "var(--accent)" };

      const li = document.createElement("li");
      li.className = "distribution-item" + (idx === 0 ? " is-top" : "");

      const nameSpan = document.createElement("span");
      nameSpan.className = "distribution-name";
      nameSpan.textContent = entry.key;

      const track = document.createElement("span");
      track.className = "distribution-track";
      const fill = document.createElement("span");
      fill.className = "distribution-fill";
      fill.style.background = emMeta.color;
      fill.style.opacity = String(probabilityToFillOpacity(entry.value));
      fill.style.width = "0%";
      track.appendChild(fill);

      const pctSpan = document.createElement("span");
      pctSpan.className = "distribution-pct";
      pctSpan.textContent = `${pct}%`;

      li.appendChild(nameSpan);
      li.appendChild(track);
      li.appendChild(pctSpan);
      distributionList.appendChild(li);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.width = `${pct}%`;
        });
      });
    });

    analyzedText.textContent = data.text ? `“${data.text}”` : "";
  }

  // ==================================================
  // SUBMIT HANDLER
  // ==================================================

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    const text = textInput.value.trim();

    if (text.length === 0) {
      showInputError("Please enter some text before analyzing.");
      textInput.focus();
      return;
    }
    clearInputError();

    isSubmitting = true;
    analyzeBtn.disabled = true;
    analyzeBtn.classList.add("is-loading");
    setPredictionState("loading");

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errBody = await response.json();
          detail = errBody && (errBody.detail || errBody.message);
        } catch (_) {
          /* ignore malformed error body */
        }
        throw new Error(
          detail || `The prediction service returned an error (${response.status}).`
        );
      }

      const data = await response.json();

      if (
        !data ||
        typeof data.predicted_emotion !== "string" ||
        typeof data.confidence !== "number" ||
        typeof data.probabilities !== "object"
      ) {
        throw new Error("The prediction service returned an unexpected response.");
      }

      renderResult(data);
      setPredictionState("success");
    } catch (err) {
      let message = "Something went wrong while analyzing your text. Please try again.";

      if (err instanceof TypeError) {
        // fetch throws TypeError on network failure / CORS / server unreachable
        message =
          "Unable to connect to the prediction service. Make sure the FastAPI server is running.";
      } else if (err && err.message) {
        message = err.message;
      }

      errorMessage.textContent = message;
      setPredictionState("error");
    } finally {
      isSubmitting = false;
      analyzeBtn.disabled = false;
      analyzeBtn.classList.remove("is-loading");
    }
  }

  form.addEventListener("submit", handleSubmit);

  // ==================================================
  // INIT
  // ==================================================

  updateCharCount();
  setPredictionState("idle");
})();