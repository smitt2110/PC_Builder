
// CoreForge 3D — app.js

document.addEventListener("DOMContentLoaded", () => {
  // 1. Load the database
  const database = window.PC_COMPONENTS_DATABASE;
  const products = database?.products || [];

  if (!products.length) {
    console.error(
      "Database not found! Check components_db.js and script order."
    );
    return;
  }

  console.log(`CoreForge 3D: Loaded ${products.length} products`);

  // 2. App state
  const selectedComponents = {};
  let activeCategory = "all";
  let searchTerm = "";

  const categories = [
    { id: "gpu", name: "Graphics Cards" },
    { id: "cpu", name: "Processors" },
    { id: "psu", name: "Power Supplies" },
    { id: "ram", name: "RAM" },
    { id: "ssd", name: "Storage" },
    { id: "cabinet", name: "PC Cabinets" },
    { id: "fan", name: "Cooling Fans" }
  ];

  // 3. Helpers
  const formatPrice = (price) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(Number(price) || 0);

  const getCategory = (product) =>
    String(product.category || "").toLowerCase();

  const getPrice = (product) =>
    Number(
      product.price_inr_snapshot ??
      product.price ??
      product.price_inr ??
      0
    );

  const getName = (product) =>
    product.name || product.model || "Unnamed component";

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  // 4. Find existing page elements or create the app area
  let app = document.querySelector("#coreforge-app");

  if (!app) {
    app = document.createElement("main");
    app.id = "coreforge-app";
    document.body.appendChild(app);
  }

  app.innerHTML = `
    <section class="cf-header">
      <h1>CoreForge 3D</h1>
      <p>Build your dream PC, component by component.</p>
    </section>

    <section class="cf-layout">
      <div class="cf-catalog">
        <div class="cf-controls">
          <input id="cf-search" type="search"
            placeholder="Search components..." />
          <select id="cf-category">
            <option value="all">All Components</option>
            ${categories.map(c =>
              `<option value="${c.id}">${c.name}</option>`
            ).join("")}
          </select>
        </div>

        <div id="cf-products" class="cf-products"></div>
      </div>

      <aside class="cf-build">
        <h2>Your PC Build</h2>
        <div id="cf-selected">
          <p>Select components to start building.</p>
        </div>
        <div class="cf-total">
          <span>Total estimated price</span>
          <strong id="cf-total">${formatPrice(0)}</strong>
        </div>
        <button id="cf-clear" type="button">Clear Build</button>
      </aside>
    </section>
  `;

  // 5. Add basic styling
  if (!document.querySelector("#coreforge-styles")) {
    const style = document.createElement("style");
    style.id = "coreforge-styles";
    style.textContent = `
      #coreforge-app {
        max-width: 1400px;
        margin: auto;
        padding: 24px;
        color: #f4f4f5;
        font-family: Arial, sans-serif;
      }

      .cf-header { margin-bottom: 28px; }
      .cf-header h1 { font-size: 36px; margin-bottom: 8px; }
      .cf-header p { color: #a1a1aa; }

      .cf-layout {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
        gap: 24px;
        align-items: start;
      }

      .cf-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 20px;
      }

      .cf-controls input, .cf-controls select {
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #3f3f46;
        background: #18181b;
        color: white;
      }

      .cf-controls input { flex: 1; min-width: 180px; }

      .cf-products {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 16px;
      }

      .cf-card, .cf-build {
        background: #18181b;
        border: 1px solid #33333b;
        border-radius: 12px;
        padding: 16px;
      }

      .cf-card h3 { margin: 8px 0; }
      .cf-card p { color: #a1a1aa; font-size: 14px; }
      .cf-price { font-size: 19px; font-weight: bold; margin: 14px 0; }
      .cf-tag { color: #a78bfa; font-size: 12px; text-transform: uppercase; }

      .cf-card button, #cf-clear, .cf-remove {
        padding: 10px 14px;
        border: 0;
        border-radius: 7px;
        cursor: pointer;
        background: #7c3aed;
        color: white;
      }

      .cf-card button { width: 100%; }
      .cf-card button:hover, #cf-clear:hover { background: #6d28d9; }

      .cf-build { position: sticky; top: 16px; }
      .cf-build h2 { margin-top: 0; }
      .cf-selected-item {
        padding: 12px 0;
        border-bottom: 1px solid #33333b;
      }

      .cf-selected-item p { margin: 6px 0; color: #a1a1aa; }
      .cf-remove { background: #3f3f46; margin-top: 8px; }
      .cf-total { display: flex; flex-direction: column; gap: 8px; margin: 20px 0; }
      .cf-total strong { font-size: 24px; color: #a78bfa; }
      #cf-clear { width: 100%; }
      .cf-empty { color: #a1a1aa; }

      @media (max-width: 760px) {
        .cf-layout { grid-template-columns: 1fr; }
        .cf-build { position: static; }
      }
    `;
    document.head.appendChild(style);
  }

  // 6. Render the product catalog
  function renderProducts() {
    const container = document.querySelector("#cf-products");

    const filtered = products.filter((product) => {
      const matchesCategory =
        activeCategory === "all" ||
        getCategory(product).includes(activeCategory);

      const text = [
        product.name,
        product.model,
        product.brand,
        product.category,
        product.compatibility
      ].join(" ").toLowerCase();

      return matchesCategory && text.includes(searchTerm);
    });

    if (!filtered.length) {
      container.innerHTML =
        '<p class="cf-empty">No components found. Try another search.</p>';
      return;
    }

    container.innerHTML = filtered.map((product, index) => {
      const id = product.id || `${getCategory(product)}-${index}`;
      const name = escapeHTML(getName(product));
      const brand = escapeHTML(product.brand || "");
      const category = escapeHTML(product.category || "Component");
      const price = getPrice(product);
      const specs = product.specs
        ? (typeof product.specs === "string"
            ? product.specs
            : Object.entries(product.specs)
                .map(([key, value]) => `${key}: ${value}`)
                .join(" • "))
        : "";

      return `
        <article class="cf-card">
          <span class="cf-tag">${category}</span>
          <h3>${name}</h3>
          <p>${brand}</p>
          <p>${escapeHTML(specs || "PC component")}</p>
          <div class="cf-price">${formatPrice(price)}</div>
          <button type="button" data-add="${escapeHTML(id)}">
            ${selectedComponents[id] ? "Added ✓" : "Add to Build"}
          </button>
        </article>
      `;
    }).join("");
  }

  // 7. Render selected components and total price
  function renderBuild() {
    const container = document.querySelector("#cf-selected");
    const items = Object.values(selectedComponents);

    if (!items.length) {
      container.innerHTML =
        '<p class="cf-empty">Select components to start building.</p>';
    } else {
      container.innerHTML = items.map((product) => {
        const id = product.id;
        return `
          <div class="cf-selected-item">
            <strong>${escapeHTML(getName(product))}</strong>
            <p>${formatPrice(getPrice(product))}</p>
            <button class="cf-remove" type="button"
              data-remove="${escapeHTML(id)}">Remove</button>
          </div>
        `;
      }).join("");
    }

    const total = items.reduce(
      (sum, product) => sum + getPrice(product), 0
    );

    document.querySelector("#cf-total").textContent = formatPrice(total);
  }

  // 8. Search and category filter
  document.querySelector("#cf-search").addEventListener("input", (event) => {
    searchTerm = event.target.value.toLowerCase().trim();
    renderProducts();
  });

  document.querySelector("#cf-category").addEventListener("change", (event) => {
    activeCategory = event.target.value;
    renderProducts();
  });

  // 9. Add/remove components
  document.querySelector("#cf-products").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (!button) return;

    const id = button.dataset.add;
    const product = products.find((item, index) =>
      String(item.id || `${getCategory(item)}-${index}`) === id
    );

    if (!product) return;

    // One component per category; selecting another replaces it.
    const category = getCategory(product);
    Object.keys(selectedComponents).forEach((selectedId) => {
      if (getCategory(selectedComponents[selectedId]) === category) {
        delete selectedComponents[selectedId];
      }
    });

    selectedComponents[id] = { ...product, id };
    renderProducts();
    renderBuild();
  });

  document.querySelector("#cf-selected").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;

    delete selectedComponents[button.dataset.remove];
    renderProducts();
    renderBuild();
  });

  document.querySelector("#cf-clear").addEventListener("click", () => {
    Object.keys(selectedComponents).forEach(
      (id) => delete selectedComponents[id]
    );
    renderProducts();
    renderBuild();
  });

  // 10. Start the app
  renderProducts();
  renderBuild();
});
