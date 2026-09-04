"use strict";

const THREE = require("three");

// Default curated books for initial frame before CDN catalog resolves
const DEFAULT_HERO_BOOKS = [
  {
    id: "fanqie-7027679289931729920",
    title: "Ác Mộng Cầu Sinh: Từ Tiểu Mộc Ốc Khởi Xây",
    author: "Lộ Kiếm Nhất",
    genre: "Trinh thám / Sinh tồn",
    status: "Đang cập nhật",
    chapterCount: 1956,
    translatedChapters: 300,
    cover: "/covers/fanqie-7027679289931729920.jpg",
    description: "Thế giới ác mộng, những ứng cử viên được chọn rơi xuống đây, mở ra cuộc thi sinh tử...",
    color: "#38bdf8"
  },
  {
    id: "fanqie-6995119379645991944",
    title: "Ta Biến Thế Giới Kinh Hoàng Thành Trò Chơi Nuôi Dưỡng!",
    author: "Dự Tác",
    genre: "Linh dị / Huyền bí",
    status: "Đang cập nhật",
    chapterCount: 939,
    translatedChapters: 0,
    cover: "/covers/fanqie-6995119379645991944.jpg",
    description: "Một lực lượng bí ẩn hạ xuống Trái Đất, sinh ra một thế giới văn minh kinh hoàng khác...",
    color: "#c084fc"
  },
  {
    id: "fanqie-7168385493590084619",
    title: "Hỗn Độn Cổ Đỉnh",
    author: "Loạn Thế Gian Thần",
    genre: "Huyền huyễn / Tu tiên",
    status: "Đang cập nhật",
    chapterCount: 2580,
    translatedChapters: 0,
    cover: "/covers/fanqie-7168385493590084619.jpg",
    description: "Thiếu niên Lục Thần bước ra từ thành nhỏ Thiên Nguyên mang theo bảo vật Hỗn Độn Cổ Đỉnh bí ẩn...",
    color: "#f59e0b"
  },
  {
    id: "fanqie-6501193975188163598",
    title: "Đạo Trưởng Đừng Giả Vờ Nữa",
    author: "Khốn Đích Thụy Bất Trước",
    genre: "Linh dị / Tiên thuật",
    status: "Đang cập nhật",
    chapterCount: 5548,
    translatedChapters: 0,
    cover: "/covers/fanqie-6501193975188163598.jpg",
    description: "Người của Cổ Tỉnh Quán xuất thế, từ đó danh tiếng vang khắp thiên hạ...",
    color: "#2dd4bf"
  },
  {
    id: "fanqie-6497813734990285837",
    title: "Ma Y Thần Toán Tử",
    author: "Kỵ Mã Điếu Ngư",
    genre: "Tiên hiệp / Phong thủy",
    status: "Đang cập nhật",
    chapterCount: 2678,
    translatedChapters: 0,
    cover: "/covers/fanqie-6497813734990285837.jpg",
    description: "Nhìn thấu huyền cơ âm dương, hàng yêu trừ ma, giải mã những kỳ án kinh thiên động địa...",
    color: "#fb7185"
  },
  {
    id: "fanqie-7287726057069743138",
    title: "Dân Gian Đệ Nhất Cấm Kỵ",
    author: "Phỉ Di",
    genre: "Linh dị dân gian",
    status: "Đang cập nhật",
    chapterCount: 2206,
    translatedChapters: 0,
    cover: "/covers/fanqie-7287726057069743138.jpg",
    description: "Ta bị cắt đứt gân mạch chôn sống trong quan tài, nhưng bọn họ không biết rằng ta mang mệnh Diêm Vương...",
    color: "#818cf8"
  },
  {
    id: "fanqie-7309742129457138738",
    title: "Ta Ở Thiên Lao, Trường Sinh Bất Tử",
    author: "Giới Giới",
    genre: "Huyền huyễn / Trường sinh",
    status: "Đang cập nhật",
    chapterCount: 1976,
    translatedChapters: 0,
    cover: "/covers/fanqie-7309742129457138738.jpg",
    description: "Trần Quan Lâu sống thọ hơn Tông Sư, sống thọ hơn Đại Tông Sư, chứng kiến vạn thế thăng trầm...",
    color: "#34d399"
  }
];

// SPATIAL CONSTELLATION: Exactly 5 books with clear visual depth hierarchy
// 1 Foreground (Main Focal Novel) + 2 Midground + 2 Background
// SPATIAL CONSTELLATION: Protagonist Novel (Monumental scale) + 5 Background Novels in vast depth
const SPATIAL_CONFIGS = [
  // 1. PROTAGONIST NOVEL (Monumental Focal Object)
  // Commanding physical presence filling ~58% of viewport height on the right stage.
  {
    tier: "protagonist",
    pos: [1.32, -0.08, 0.1],
    rot: [-0.05, -0.38, 0.03],
    scale: 1.0,
    opacity: 1.0,
    drift: "majestic-breath",
    speed: 0.12,
    amplitude: 0.012
  },
  // 2. MIDGROUND 1 (Upper-Right Flank)
  {
    tier: "midground",
    pos: [2.8, 1.35, -1.2],
    rot: [0.08, -0.44, -0.04],
    scale: 0.62,
    opacity: 0.72,
    drift: "pitch-sway",
    speed: 0.22,
    amplitude: 0.035
  },
  // 3. MIDGROUND 2 (Lower-Right Flank - floating beneath protagonist novel)
  {
    tier: "midground",
    pos: [1.85, -1.65, -1.5],
    rot: [0.08, -0.32, -0.02],
    scale: 0.52,
    opacity: 0.65,
    drift: "depth-surge",
    speed: 0.20,
    amplitude: 0.03
  },
  // 4. BACKGROUND 1 (High Deep Center Anchor)
  {
    tier: "background",
    pos: [0.4, 2.0, -2.8],
    rot: [-0.05, -0.22, 0.03],
    scale: 0.40,
    opacity: 0.35,
    drift: "horizontal",
    speed: 0.28,
    amplitude: 0.045
  },
  // 5. BACKGROUND 2 (Deep Far Right Anchor)
  {
    tier: "background",
    pos: [3.8, -0.8, -2.6],
    rot: [0.05, -0.45, -0.02],
    scale: 0.42,
    opacity: 0.30,
    drift: "orbital",
    speed: 0.25,
    amplitude: 0.04
  },
  // 6. BACKGROUND 3 (Distant Void Silhouette)
  {
    tier: "background",
    pos: [2.0, -2.2, -4.2],
    rot: [0.12, -0.20, 0.05],
    scale: 0.32,
    opacity: 0.20,
    drift: "majestic-breath",
    speed: 0.24,
    amplitude: 0.04
  }
];

const PALETTES = ["#38bdf8", "#c084fc", "#f59e0b", "#2dd4bf", "#fb7185", "#818cf8", "#34d399"];

let hero3DInstance = null;

// Rich hardcover procedural cover with leather/buckram gradient and gold foil typography
function createProceduralCoverTexture(book, paletteColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Dark rich buckram gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGrad.addColorStop(0, "#080c1d");
  bgGrad.addColorStop(0.35, paletteColor + "38");
  bgGrad.addColorStop(0.75, "#0b1028");
  bgGrad.addColorStop(1, "#040713");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft atmospheric radial glow
  const radial = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.42,
    60,
    canvas.width * 0.5,
    canvas.height * 0.42,
    canvas.width * 0.68
  );
  radial.addColorStop(0, paletteColor + "45");
  radial.addColorStop(0.55, paletteColor + "14");
  radial.addColorStop(1, "transparent");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ornate gold/bronze outer frame
  ctx.strokeStyle = paletteColor + "99";
  ctx.lineWidth = 5;
  ctx.strokeRect(52, 52, canvas.width - 104, canvas.height - 104);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(68, 68, canvas.width - 136, canvas.height - 136);

  // Corner ornaments
  const corners = [
    [52, 52],
    [canvas.width - 52, 52],
    [52, canvas.height - 52],
    [canvas.width - 52, canvas.height - 52]
  ];
  corners.forEach(([cx, cy]) => {
    ctx.fillStyle = paletteColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  });

  // Top Genre Tag
  ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = paletteColor;
  ctx.textAlign = "center";
  ctx.letterSpacing = "6px";
  ctx.fillText((book.genre || "TIỂU THUYẾT").toUpperCase(), canvas.width / 2, 135);

  const chCount = Number(book.chapterCount || book.totalChapters || 0);
  ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.letterSpacing = "4px";
  ctx.fillText(chCount > 0 ? `TRẠM CHỮ • ${chCount} CHƯƠNG` : "TRẠM CHỮ ĐỀ CỬ", canvas.width / 2, 172);

  // Central Emblem
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height * 0.42);
  ctx.strokeStyle = paletteColor + "66";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 180, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.arc(0, 0, 150, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = paletteColor;
  ctx.font = '900 78px "Cinzel", "Times New Roman", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const initial = (book.title || "T").charAt(0);
  ctx.fillText(initial, 0, -6);
  ctx.restore();

  // Book Title (Serif with shadow)
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = '700 58px "Cinzel", "Times New Roman", serif';
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;

  const titleWords = (book.title || "").split(" ");
  if (titleWords.length > 3) {
    const mid = Math.ceil(titleWords.length / 2);
    ctx.fillText(titleWords.slice(0, mid).join(" "), canvas.width / 2, canvas.height * 0.68);
    ctx.fillText(titleWords.slice(mid).join(" "), canvas.width / 2, canvas.height * 0.74);
  } else {
    ctx.fillText(book.title || "", canvas.width / 2, canvas.height * 0.71);
  }
  ctx.shadowBlur = 0;

  // Gold Divider Line
  ctx.strokeStyle = paletteColor + "bb";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.32, canvas.height * 0.82);
  ctx.lineTo(canvas.width * 0.68, canvas.height * 0.82);
  ctx.stroke();

  // Author byline
  ctx.font = '600 26px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = "#e2e8f0";
  ctx.letterSpacing = "3px";
  ctx.fillText(`TÁC GIẢ: ${(book.author || "ĐANG CẬP NHẬT").toUpperCase()}`, canvas.width / 2, canvas.height * 0.875);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createPageEdgesTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#dfd6c5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#b8ad96";
  for (let y = 0; y < canvas.height; y += 3) {
    if (Math.random() > 0.3) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
}

function createSpineTexture(book, paletteColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, "#04060e");
  grad.addColorStop(0.5, "#0e142e");
  grad.addColorStop(1, "#04060e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = paletteColor;
  [80, 220, 800, 940].forEach((y) => ctx.fillRect(16, y, canvas.width - 32, 6));

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.font = '700 24px "Cinzel", "Times New Roman", serif';
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const title = book.title || "";
  ctx.fillText(title.length > 24 ? title.substring(0, 22) + "..." : title, 0, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDustParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.25, "rgba(160, 210, 255, 0.7)");
  grad.addColorStop(0.6, "rgba(120, 160, 255, 0.2)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  return new THREE.CanvasTexture(canvas);
}

class Hero3DUniverse {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.books = [];
    this.bookMeshes = [];
    this.hoveredBookId = null;
    this.selectedBookId = null;
    this.isEntering = false;
    this.pointer = new THREE.Vector2(0, 0);
    // Camera base coordinates focused on the right stage (X=0.6, Y=0, Z=5.2)
    this.targetCamPos = new THREE.Vector3(0.6, 0, 5.2);
    this.targetLookAt = new THREE.Vector3(0.6, 0, 0);
    this.currentLookAt = new THREE.Vector3(0.6, 0, 0);
    this.targetCamPos = new THREE.Vector3(0.65, 0, 5.0);
    this.targetLookAt = new THREE.Vector3(0.65, 0, 0);
    this.currentLookAt = new THREE.Vector3(0.65, 0, 0);
    this.isRunning = false;
    this.rafId = null;
    this.clock = new THREE.Clock();

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || 600;

    // 1. Scene & Depth Fog
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x030611, 4.5, 14.0);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    this.camera.position.set(0.65, 0, 5.0);
    this.camera.lookAt(0.65, 0, 0);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.className = "hero-3d-canvas";
    this.container.appendChild(this.renderer.domElement);

    // 4. Lighting Setup - Studio Raking & Rim Illumination
    const ambientLight = new THREE.AmbientLight(0x0a1026, 0.85);
    this.scene.add(ambientLight);

    // Warm Key Light highlighting the cover texture
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.4);
    keyLight.position.set(4.5, 5, 5);
    this.scene.add(keyLight);

    // Dramatic Orange Rim Light grazing the spine and page edges
    const rimLightOrange = new THREE.DirectionalLight(0xf97316, 3.5);
    rimLightOrange.position.set(-4.5, 2.5, -1);
    this.scene.add(rimLightOrange);

    // Cool Azure Fill Light from opposite side for architectural depth
    const fillLightCool = new THREE.DirectionalLight(0x38bdf8, 0.7);
    fillLightCool.position.set(2, -4, 3);
    this.scene.add(fillLightCool);

    // Warm Focal Point Light anchored near the protagonist novel
    const focalPointLight = new THREE.PointLight(0xffedd5, 1.8, 12);
    focalPointLight.position.set(1.2, 0.8, 2.8);
    this.scene.add(focalPointLight);

    // 5. Atmosphere: Dust Particles & Starfield
    this.initAtmosphere();

    // 6. Raycaster
    this.raycaster = new THREE.Raycaster();

    // 7. Event Listeners
    this.bindEvents();

    // 8. Populate books
    this.setBooks(this.options.books || DEFAULT_HERO_BOOKS);

    // 9. Intersection Observer (auto-pauses loop when offscreen)
    this.initIntersectionObserver();

    // 10. Start render loop
    this.start();
  }

  initAtmosphere() {
    // 1. Subtle, Clean Floating Dust Particles (Reduced from 650 to 180)
    const dustCount = 180;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    this.dustSpeeds = new Float32Array(dustCount * 3);

    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3 + 0] = (Math.random() - 0.5) * 16 + 0.5;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 1;

      this.dustSpeeds[i * 3 + 0] = (Math.random() - 0.5) * 0.03;
      this.dustSpeeds[i * 3 + 1] = 0.03 + Math.random() * 0.06;
      this.dustSpeeds[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));

    const dustTex = createDustParticleTexture();
    const dustMat = new THREE.PointsMaterial({
      size: 0.12,
      map: dustTex,
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);

    // 2. Distant Stars (Reduced from 1000 to 350, tiny and serene)
    const starCount = 350;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3 + 0] = (Math.random() - 0.5) * 35;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 25;
      starPos[i * 3 + 2] = -6 - Math.random() * 20;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.04,
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true
    });
    this.starPoints = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starPoints);

    // 3. Subtle Cosmic Vignette Glow (Very dark, no visual clash)
    const nebGeo1 = new THREE.PlaneGeometry(16, 12);
    const nebMat1 = new THREE.MeshBasicMaterial({
      color: 0x0c1428,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const nebMesh1 = new THREE.Mesh(nebGeo1, nebMat1);
    nebMesh1.position.set(1, 1, -6);
    this.scene.add(nebMesh1);
  }

  setBooks(booksList) {
    // Clear existing book meshes
    this.bookMeshes.forEach((item) => {
      this.scene.remove(item.group);
      if (item.materials) {
        item.materials.forEach((m) => m.dispose && m.dispose());
      }
    });
    this.bookMeshes = [];

    const source = (booksList && booksList.length > 0) ? booksList : DEFAULT_HERO_BOOKS;
    // Exactly 6 books: 1 Protagonist Focal Novel + 2 Midground + 3 Background
    this.books = source.slice(0, 6);

    const BOOK_W = 1.38;
    const BOOK_H = 2.05;
    const BOOK_D = 0.22;
    const pagesTex = createPageEdgesTexture();

    this.books.forEach((book, idx) => {
      const config = SPATIAL_CONFIGS[idx] || SPATIAL_CONFIGS[0];
      const palette = book.color || PALETTES[idx % PALETTES.length];
      const tierOpacity = config.opacity || 1.0;
      const isProtagonist = config.tier === "protagonist" || config.tier === "foreground";

      const group = new THREE.Group();
      group.position.set(config.pos[0], config.pos[1], config.pos[2]);
      group.rotation.set(config.rot[0], config.rot[1], config.rot[2]);
      group.scale.set(config.scale, config.scale, config.scale);

      // Book materials with depth transparency
      const fallbackTex = createProceduralCoverTexture(book, palette);
      const spineTex = createSpineTexture(book, palette);

      const pageEdgeMat = new THREE.MeshStandardMaterial({
        map: pagesTex,
        roughness: 0.85,
        metalness: 0.05,
        color: new THREE.Color(0xeae2d5),
        transparent: tierOpacity < 1.0,
        opacity: tierOpacity
      });
      const spineMat = new THREE.MeshStandardMaterial({
        map: spineTex,
        roughness: 0.45,
        metalness: 0.2,
        transparent: tierOpacity < 1.0,
        opacity: tierOpacity
      });
      const backCoverMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x070b1e),
        roughness: 0.6,
        metalness: 0.1,
        transparent: tierOpacity < 1.0,
        opacity: tierOpacity
      });
      const frontCoverMat = new THREE.MeshPhysicalMaterial({
        map: fallbackTex,
        roughness: isProtagonist ? 0.22 : 0.4,
        metalness: isProtagonist ? 0.12 : 0.05,
        clearcoat: isProtagonist ? 0.85 : 0.3,
        clearcoatRoughness: 0.18,
        reflectivity: 0.85,
        emissive: isProtagonist ? new THREE.Color(0xf97316) : new THREE.Color(palette),
        emissiveIntensity: isProtagonist ? 0.08 : 0.015,
        transparent: tierOpacity < 1.0,
        opacity: tierOpacity
      });

      const materials = [
        pageEdgeMat,   // Right
        spineMat,      // Left (Spine)
        pageEdgeMat,   // Top
        pageEdgeMat,   // Bottom
        frontCoverMat, // Front
        backCoverMat   // Back
      ];

      const bookGeo = new THREE.BoxGeometry(BOOK_W, BOOK_H, BOOK_D);
      const bookMesh = new THREE.Mesh(bookGeo, materials);
      group.add(bookMesh);

      // Halo Backlight - Warm orange for protagonist, soft ambient for background
      const glowMat = new THREE.MeshBasicMaterial({
        color: isProtagonist ? new THREE.Color(0xf97316) : new THREE.Color(palette),
        transparent: true,
        opacity: isProtagonist ? 0.35 : (config.tier === "midground" ? 0.14 : 0.05),
        side: THREE.BackSide
      });
      const glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOOK_W * 1.15, BOOK_H * 1.12), glowMat);
      glowMesh.position.set(0, 0, -BOOK_D / 2 - 0.01);
      group.add(glowMesh);

      // Subtle Chamfered Edge Line
      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(BOOK_W, BOOK_H, BOOK_D));
      const edgeMat = new THREE.LineBasicMaterial({
        color: isProtagonist ? new THREE.Color(0xfb923c) : new THREE.Color(palette),
        transparent: true,
        opacity: isProtagonist ? 0.45 : (config.tier === "midground" ? 0.20 : 0.08)
      });
      const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
      edgeLine.position.set(0, 0, 0);
      group.add(edgeLine);

      // Load Real Cover through CORS Proxy
      if (book.cover) {
        let coverUrl = book.cover;
        if (!coverUrl.startsWith("http") && !coverUrl.startsWith("/")) {
          coverUrl = `/${coverUrl}`;
        }

        const loader = new THREE.TextureLoader();
        loader.crossOrigin = "anonymous";
        loader.load(
          coverUrl,
          (realTex) => {
            realTex.colorSpace = THREE.SRGBColorSpace;
            frontCoverMat.map = realTex;
            frontCoverMat.needsUpdate = true;
          },
          undefined,
          () => {
            // Fallback kept
          }
        );
      }

      this.scene.add(group);

      this.bookMeshes.push({
        book,
        group,
        bookMesh,
        glowMesh,
        glowMat,
        frontCoverMat,
        config,
        palette,
        materials,
        basePos: [...config.pos],
        baseRot: [...config.rot],
        baseScale: config.scale,
        driftType: config.drift,
        driftSpeed: config.speed
      });
    });
  }

  bindEvents() {
    this.onPointerMove = (e) => {
      const rect = this.container.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.checkRaycast();
    };

    this.onClick = (e) => {
      if (this.isEntering) return;
      const rect = this.container.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const clickY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(new THREE.Vector2(clickX, clickY), this.camera);
      const intersects = this.raycaster.intersectObjects(
        this.bookMeshes.map((m) => m.bookMesh),
        false
      );

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const entry = this.bookMeshes.find((m) => m.bookMesh === hitMesh);
        if (entry) {
          this.selectedBookId = entry.book.id;
          if (this.options.onSelectBook) {
            setTimeout(() => {
              this.selectedBookId = null;
              this.options.onSelectBook(entry.book);
            }, 450);
          }
          this.triggerCinematicEnter(entry);
        }
      }
    };

    this.onResize = () => {
      if (!this.container) return;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight || 600;
      if (width === 0 || height === 0) return;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };

    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.container.addEventListener("click", this.onClick);
    window.addEventListener("resize", this.onResize);
  }

  triggerCinematicEnter(entry) {
    if (this.isEntering) return;
    this.isEntering = true;
    this.selectedBookId = entry.book.id;
    this.container.classList.add("is-entering-book");
    this.hideHoverLabel();

    const enterDuration = 600;
    const startTime = performance.now();
    const startCamPos = this.camera.position.clone();
    const bookWorldPos = new THREE.Vector3();
    entry.group.getWorldPosition(bookWorldPos);

    const targetCam = new THREE.Vector3(
      bookWorldPos.x,
      bookWorldPos.y,
      bookWorldPos.z + 1.8
    );
    const startRot = entry.group.rotation.clone();

    const animateEnter = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / enterDuration, 1.0);
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.position.lerpVectors(startCamPos, targetCam, ease);
      this.camera.lookAt(bookWorldPos);

      entry.group.rotation.x = THREE.MathUtils.lerp(startRot.x, 0, ease);
      entry.group.rotation.y = THREE.MathUtils.lerp(startRot.y, 0, ease);
      entry.group.rotation.z = THREE.MathUtils.lerp(startRot.z, 0, ease);

      if (entry.frontCoverMat) {
        entry.frontCoverMat.emissiveIntensity = THREE.MathUtils.lerp(0.08, 0.65, ease);
      }
      if (entry.glowMat) {
        entry.glowMat.opacity = THREE.MathUtils.lerp(0.35, 0.95, ease);
      }

      if (progress < 1.0) {
        requestAnimationFrame(animateEnter);
      } else {
        if (this.options.onSelectBook) {
          this.options.onSelectBook(entry.book);
        }
        setTimeout(() => {
          this.isEntering = false;
          this.selectedBookId = null;
          this.container.classList.remove("is-entering-book");
        }, 350);
      }
    };

    requestAnimationFrame(animateEnter);
  }

  checkRaycast() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(
      this.bookMeshes.map((m) => m.bookMesh),
      false
    );

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const entry = this.bookMeshes.find((m) => m.bookMesh === hitMesh);
      if (entry && this.hoveredBookId !== entry.book.id) {
        this.hoveredBookId = entry.book.id;
        this.container.style.cursor = "pointer";
        this.showHoverLabel(entry.book);
        if (this.options.onHoverBook) {
          this.options.onHoverBook(entry.book);
        }
      }
    } else {
      if (this.hoveredBookId !== null) {
        this.hoveredBookId = null;
        this.container.style.cursor = "auto";
        this.hideHoverLabel();
        if (this.options.onHoverBook) {
          this.options.onHoverBook(null);
        }
      }
    }
  }

  showHoverLabel(book) {
    if (!this.hoverLabelEl) {
      this.hoverLabelEl = document.getElementById("hero3dHoverLabel");
      this.hoverTitleEl = document.getElementById("hoverLabelTitle");
      this.hoverAuthorEl = document.getElementById("hoverLabelAuthor");
      this.hoverReadBtn = document.getElementById("hoverLabelReadBtn");
      if (this.hoverReadBtn) {
        this.hoverReadBtn.onclick = (e) => {
          e.stopPropagation();
          const target = this.bookMeshes.find((m) => m.book.id === this.hoveredBookId);
          if (target) {
            this.triggerCinematicEnter(target);
          }
        };
      }
    }
    if (!this.hoverLabelEl) return;
    if (this.hoverTitleEl) this.hoverTitleEl.textContent = book.title;
    if (this.hoverAuthorEl) this.hoverAuthorEl.textContent = book.author || "Tác giả đang cập nhật";
    this.hoverLabelEl.classList.add("is-visible");
  }

  hideHoverLabel() {
    if (this.hoverLabelEl) {
      this.hoverLabelEl.classList.remove("is-visible");
    }
  }

  initIntersectionObserver() {
    if (typeof IntersectionObserver !== "function") return;
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.start();
          } else {
            this.stop();
          }
        });
      },
      { threshold: 0.05 }
    );
    this.observer.observe(this.container);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.tick();
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  tick() {
    if (!this.isRunning) return;
    this.rafId = requestAnimationFrame(() => this.tick());

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();
    const smoothFactor = 1 - Math.exp(-4.5 * delta);

    // 1. Dust motes gentle upward drift
    if (this.dustPoints) {
      const pos = this.dustPoints.geometry.attributes.position.array;
      const count = pos.length / 3;
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] += this.dustSpeeds[i * 3 + 1] * delta;
        pos[i * 3 + 0] += Math.sin(time * 0.3 + i) * 0.001;
        if (pos[i * 3 + 1] > 6) pos[i * 3 + 1] = -5;
      }
      this.dustPoints.geometry.attributes.position.needsUpdate = true;
      this.dustPoints.position.x = -this.pointer.x * 0.08 + 0.3;
      this.dustPoints.position.y = -this.pointer.y * 0.06;
    }

    // 2. Stars very slow rotation
    if (this.starPoints) {
      this.starPoints.rotation.z = time * 0.0015;
    }

    // 3. Camera Parallax & Autonomous Crane Float
    const hoveredMesh = this.bookMeshes.find((m) => m.book.id === this.hoveredBookId);

    if (!this.isEntering) {
      const dollyX = Math.sin(time * 0.15) * 0.14;
      const dollyY = Math.cos(time * 0.12) * 0.08;
      const dollyZ = Math.sin(time * 0.09) * 0.10;

      // Restrain parallax to max ±1.8° (~0.031 rad)
      const mouseX = this.pointer.x * 0.12;
      const mouseY = this.pointer.y * 0.08;

      if (hoveredMesh) {
        const [hx, hy] = hoveredMesh.basePos;
        this.targetCamPos.set(0.65 + hx * 0.07 + mouseX * 0.5 + dollyX * 0.4, hy * 0.07 + mouseY * 0.5 + dollyY * 0.4, 4.85 + dollyZ);
        this.targetLookAt.set(0.65 + hx * 0.08, hy * 0.08, 0);
      } else {
        this.targetCamPos.set(0.65 + dollyX + mouseX, dollyY + mouseY, 4.95 + dollyZ);
        this.targetLookAt.set(0.65 + dollyX * 0.35 + mouseX * 0.2, dollyY * 0.35 + mouseY * 0.2, 0);
      }

      this.camera.position.lerp(this.targetCamPos, smoothFactor);
      this.currentLookAt.lerp(this.targetLookAt, smoothFactor);
      this.camera.lookAt(this.currentLookAt);
    }

    // 4. Update each floating 3D book (Serene, majestic zero-gravity suspension)
    this.bookMeshes.forEach((item, idx) => {
      const isHovered = this.hoveredBookId === item.book.id;
      const isAnyHovered = this.hoveredBookId !== null;
      const isOtherHovered = isAnyHovered && !isHovered;
      const isSelected = this.selectedBookId === item.book.id;

      const [bx, by, bz] = item.basePos;
      const [rx, ry, rz] = item.baseRot;
      const speed = item.config.speed || 0.25;
      const amp = item.config.amplitude || 0.03;
      const phase = idx * 1.5;

      let floatX = 0, floatY = 0, floatZ = 0;
      let floatPitch = 0, floatYaw = 0, floatRoll = 0;

      switch (item.driftType) {
        case "majestic-breath":
        case "subtle-float": // Main novel: almost motionless, breathing
          floatY = Math.sin(time * speed + phase) * amp;
          floatPitch = Math.cos(time * speed * 0.7 + phase) * 0.008;
          floatRoll = Math.sin(time * speed * 0.5 + phase) * 0.005;
          break;
        case "pitch-sway":
          floatY = Math.sin(time * speed * 0.8 + phase) * amp;
          floatPitch = Math.sin(time * speed + phase) * 0.015;
          floatYaw = Math.cos(time * speed * 0.6 + phase) * 0.01;
          break;
        case "depth-surge":
          floatZ = Math.cos(time * speed * 0.9 + phase) * amp * 1.2;
          floatY = Math.sin(time * speed * 0.5 + phase) * amp;
          break;
        case "horizontal":
          floatX = Math.sin(time * speed * 0.7 + phase) * amp;
          floatY = Math.cos(time * speed * 0.9 + phase) * amp * 0.8;
          break;
        case "orbital":
        default:
          floatX = Math.cos(time * speed * 0.6 + phase) * amp;
          floatY = Math.sin(time * speed * 0.8 + phase) * amp;
          floatPitch = Math.sin(time * speed * 0.5 + phase) * 0.01;
          break;
      }

      // Parallax offset per tier
      const isProtagonist = item.config.tier === "protagonist" || item.config.tier === "foreground";
      const tierParallax = isProtagonist ? 0.045 : (item.config.tier === "midground" ? 0.025 : 0.012);
      const parallaxX = this.pointer.x * tierParallax;
      const parallaxY = this.pointer.y * tierParallax;

      let targetX = bx + floatX + parallaxX;
      let targetY = by + floatY + parallaxY;
      let targetZ = bz + floatZ;
      let targetScale = item.baseScale;
      let targetRotX = rx + floatPitch;
      let targetRotY = ry + floatYaw;
      let targetRotZ = rz + floatRoll;
      let targetEmissive = isProtagonist ? 0.08 : 0.015;
      let targetGlowOpacity = isProtagonist ? 0.35 : (item.config.tier === "midground" ? 0.14 : 0.05);

      if (this.isEntering && isSelected) {
        // Position and rotation are driven by triggerCinematicEnter RAF loop
        return;
      } else if (isSelected) {
        targetX = 0.65;
        targetY = 0;
        targetZ = 2.4;
        targetRotX = 0;
        targetRotY = 0;
        targetRotZ = 0;
        targetScale = item.baseScale * 1.12;
        targetEmissive = 0.4;
        targetGlowOpacity = 0.75;
      } else if (isHovered) {
        targetZ += 0.35;
        targetScale = item.baseScale * 1.05; // 1.05 hover scale
        targetEmissive = 0.22;
        targetGlowOpacity = 0.5;
      } else if (isOtherHovered) {
        targetZ -= 0.15;
        targetScale = item.baseScale * 0.97;
        targetEmissive = 0.005;
        targetGlowOpacity = 0.03;
      }

      item.group.position.x = THREE.MathUtils.lerp(item.group.position.x, targetX, smoothFactor);
      item.group.position.y = THREE.MathUtils.lerp(item.group.position.y, targetY, smoothFactor);
      item.group.position.z = THREE.MathUtils.lerp(item.group.position.z, targetZ, smoothFactor);

      item.group.rotation.x = THREE.MathUtils.lerp(item.group.rotation.x, targetRotX, smoothFactor);
      item.group.rotation.y = THREE.MathUtils.lerp(item.group.rotation.y, targetRotY, smoothFactor);
      item.group.rotation.z = THREE.MathUtils.lerp(item.group.rotation.z, targetRotZ, smoothFactor);

      const curScale = item.group.scale.x;
      const newScale = THREE.MathUtils.lerp(curScale, targetScale, smoothFactor);
      item.group.scale.set(newScale, newScale, newScale);

      if (item.frontCoverMat) {
        item.frontCoverMat.emissiveIntensity = THREE.MathUtils.lerp(
          item.frontCoverMat.emissiveIntensity,
          targetEmissive,
          smoothFactor
        );
      }
      if (item.glowMat) {
        item.glowMat.opacity = THREE.MathUtils.lerp(item.glowMat.opacity, targetGlowOpacity, smoothFactor);
      }
    });

    // 5. Update Floating Minimal Hover Label position in screen space
    if (this.hoverLabelEl && this.hoveredBookId) {
      const hMesh = this.bookMeshes.find((m) => m.book.id === this.hoveredBookId);
      if (hMesh) {
        const wp = new THREE.Vector3();
        hMesh.group.getWorldPosition(wp);
        wp.y += 1.45 * hMesh.group.scale.y;
        wp.project(this.camera);

        const rect = this.container.getBoundingClientRect();
        const sx = (wp.x * 0.5 + 0.5) * rect.width;
        const sy = (-wp.y * 0.5 + 0.5) * rect.height;

        this.hoverLabelEl.style.left = `${sx}px`;
        this.hoverLabelEl.style.top = `${sy}px`;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.stop();
    if (this.observer) {
      this.observer.disconnect();
    }
    window.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("click", this.onClick);
    window.removeEventListener("resize", this.onResize);

    if (this.renderer && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}

function initHero3D(options = {}) {
  const container = document.getElementById("hero3dCanvasContainer");
  if (!container) return null;

  if (hero3DInstance) {
    hero3DInstance.destroy();
  }

  hero3DInstance = new Hero3DUniverse(container, options);
  return hero3DInstance;
}

function updateHero3DBooks(books) {
  if (hero3DInstance) {
    hero3DInstance.setBooks(books);
  }
}

module.exports = {
  initHero3D,
  updateHero3DBooks
};
