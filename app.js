
// CoreForge 3D — original layout + component database + 3D viewer

document.addEventListener("DOMContentLoaded", () => {
  const DB = window.PC_COMPONENTS_DATABASE;
  const products = DB?.products || [];

  const $ = (selector) => document.querySelector(selector);
  const left = $("#left");
  const right = $("#right");
  const canvas = $("#cv");
  const info = $("#info");
  const caseFallback = $("#case-fallback");
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
    ["Motherboard", "Motherboards"],
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
  const cameraHome = {
    yaw: Math.atan2(5, 7),
    pitch: Math.asin(2 / Math.hypot(5, 7)),
    distance: Math.hypot(5, 7),
    targetY: 1.5
  };
  let cameraYaw = cameraHome.yaw;
  let cameraPitch = cameraHome.pitch;
  let cameraDistance = cameraHome.distance;
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
    if (value.includes("motherboard") || value === "mb") return "Motherboard";
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
      <hr style="borderl-color:var(--b);margin:14px 0">
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
    const list = getProducts(activeCategory).filter(product => {
      const specs = typeof product.specs === "string"
        ? product.specs
        : JSON.stringify(product.specs || {});
      return [product.name, product.model, product.brand, product.category,
        product.specifications, specs].join(" ").toLowerCase().includes(query);
    });

    if (!list.length) {
      container.innerHTML = "<p class='est'>No matching components found.</p>";
      return;
    }

    container.innerHTML = list.map(product => {
      const id = String(product.id);
      const category = categoryOf(product);
      const isSelected = String(selected[category]?.id) === id;
      const isActive = selectedId === id;
      const details = product.specifications ||
        (typeof product.specs === "string" ? product.specs : "");
      return `
        <button class="cat ${isActive ? "on" : ""}" data-product="${esc(id)}">
          <span class="n">${esc(nameOf(product))}</span>
          <small>${esc(product.brand || product.model || "")}</small>
          <small>${money(price(product))}</small>
          ${details ? `<small>${esc(details)}</small>` : ""}
          ${isSelected ? `<small class="ok">✓ Selected</small>` : ""}
        </button>
      `;
    }).join("");

    container.querySelectorAll("[data-product]").forEach(button => {
      button.addEventListener("click", () => {
        const product = products.find(item => String(item.id) === button.dataset.product);
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
  function renderRight() {
    const items = Object.entries(selected);
    const total = items.reduce((sum, [, product]) => sum + price(product), 0);
    right.innerHTML = `
      <h3>Your PC Build</h3>
      <div class="row"><span>Components</span><strong>${items.length}</strong></div>
      <div class="row"><span>Categories filled</span><strong>${items.length}/${categories.length}</strong></div>
      <div class="bar"><i style="width:${items.length / categories.length * 100}%"></i></div>
      <h3 style="margin-top:18px">Selected Parts</h3>
      ${items.length ? items.map(([category, product]) => `
        <div class="item"><div><strong>${esc(nameOf(product))}</strong><div class="sp">${esc(category)} · ${money(price(product))}</div></div><button data-remove="${esc(category)}" title="Remove">×</button></div>
      `).join("") : `<p class="est">Choose components from the left panel.</p>`}
      <hr style="border-color:var(--b);margin:14px 0">
      <div class="row"><span>Estimated total</span><strong class="ok">${money(total)}</strong></div>
      <p class="est">Prices are snapshots, not live prices.</p>
      <h3 style="margin-top:18px">Build Status</h3><div id="cf-status"></div>
      <button id="cf-clear" style="width:100%;margin-top:12px">Clear Build</button>
      <h3 style="margin-top:20px">Gaming FPS Estimator</h3>
      <label for="fps-game">Game</label><select id="fps-game" class="sel">${Object.keys(fpsGameBase).map(game => `<option>${esc(game)}</option>`).join("")}</select>
      <label for="fps-gpu">Graphics Card</label><select id="fps-gpu" class="sel"><option value="build">Use GPU from my build</option>${getProducts("GPU").map(product => `<option value="${esc(product.id)}">${esc(nameOf(product))}</option>`).join("")}</select>
      <label for="fps-resolution">Resolution</label><select id="fps-resolution" class="sel"><option value="1080p">1080p</option><option value="1440p">1440p</option><option value="4k">4K</option></select>
      <label for="fps-preset">Graphics Preset</label><select id="fps-preset" class="sel"><option value="Low">Low</option><option value="Medium">Medium</option><option value="High" selected>High</option><option value="Ultra">Ultra</option></select>
      <button id="fps-calculate" class="p" style="width:100%;margin:8px 0">Estimate FPS</button>
      <div id="fps-result" class="fps-result"><p class="est">Choose your settings and estimate FPS.</p></div>
    `;
    right.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
      delete selected[button.dataset.remove]; selectedId = null;
      renderLeft(); renderRight(); update3D();
    }));
    $("#cf-clear").addEventListener("click", () => {
      Object.keys(selected).forEach(key => delete selected[key]); selectedId = null;
      renderLeft(); renderRight(); update3D(); notify("Build cleared");
    });
    $("#fps-calculate").addEventListener("click", calculateFPS);
    renderStatus();
  }

  const fpsGameBase = { "Cyberpunk 2077":48,"GTA V Enhanced":75,"Red Dead Redemption 2":58,"Hogwarts Legacy":50,"Forza Horizon 5":80,"Call of Duty: Warzone":75,"Counter-Strike 2":180,"Valorant":240,"Fortnite":100,"Black Myth: Wukong":38 };
  const fpsResolutionFactor = {"1080p":1,"1440p":0.72,"4k":0.43};
  const fpsPresetFactor = {Low:1.35,Medium:1.15,High:1,Ultra:0.78};
  function getFpsGpuTier(gpu) {
    if (!gpu) return null;
    const text = `${gpu.name || ""} ${gpu.model || ""} ${gpu.brand || ""}`.toLowerCase();
    if (/5090|rx 9070/.test(text)) return 10;
    if (/5080|4090|rx 7900/.test(text)) return 9;
    if (/5070 ti|4080|rx 7800|rx 6800/.test(text)) return 8;
    if (/5070|4070 ti|3090|rx 7700|rx 6700/.test(text)) return 7;
    if (/5060 ti|4070|3080/.test(text)) return 6;
    if (/5060|4060 ti|3070|2080/.test(text)) return 5;
    if (/5050|4060|3060 ti|rx 7600|rx 6600/.test(text)) return 4;
    if (/4050|3060|2070/.test(text)) return 3;
    if (/3050|2060|1660/.test(text)) return 2;
    if (/1650|1050/.test(text)) return 1;
    return null;
  }
  function calculateFPS() {
    const game = $("#fps-game")?.value, gpuChoice = $("#fps-gpu")?.value;
    const resolution = $("#fps-resolution")?.value, preset = $("#fps-preset")?.value;
    const result = $("#fps-result");
    if (!game || !gpuChoice || !resolution || !preset || !result) return;
    const gpu = gpuChoice === "build" ? selected.GPU : products.find(product => String(product.id) === String(gpuChoice));
    if (!gpu) { result.innerHTML = '<p class="est">Select a GPU in your build or choose one manually.</p>'; return; }
    const tier = getFpsGpuTier(gpu);
    if (tier == null) { result.innerHTML = '<p class="est">GPU performance data is unavailable for this model.</p>'; return; }
    const fps = Math.max(1, Math.round(fpsGameBase[game] * tier / 5 * fpsResolutionFactor[resolution] * fpsPresetFactor[preset]));
    result.innerHTML = `<h3>Estimated Performance</h3><p><strong>${esc(game)}</strong></p><p>${esc(nameOf(gpu))}</p><p>${esc(resolution)} · ${esc(preset)} settings</p><div style="font-size:32px;font-weight:800;color:var(--a)">${fps} FPS</div><p class="est">Approximate estimate, not a benchmark. Actual FPS depends on CPU, drivers, ray tracing, upscaling and game settings.</p>`;
  }
  function qualityScore(product, category) {
    const name = `${product.name || ""} ${product.model || ""}`.toLowerCase();
    const specs = `${product.specifications || ""} ${typeof product.specs === "string" ? product.specs : ""}`.toLowerCase();
    if (category === "GPU") return (getFpsGpuTier(product) || 1) * 10;
    if (category === "CPU") {
      if (/9950x/.test(name)) return 100;
      if (/7800x3d/.test(name)) return 96;
      if (/9700x|14700k/.test(name)) return 88;
      if (/265k/.test(name)) return 86;
      if (/14600k/.test(name)) return 82;
      if (/9600x/.test(name)) return 78;
      if (/250k/.test(name)) return 76;
      if (/7600/.test(name)) return 72;
      if (/14400f/.test(name)) return 68;
      return 60;
    }
    if (category === "Motherboard") {
      if (/z890|z790|x870/.test(name)) return 100;
      if (/b850/.test(name)) return 90;
      if (/b860/.test(name)) return 86;
      if (/b650/.test(name)) return 82;
      if (/b760/.test(name)) return 78;
      return 70;
    }
    if (category === "RAM") return /32\s*gb/.test(`${name} ${specs}`) ? 100 : 62;
    if (category === "SSD") return /2\s*tb/.test(`${name} ${specs}`) ? 100 : 68;
    if (category === "PSU") return Number(specs.match(/(\d{3,4})\s*w/)?.[1] || 0) / 10;
    if (category === "Cabinet") return /high.airflow|airflow|mesh|flow/i.test(`${name} ${specs}`) ? 100 : 70;
    if (category === "Fan") return /3.in.1|3.pack/i.test(`${name} ${specs}`) ? 100 : /noctua|mobius|elite|p28/i.test(`${name} ${specs}`) ? 90 : 70;
    return 0;
  }

  function requiredPsuWatts(gpu) {
    const name = `${gpu.name || ""} ${gpu.model || ""}`.toLowerCase();
    if (/5090/.test(name)) return 1000;
    if (/5080|4090|5070 ti|9070 xt|7900/.test(name)) return 850;
    if (/5070|9070|7800 xt|4070|3090/.test(name)) return 750;
    return 650;
  }

  function platformSocket(product) {
    const text = `${product?.compatibility || ""} ${product?.specifications || ""}`.toUpperCase();
    return text.match(/\b(AM5|LGA\s*1700|LGA\s*1851)\b/)?.[1].replace(/\s+/g, "") || null;
  }

  function memoryType(product) {
    const text = `${product?.compatibility || ""} ${product?.specifications || ""}`.toUpperCase();
    return text.match(/DDR[45]/)?.[0] || null;
  }

  function cpuMatchesMotherboard(cpu, motherboard) {
    const cpuSocket = platformSocket(cpu);
    const boardSocket = platformSocket(motherboard);
    return Boolean(cpuSocket && boardSocket && cpuSocket === boardSocket);
  }

  function ramMatchesMotherboard(ram, motherboard) {
    const ramType = memoryType(ram);
    const boardType = memoryType(motherboard);
    return Boolean(ramType && boardType && ramType === boardType);
  }
  function findBestBuild(budget) {
    const weights = { GPU: 0.42, CPU: 0.18, Motherboard: 0.10, RAM: 0.08, SSD: 0.06, PSU: 0.06, Cabinet: 0.06, Fan: 0.04 };
    const order = ["GPU", "CPU", "Motherboard", "RAM", "SSD", "PSU", "Cabinet", "Fan"];
    const options = order.map(category => getProducts(category)
      .map(product => ({ product, cost: price(product), score: qualityScore(product, category) * weights[category] }))
      .sort((a, b) => b.score - a.score || a.cost - b.cost));
    if (options.some(group => !group.length)) return null;

    const minRemaining = Array(order.length + 1).fill(0);
    const maxRemaining = Array(order.length + 1).fill(0);
    for (let i = order.length - 1; i >= 0; i--) {
      minRemaining[i] = minRemaining[i + 1] + Math.min(...options[i].map(option => option.cost));
      maxRemaining[i] = maxRemaining[i + 1] + Math.max(...options[i].map(option => option.score));
    }

    let best = null;
    const picks = {};
    function search(index, cost, score, gpu) {
      if (cost + minRemaining[index] > budget) return;
      if (best && score + maxRemaining[index] < best.score) return;
      if (index === order.length) {
        if (!best || score > best.score || (score === best.score && cost < best.cost)) {
          best = { picks: { ...picks }, cost, score };
        }
        return;
      }

      const category = order[index];
      for (const option of options[index]) {
        if (cost + option.cost + minRemaining[index + 1] > budget) continue;
        if (category === "Motherboard" && !cpuMatchesMotherboard(picks.CPU, option.product)) continue;
        if (category === "RAM" && !ramMatchesMotherboard(option.product, picks.Motherboard)) continue;
        if (category === "PSU") {
          const watts = Number(String(option.product.specifications || "").match(/(\d{3,4})\s*w/i)?.[1] || 0);
          if (gpu && watts < requiredPsuWatts(gpu)) continue;
        }
        picks[category] = option.product;
        search(index + 1, cost + option.cost, score + option.score, category === "GPU" ? option.product : gpu);
        delete picks[category];
      }
    }

    search(0, 0, 0, null);
    return best;
  }
  function renderStatus() {
    const status = $("#cf-status");
    if (!status) return;

    const issues = [];
    const cpu = selected.CPU;
    const gpu = selected.GPU;
    const ram = selected.RAM;

    if (!cpu) issues.push(["Choose a CPU", "w"]);
    if (!selected.Motherboard) issues.push(["Choose a motherboard", "w"]);
    if (!selected.Cabinet) issues.push(["Choose a cabinet", "w"]);
    if (!selected.PSU) issues.push(["Choose a power supply", "w"]);
    if (cpu && selected.Motherboard && !cpuMatchesMotherboard(cpu, selected.Motherboard)) {
      issues.push(["CPU socket does not match the selected motherboard", "w"]);
    }
    if (ram && selected.Motherboard && !ramMatchesMotherboard(ram, selected.Motherboard)) {
      issues.push(["RAM type does not match the selected motherboard", "w"]);
    }
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
         <p class="est">CPU socket and RAM type match the motherboard.</p>`;
    } else {
      status.innerHTML = issues.map(([text, cls]) =>
        `<div class="issue ${cls === "w" ? "w" : ""}">${esc(text)}</div>`
      ).join("");
    }
  }

  // 3D VIEWER
  function init3D() {
    if (caseFallback) caseFallback.style.display = "grid";
    const THREE = window.THREE;
    if (!THREE) {
      if (caseFallback) caseFallback.style.display = "grid";
      info.style.display = "block";
      info.textContent = "3D engine unavailable. Showing the static PC case preview.";
      return;
    }
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
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
      updateCamera();

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
      floor.position.y = -2;
      scene.add(floor);

      pcGroup = new THREE.Group();
      scene.add(pcGroup);

      build3DModel();
      update3D();
      resize3D();


let dragMode = null;
let dragStartX = 0;
let dragStartY = 0;

function hitTestModel(clientX, clientY) {
  if (!camera || !pcGroup) return false;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;

  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(pcGroup, true).length > 0;
}

function updateCanvasCursor(clientX, clientY) {
  canvas.classList.toggle("is-over-model", hitTestModel(clientX, clientY));
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !event.isPrimary) return;

  dragMode = hitTestModel(event.clientX, event.clientY) ? "model" : "view";
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  canvas.classList.remove("is-over-model");
  canvas.classList.toggle("is-dragging-model", dragMode === "model");
  canvas.classList.toggle("is-dragging-view", dragMode === "view");
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragMode) {
    updateCanvasCursor(event.clientX, event.clientY);
    return;
  }

  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;

  dragStartX = event.clientX;
  dragStartY = event.clientY;

  if (dragMode === "model") {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const cameraRight = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(camera.quaternion)
      .normalize();
    const yaw = new THREE.Quaternion().setFromAxisAngle(worldUp, dx * 0.005);
    const pitch = new THREE.Quaternion().setFromAxisAngle(cameraRight, dy * 0.005);

    pcGroup.quaternion.premultiply(yaw).premultiply(pitch).normalize();
  } else {
    cameraYaw -= dx * 0.005;
    cameraPitch = Math.max(-0.7, Math.min(0.7, cameraPitch + dy * 0.003));
    updateCamera();
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  dragMode = null;
  canvas.classList.remove("is-dragging-model", "is-dragging-view");
  updateCanvasCursor(event.clientX, event.clientY);
});

canvas.addEventListener("pointercancel", () => {
  dragMode = null;
  canvas.classList.remove("is-dragging-model", "is-dragging-view");
});

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
      if (caseFallback) caseFallback.style.display = "grid";
      info.style.display = "block";
      info.textContent = "3D viewer unavailable. Showing the static PC case preview.";
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
      opacity: 0.35,
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
makePanel("caseLeft", [0.06, 3.6, 1.5], [-1.07, 1.8, 0], glassMaterial);
makePanel("caseRight", [0.06, 3.6, 1.5], [1.07, 1.8, 0], glassMaterial);

// Top and bottom panels
makePanel("caseTop", [2.2, 0.06, 1.5], [0, 3.57, 0], caseMaterial);
makePanel("caseBottom", [2.2, 0.06, 1.5], [0, 0.03, 0], caseMaterial);

// Front and rear panels
makePanel("caseFront", [2.2, 3.6, 0.06], [0, 1.8, 0.72], glassMaterial);
makePanel("caseRear", [2.2, 3.6, 0.06], [0, 1.8, -0.72], caseMaterial);
    // Structural rails keep the case silhouette visible around the glass panels.
    for (const x of [-1.04, 1.04]) {
      for (const z of [-0.69, 0.69]) {
        box(caseGroup, [0.10, 3.58, 0.10], [x, 1.8, z], caseMaterial);
      }
    }
    for (const y of [0.08, 3.52]) {
      box(caseGroup, [2.16, 0.10, 0.10], [0, y, 0.69], caseMaterial);
      box(caseGroup, [2.16, 0.10, 0.10], [0, y, -0.69], caseMaterial);
      box(caseGroup, [0.10, 0.10, 1.38], [-1.04, y, 0], caseMaterial);
      box(caseGroup, [0.10, 0.10, 1.38], [1.04, y, 0], caseMaterial);
    }
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

  // Keep the interior empty until the matching part is selected in the catalog.
  const partVisibility = {
    motherboard: Boolean(selected.Motherboard),
    cpu: Boolean(selected.CPU),
    gpu: Boolean(selected.GPU),
    gpuLight: Boolean(selected.GPU),
    ram1: Boolean(selected.RAM),
    ram2: Boolean(selected.RAM),
    ssd: Boolean(selected.SSD),
    psu: Boolean(selected.PSU)
  };
  Object.entries(partVisibility).forEach(([part, visible]) => {
    if (parts[part]) parts[part].visible = visible;
  });

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

    // The RGB toggle controls lighting only; selecting a fan always shows its hardware.
    rgbGroup.visible = Boolean(selected.Fan);
  }

  // Keep the tower frame visible around its transparent panels.
  if (caseGroup) {
    caseGroup.visible = true;
  }

  // 9. RGB COLOUR AND EFFECTS
  const color = $("#rc")?.value || "#38e0b0";
  const fx = $("#fx")?.value || "Breathing";

  if (rgbGroup) {
    const rgbEnabled = $("#rgb")?.checked ?? true;
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
        mesh.material.emissiveIntensity = rgbEnabled ? 1.3 : 0;
      }
    });
  }
}

  function updateCamera() {
    if (!camera) return;
    const horizontalDistance = Math.cos(cameraPitch) * cameraDistance;
    camera.position.set(
      Math.sin(cameraYaw) * horizontalDistance,
      cameraHome.targetY + Math.sin(cameraPitch) * cameraDistance,
      Math.cos(cameraYaw) * horizontalDistance
    );
    camera.lookAt(0, cameraHome.targetY, 0);
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
      const rgbEnabled = $("#rgb")?.checked ?? true;
      const fx = $("#fx")?.value || "Breathing";
      const time = performance.now() * 0.001;

      if (fx === "Rainbow") rgbHue = (time * 0.12) % 1;

      rgbGroup.children.forEach((mesh) => {
        if (mesh.geometry.type !== "TorusGeometry") return;

        if (!rgbEnabled) {
          mesh.material.emissiveIntensity = 0;
        } else if (fx === "Breathing") {
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

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
      if (caseFallback) caseFallback.style.display = "none";
    }
  }

  // EXISTING 3D CONTROLS
  $("#ex")?.addEventListener("input", update3D);
  $("#rgb")?.addEventListener("change", update3D);
  $("#rc")?.addEventListener("input", update3D);
  $("#fx")?.addEventListener("change", update3D);

  $("#rs")?.addEventListener("click", () => {
    cameraYaw = cameraHome.yaw;
    cameraPitch = cameraHome.pitch;
    cameraDistance = cameraHome.distance;
    if (pcGroup) {
      pcGroup.quaternion.identity();
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

  const buildDialog = $("#build-dialog");
  $("#bBuild")?.addEventListener("click", () => {
    $("#build-budget").value = "";
    $("#build-budget-error").textContent = "";
    buildDialog.showModal();
    $("#build-budget").focus();
  });
  $("#build-cancel")?.addEventListener("click", () => buildDialog.close());
  $("#build-generate")?.addEventListener("click", () => {
    const budget = Number($("#build-budget").value);
    const minimum = categories.reduce((sum, [category]) => {
      const cheapest = Math.min(...getProducts(category).map(price));
      return sum + (Number.isFinite(cheapest) ? cheapest : 0);
    }, 0);
    const error = $("#build-budget-error");
    if (!Number.isFinite(budget) || budget <= 0) {
      error.textContent = "Enter a valid budget in rupees.";
      return;
    }
    if (budget < minimum) {
      error.textContent = `The minimum catalog build is ${money(minimum)}.`;
      return;
    }

    const build = findBestBuild(budget);
    if (!build) {
      error.textContent = "No compatible build fits this budget. Try increasing it.";
      return;
    }
    Object.keys(selected).forEach(key => delete selected[key]);
    Object.assign(selected, build.picks);
    activeCategory = "GPU";
    selectedId = null;
    renderLeft();
    renderRight();
    update3D();
    buildDialog.close();
    notify(`Best build selected: ${money(build.cost)} of ${money(budget)}`);
  });
  $("#build-budget")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#build-generate").click();
    }
  });
  window.addEventListener("resize", resize3D);

  renderLeft();
  renderRight();
  init3D();

  console.log(`CoreForge 3D loaded ${products.length} database products.`);
});
