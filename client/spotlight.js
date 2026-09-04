"use strict";

// Ambient color palettes and tags per genre
const REALM_THEMES = {
  "Tiên hiệp": { glow: "rgba(217, 155, 80, 0.28)", color: "#d99b50", tag: "Tiên Đạo Vô Song" },
  "Huyền huyễn": { glow: "rgba(168, 85, 247, 0.25)", color: "#c084fc", tag: "Dị Giới Tranh Bá" },
  "Linh dị / Kinh dị": { glow: "rgba(244, 63, 94, 0.24)", color: "#f43f5e", tag: "Bí Ẩn Quỷ Dị" },
  "Mạt thế": { glow: "rgba(56, 189, 248, 0.25)", color: "#38bdf8", tag: "Tận Thế Sinh Tồn" },
  "Trinh thám": { glow: "rgba(45, 212, 191, 0.25)", color: "#2dd4bf", tag: "Kỳ Án Phá Giới" }
};

const DEFAULT_THEME = { glow: "rgba(217, 155, 80, 0.24)", color: "#d99b50", tag: "Tuyển Tập Đặc Biệt" };

function setWorldAtmosphere(genre) {
  const theme = REALM_THEMES[genre] || DEFAULT_THEME;
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root) {
    root.style.setProperty("--world-aura-color", theme.color);
    root.style.setProperty("--world-aura-glow", theme.glow);
    root.setAttribute("data-active-realm", genre || "default");
  }
  const auraEl = document.getElementById("worldAtmosphere");
  if (auraEl) {
    auraEl.style.background = `radial-gradient(ellipse 95% 65% at 50% 15%, ${theme.glow} 0%, rgba(20, 22, 26, 0) 75%)`;
  }
}

function resetWorldAtmosphere() {
  const activeBook = spotlightState.curatedBooks[spotlightState.activeIndex];
  if (activeBook) {
    setWorldAtmosphere(activeBook.genre);
  } else {
    setWorldAtmosphere();
  }
}

let spotlightState = {
  books: [],
  curatedBooks: [],
  activeIndex: 0,
  callbacks: {}
};

function formatExcerpt(book) {
  if (!book || !book.description) {
    return "Mỗi cuốn sách mở ra là một thế giới đang chờ được khám phá, nơi số phận của những nhân vật hòa quyện cùng trí tưởng tượng của bạn.";
  }
  const clean = book.description.replace(/\s+/g, " ").trim();
  // Attempt to extract the first complete sentence
  const match = clean.match(/^([^.!?]+[.!?])/);
  if (match && match[1].length >= 35 && match[1].length <= 220) {
    return `"${match[1].trim()}"`;
  }
  if (clean.length > 180) {
    return `"${clean.slice(0, 180).trim()}..."`;
  }
  return `"${clean}"`;
}

function selectCuratedBooks(allBooks) {
  if (!allBooks || allBooks.length === 0) return [];

  // Pick top book per major genre to ensure rich variety
  const targetGenres = ["Trinh thám", "Huyền huyễn", "Linh dị / Kinh dị", "Tiên hiệp", "Mạt thế"];
  const selected = [];
  const usedIds = new Set();

  // 1. Try to get one standout book with cover for each major genre
  for (const g of targetGenres) {
    const candidate = allBooks.find(
      (b) => b.genre === g && b.cover && Number(b.translatedChapters || 0) > 0 && !usedIds.has(b.id)
    ) || allBooks.find(
      (b) => b.genre === g && b.cover && !usedIds.has(b.id)
    );
    if (candidate) {
      selected.push(candidate);
      usedIds.add(candidate.id);
    }
  }

  // 2. Fill remaining slots up to 5 with highest rated / most translated books
  if (selected.length < 5) {
    const sorted = [...allBooks].sort((a, b) => {
      const ta = Number(a.translatedChapters || 0);
      const tb = Number(b.translatedChapters || 0);
      if (tb !== ta) return tb - ta;
      return (Number(b.chapterCount || 0)) - (Number(a.chapterCount || 0));
    });

    for (const b of sorted) {
      if (selected.length >= 5) break;
      if (!usedIds.has(b.id)) {
        selected.push(b);
        usedIds.add(b.id);
      }
    }
  }

  return selected.slice(0, 5);
}

function initSpotlight(options = {}) {
  spotlightState.callbacks = options;
  if (options.books && options.books.length > 0) {
    updateSpotlightBooks(options.books);
  }
  bindStageInteractions();
}

function updateSpotlightBooks(books) {
  if (!books || books.length === 0) return;
  spotlightState.books = books;
  spotlightState.curatedBooks = selectCuratedBooks(books);
  spotlightState.activeIndex = 0;

  renderActiveSpotlight();
  renderSpotlightReel();
  updateRealmsCounts(books);
}

function renderActiveSpotlight() {
  const curated = spotlightState.curatedBooks;
  if (curated.length === 0) return;

  const book = curated[spotlightState.activeIndex] || curated[0];
  if (!book) return;

  const theme = REALM_THEMES[book.genre] || DEFAULT_THEME;
  setWorldAtmosphere(book.genre);

  // Elements
  const coverEl = document.getElementById("spotlightCover");
  const spineTextEl = document.getElementById("spotlightSpineText");
  const sealEl = document.getElementById("spotlightSeal");
  const genreEl = document.getElementById("spotlightGenre");
  const statusEl = document.getElementById("spotlightStatus");
  const chaptersEl = document.getElementById("spotlightChapters");
  const titleEl = document.getElementById("spotlightTitle");
  const authorEl = document.getElementById("spotlightAuthor");
  const excerptEl = document.getElementById("spotlightExcerpt");
  const glowEl = document.getElementById("spotlightGlow");
  const readBtn = document.getElementById("spotlightReadBtn");
  const detailBtn = document.getElementById("spotlightDetailBtn");
  const stageEl = document.querySelector(".spotlight-stage");

  if (stageEl) {
    stageEl.classList.remove("is-transitioning");
    void stageEl.offsetWidth; // trigger reflow
    stageEl.classList.add("is-transitioning");
  }

  // Cover & Spine
  if (coverEl) {
    coverEl.src = book.cover || "/library/covers/misty-pagoda.webp";
    coverEl.alt = `Bìa tiểu thuyết ${book.title}`;
  }
  if (spineTextEl) {
    spineTextEl.textContent = (book.title && book.title.length > 24) 
      ? book.title.slice(0, 22) + "..." 
      : (book.title || "TRẠM CHỮ");
  }

  // Badges & Seal
  if (sealEl) {
    sealEl.textContent = book.status === "Hoàn thành" ? "★ TOÀN BẢN" : "★ ĐỀ CỬ";
  }
  if (genreEl) {
    genreEl.textContent = book.genre || "Tiểu thuyết";
    genreEl.style.borderColor = `${theme.color}40`;
    genreEl.style.color = theme.color;
  }
  if (statusEl) {
    statusEl.textContent = book.status || "Đang ra";
  }
  if (chaptersEl) {
    const total = Number(book.chapterCount || book.totalChapters || 0);
    const trans = Number(book.translatedChapters || 0);
    chaptersEl.textContent = trans > 0 ? `Dịch ${trans}/${total} ch` : (total > 0 ? `${total} chương` : "Đang cập nhật");
  }

  // Typography
  if (titleEl) {
    titleEl.textContent = book.title;
  }
  if (authorEl) {
    authorEl.textContent = book.author || "Tác giả đang cập nhật";
  }
  if (excerptEl) {
    excerptEl.textContent = formatExcerpt(book);
  }

  // Ambient Glow
  if (glowEl) {
    glowEl.style.background = `radial-gradient(ellipse at 50% 35%, ${theme.glow} 0%, transparent 68%)`;
  }

  // Action Buttons
  if (readBtn) {
    readBtn.onclick = () => {
      if (spotlightState.callbacks.onReadBook) {
        spotlightState.callbacks.onReadBook(book);
      }
    };
  }
  if (detailBtn) {
    detailBtn.onclick = () => {
      if (spotlightState.callbacks.onShowDetail) {
        spotlightState.callbacks.onShowDetail(book);
      }
    };
  }

  // Update reel selection state
  updateReelActiveState();
}

function renderSpotlightReel() {
  const reelEl = document.getElementById("spotlightReel");
  if (!reelEl) return;

  reelEl.innerHTML = "";
  spotlightState.curatedBooks.forEach((book, idx) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `reel-item ${idx === spotlightState.activeIndex ? "active" : ""}`;
    item.setAttribute("role", "tab");
    item.setAttribute("aria-selected", String(idx === spotlightState.activeIndex));
    item.setAttribute("aria-label", `Xem tiêu điểm: ${book.title}`);

    const thumb = document.createElement("img");
    thumb.className = "reel-thumb";
    thumb.src = book.cover || "/library/covers/misty-pagoda.webp";
    thumb.alt = "";
    thumb.loading = "lazy";

    const info = document.createElement("div");
    info.className = "reel-item-info";
    const title = document.createElement("span");
    title.className = "reel-item-title";
    title.textContent = book.title;
    const genre = document.createElement("span");
    genre.className = "reel-item-genre";
    genre.textContent = book.genre || "Tiểu thuyết";

    info.append(title, genre);
    item.append(thumb, info);

    item.addEventListener("click", () => {
      if (spotlightState.activeIndex !== idx) {
        spotlightState.activeIndex = idx;
        renderActiveSpotlight();
      }
    });

    item.addEventListener("mouseenter", () => {
      setWorldAtmosphere(book.genre);
    });

    item.addEventListener("mouseleave", () => {
      const activeBook = spotlightState.curatedBooks[spotlightState.activeIndex];
      if (activeBook) {
        setWorldAtmosphere(activeBook.genre);
      }
    });

    reelEl.appendChild(item);
  });
}

function updateReelActiveState() {
  const reelEl = document.getElementById("spotlightReel");
  if (!reelEl) return;
  const items = reelEl.querySelectorAll(".reel-item");
  items.forEach((item, idx) => {
    const isActive = idx === spotlightState.activeIndex;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
}

function updateRealmsCounts(books) {
  const counts = {};
  books.forEach((b) => {
    if (b.genre) {
      counts[b.genre] = (counts[b.genre] || 0) + 1;
    }
  });

  const countEls = document.querySelectorAll("[data-genre-count]");
  countEls.forEach((el) => {
    const genre = el.getAttribute("data-genre-count");
    if (genre && counts[genre] !== undefined) {
      el.textContent = `${counts[genre]} tác phẩm`;
    }
  });
}

function bindStageInteractions() {
  const displayEl = document.getElementById("spotlightBookDisplay");
  const bookEl = document.getElementById("spotlightPhysicalBook");
  const sheenEl = document.querySelector(".cover-sheen");

  if (!displayEl || !bookEl) return;

  // Tactile 3D tilt & sheen reflection on desktop
  let isHovered = false;
  let rafId = null;
  let targetRotX = 0;
  let targetRotY = -6;
  let currentRotX = 0;
  let currentRotY = -6;

  function renderTilt() {
    if (!isHovered) {
      currentRotX += (0 - currentRotX) * 0.1;
      currentRotY += (-6 - currentRotY) * 0.1;
    } else {
      currentRotX += (targetRotX - currentRotX) * 0.15;
      currentRotY += (targetRotY - currentRotY) * 0.15;
    }

    bookEl.style.transform = `perspective(1200px) rotateX(${currentRotX.toFixed(2)}deg) rotateY(${currentRotY.toFixed(2)}deg) translateZ(12px)`;

    if (Math.abs(targetRotX - currentRotX) > 0.05 || Math.abs(targetRotY - currentRotY) > 0.05 || isHovered) {
      rafId = requestAnimationFrame(renderTilt);
    } else {
      rafId = null;
    }
  }

  displayEl.addEventListener("mousemove", (e) => {
    isHovered = true;
    const rect = displayEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    targetRotX = -y * 14;
    targetRotY = x * 18;

    if (sheenEl) {
      sheenEl.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255, 255, 255, 0.28) 0%, transparent 60%)`;
    }

    if (!rafId) rafId = requestAnimationFrame(renderTilt);
  });

  displayEl.addEventListener("mouseleave", () => {
    isHovered = false;
    targetRotX = 0;
    targetRotY = -6;
    if (sheenEl) sheenEl.style.background = "none";
    if (!rafId) rafId = requestAnimationFrame(renderTilt);
  });

  // Clicking the 3D book directly opens reader or detail
  bookEl.addEventListener("click", () => {
    const current = spotlightState.curatedBooks[spotlightState.activeIndex];
    if (current && spotlightState.callbacks.onShowDetail) {
      spotlightState.callbacks.onShowDetail(current);
    }
  });

  // Realm card filter actions & atmosphere response
  const realmCards = document.querySelectorAll(".realm-card[data-genre]");
  realmCards.forEach((card) => {
    const genre = card.getAttribute("data-genre");
    card.addEventListener("click", () => {
      if (genre && spotlightState.callbacks.onSelectGenre) {
        spotlightState.callbacks.onSelectGenre(genre);
      }
    });

    card.addEventListener("mouseenter", () => {
      if (genre) setWorldAtmosphere(genre);
    });

    card.addEventListener("mouseleave", () => {
      const activeBook = spotlightState.curatedBooks[spotlightState.activeIndex];
      if (activeBook) {
        setWorldAtmosphere(activeBook.genre);
      }
    });
  });
}

module.exports = {
  REALM_THEMES,
  DEFAULT_THEME,
  formatExcerpt,
  setWorldAtmosphere,
  resetWorldAtmosphere,
  initSpotlight,
  updateSpotlightBooks
};

