
(() => {
  "use strict";

  const LIBRARY_FILE = "library.json";
  const R2_BASE_URL = "https://pub-cd01009a7c6c464aa0b093e33aa5ae51.r2.dev";
  const WORKS_DIR = `${R2_BASE_URL}/works`;
  const ITEM_JSON_NAME = "item.json";
  const BOTTOM_AD_COUNT = 6;
  const RAIL_REFRESH_MS = 75000;
  const BANNER_REFRESH_MS = 95000;
  const READ_PROGRESS_PREFETCH = 0.7;
  const BOTTOM_GLOW_PROGRESS = 0.95;
  const SEARCH_RESULTS_LIMIT = 12;

  const ZONES = {
    topBanner: 5865232,
    leftRail: 5865238,
    rightRail: 5865240,
    betweenMulti: 5867482
  };

  let ARCHIVE_WORKS = [];
  let CURRENT_WORK = null;
  let CURRENT_ENTRY = null;
  let CURRENT_ITEM = null;
  let topFlyoutsWired = false;
  let stickyControlsWired = false;
  let searchWired = false;
  let railRefreshTimer = null;
  let bannerRefreshTimer = null;
  let nextPrefetch = null;
  let progressWatchWired = false;
  let bottomGlowTriggered = false;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function $$(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeKey(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function titleCaseSlug(slug) {
    return String(slug ?? "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, ch => ch.toUpperCase());
  }

  function serveAds() {
    (window.AdProvider = window.AdProvider || []).push({ serve: {} });
  }

  function makeIns(zoneId, sub = 1, sub2 = 1, sub3 = 1) {
    const ins = document.createElement("ins");
    ins.className = "eas6a97888e38";
    ins.setAttribute("data-zoneid", String(zoneId));
    ins.setAttribute("data-sub", String(sub));
    ins.setAttribute("data-sub2", String(sub2));
    ins.setAttribute("data-sub3", String(sub3));
    return ins;
  }

  function refillSlot(el, zoneId, sub = 1, sub2 = 1, sub3 = 1) {
    if (!el) return;
    el.innerHTML = "";
    el.appendChild(makeIns(zoneId, sub, sub2, sub3));
  }

  function fillSlot(el, zoneId, sub = 1, sub2 = 1, sub3 = 1) {
    refillSlot(el, zoneId, sub, sub2, sub3);
    serveAds();
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url} (${res.status})`);
    }
    return res.json();
  }

  async function loadLibrary() {
    const data = await fetchJson(LIBRARY_FILE);
    ARCHIVE_WORKS = Array.isArray(data.works) ? data.works : [];
  }

  function getQueryState() {
    const url = new URL(window.location.href);
    return {
      dir: url.searchParams.get("dir") || "",
      file: url.searchParams.get("file") || ""
    };
  }

  function setQueryState(dir, file, replace = false) {
    const url = new URL(window.location.href);
    url.searchParams.set("dir", dir);
    url.searchParams.set("file", file);

    if (replace) {
      history.replaceState({ dir, file }, "", url);
    } else {
      history.pushState({ dir, file }, "", url);
    }
  }

  function getFirstEntry() {
    for (const work of ARCHIVE_WORKS) {
      const first = Array.isArray(work.entries) ? work.entries[0] : null;
      if (work?.slug && first?.slug) {
        return { work, entry: first };
      }
    }
    return { work: null, entry: null };
  }

  function resolveSelection(dir, file) {
    const d = normalizeKey(dir);
    const f = normalizeKey(file);

    for (const work of ARCHIVE_WORKS) {
      if (normalizeKey(work.slug) !== d) continue;
      for (const entry of work.entries || []) {
        if (normalizeKey(entry.slug) === f) {
          return { work, entry };
        }
      }
    }

    return null;
  }

  function buildItemJsonPath(workSlug, entryPathOrSlug) {
    const safeParts = String(entryPathOrSlug)
      .split("/")
      .filter(Boolean)
      .map(part => encodeURIComponent(part));

    return `${WORKS_DIR}/${encodeURIComponent(workSlug)}/${safeParts.join("/")}/${ITEM_JSON_NAME}`;
  }

  function normalizeBaseUrl(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  function buildImageList(manifest) {
    if (Array.isArray(manifest.images) && manifest.images.length) {
      return manifest.images;
    }

    if (Number.isFinite(manifest.pages) && manifest.pages > 0) {
      const ext = manifest.extension || "jpg";
      const padding = Number.isFinite(manifest.padding) ? manifest.padding : 2;

      return Array.from({ length: manifest.pages }, (_, i) => {
        const n = String(i + 1).padStart(padding, "0");
        return `${n}.${ext}`;
      });
    }

    return [];
  }

  function getSubids(manifest) {
    const fallbackWork = Number(manifest.id) || Number(manifest.parent_work_id) || 1;

    return {
      work: manifest.subids?.work ?? fallbackWork,
      top: manifest.subids?.top ?? fallbackWork + 10,
      left: manifest.subids?.left ?? fallbackWork + 20,
      right: manifest.subids?.right ?? fallbackWork + 30,
      between: manifest.subids?.between ?? fallbackWork + 40
    };
  }

  function imageBlock(src, alt) {
    const wrap = document.createElement("div");
    wrap.className = "image-wrap";

    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.loading = "lazy";
    img.decoding = "async";

    wrap.appendChild(img);
    return wrap;
  }

  function betweenAd(manifest, groupNumber, slotCount) {
    const subids = getSubids(manifest);

    const wrap = document.createElement("div");
    wrap.className = "slot";

    const grid = document.createElement("div");
    grid.className = "between-grid";

    for (let i = 1; i <= slotCount; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.appendChild(makeIns(ZONES.betweenMulti, subids.between, subids.work, Number(`${groupNumber}${i}`)));
      grid.appendChild(slot);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  function endAds(manifest, count) {
    const subids = getSubids(manifest);

    const wrap = document.createElement("div");
    wrap.className = "slot";

    const grid = document.createElement("div");
    grid.className = "end-grid";

    for (let i = 1; i <= count; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.appendChild(makeIns(ZONES.betweenMulti, subids.between, subids.work, 9000 + i));
      grid.appendChild(slot);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  function fillRailStacks(subids) {
    const leftSlots = ["leftRailSlot1","leftRailSlot2","leftRailSlot3","leftRailSlot4","leftRailSlot5","leftRailSlot6"];
    const rightSlots = ["rightRailSlot1","rightRailSlot2","rightRailSlot3","rightRailSlot4","rightRailSlot5","rightRailSlot6"];

    leftSlots.forEach((id, index) => {
      fillSlot(document.getElementById(id), ZONES.leftRail, subids.left, subids.work, index + 1);
    });

    rightSlots.forEach((id, index) => {
      fillSlot(document.getElementById(id), ZONES.rightRail, subids.right, subids.work, index + 1);
    });
  }

  function flattenEntries() {
    const rows = [];
    for (const work of ARCHIVE_WORKS) {
      for (const entry of work.entries || []) {
        rows.push({
          workSlug: work.slug,
          workLabel: work.display || titleCaseSlug(work.slug),
          entrySlug: entry.slug,
          entryLabel: entry.subtitle || titleCaseSlug(entry.slug),
          searchKey: normalizeKey(`${work.display || work.slug} ${entry.subtitle || entry.slug} ${entry.slug}`)
        });
      }
    }
    return rows;
  }

  function renderSearchResults(items) {
    const results = document.getElementById("chapterSearchResults");
    const stat = document.getElementById("chapterSearchStat");
    if (!results || !stat) return;

    if (!items.length) {
      results.innerHTML = "";
      stat.textContent = "No matches yet";
      return;
    }

    stat.textContent = `${items.length} quick jump${items.length === 1 ? "" : "s"}`;
    results.innerHTML = items.map(item => `
      <button class="search-result-pill" type="button" data-dir="${escapeHtml(item.workSlug)}" data-file="${escapeHtml(item.entrySlug)}">
        ${escapeHtml(item.workLabel)} · ${escapeHtml(item.entryLabel)}
      </button>
    `).join("");
  }

  function wireSearch() {
    if (searchWired) return;
    searchWired = true;

    const input = document.getElementById("chapterSearchInput");
    const results = document.getElementById("chapterSearchResults");
    const stat = document.getElementById("chapterSearchStat");
    if (!input || !results || !stat) return;

    const all = flattenEntries();

    const refresh = () => {
      const query = normalizeKey(input.value);
      if (!query) {
        const seeded = all
          .filter(item => item.workSlug === CURRENT_WORK?.slug)
          .slice(0, SEARCH_RESULTS_LIMIT);
        renderSearchResults(seeded);
        stat.textContent = seeded.length ? `Showing ${seeded.length} in this work` : "Ready to jump";
        return;
      }

      const matched = all
        .filter(item => item.searchKey.includes(query))
        .slice(0, SEARCH_RESULTS_LIMIT);
      renderSearchResults(matched);
      stat.textContent = matched.length ? `${matched.length} result${matched.length === 1 ? "" : "s"}` : "No matches";
    };

    input.addEventListener("input", refresh);
    results.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-dir][data-file]");
      if (!btn) return;
      input.value = "";
      switchEntry(btn.dataset.dir, btn.dataset.file, false);
    });

    refresh();
  }

  function syncSearchSeed() {
    const input = document.getElementById("chapterSearchInput");
    const stat = document.getElementById("chapterSearchStat");
    if (!input || !stat) return;
    if (input.value.trim()) return;
    const seeded = flattenEntries().filter(item => item.workSlug === CURRENT_WORK?.slug).slice(0, SEARCH_RESULTS_LIMIT);
    renderSearchResults(seeded);
    stat.textContent = seeded.length ? `Showing ${seeded.length} in this work` : "Ready to jump";
  }

  function renderWorksNav() {
    const nav = document.getElementById("worksNav");
    if (!nav) return;

    let html = "";

    for (const work of ARCHIVE_WORKS.filter(w => w.top_pill !== false)) {
      const isActive = normalizeKey(work.slug) === normalizeKey(CURRENT_WORK?.slug);
      const entries = Array.isArray(work.entries) ? work.entries : [];

      html += `
        <div class="topworks-item${isActive ? " active" : ""}">
          <button class="topworks-trigger" type="button">
            <span>${escapeHtml(work.display || titleCaseSlug(work.slug))}</span>
            <span class="topworks-caret"></span>
          </button>
          <div class="topworks-flyout">
            <div class="topworks-links">
      `;

      for (const entry of entries) {
        const label = `${work.display || titleCaseSlug(work.slug)} · ${entry.subtitle || titleCaseSlug(entry.slug)}`;
        const active = isActive && normalizeKey(entry.slug) === normalizeKey(CURRENT_ENTRY?.slug) ? " active" : "";
        html += `
          <a href="?dir=${encodeURIComponent(work.slug)}&file=${encodeURIComponent(entry.slug)}" class="topworks-link${active}" data-dir="${escapeHtml(work.slug)}" data-file="${escapeHtml(entry.slug)}">${escapeHtml(label)}</a>
        `;
      }

      html += `</div></div></div>`;
    }

    nav.innerHTML = html;
    nav.onclick = (e) => {
      const a = e.target.closest("a[data-dir][data-file]");
      if (!a) return;
      e.preventDefault();
      switchEntry(a.dataset.dir, a.dataset.file, false);
    };
  }

  function wireTopFlyouts() {
    if (topFlyoutsWired) return;
    topFlyoutsWired = true;

    document.addEventListener("click", (e) => {
      const trigger = e.target.closest(".topworks-trigger");
      if (trigger) {
        const item = trigger.closest(".topworks-item");
        if (!item) return;
        e.preventDefault();
        const wasOpen = item.classList.contains("open");
        $$(".topworks-item.open").forEach(x => x.classList.remove("open"));
        if (!wasOpen) item.classList.add("open");
        return;
      }

      if (!e.target.closest(".topworks-item")) {
        $$(".topworks-item.open").forEach(x => x.classList.remove("open"));
      }
    });
  }

  function getEntryContext() {
    const entries = Array.isArray(CURRENT_WORK?.entries) ? CURRENT_WORK.entries : [];
    const currentIndex = entries.findIndex(entry => normalizeKey(entry.slug) === normalizeKey(CURRENT_ENTRY?.slug));
    return {
      entries,
      currentIndex,
      prev: currentIndex > 0 ? entries[currentIndex - 1] : null,
      next: currentIndex >= 0 && currentIndex < entries.length - 1 ? entries[currentIndex + 1] : null
    };
  }

  function makeTraversalPill(label, onClick, extraClass = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `traversal-pill${extraClass ? ` ${extraClass}` : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function buildTraversal(position = "top") {
    const shell = document.createElement("section");
    shell.className = `traversal-shell ${position}`;
    if (position === "bottom") shell.id = "bottomTraversal";

    const kicker = document.createElement("p");
    kicker.className = "traversal-kicker";
    kicker.textContent = position === "top" ? "Chapter Navigation" : "Keep The Scroll Alive";
    shell.appendChild(kicker);

    if (position === "bottom") {
      const prompt = document.createElement("div");
      prompt.className = "continue-prompt";
      prompt.textContent = "Finished this chapter? Pick the next move right here.";
      shell.appendChild(prompt);
    }

    const bar = document.createElement("div");
    bar.className = "traversal-bar";
    const { entries, prev, next } = getEntryContext();

    if (prev) bar.appendChild(makeTraversalPill("← Previous", () => switchEntry(CURRENT_WORK.slug, prev.slug, false)));

    for (const entry of entries) {
      const isCurrent = normalizeKey(entry.slug) === normalizeKey(CURRENT_ENTRY?.slug);
      const label = entry.subtitle || titleCaseSlug(entry.slug);
      bar.appendChild(makeTraversalPill(label, () => switchEntry(CURRENT_WORK.slug, entry.slug, false), isCurrent ? "current" : ""));
    }

    if (next) bar.appendChild(makeTraversalPill("Next →", () => switchEntry(CURRENT_WORK.slug, next.slug, false)));

    shell.appendChild(bar);
    return shell;
  }

  function updateChapterProgress(progress = 0) {
    const clamped = Math.max(0, Math.min(1, progress));
    const percent = Math.round(clamped * 100);
    const pageBar = document.getElementById("pageProgressBar");
    const fill = document.getElementById("chapterProgressFill");
    const label = document.getElementById("chapterProgressLabel");
    const text = document.getElementById("chapterProgressPercent");

    if (pageBar) pageBar.style.width = `${percent}%`;
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
    if (label) label.textContent = CURRENT_ENTRY?.subtitle || CURRENT_ITEM?.subtitle || "Chapter Progress";

    const bottomBtn = document.getElementById("scrollToBottomTraversalBtn");
    if (bottomBtn && clamped >= BOTTOM_GLOW_PROGRESS && !bottomGlowTriggered) {
      bottomGlowTriggered = true;
      bottomBtn.classList.add("pulse");
    }
    if (bottomBtn && clamped < BOTTOM_GLOW_PROGRESS) {
      bottomGlowTriggered = false;
      bottomBtn.classList.remove("pulse");
    }
  }

  function wireStickyControls() {
    if (stickyControlsWired) return;
    stickyControlsWired = true;

    const topBtn = document.getElementById("scrollToSearchBtn");
    const bottomBtn = document.getElementById("scrollToBottomTraversalBtn");
    if (!topBtn || !bottomBtn) return;

    topBtn.addEventListener("click", () => {
      const target = document.getElementById("searchBarAnchor") || document.querySelector(".hero");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    bottomBtn.addEventListener("click", () => {
      const target = document.getElementById("bottomTraversal") || document.getElementById("readerBottomAnchor");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function clearRefreshTimers() {
    if (railRefreshTimer) clearInterval(railRefreshTimer);
    if (bannerRefreshTimer) clearInterval(bannerRefreshTimer);
    railRefreshTimer = null;
    bannerRefreshTimer = null;
  }

  function startRefreshTimers() {
    clearRefreshTimers();

    railRefreshTimer = window.setInterval(() => {
      if (document.hidden || !CURRENT_ITEM) return;
      const subids = getSubids(CURRENT_ITEM);
      const leftSlots = ["leftRailSlot1","leftRailSlot2","leftRailSlot3","leftRailSlot4","leftRailSlot5","leftRailSlot6"];
      const rightSlots = ["rightRailSlot1","rightRailSlot2","rightRailSlot3","rightRailSlot4","rightRailSlot5","rightRailSlot6"];
      leftSlots.forEach((id, index) => refillSlot(document.getElementById(id), ZONES.leftRail, subids.left, subids.work, index + 1));
      rightSlots.forEach((id, index) => refillSlot(document.getElementById(id), ZONES.rightRail, subids.right, subids.work, index + 1));
      serveAds();
    }, RAIL_REFRESH_MS);

    bannerRefreshTimer = window.setInterval(() => {
      if (document.hidden || !CURRENT_ITEM) return;
      const subids = getSubids(CURRENT_ITEM);
      refillSlot(document.getElementById("topBannerSlot"), ZONES.topBanner, subids.top, subids.work, 1);
      serveAds();
    }, BANNER_REFRESH_MS);
  }

  function maybePreloadNextChapter() {
    if (nextPrefetch || !CURRENT_WORK || !CURRENT_ENTRY) return;
    const { next } = getEntryContext();
    if (!next) return;

    const entryPath = next.path || next.slug;
    const itemUrl = buildItemJsonPath(CURRENT_WORK.slug, entryPath);

    nextPrefetch = fetchJson(itemUrl)
      .then(manifest => {
        const images = buildImageList(manifest).slice(0, 3);
        const base = normalizeBaseUrl(manifest.base_url);
        images.forEach(name => {
          const img = new Image();
          img.decoding = "async";
          img.src = `${base}/${name}`;
        });
        return manifest;
      })
      .catch(() => null);
  }

  function wireProgressWatch() {
    if (progressWatchWired) return;
    progressWatchWired = true;

    window.addEventListener("scroll", () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      updateChapterProgress(progress);
      if (progress >= READ_PROGRESS_PREFETCH) maybePreloadNextChapter();
    }, { passive: true });
  }

  function buildChapterMeta(manifest, imageCount) {
    const meta = document.createElement("section");
    meta.className = "chapter-meta";

    const row = document.createElement("div");
    row.className = "meta-row";

    const leftTag = document.createElement("div");
    leftTag.className = "chapter-tag";
    leftTag.textContent = `${manifest.title || CURRENT_WORK.display || titleCaseSlug(CURRENT_WORK.slug)} · ${manifest.subtitle || CURRENT_ENTRY.subtitle || titleCaseSlug(CURRENT_ENTRY.slug)}`;

    const rightTag = document.createElement("div");
    rightTag.className = "chapter-tag";
    rightTag.textContent = `${imageCount} page${imageCount === 1 ? "" : "s"}`;

    row.appendChild(leftTag);
    row.appendChild(rightTag);

    const note = document.createElement("div");
    note.className = "chapter-note";
    note.textContent = "Use the search bar for instant jumps, keep the quick controls in view, and roll straight into the next chapter when you hit the end.";

    meta.appendChild(row);
    meta.appendChild(note);
    return meta;
  }

  async function buildReader() {
    const reader = document.getElementById("reader");
    if (!reader) return;

    nextPrefetch = null;
    bottomGlowTriggered = false;
    updateChapterProgress(0);

    const state = getQueryState();
    let resolved = resolveSelection(state.dir, state.file);
    if (!resolved) {
      const first = getFirstEntry();
      resolved = first.work && first.entry ? first : null;
      if (resolved) setQueryState(resolved.work.slug, resolved.entry.slug, true);
    }
    if (!resolved) throw new Error("No works found in library.json");

    CURRENT_WORK = resolved.work;
    CURRENT_ENTRY = resolved.entry;

    const entryPath = resolved.entry.path || resolved.entry.slug;
    const itemUrl = buildItemJsonPath(resolved.work.slug, entryPath);
    const manifest = await fetchJson(itemUrl);
    CURRENT_ITEM = manifest;

    const title = `${resolved.work.display || titleCaseSlug(resolved.work.slug)} · ${manifest.subtitle || resolved.entry.subtitle || titleCaseSlug(resolved.entry.slug)}`;
    const workTitleEl = document.getElementById("workTitle");
    if (workTitleEl) workTitleEl.textContent = title;

    renderWorksNav();
    syncSearchSeed();

    const subids = getSubids(manifest);
    fillSlot(document.getElementById("topBannerSlot"), ZONES.topBanner, subids.top, subids.work, 1);
    fillRailStacks(subids);

    reader.innerHTML = "";

    const topAnchor = document.createElement("span");
    topAnchor.id = "readerTopAnchor";
    topAnchor.className = "reader-anchor";
    reader.appendChild(topAnchor);

    const images = buildImageList(manifest);
    const base = normalizeBaseUrl(manifest.base_url);
    if (!base) throw new Error(`Manifest for ${resolved.entry.slug} is missing base_url`);
    if (!images.length) throw new Error(`Manifest for ${resolved.entry.slug} has no images`);

    reader.appendChild(buildChapterMeta(manifest, images.length));

    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "At most they simply have to scroll. And that’s easy.";
    reader.appendChild(note);
    reader.appendChild(buildTraversal("top"));

    const betweenEvery = Number(manifest.ads?.between_every) || 0;
    const betweenSlots = Number(manifest.ads?.between_slots) || 3;
    const finalBlock = Math.max(Number(manifest.ads?.final_block) || 0, BOTTOM_AD_COUNT);

    let groupNumber = 0;
    for (let i = 0; i < images.length; i++) {
      reader.appendChild(imageBlock(`${base}/${images[i]}`, `${manifest.title || resolved.work.display || resolved.work.slug} page ${i + 1}`));
      const pageNumber = i + 1;
      const shouldInsertBetween = betweenEvery > 0 && pageNumber % betweenEvery === 0 && pageNumber < images.length;
      if (shouldInsertBetween) {
        groupNumber += 1;
        reader.appendChild(betweenAd(manifest, groupNumber, betweenSlots));
      }
    }

    if (finalBlock > 0) reader.appendChild(endAds(manifest, finalBlock));
    reader.appendChild(buildTraversal("bottom"));

    const bottomAnchor = document.createElement("span");
    bottomAnchor.id = "readerBottomAnchor";
    bottomAnchor.className = "reader-anchor";
    reader.appendChild(bottomAnchor);

    serveAds();
    startRefreshTimers();
    updateChapterProgress(0);
  }

  async function switchEntry(dir, file, replace = false) {
    setQueryState(dir, file, replace);
    await buildReader();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function boot() {
    await loadLibrary();
    wireTopFlyouts();
    wireStickyControls();
    wireProgressWatch();
    wireSearch();
    await buildReader();

    window.addEventListener("popstate", async () => {
      await buildReader();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    boot().catch(err => {
      console.error(err);
      clearRefreshTimers();
      const workTitleEl = document.getElementById("workTitle");
      if (workTitleEl) workTitleEl.textContent = "Failed to load work";
      const reader = document.getElementById("reader");
      if (reader) {
        reader.innerHTML = `
          <div class="note">
            Failed to load this work. Please check library.json, item.json, base_url, and image filenames.
          </div>
        `;
      }
    });
  });
})();
