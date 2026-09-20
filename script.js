const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

const navToggle = $(".nav-toggle");
const siteNav = $(".site-nav");
if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

const pollButtons = $$("[data-poll]");
const pollResults = $(".poll-results");
const pollLabels = {
  single: "Single",
  visual: "Visual",
  story: "Behind the song",
};

function renderPoll() {
  if (!pollResults) return;
  const votes = store.get("losoPoll", { single: 2, visual: 3, story: 1 });
  const total = Object.values(votes).reduce((sum, value) => sum + value, 0) || 1;
  pollResults.innerHTML = Object.entries(votes)
    .map(([key, value]) => {
      const percent = Math.round((value / total) * 100);
      return `
        <div class="result-row">
          <div class="result-label"><span>${pollLabels[key]}</span><span>${percent}%</span></div>
          <div class="result-bar"><span style="width:${percent}%"></span></div>
        </div>
      `;
    })
    .join("");
}

pollButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.poll;
    const votes = store.get("losoPoll", { single: 2, visual: 3, story: 1 });
    votes[key] += 1;
    store.set("losoPoll", votes);
    pollButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderPoll();
  });
});
renderPoll();

const signalForm = $("#signalForm");
const signalWall = $("#signalWall");

function renderSignals() {
  if (!signalWall) return;
  const signals = store.get("losoSignals", [
    { name: "Night listener", message: "Shadows & Demons feels like fighting through the fog and still finding your feet." },
    { name: "Signal 33", message: "Drop the visual next. The cinematic lane is right there." },
    { name: "Day one", message: "Right Love Wrong Time hits like a conversation you never got to finish." },
  ]);
  signalWall.innerHTML = signals
    .slice()
    .reverse()
    .map((signal) => `<article class="signal-card"><strong>${escapeHtml(signal.name)}</strong><p>${escapeHtml(signal.message)}</p></article>`)
    .join("");
}

if (signalForm) {
  signalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#signalName").value.trim();
    const message = $("#signalMessage").value.trim();
    if (!name || !message) return;
    const signals = store.get("losoSignals", []);
    signals.push({ name, message });
    store.set("losoSignals", signals.slice(-9));
    signalForm.reset();
    renderSignals();
  });
}
renderSignals();

const packForm = $("#packForm");
const packOutput = $("#packOutput");
const savePackButton = $("#savePack");
const copyPackButton = $("#copyPack");
const sceneForm = $("#sceneForm");
const sceneOutput = $("#sceneOutput");
const copyScenesButton = $("#copyScenes");
const libraryList = $("#libraryList");
const clearLibraryButton = $("#clearLibrary");
const savedCount = $("#savedCount");

let latestPackText = "";
let latestScenesText = "";

function generatePack(data) {
  const release = data.get("release").trim() || "the next release";
  const artist = data.get("artist").trim() || "Loso Jones";
  const tone = data.get("tone");
  const platform = data.get("platform");
  const direction = data.get("direction").trim();
  const hooks = {
    "Dark cinematic": [
      "POV: the part of you that survived finally starts talking.",
      "Some songs are not sad. They are evidence.",
      "This is what healing sounds like when it still has teeth.",
    ],
    "Raw heartbreak": [
      "For everybody who had to leave with love still in their chest.",
      "The message you typed, deleted, and still meant.",
      "When the goodbye is clean but the wound is not.",
    ],
    "Survival anthem": [
      "You can be tired and still be dangerous to what tried to break you.",
      "Survival does not always sound pretty. Sometimes it sounds like this.",
      "For the ones who made it out different, not untouched.",
    ],
    "Low-key intimate": [
      "Late-night honesty, no performance.",
      "One room, one memory, one thing you never said out loud.",
      "This one is for the quiet part of the healing.",
    ],
  };
  const selectedHooks = hooks[tone] || hooks["Dark cinematic"];
  const caption = `${selectedHooks[0]} ${artist} - "${release}" is out now.`;
  return {
    release,
    artist,
    tone,
    platform,
    direction,
    caption,
    blocks: [
      {
        title: "Core Angle",
        items: [
          `${release} should feel like a confession that became armor.`,
          `Lead with one emotional truth, then let the ${tone.toLowerCase()} visuals sell the world.`,
          direction,
        ],
      },
      {
        title: "Content Ideas",
        items: [
          `15-second lyric clip with rain, red signal light, and a close crop on one handwritten line.`,
          `Talking-to-camera intro: "I wrote this for the part of me that almost stayed broken."`,
          `Fan prompt: "What line would you send to someone you had to let go?"`,
        ],
      },
      {
        title: "Captions",
        items: [caption, selectedHooks[1], selectedHooks[2]],
      },
      {
        title: "Hashtags",
        items: ["#LosoJones #LosoMedia #IndependentArtist #EmotionalMusic #MusicLife #HeartbreakSongs #SurvivalMusic"],
      },
      {
        title: "Rollout Checklist",
        items: [
          `Post teaser to ${platform}.`,
          "Pin the strongest lyric in the comments.",
          "Reply to every real fan signal with a personal note.",
          "Follow with a behind-the-song post within 24 hours.",
        ],
      },
    ],
  };
}

function renderPack(pack) {
  if (!packOutput) return;
  latestPackText = `${pack.artist} - ${pack.release}\nTone: ${pack.tone}\nPlatform: ${pack.platform}\n\n${pack.blocks
    .map((block) => `${block.title}\n${block.items.map((item) => `- ${item}`).join("\n")}`)
    .join("\n\n")}`;
  packOutput.innerHTML = pack.blocks
    .map(
      (block) => `
        <section class="pack-block">
          <h3>${block.title}</h3>
          <ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
      `,
    )
    .join("");
}

if (packForm) {
  packForm.addEventListener("submit", (event) => {
    event.preventDefault();
    renderPack(generatePack(new FormData(packForm)));
  });
}

if (copyPackButton) {
  copyPackButton.addEventListener("click", () => copyText(latestPackText || packOutput?.innerText || ""));
}

if (savePackButton) {
  savePackButton.addEventListener("click", () => {
    if (!latestPackText) {
      renderPack(generatePack(new FormData(packForm)));
    }
    const library = store.get("losoStudioLibrary", []);
    const title = new FormData(packForm).get("release") || "Untitled pack";
    library.unshift({ title, body: latestPackText, date: new Date().toLocaleString() });
    store.set("losoStudioLibrary", library.slice(0, 20));
    renderLibrary();
  });
}

if (sceneForm) {
  sceneForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(sceneForm);
    const world = data.get("world").trim();
    const arc = data.get("arc");
    const count = Math.max(3, Math.min(8, Number(data.get("count")) || 5));
    const beats = [
      `Open on ${world}. Loso is present as silhouette, voice, or symbol instead of a normal performance shot.`,
      `Show the wound: a phone glow, empty chair, old message, cracked mirror, or streetlight flicker.`,
      `Move into pressure. The frame gets tighter while the lyric lands like a confession.`,
      `Shift the arc: ${arc}. Let the camera breathe wider as the hook opens.`,
      `End with a clean signal: red light, wet pavement, forward motion, and no fake happy ending.`,
      `Bonus shot: close-up of a handwritten title card that fans can screenshot and share.`,
      `Performance insert: one take, minimal motion, eyes locked like the verse is a testimony.`,
      `Final social cut: isolate the strongest line for a 7-second loop.`,
    ].slice(0, count);
    latestScenesText = beats.map((beat, index) => `${index + 1}. ${beat}`).join("\n");
    sceneOutput.innerHTML = beats.map((beat) => `<li>${escapeHtml(beat)}</li>`).join("");
  });
}

if (copyScenesButton) {
  copyScenesButton.addEventListener("click", () => copyText(latestScenesText || sceneOutput?.innerText || ""));
}

if (clearLibraryButton) {
  clearLibraryButton.addEventListener("click", () => {
    store.set("losoStudioLibrary", []);
    renderLibrary();
  });
}

function renderLibrary() {
  if (!libraryList) return;
  const library = store.get("losoStudioLibrary", []);
  if (savedCount) savedCount.textContent = String(library.length);
  libraryList.innerHTML = library.length
    ? library
        .map(
          (item) => `
          <article class="library-item">
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.date)}</small>
            <p>${escapeHtml(item.body).slice(0, 220)}${item.body.length > 220 ? "..." : ""}</p>
          </article>
        `,
        )
        .join("")
    : "<p>No saved packs yet. Generate one and hit Save.</p>";
}
renderLibrary();

function copyText(value) {
  if (!value) return;
  navigator.clipboard?.writeText(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
