
// CoreForge 3D — original layout + component database + 3D viewer

document.addEventListener("DOMContentLoaded", () => {
  const DB = window.PC_COMPONENTS_DATABASE;
  const products = DB?.products || [];

  const $ = (selector) => document.querySelector(selector);
  const left = $("#left");
  const right = $("#right");
  const canvas = $("#cv");
  const info = $("#info");
  const toastBox = $("#toast");

  if (!left || !right || !canvas) {
    console.error("CoreForge: Original HTML elements are missing.");
    return;
  }

  if (!products.length) {
    left.innerHTML = "<p class='er'>Database not loaded. Check script order.</p>";
    console.error("CoreForge: No products found.");
    return;
  }

  const categories = [
    ["GPU", "Graphics Cards"],
    ["CPU", "Processors"],
    ["RAM", "Memory"],
    ["SSD", "Storage"],
    ["PSU", "Power Supplies"],
    ["Cabinet", "PC Cases"],
    ["Fan", "Cooling Fans"]
  ];

  const selected = {};
  let activeCategory = "GPU";
  let selectedId = null;
  let toastTimer;
  let renderer, scene, camera, pcGroup, caseGroup, rgbGroup;
  let animationId;
  let dragging = false;
  let previousX = 0;
  let previousY = 0;
  let rotationY = -0.45;
  let rotationX = 0.12;
  let cameraDistance = 7;
  let rgbHue = 0;
  let parts = {};

  const money = (n) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(Number(n) || 0);

  const price = (p) =>
    Number(p.price_inr_snapshot ?? p.price ?? p.price_inr ?? 0);

  const categoryOf = (p) => {
    const value = String(p.category || "").toLowerCase();

    if (value.includes("gpu") || value.includes("graphics")) return "GPU";
    if (value.includes("cpu") || value.includes("processor")) return "CPU";
    if (value.includes("ram") || value.includes("memory")) return "RAM";
    if (value.includes("ssd") || value.includes("storage")) return "SSD";
    if (value.includes("psu") || value.includes("power")) return "PSU";
    if (value.includes("cabinet") || value.includes("case")) return "Cabinet";
    if (value.includes("fan") || value.includes("cool")) return "Fan";

    return p.category || "Other";
  };

  const nameOf = (p) => p.name || p.model || "PC Component";

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);

  function notify(message) {
    toastBox.textContent = message;
    toastBox.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBox.style.display = "none";
    }, 2400);
  }

  function getProducts(category) {
    return products.filter((p) => categoryOf(p) === category);
  }

  // LEFT PANEL
  function renderLeft() {
    const all = categories.reduce(
      (sum, c) => sum + getProducts(c[0]).length, 0
    );

    left.innerHTML = `
      <h3>Components</h3>
      <p class="est">${all} components in database</p>
      ${categories.map(([id, label]) => `
        <button class="cat ${activeCategory === id ? "on" : ""}"
                data-category="${id}">
          <span class="n">${esc(label)}</span>
          <small>${getProducts(id).length} available</small>
        </button>
      `).join("")}
      <hr style="border-color:var(--b);margin:14px 0">
      <h3>Component Catalog</h3>
      <input id="cf-search" class="sel"
             placeholder="Search components..." />
      <div id="cf-catalog"></div>
    `;

    left.querySelectorAll("[data-category]").forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.category;
        selectedId = null;
        renderLeft();
      });
    });

    $("#cf-search").addEventListener("input", renderCatalog);
    renderCatalog();
  }

  function renderCatalog() {
    const container = $("#cf-catalog");
    if (!container) return;

    const query = ($("#cf-search")?.value || "").toLowerCase().trim();

    const list = getProducts(activeCategory).filter((p) => {
      const text = [
        p.name, p.model, p.brand, p.category, p.specifications,
        typeof p.specs === "string" ? p.specs : JSON.stringify(p.specs || {})
      ].join(" ").toLowerCase();

      return text.includes(query);
    });

    if (!list.length) {
      container.innerHTML = "<p class='est'>No matching components found.</p>";
      return;
    }

    container.innerHTML = list.map((p) => {
      const id = String(p.id);
      const isSelected = selected[categoryOf(p)]?.id === p.id;
      const isActive = selectedId === id;
      const details = p.specifications ||
        (typeof p.specs === "string" ? p.specs : "");

      return `
        <button class="cat ${isActive ? "on" : ""}"
                data-product="${esc(id)}">
          <span class="n">${esc(nameOf(p))}</span>
          <small>${esc(p.brand || p.model || "")}</small>
          <small>${money(price(p))}</small>
          ${details ? `<small>${esc(details)}</small>` : ""}
          ${isSelected ? `<small class="ok">✓ Selected</small>` : ""}
        </button>
      `;
    }).join("");

    container.querySelectorAll("[data-product]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = products.find(
          (p) => String(p.id) === button.dataset.product
        );
        if (!product) return;

        selected[categoryOf(product)] = product;
        selectedId = String(product.id);

        renderLeft();
        renderRight();
        
        update3D();
        notify(`${nameOf(product)} selected`);
      });
    });
  }

// Gaming FPS Estimator data
const fpsGameBase = {
  "Cyberpunk 2077": 48,
  "GTA V Enhanced": 75,
  "Red Dead Redemption 2": 58,
  "Hogwarts Legacy": 50,
  "Forza Horizon 5": 80,
  "Call of Duty: Warzone": 75,
  "Counter-Strike 2": 180,
  "Valorant": 240,
  "Fortnite": 100,
  "Black Myth: Wukong": 38
};

const fpsResolutionFactor = {
  "1080p": 1,
  "1440p": 0.72,
  "4k": 0.43
};

const fpsPresetFactor = {
  "Low": 1.35,
  "Medium": 1.15,
  "High": 1,
  "Ultra": 0.78
};

function getFpsGpuTier(gpu) {
  if (!gpu) return null;

  const text = `${gpu.name || ""} ${gpu.model || ""} ${gpu.brand || ""}`
    .toLowerCase();

  if (/5090/.test(text)) return 10;
  if (/5080|4090/.test(text)) return 9;
  if (/5070 ti|4080/.test(text)) return 8;
  if (/5070|4070 ti|3090/.test(text)) return 7;
  if (/5060 ti|4070|3080/.test(text)) return 6;
  if (/5060|4060 ti|3070|2080/.test(text)) return 5;
  if (/5050|4060|3060 ti/.test(text)) return 4;
  if (/4050|3060|2070/.test(text)) return 3;
  if (/3050|2060|1660/.test(text)) return 2;
  if (/1650|1050/.test(text)) return 1;

  return null;
}

function calculateFPS() {
  const gputier = getFpsGpuTier(gpu);
  const game = document.getElementById("fps-game")?.value;
  const gpuChoice = document.getElementById("fps-gpu")?.value;
  const resolution = document.getElementById("fps-resolution")?.value;
  const preset = document.getElementById("fps-preset")?.value;
  const result = document.getElementById("fps-result");

  if (!game || !gpuChoice || !resolution || !preset || !result) return;

  let gpu;

  if (gpuChoice === "build") {
    gpu = Object.entries(selected).find(
      ([category]) => categoryOf({ category, type: category, name: category }) === "GPU"
    )?.[1];
  } else {
    gpu = products.find(p => String(p.id) === String(gpuChoice));
  }

  if (!gpu) {
    result.innerHTML = '<p class="est">Select a GPU in your build or choose one manually.</p>';
    return;
  }

  const tier = getFpsGpuTier(gpu);
  if (tier == null) {
    result.innerHTML = '<p class="est">GPU performance data is unavailable for this model.</p>';
    return;
  }

  const base = fpsGameBase[game];
  const resolutionFactor = fpsResolutionFactor[resolution];
  const presetFactor = fpsPresetFactor[preset];

  if (base == null || resolutionFactor == null || presetFactor == null) {
    result.innerHTML = '<p class="est">Please select valid settings.</p>';
    return;
  }

  const gpuFactor = tier / 5;
  const fps = Math.max(1, Math.round(base * gpuFactor * resolutionFactor * presetFactor));

  result.innerHTML = `
    <h3>Estimated Performance</h3>
    <p><strong>${esc(game)}</strong></p>
    <p>${esc(nameOf(gpu))}</p>
    <p>${esc(resolution)} · ${esc(preset)} settings</p>
    <div style="font-size:32px;font-weight:800;color:var(--a)">${fps} FPS</div>
    <p class="est">Approximate estimate, not a benchmark. Actual FPS depends on CPU, drivers, ray tracing, upscaling and game settings.</p>
  `;
}

function getFpsGpuTier(gpu) {
  const tier = getFpsGpuTierOriginal(gpu);
  return tier;
}

  // RIGHT PANEL
 function getFpsGpuTierOriginal(gpu) {
  return getFpsGpuTier(gpu);
}
    const items = Object.entries(selected);
    const total = items.reduce((sum, [, p]) => sum + price(p), 0);

    right.innerHTML = `
      <h3>Your PC Build</h3>
      <div class="row">
        <span>Components</span><strong>${items.length}</strong>
      </div>
      <div class="row">
        <span>Categories filled</span>
        <strong>${items.length}/7</strong>
      </div>
      <div class="bar">
        <i style="width:${items.length / 7 * 100}%"></i>
      </div>

      <h3 style="margin-top:18px">Selected Parts</h3>
      ${items.length ? items.map(([category, p]) => `
        <div class="item">
          <div>
            <strong>${esc(nameOf(p))}</strong>
            <div class="sp">${esc(category)} · ${money(price(p))}</div>
          </div>
          <button data-remove="${esc(category)}" title="Remove">×</button>
        </div>
      `).join("") : `<p class="est">Choose components from the left panel.</p>`}

      <hr style="border-color:var(--b);margin:14px 0">
      <div class="row">
        <span>Estimated total</span>
        <strong class="ok">${money(total)}</strong>
      </div>
      <p class="est">Prices are snapshots, not live prices.</p>

      <h3 style="margin-top:18px">Build Status</h3>
      <div id="cf-status"></div>

      <button id="cf-clear" style="width:100%;margin-top:12px">
        Clear Build
      </button>
  <h3 style="margin-top:20px">Gaming FPS Estimator</h3>

<label for="fps-game">Game</label>
<select id="fps-game" class="sel">
  <option>Cyberpunk 2077</option>
  <option>GTA V Enhanced</option>
  <option>Red Dead Redemption 2</option>
  <option>Hogwarts Legacy</option>
  <option>Forza Horizon 5</option>
  <option>Call of Duty: Warzone</option>
  <option>Counter-Strike 2</option>
  <option>Valorant</option>
  <option>Fortnite</option>
  <option>Black Myth: Wukong</option>
</select>

<label for="fps-gpu">Graphics Card</label>
<select id="fps-gpu" class="sel">
  <option value="build">Use GPU from my build</option>
  ${products.filter(p => categoryOf(p) === "GPU").map(p =>
    `<option value="${esc(p.id)}">${esc(nameOf(p))}</option>`
  ).join("")}
</select>

<label for="fps-resolution">Resolution</label>
<select id="fps-resolution" class="sel">
  <option value="1080p">1080p</option>
  <option value="1440p">1440p</option>
  <option value="4k">4K</option>
</select>

<label for="fps-preset">Graphics Preset</label>
<select id="fps-preset" class="sel">
  <option value="Low">Low</option>
  <option value="Medium">Medium</option>
  <option value="High" selected>High</option>
  <option value="Ultra">Ultra</option>
</select>

<button id="fps-calculate" class="p" style="width:100%;margin:8px 0">
  Estimate FPS
</button>

<div id="fps-result" class="fps-result">
  <p class="est">Choose your settings and estimate FPS.</p>
</div>
    `;

    right.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        delete selected[button.dataset.remove];
        selectedId = null;
        renderLeft();
        renderRight();
        update3D();
      });
    });

    $("#cf-clear").addEventListener("click", () => {
      Object.keys(selected).forEach((key) => delete selected[key]);
      selectedId = null;
      renderLeft();
      renderRight();
      update3D();
      notify("Build cleared");
    });

    renderStatus();


function renderFPS() {
  const gameEl = document.getElementById("fps-game");
  const gpuEl = document.getElementById("fps-gpu");
  const resolutionEl = document.getElementById("fps-resolution");
  const presetEl = document.getElementById("fps-preset");
  const resultEl = document.getElementById("fps-result");

  if (!gameEl || !gpuEl || !resolutionEl || !presetEl || !resultEl) return;    

  
 
 
  // Use manually selected GPU, or the GPU in the current build.
  let gpu = null;
  if (gpuEl.value === "build") {
    gpu = Object.entries(selected).find(([category]) =>
      categoryOfKey(category) === "GPU"
    )?.[1] || null;
  } else {
    gpu = products.find(p => String(p.id) === gpuEl.value) || null;
  }

  if (!gpu) {
    resultEl.innerHTML =
      '<p class="est">Select a graphics card in your build or choose one manually.</p>';
    return;
  }

  const gpuName = String(
    gpu.name || gpu.model || gpu.brand || nameOf(gpu) || ""
  );

  // Rough performance tiers based on GPU model names.
  let tier = 2;
  if (/5090|5080|4090/i.test(gpuName)) tier = 9;
  else if (/5070 ti|4080/i.test(gpuName)) tier = 8;
  else if (/5070|4070 ti|3090/i.test(gpuName)) tier = 7;
  else if (/5060 ti|4070|3080/i.test(gpuName)) tier = 6;
  else if (/5060|4060 ti|3070|2080/i.test(gpuName)) tier = 5;
  else if (/5050|4060|3060 ti/i.test(gpuName)) tier = 4;
  else if (/4050|3060|2070/i.test(gpuName)) tier = 3;
  else if (/3050|2060|1660|1650|1050/i.test(gpuName)) tier = 2;
  else if (/rx 9[07]00|rx 7900/i.test(gpuName)) tier = 7;
  else if (/rx 7800|rx 6800/i.test(gpuName)) tier = 6;
  else if (/rx 7700|rx 6700/i.test(gpuName)) tier = 5;
  else if (/rx 7600|rx 6600/i.test(gpuName)) tier = 4;

  const game = gameEl.value;
  const resolution = resolutionEl.value;
  const preset = presetEl.value;

  const gameFactor = {
    "Cyberpunk 2077": 0.55,
    "GTA V Enhanced": 1.15,
    "Red Dead Redemption 2": 0.70,
    "Hogwarts Legacy": 0.65,
    "Forza Horizon 5": 1.00,
    "Call of Duty: Warzone": 0.85,
    "Counter-Strike 2": 2.40,
    "Valorant": 3.00,
    "Fortnite": 1.50,
    "Black Myth: Wukong": 0.45
  }[game] || 1;

  const resolutionFactor = {
    "1080p": 1,
    "1440p": 0.70,
    "4k": 0.40
  }[resolution] || 1;

  const presetFactor = {
    "Low": 1.45,
    "Medium": 1.20,
    "High": 1,
    "Ultra": 0.72
  }[preset] || 1;

  const estimatedFPS = Math.round(
    (tier * 18 + 12) * gameFactor * resolutionFactor * presetFactor
  );

  resultEl.innerHTML = `
    <h3>Estimated Performance</h3>
    <p><strong>${esc(game)}</strong></p>
    <p>${esc(gpuName)}</p>
    <p>${resolution} · ${preset} settings</p>
    <div style="font-size:32px;font-weight:800;color:var(--a)">
      ${estimatedFPS} FPS
    </div>
    <p class="est">Approximate estimate only. Actual FPS varies by CPU,
    game version, drivers, ray tracing, upscaling and other settings.</p>
  `;
}
document.getElementById("fps-calculate")
  ?.addEventListener("click", renderFPS);
function categoryOfKey(key) {
  return categoryOf({ category: key, type: key, name: key });
}

  function renderStatus() {
    const status = $("#cf-status");
    if (!status) return;

    const issues = [];
    const cpu = selected.CPU;
    const gpu = selected.GPU;
    const ram = selected.RAM;

    if (!cpu) issues.push(["Choose a CPU", "w"]);
    if (!selected.Cabinet) issues.push(["Choose a cabinet", "w"]);
    if (!selected.PSU) issues.push(["Choose a power supply", "w"]);
    if (cpu && gpu) {
      const cpuText = `${cpu.name || ""} ${cpu.model || ""}`.toLowerCase();
      const gpuText = `${gpu.name || ""} ${gpu.model || ""}`.toLowerCase();

      if (cpuText && gpuText) {
        // This is a basic presence check, not a full compatibility test.
      }
    }

    if (ram && cpu) {
      const ramText = JSON.stringify(ram.specifications || ram.specs || "")
        .toLowerCase();
      if (ramText.includes("ddr4") || ramText.includes("ddr5")) {
        // Exact CPU motherboard and memory compatibility needs more data.
      }
    }

    if (!issues.length) {
      status.innerHTML =
        `<p class="ok">✓ Main component categories selected.</p>
         <p class="est">Detailed compatibility has not been verified.</p>`;
    } else {
      status.innerHTML = issues.map(([text, cls]) =>
        `<div class="issue ${cls === "w" ? "w" : ""}">${esc(text)}</div>`
      ).join("");
    }
  }

  // 3D VIEWER
  function init3D() {
    if (!window.THREE) {
      info.style.display = "block";
      info.textContent = "Three.js failed to load. Check your internet connection.";
      return;
    }

    const THREE = window.THREE;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x0b0d10, 1);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b0d10);

      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(5, 3.5, cameraDistance);
      camera.lookAt(0, 1.3, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 1.8));

      const light = new THREE.DirectionalLight(0xffffff, 2.4);
      light.position.set(4, 8, 6);
      scene.add(light);

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshStandardMaterial({
          color: 0x10151b, roughness: 0.9
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.03;
      scene.add(floor);

      pcGroup = new THREE.Group();
      scene.add(pcGroup);

      build3DModel();
      resize3D();

      canvas.addEventListener("pointerdown", (event) => {
        dragging = true;
        previousX = event.clientX;
        previousY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
      });

      canvas.addEventListener("pointermove", (event) => {
        if (!dragging) return;

        rotationY += (event.clientX - previousX) * 0.01;
        rotationX += (event.clientY - previousY) * 0.006;
        rotationX = Math.max(-0.7, Math.min(0.7, rotationX));

        previousX = event.clientX;
        previousY = event.clientY;

        pcGroup.rotation.y = rotationY;
        pcGroup.rotation.x = rotationX;
      });

      canvas.addEventListener("pointerup", () => dragging = false);
      canvas.addEventListener("pointercancel", () => dragging = false);

      canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        cameraDistance = Math.max(
          4, Math.min(12, cameraDistance + event.deltaY * 0.008)
        );
        updateCamera();
      }, { passive: false });

      animate();
    } catch (error) {
      console.error("3D initialization failed:", error);
      info.style.display = "block";
      info.textContent = "3D viewer could not initialize. See Console.";
    }
  }

  function build3DModel() {
    const THREE = window.THREE;
    pcGroup.clear();
    parts = {};

    const caseMaterial = new THREE.MeshStandardMaterial({
      color: 0x202a34,
      metalness: 0.55,
      roughness: 0.35
    });

    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x080b10,
      metalness: 0.25,
      roughness: 0.5
    });

    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x38e0b0,
      emissive: 0x073d30,
      emissiveIntensity: 1.3,
      metalness: 0.2,
      roughness: 0.3
    });

    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b6875,
      transparent: true,
      opacity: 0.2,
      metalness: 0.4,
      roughness: 0.15,
      side: THREE.DoubleSide
    });

    caseGroup = new THREE.Group();
    pcGroup.add(caseGroup);

    function box(parent, size, position, material, key) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...size), material
      );
      mesh.position.set(...position);
      parent.add(mesh);
      if (key) parts[key] = mesh;
      return mesh;
    }

    // PC tower body
// SIX SEPARATE CASE PANELS
function makePanel(name, size, position, material) {
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    material
  );

  panel.position.set(...position);
  caseGroup.add(panel);
  parts[name] = panel;
}

// Left and right panels
makePanel("caseLeft", [0.06, 3.6, 1.5], [-1.07, 1.8, 0], caseMaterial);
makePanel("caseRight", [0.06, 3.6, 1.5], [1.07, 1.8, 0], caseMaterial);

// Top and bottom panels
makePanel("caseTop", [2.2, 0.06, 1.5], [0, 3.57, 0], caseMaterial);
makePanel("caseBottom", [2.2, 0.06, 1.5], [0, 0.03, 0], caseMaterial);

// Front and rear panels
makePanel("caseFront", [2.2, 3.6, 0.06], [0, 1.8, 0.72], glassMaterial);
makePanel("caseRear", [2.2, 3.6, 0.06], [0, 1.8, -0.72], caseMaterial);
    // Internal motherboard
    box(pcGroup, [1.5, 2.65, 0.09], [0, 1.85, -0.48],
      darkMaterial, "motherboard");

    // CPU block
    box(pcGroup, [0.48, 0.15, 0.48], [-0.35, 2.45, -0.35],
      accentMaterial, "cpu");

    // Graphics card
    box(pcGroup, [1.55, 0.35, 0.65], [0.1, 1.35, 0.05],
      darkMaterial, "gpu");
    box(pcGroup, [0.95, 0.08, 0.05], [0.1, 1.35, 0.39],
      accentMaterial, "gpuLight");

    // Two RAM sticks
    box(pcGroup, [0.16, 0.95, 0.16], [-0.72, 2.1, -0.12],
      accentMaterial, "ram1");
    box(pcGroup, [0.16, 0.95, 0.16], [-0.48, 2.1, -0.12],
      accentMaterial, "ram2");

    // Storage and PSU
    box(pcGroup, [0.5, 0.22, 0.5], [0.62, 0.5, -0.35],
      caseMaterial, "ssd");
    box(pcGroup, [1.0, 0.55, 1.0], [0.3, 0.38, -0.05],
      darkMaterial, "psu");

    // Front RGB fans
    rgbGroup = new THREE.Group();
    pcGroup.add(rgbGroup);

    for (let i = 0; i < 3; i++) {
      const fan = new THREE.Mesh(
        new THREE.TorusGeometry(0.31, 0.055, 8, 32),
        accentMaterial.clone()
      );
      fan.position.set(-0.65, 0.85 + i * 0.85, 0.83);
      rgbGroup.add(fan);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.06, 20),
        darkMaterial
      );
      hub.rotation.x = Math.PI / 2;
      hub.position.set(-0.65, 0.85 + i * 0.85, 0.83);
      rgbGroup.add(hub);
    }

    // Floor shadow-style base
    box(pcGroup, [2.5, 0.08, 1.8], [0, 0.08, 0],
      darkMaterial, "base");

    // Make internal parts visible through the front side
    [
  "caseLeft",
  "caseRight",
  "caseTop",
  "caseBottom",
  "caseFront",
  "caseRear"
].forEach((name) => {
  if (parts[name]) parts[name].visible = true;
});
  }


function update3D() {
  if (!pcGroup) return;

  const exploded = Number($("#ex")?.value || 0) / 100;

  // 1. MOVE THE CASE BACKWARD AND UPWARD
 
// Move all six case panels in different directions
if (parts.caseLeft) {
  parts.caseLeft.position.x = -1.07 - exploded * 2;
}
if (parts.caseRight) {
  parts.caseRight.position.x = 1.07 + exploded * 2;
}
if (parts.caseTop) {
  parts.caseTop.position.y = 3.57 + exploded * 2;
}
if (parts.caseBottom) {
  parts.caseBottom.position.y = 0.03 - exploded * 2;
}
if (parts.caseFront) {
  parts.caseFront.position.z = 0.72 + exploded * 2;
}
if (parts.caseRear) {
  parts.caseRear.position.z = -0.72 - exploded * 2;
}

  // 2. SEPARATE THE GPU
  if (parts.gpu) {
    parts.gpu.position.set(
      0.1,
      1.35 + exploded * 1.8,
      0.05 + exploded * 1.5
    );
  }

  if (parts.gpuLight) {
    parts.gpuLight.position.set(
      0.1,
      1.35 + exploded * 1.8,
      0.39 + exploded * 1.5
    );
  }

  // 3. SEPARATE THE CPU
  if (parts.cpu) {
    parts.cpu.position.set(
      -0.35 - exploded * 1.5,
      2.45 + exploded * 1.5,
      -0.35
    );
  }

  // 4. SEPARATE THE RAM
  if (parts.ram1) {
    parts.ram1.position.set(
      -0.72 - exploded * 1.0,
      2.1 + exploded * 1.2,
      -0.12
    );
  }

  if (parts.ram2) {
    parts.ram2.position.set(
      -0.48 - exploded * 1.0,
      2.1 + exploded * 1.2,
      -0.12
    );
  }

  // 5. SEPARATE THE SSD
  if (parts.ssd) {
    parts.ssd.position.set(
      0.62 + exploded * 1.5,
      0.5 - exploded * 0.5,
      -0.35
    );
  }

  // 6. SEPARATE THE POWER SUPPLY
  if (parts.psu) {
    parts.psu.position.set(
      0.3 + exploded * 1.5,
      0.38 - exploded * 0.5,
      -0.05
    );
  }

  // 7. MOVE THE FANS FORWARD
  if (rgbGroup) {
    rgbGroup.position.set(
      0,
      exploded * 0.5,
      exploded * 3.5
    );

    rgbGroup.visible = $("#rgb")?.checked ?? true;
  }

  // 8. HIDE CASE OPTION
  if (caseGroup) {
    caseGroup.visible = !($("#hc")?.checked ?? false);
  }

  // 9. RGB COLOUR AND EFFECTS
  const color = $("#rc")?.value || "#38e0b0";
  const fx = $("#fx")?.value || "Breathing";

  if (rgbGroup) {
    rgbGroup.children.forEach((mesh) => {
      if (
        mesh.material?.color &&
        mesh.geometry.type === "TorusGeometry"
      ) {
        mesh.material.color.set(
          fx === "Rainbow"
            ? new window.THREE.Color().setHSL(
                rgbHue, 0.9, 0.58
              )
            : color
        );
      }
    });
  }
}

  function updateCamera() {
    if (!camera) return;
    camera.position.set(
      Math.sin(rotationY) * cameraDistance,
      3 + rotationX * 2,
      Math.cos(rotationY) * cameraDistance
    );
    camera.lookAt(0, 1.5, 0);
  }

  function resize3D() {
    if (!renderer || !camera) return;

    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    if (rgbGroup) {
      const fx = $("#fx")?.value || "Breathing";
      const time = performance.now() * 0.001;

      if (fx === "Rainbow") rgbHue = (time * 0.12) % 1;

      rgbGroup.children.forEach((mesh) => {
        if (mesh.geometry.type !== "TorusGeometry") return;

        if (fx === "Breathing") {
          mesh.material.emissiveIntensity =
            0.4 + (Math.sin(time * 2) + 1) * 0.8;
        } else if (fx === "Pulse") {
          mesh.material.emissiveIntensity =
            Math.sin(time * 5) > 0 ? 2 : 0.3;
        } else {
          mesh.material.emissiveIntensity = 1.2;
        }
      });
    }

    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  // EXISTING 3D CONTROLS
  $("#ex")?.addEventListener("input", update3D);
  $("#rgb")?.addEventListener("change", update3D);
  $("#rc")?.addEventListener("input", update3D);
  $("#fx")?.addEventListener("change", update3D);
  $("#hc")?.addEventListener("change", update3D);

  $("#rs")?.addEventListener("click", () => {
    rotationY = -0.45;
    rotationX = 0.12;
    cameraDistance = 7;
    if (pcGroup) {
      pcGroup.rotation.set(rotationX, rotationY, 0);
    }
    updateCamera();
  });

  $("#shot")?.addEventListener("click", () => {
    if (!renderer) return;
    renderer.render(scene, camera);

    const link = document.createElement("a");
    link.download = "coreforge-pc.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    notify("Screenshot saved");
  });

  $("#bSaved")?.addEventListener("click", () => {
    try {
      const data = JSON.stringify(selected, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "coreforge-build.json";
      link.click();
      URL.revokeObjectURL(url);
      notify("Build exported");
    } catch (error) {
      console.error(error);
      notify("Could not export build");
    }
  });

  $("#bBuild")?.addEventListener("click", () => {
    const missing = categories
      .filter(([id]) => !selected[id])
      .map(([, label]) => label);

    if (missing.length) {
      notify("Choose more components to complete your build");
      activeCategory = categories.find(([id]) => !selected[id])?.[0] || "GPU";
      renderLeft();
    } else {
      notify("All seven component categories selected!");
    }
  });

  window.addEventListener("resize", resize3D);

  renderLeft();
  renderRight();
  init3D();

  console.log(`CoreForge 3D loaded ${products.length} database products.`);
});
