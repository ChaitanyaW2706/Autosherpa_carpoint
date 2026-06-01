// Using global API from config.js

let allCarsData = [];
let filteredCarsData = [];
let currentAction = null;
let currentCarId = null;
let currentItemId = null;
let currentPage = 0;
const PAGE_SIZE = 51;

// -------------------- HELPERS --------------------
function handleError(res) {
  if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
  return res.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function handleCarImagesSelect(event) {
  const files = Array.from(event.target.files || []);
  const listEl = document.getElementById("carImagesList");
  if (!listEl) return;
  if (!files.length) {
    listEl.textContent = "No images selected.";
    return;
  }
  if (files.length > 5) {
    event.target.value = "";
    listEl.textContent = "Please select up to 5 images only.";
    return;
  }
  listEl.textContent = `${files.length} file${files.length === 1 ? "" : "s"} selected: ${files.map(f => f.name).join(", ")}`;
}

function formatPrice(price) {
  if (!price || price === 0) return "—";
  return "₹" + price.toLocaleString("en-IN");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadCarTypes(selectId = "carType") {
  return fetch(API + "/sales/car-types")
    .then(handleError)
    .then(types => {
      const select = document.getElementById(selectId);
      if (!select) return;
      select.innerHTML = '<option value="">Select Car Type</option>';
      types.forEach(type => {
        const option = document.createElement("option");
        option.value = type.id;
        option.textContent = type.type_name;
        select.appendChild(option);
      });
      const newOption = document.createElement("option");
      newOption.value = "_new_type_";
      newOption.textContent = "➕ Add new type";
      select.appendChild(newOption);
    })
    .catch(e => console.error("Load car types error:", e));
}

function toggleCustomTypeInput(selectId, inputId) {
  const select = document.getElementById(selectId);
  const inputRow = document.getElementById(inputId + "Row");
  const input = document.getElementById(inputId);
  if (!select || !inputRow || !input) return;
  if (select.value === "_new_type_") {
    inputRow.style.display = "block";
    input.focus();
  } else {
    inputRow.style.display = "none";
    input.value = "";
  }
}

function addTag(type) {
  const inputId = type + "Input";
  const tagsId = type + "Tags";
  const input = document.getElementById(inputId);
  const tagsEl = document.getElementById(tagsId);
  const val = input.value.trim();
  if (!val) return;
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.innerHTML = `${escapeHtml(val)}<button onclick="removeTag(this, '${type}')">×</button>`;
  tagsEl.appendChild(tag);
  input.value = "";
}

function removeTag(btn, type) {
  btn.parentElement.remove();
}

function getTags(type) {
  const tagsId = type + "Tags";
  const tagsEl = document.getElementById(tagsId);
  if (!tagsEl) return [];
  return Array.from(tagsEl.children).map(tag => tag.textContent.slice(0, -1)); // remove the ×
}

function getImageSrc(base64Data) {
  if (!base64Data) return null;
  let value = base64Data.trim();
  
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return API + value;
  
  if (value.startsWith("data:")) return value;
  if (value.startsWith("[")) {
    try {
      const arr = JSON.parse(value);
      if (Array.isArray(arr) && arr.length > 0) {
        value = String(arr[0]).trim();
        if (value.startsWith("http://") || value.startsWith("https://")) return value;
        if (value.startsWith("/")) return API + value;
        if (value.startsWith("data:")) return value;
      } else {
        return null;
      }
    } catch (e) {
      // ignore and fall through
    }
  }
  const clean = value.replace(/\s/g, "");
  if (clean.length <= 10) return null;
  const base64Only = clean.replace(/\r|\n|\t/g, "").split(",").pop();
  if (base64Only.startsWith("/9j/")) return `data:image/jpeg;base64,${base64Only}`;
  if (base64Only.startsWith("iVBOR")) return `data:image/png;base64,${base64Only}`;
  if (base64Only.startsWith("R0lGOD")) return `data:image/gif;base64,${base64Only}`;
  if (base64Only.startsWith("UklGR")) return `data:image/webp;base64,${base64Only}`;
  return `data:image/jpeg;base64,${base64Only}`;
}

function createBrochureDownloadLink(brochureBase64, filename = "brochure.pdf") {
  if (!brochureBase64) return null;
  let base64 = brochureBase64.trim();
  if (base64.startsWith("data:")) {
    const parts = base64.split(",");
    base64 = parts[parts.length - 1] || "";
  }
  base64 = base64.replace(/\s/g, "");
  if (!base64) return null;
  try {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.textContent = "Download Brochure";
    anchor.style.color = "#0052cc";
    anchor.style.fontWeight = "600";
    anchor.addEventListener("click", () => {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    return anchor;
  } catch (err) {
    console.error("Brochure download error:", err);
    return null;
  }
}

function extractCarImages(car) {
  const fields = ["car_image_base64", "image_base64", "car_image", "image"];
  let raw = null;
  for (const f of fields) {
    if (car && car[f]) {
      raw = car[f];
      break;
    }
  }
  if (!raw || typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return arr.map(getImageSrc).filter(Boolean);
      }
    } catch (_) {
      // fall back below
    }
  }
  const src = getImageSrc(raw);
  return src ? [src] : [];
}

function extractCarImage(car) {
  const images = extractCarImages(car);
  return images.length ? images[0] : null;
}

function serializeCarImages(images) {
  if (!Array.isArray(images) || !images.length) return null;
  return images;
}

// -------------------- LOAD ALL CARS (FAST: meta first, images lazy) --------------------
async function loadAllCars(page = 0) {
  currentPage = page;
  const skip = page * PAGE_SIZE;
  const limit = PAGE_SIZE;

  const search = (document.getElementById("carSearch")?.value || "").trim();
  const brand = (document.getElementById("brandFilter")?.value || "").trim();
  const fuel = (document.getElementById("fuelFilter")?.value || "").trim();
  const model = (document.getElementById("modelFilter")?.value || "").trim();
  const type = (document.getElementById("typeFilter")?.value || "").trim();

  let query = `?skip=${skip}&limit=${limit}`;
  if (search) query += `&search=${encodeURIComponent(search)}`;
  if (brand) query += `&brand=${encodeURIComponent(brand)}`;
  if (fuel) query += `&fuel=${encodeURIComponent(fuel)}`;
  if (model) query += `&model=${encodeURIComponent(model)}`;
  if (type) query += `&type=${encodeURIComponent(type)}`;

  const grid = document.getElementById("carsGrid");
  const loading = document.getElementById("carsLoading");
  const empty = document.getElementById("carsEmpty");
  if (!grid) return;
  grid.innerHTML = "";
  loading.classList.remove("hidden");
  empty.classList.add("hidden");
  try {
    const res = await fetch(API + "/sales/cars-meta" + query);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const cars = data.items || [];
    
    allCarsData = cars;
    filteredCarsData = [...allCarsData];
    loading.classList.add("hidden");
    
    renderCarsGrid(cars, data.total);
    renderSalesCharts(cars);
    renderPagination(data.total);
    
    // Step 2: Lazy load images
    lazyLoadCarImages(cars);
  } catch (e) {
    console.error("Load cars error:", e);
    loading.classList.add("hidden");
    grid.innerHTML = `<div style="text-align:center;padding:40px;">⚠️ Error: ${escapeHtml(e.message)}</div>`;
  }
}

function renderPagination(totalCount) {
  let paginationEl = document.getElementById("carsPagination");
  if (!paginationEl) {
    // Create it if it doesn't exist below carsGrid
    paginationEl = document.createElement("div");
    paginationEl.id = "carsPagination";
    paginationEl.className = "pagination-container";
    const grid = document.getElementById("carsGrid");
    grid.parentNode.insertBefore(paginationEl, grid.nextSibling);
  }
  
  paginationEl.innerHTML = "";
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  
  if (totalPages <= 1) return;
  
  const prevBtn = document.createElement("button");
  prevBtn.className = "pagination-btn";
  prevBtn.textContent = "Previous";
  prevBtn.disabled = currentPage === 0;
  prevBtn.onclick = () => loadAllCars(currentPage - 1);
  
  const info = document.createElement("span");
  info.className = "pagination-info";
  info.textContent = ` Page ${currentPage + 1} of ${totalPages} `;
  
  const nextBtn = document.createElement("button");
  nextBtn.className = "pagination-btn";
  nextBtn.textContent = "Next";
  nextBtn.disabled = currentPage >= totalPages - 1;
  nextBtn.onclick = () => loadAllCars(currentPage + 1);
  
  paginationEl.appendChild(prevBtn);
  paginationEl.appendChild(info);
  paginationEl.appendChild(nextBtn);
}

// Lazy load images for each car in background (batched to avoid overload)
async function lazyLoadCarImages(cars) {
  const BATCH_SIZE = 4; // load 4 images at a time
  for (let i = 0; i < cars.length; i += BATCH_SIZE) {
    const batch = cars.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(car => loadCarImageById(car.id)));
  }
}

async function loadCarImageById(carId) {
  try {
    const res = await fetch(`${API}/sales/cars-image/${carId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.car_image_base64) return;
    // Update in-memory data
    const car = allCarsData.find(c => c.id === carId);
    if (car) car.car_image_base64 = data.car_image_base64;
    // Update the card image in DOM without re-rendering the whole card
    const imgEl = document.getElementById(`car-img-${carId}`);
    const placeholderEl = document.getElementById(`car-img-placeholder-${carId}`);
    if (imgEl) {
      const src = extractCarImage({ car_image_base64: data.car_image_base64 });
      if (src) {
        imgEl.src = src;
        imgEl.style.display = "";
        if (placeholderEl) placeholderEl.style.display = "none";
      }
    }
  } catch (e) {
    // Silently ignore image load errors - placeholder stays
  }
}

function populateFilterDropdowns(cars) {
  const brands = [...new Set(cars.map(c => c.make).filter(Boolean))].sort();
  const models = [...new Set(cars.map(c => c.model).filter(Boolean))].sort();
  const fuels = [...new Set(cars.flatMap(c => (c.fuels || []).map(f => f.fuel_type)).filter(Boolean))].sort();
  const types = [...new Set(cars.map(c => c.type_name).filter(Boolean))].sort();

  const brandSel = document.getElementById("brandFilter");
  const modelSel = document.getElementById("modelFilter");
  const fuelSel = document.getElementById("fuelFilter");
  const typeSel = document.getElementById("typeFilter");

  if (brandSel) brandSel.innerHTML = '<option value="">All Brands</option>' + brands.map(b => `<option>${escapeHtml(b)}</option>`).join("");
  if (modelSel) modelSel.innerHTML = '<option value="">All Model</option>' + models.map(m => `<option>${escapeHtml(m)}</option>`).join("");
  if (fuelSel) fuelSel.innerHTML = '<option value="">All Fuel Types</option>' + fuels.map(f => `<option>${escapeHtml(f)}</option>`).join("");
  if (typeSel) typeSel.innerHTML = '<option value="">All Types</option>' + types.map(t => `<option>${escapeHtml(t)}</option>`).join("");
}

function renderCarsGrid(cars, totalCount = null) {
  const grid = document.getElementById("carsGrid");
  const empty = document.getElementById("carsEmpty");
  const countEl = document.getElementById("carsCount");
  grid.innerHTML = "";
  if (countEl) {
    const start = currentPage * PAGE_SIZE + 1;
    const end = start + cars.length - 1;
    countEl.textContent = totalCount !== null 
      ? `${start}-${end} cars (Total-${totalCount})`
      : `${start}-${end} cars`;
  }
  if (!cars.length) { empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  for (const car of cars) grid.appendChild(createCarCard(car));
}

function filterCars() {
  loadAllCars(0); // Trigger server-side filtering and reset to page 0
}

function resetCarFilters() {
  const ids = ["carSearch", "brandFilter", "fuelFilter", "modelFilter", "typeFilter"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  loadAllCars(0);
}

function exportCSV() {
  const search = (document.getElementById("carSearch")?.value || "").toLowerCase();
  const brand = (document.getElementById("brandFilter")?.value || "").toLowerCase();
  const fuel = (document.getElementById("fuelFilter")?.value || "").toLowerCase();
  const model = (document.getElementById("modelFilter")?.value || "").toLowerCase();
  const type = (document.getElementById("typeFilter")?.value || "").toLowerCase();

  const filtered = allCarsData.filter(car => {
    const matchSearch = !search || (car.make + " " + car.model + " " + car.variant).toLowerCase().includes(search);
    const matchBrand = !brand || (car.make || "").toLowerCase() === brand;
    const matchModel = !model || (car.model || "").toLowerCase() === model;
    const matchType = !type || (car.type_name || "").toLowerCase() === type;
    const matchFuel = !fuel || (car.fuels || []).some(f => (f.fuel_type || "").toLowerCase() === fuel);
    return matchSearch && matchBrand && matchModel && matchType && matchFuel;
  });

  if (!filtered.length) return showToast("No cars to export matching current filters");

  console.log(`Exporting ${filtered.length} cars...`);
  const h = ["ID", "Make", "Model", "Variant", "Mileage", "Price Base", "Price Top", "Fuel", "Trans", "Color"];
  const rows = filtered.map(c => [
    c.id, c.make, c.model, c.variant, c.mileage_kmph, c.ex_showroom_price_base, c.ex_showroom_price_top,
    (c.fuels || []).map(f => f.fuel_type).join("; "), (c.transmissions || []).map(t => t.transmission_type).join("; "), (c.colors || []).map(cl => cl.color_name).join("; ")
  ]);
  const csv = [h, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "cars_filtered.csv" });
  a.click();
}

function createCarCard(car) {
  const card = document.createElement("div");
  card.className = "car-card";
  const src = extractCarImage(car);
  let fuels = car.fuels?.length ? car.fuels.map(f => f.fuel_type).join(", ") : "—";
  let trans = car.transmissions?.length ? car.transmissions.map(t => t.transmission_type).join(", ") : "—";
  let clrs = car.colors?.length ? (car.colors.length > 3 ? car.colors.slice(0, 3).map(c => c.color_name).join(", ") + " & More" : car.colors.map(c => c.color_name).join(", ")) : "—";
  let typeName = car.type_name || "—";

  const specs = [
    ["Type", typeName],
    ["Price (Base)", formatPrice(car.ex_showroom_price_base)],
    ["Price (Top)", formatPrice(car.ex_showroom_price_top)],
    ["Fuel", fuels],
    ["Transmission", trans],
    ["Mileage", `${car.mileage_kmph || "—"} KMPL`],
    ["Colors", clrs],
  ];

  const specsHtml = specs.map((s, i) => `
    <div class="spec-inline">
      <span class="spec-number">${i + 1}.</span>
      <span class="spec-text">${escapeHtml(s[0])} <strong>${escapeHtml(s[1])}</strong></span>
    </div>
  `).join("");

  card.innerHTML = `
    <div class="car-badge">Available</div>
    <div class="car-image-side">
      <img id="car-img-${car.id}" src="${src || ''}" alt="Car" class="car-image" style="${src ? '' : 'display:none'}">
      <div id="car-img-placeholder-${car.id}" class="car-image-placeholder" style="${src ? 'display:none' : ''}">🚗</div>
    </div>
    <div class="car-details-side">
      <div>
        <div class="car-model">${escapeHtml(car.make)} ${escapeHtml(car.model)}</div>
        <div class="car-variant">${escapeHtml(car.variant)}</div>
      </div>
      <div class="car-specs">${specsHtml}</div>
      <div class="car-actions">
        <button class="car-view-btn" onclick="openViewCarModal(${car.id})">View</button>
        <button class="car-edit-btn" onclick="openEditCarModal(${car.id})">✏ Edit</button>
        <button class="car-delete-btn" onclick="deleteCar(${car.id})">Delete</button>
      </div>
    </div>
  `;
  return card;
}

// -------------------- CHARTS --------------------
let brandChartInst = null;
let priceChartInst = null;
let fuelChartInst = null;

function normalizeString(str) {
  if (!str) return 'Unknown';
  const s = String(str).trim().toLowerCase();
  if (!s) return 'Unknown';
  if (s === 'cng') return 'CNG';
  if (s === 'ev' || s === 'electric') return 'Electric';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeBrand(brand) {
  if (!brand) return 'Unknown';
  let b = brand.trim().toLowerCase();
  
  if (b.includes('mahindra') || b.includes('mahindhra')) return 'Mahindra';
  if (b.includes('hyundai')) return 'Hyundai';
  if (b.includes('maruti') || b.includes('suzuki')) return 'Maruti Suzuki';
  if (b.includes('tata')) return 'Tata';
  if (b.includes('honda')) return 'Honda';
  if (b.includes('toyota')) return 'Toyota';
  if (b.includes('kia')) return 'Kia';
  if (b.includes('mg') || b.includes('morris garages')) return 'MG';
  if (b.includes('volkswagen') || b.includes('vw')) return 'Volkswagen';
  if (b.includes('renault')) return 'Renault';
  if (b.includes('nissan')) return 'Nissan';
  if (b.includes('skoda')) return 'Skoda';
  if (b.includes('ford')) return 'Ford';
  if (b.includes('jeep')) return 'Jeep';
  
  return b.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function renderSalesCharts(cars) {
  const chartsCard = document.getElementById('salesChartsCard');
  if (!chartsCard) return;
  if (!cars || cars.length === 0) {
    chartsCard.innerHTML = '<div style="padding: 24px; text-align: center; color: #64748b; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">No data available for charts based on current filters.</div>';
    chartsCard.style.display = 'block';
    return;
  }
  
  // Re-render the container if it was previously set to empty state
  if (chartsCard.innerHTML.includes('No data available')) {
    chartsCard.innerHTML = `
      <div class="chart-grid">
        <div class="chart-container">
          <h4>Brand Share</h4>
          <canvas id="brandPieChart"></canvas>
        </div>
        <div class="chart-container">
          <h4>Average Base Price by Brand</h4>
          <canvas id="priceBarChart"></canvas>
        </div>
        <div class="chart-container">
          <h4>Fuel Type Distribution</h4>
          <canvas id="fuelDoughnutChart"></canvas>
        </div>
      </div>
    `;
  }

  chartsCard.style.display = 'block';

  const brandCount = {};
  const brandPriceTotal = {};
  const brandPriceCount = {};
  const fuelCount = {};

  cars.forEach(car => {
    const make = normalizeBrand(car.make);
    brandCount[make] = (brandCount[make] || 0) + 1;
    
    if (car.ex_showroom_price_base) {
      brandPriceTotal[make] = (brandPriceTotal[make] || 0) + car.ex_showroom_price_base;
      brandPriceCount[make] = (brandPriceCount[make] || 0) + 1;
    }

    if (car.fuels && car.fuels.length > 0) {
      car.fuels.forEach(f => {
        const ft = normalizeString(f.fuel_type);
        fuelCount[ft] = (fuelCount[ft] || 0) + 1;
      });
    }
  });

  const commonColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#06b6d4'];

  const brandLabels = Object.keys(brandCount);
  const brandData = Object.values(brandCount);
  if (brandChartInst) brandChartInst.destroy();
  brandChartInst = new Chart(document.getElementById('brandPieChart'), {
    type: 'pie',
    data: { labels: brandLabels, datasets: [{ data: brandData, backgroundColor: commonColors, borderWidth: 1 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });

  const priceLabels = Object.keys(brandPriceTotal);
  const priceData = priceLabels.map(make => Math.round(brandPriceTotal[make] / brandPriceCount[make]));
  if (priceChartInst) priceChartInst.destroy();
  priceChartInst = new Chart(document.getElementById('priceBarChart'), {
    type: 'bar',
    data: { labels: priceLabels, datasets: [{ label: 'Avg Base Price (₹)', data: priceData, backgroundColor: commonColors, borderRadius: 4 }] },
    options: { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
  });

  const fuelLabels = Object.keys(fuelCount);
  const fuelData = Object.values(fuelCount);
  if (fuelChartInst) fuelChartInst.destroy();
  fuelChartInst = new Chart(document.getElementById('fuelDoughnutChart'), {
    type: 'doughnut',
    data: { labels: fuelLabels, datasets: [{ data: fuelData, backgroundColor: commonColors, borderWidth: 1 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function switchSalesView(view) {
  const inventoryView = document.getElementById('inventoryView');
  const reportsView = document.getElementById('reportsView');
  const tabInventory = document.getElementById('tabInventory');
  const tabReports = document.getElementById('tabReports');

  if (!inventoryView || !reportsView) return;

  if (view === 'inventory') {
    inventoryView.style.display = 'block';
    reportsView.style.display = 'none';
    if(tabInventory) tabInventory.classList.add('active');
    if(tabReports) tabReports.classList.remove('active');
  } else if (view === 'reports') {
    inventoryView.style.display = 'none';
    reportsView.style.display = 'block';
    if(tabInventory) tabInventory.classList.remove('active');
    if(tabReports) tabReports.classList.add('active');
    renderSalesCharts(filteredCarsData);
  }
}

// -------------------- MODALS & CRUD --------------------
async function addCar() {
  try {
    const make = document.getElementById("make")?.value.trim();
    const model = document.getElementById("model")?.value.trim();
    const variant = document.getElementById("variant")?.value.trim();
    const typeId = document.getElementById("carType")?.value;
    const customType = document.getElementById("newCarType")?.value.trim();
    if (!make || !model || !variant || (!typeId && !customType)) return showToast("Fill required fields");
    if (typeId === "_new_type_" && !customType) return showToast("Enter new car type name.");
    const imageFiles = Array.from(document.getElementById("carImages")?.files || []);
    if (imageFiles.length > 5) return showToast("Please upload up to 5 images only.");
    const pdfFile = document.getElementById("brochurePdf")?.files?.[0];
    const imageBase64s = imageFiles.length ? await Promise.all(imageFiles.map(fileToBase64)) : [];
    const pdfBase64 = pdfFile ? await fileToBase64(pdfFile) : null;
    const body = {
      make, model, variant,
      mileage_kmph: parseInt(document.getElementById("mileage").value) || 0,
      ex_showroom_price_base: parseInt(document.getElementById("exPriceBase").value) || 0,
      ex_showroom_price_top: parseInt(document.getElementById("exPriceTop").value) || 0,
      type_id: typeId && typeId !== "_new_type_" ? parseInt(typeId) : null,
      custom_type_name: typeId === "_new_type_" ? customType : null,
      colors: getTags("color"),
      fuels: getTags("fuel"),
      transmissions: getTags("transmission"),
      car_images_base64: imageBase64s.length ? imageBase64s : null,
      brochure_pdf_base64: pdfBase64,
      description: document.getElementById("description")?.value || null
    };
    console.debug("Uploading new car payload", body, "API", API);
    const res = await fetch(API + "/sales/cars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json()).detail || "Error");
    showToast("Car added");
    toggleAddCarForm(); loadAllCars();
  } catch (err) { showToast("Error: " + err.message); }
}

async function deleteCar(id) {
  if (!confirm("Delete?")) return;
  try {
    const res = await fetch(`${API}/sales/cars/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    loadAllCars();
  } catch (e) { showToast("Delete failed: " + e.message); }
}

function displaySalesCarImageView(elementId, imageData, viewName) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const src = getImageSrc(imageData);
  if (src) {
    element.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(viewName)}" style="width:100%; height:100%; object-fit:contain; border-radius:12px;" onerror="this.style.display='none'">`;
  } else {
    element.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; border-radius:12px; background:#f1f5f9; color:#64748b; font-size:14px; padding:8px; text-align:center;">No ${escapeHtml(viewName)}</div>`;
  }
}

function openViewCarModal(id) {
  const car = allCarsData.find(c => c.id === id);
  if (!car) return;
  document.getElementById("viewModalTitle").textContent = `${car.make} ${car.model}`;
  document.getElementById("viewModalVariant").textContent = car.variant;
  document.getElementById("viewModalMake").textContent = car.make;
  document.getElementById("viewModalModel").textContent = car.model;
  document.getElementById("viewModalVariantLabel").textContent = car.variant;
  document.getElementById("viewModalPriceBase").textContent = formatPrice(car.ex_showroom_price_base);
  document.getElementById("viewModalPriceTop").textContent = formatPrice(car.ex_showroom_price_top);
  document.getElementById("viewModalMileage").textContent = `${car.mileage_kmph} KMPL`;
  document.getElementById("viewModalFuel").textContent = (car.fuels || []).map(f => f.fuel_type).join(", ");
  document.getElementById("viewModalTrans").textContent = (car.transmissions || []).map(t => t.transmission_type).join(", ");
  document.getElementById("viewModalColor").textContent = (car.colors || []).map(c => c.color_name).join(", ");
  document.getElementById("viewModalType").textContent = car.type_name || "—";
  const brochure = car.brochure_pdf_base64;
  const brochureElement = document.getElementById("viewModalBrochure");
  if (brochureElement) {
    brochureElement.innerHTML = "";
    if (brochure) {
      const link = createBrochureDownloadLink(brochure);
      if (link) {
        brochureElement.appendChild(link);
      } else {
        brochureElement.textContent = "Download unavailable";
      }
    } else {
      brochureElement.textContent = "—";
    }
  }
  document.getElementById("viewModalDescription").textContent = car.description || "—";
  const images = extractCarImages(car);
  // If image not yet lazy-loaded, fetch it now for the modal
  if (!images.length && car.id) {
    fetch(`${API}/sales/cars-image/${car.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.car_image_base64) {
          car.car_image_base64 = data.car_image_base64;
          const freshImages = extractCarImages(car);
          displaySalesCarImageView('viewBackViewImage', freshImages[0], 'Back View');
          displaySalesCarImageView('viewRightViewImage', freshImages[1], 'Right View');
          displaySalesCarImageView('viewFrontViewImage', freshImages[2], 'Front View');
          displaySalesCarImageView('viewLeftViewImage', freshImages[3], 'Left View');
          displaySalesCarImageView('viewInteriorImage', freshImages[4], 'Interior');
        }
      }).catch(() => {});
  }
  displaySalesCarImageView('viewBackViewImage', images[0], 'Back View');
  displaySalesCarImageView('viewRightViewImage', images[1], 'Right View');
  displaySalesCarImageView('viewFrontViewImage', images[2], 'Front View');
  displaySalesCarImageView('viewLeftViewImage', images[3], 'Left View');
  displaySalesCarImageView('viewInteriorImage', images[4], 'Interior');
  const modal = document.getElementById("viewCarModal");
  if (modal) {
    modal.classList.add("drawer-open");
    document.body.style.overflow = "hidden";
  }
}
function closeViewModal() {
  const modal = document.getElementById("viewCarModal");
  if (modal) {
    modal.classList.remove("drawer-open");
    document.body.style.overflow = "";
  }
}

// ==================== RICH EDIT MODAL ====================
let editTags = { fuel: [], trans: [], color: [] };
let editDeleted = { fuel: [], trans: [], color: [] };
let editNewImageBase64 = null;

function renderEditTags(type) {
  const listEl = document.getElementById(type === "fuel" ? "editFuelList" : type === "trans" ? "editTransList" : "editColorList");
  if (!listEl) return;
  listEl.innerHTML = "";
  editTags[type].forEach((tag, idx) => {
    const span = document.createElement("span");
    span.className = `edit-tag ${type}-tag`;
    span.innerHTML = `${escapeHtml(tag.value)}<button onclick="removeEditTag('${type}',${idx})">×</button>`;
    listEl.appendChild(span);
  });
}
function addEditTag(type) {
  const input = document.getElementById(`edit${type.charAt(0).toUpperCase() + type.slice(1)}Input`);
  const val = input.value.trim(); if (!val) return;
  editTags[type].push({ id: null, value: val }); input.value = ""; renderEditTags(type);
}
function removeEditTag(type, idx) {
  const tag = editTags[type][idx]; if (tag.id) editDeleted[type].push(tag.id);
  editTags[type].splice(idx, 1); renderEditTags(type);
}
async function previewEditImage(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  if (files.length > 5) return showToast("Please upload up to 5 images only.");
  const results = await Promise.all(files.map(fileToBase64));
  editNewImageBase64 = results;
  const first = results[0] ? getImageSrc(results[0]) : null;
  document.getElementById("editImagePreview").innerHTML = first ? `<img src="${first}">` : "🚗";
}
async function openEditCarModal(carId) {
  try {
    const res = await fetch(`${API}/sales/cars-grouped?car_id=${carId}`);
    const carData = (await res.json())[0];
    if (!carData) return;
    editTags = { fuel: (carData.fuels || []).map(f => ({ id: f.id, value: f.fuel_type })), trans: (carData.transmissions || []).map(t => ({ id: t.id, value: t.transmission_type })), color: (carData.colors || []).map(c => ({ id: c.id, value: c.color_name })) };
    editDeleted = { fuel: [], trans: [], color: [] }; editNewImageBase64 = null;
    document.getElementById("editCarId").value = carData.id;
    document.getElementById("editMake").value = carData.make;
    document.getElementById("editModel").value = carData.model;
    document.getElementById("editVariant").value = carData.variant;
    document.getElementById("editMileage").value = carData.mileage_kmph;
    document.getElementById("editExPriceBase").value = carData.ex_showroom_price_base;
    document.getElementById("editExPriceTop").value = carData.ex_showroom_price_top;
    document.getElementById("editDescription").value = carData.description || "";
    const brochureInput = document.getElementById("editBrochurePdf");
    if (brochureInput) brochureInput.value = "";
    const src = extractCarImage(carData);
    document.getElementById("editImagePreview").innerHTML = src ? `<img src="${src}">` : "🚗";
    renderEditTags("fuel"); renderEditTags("trans"); renderEditTags("color");

    // Load car types and set selected value
    await loadCarTypes("editCarType");
    const editCarTypeSelect = document.getElementById("editCarType");
    const editCustomTypeInput = document.getElementById("editNewCarType");
    const editCustomTypeRow = document.getElementById("editNewCarTypeRow");
    if (carData.type_id) {
      if (editCarTypeSelect) editCarTypeSelect.value = carData.type_id;
      if (editCustomTypeRow) editCustomTypeRow.style.display = "none";
      if (editCustomTypeInput) editCustomTypeInput.value = "";
    } else if (carData.type_name) {
      if (editCarTypeSelect) editCarTypeSelect.value = "_new_type_";
      if (editCustomTypeRow) editCustomTypeRow.style.display = "block";
      if (editCustomTypeInput) editCustomTypeInput.value = carData.type_name;
    } else {
      if (editCarTypeSelect) editCarTypeSelect.value = "";
      if (editCustomTypeRow) editCustomTypeRow.style.display = "none";
    }

    const modal = document.getElementById("editCarModal");
    if (modal) {
      modal.classList.add("drawer-open");
      document.body.style.overflow = "hidden";
    }
  } catch (e) { console.error(e); }
}
function closeEditModal() {
  const modal = document.getElementById("editCarModal");
  if (modal) {
    modal.classList.remove("drawer-open");
    document.body.style.overflow = "";
  }
}
async function saveEditCar() {
  try {
    const carId = parseInt(document.getElementById("editCarId").value);
    const editTypeId = document.getElementById("editCarType").value;
    const editCustomType = document.getElementById("editNewCarType")?.value.trim();
    const brochureFile = document.getElementById("editBrochurePdf")?.files?.[0];
    const brochureBase64 = brochureFile ? await fileToBase64(brochureFile) : null;

    const body = {
      make: document.getElementById("editMake").value,
      model: document.getElementById("editModel").value,
      variant: document.getElementById("editVariant").value,
      mileage_kmph: parseInt(document.getElementById("editMileage").value),
      ex_showroom_price_base: parseInt(document.getElementById("editExPriceBase").value),
      ex_showroom_price_top: parseInt(document.getElementById("editExPriceTop").value),
      type_id: editTypeId && editTypeId !== "_new_type_" ? parseInt(editTypeId) : null,
      custom_type_name: editTypeId === "_new_type_" ? (editCustomType || null) : null,
      description: document.getElementById("editDescription").value,
      colors: editTags.color.map(t => t.value),
      fuel_types: editTags.fuel.map(t => t.value),
      transmissions: editTags.trans.map(t => t.value)
    };
    if (editNewImageBase64) body.car_images_base64 = editNewImageBase64;
    if (brochureBase64) body.brochure_pdf_base64 = brochureBase64;
    await fetch(`${API}/sales/cars/${carId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    showToast("Updated!"); closeEditModal(); loadAllCars();
  } catch (e) { showToast("Error: " + e.message); }
}

// -------------------- EXCEL UPLOAD --------------------
let selectedSalesFile = null;
function toggleUploadInventory() {
  const section = document.getElementById("uploadInventorySection");
  if (section) { section.classList.toggle("hidden"); if (!section.classList.contains("hidden")) section.scrollIntoView({ behavior: 'smooth' }); }
}
function downloadSalesTemplate() {
  const csv = "Brand,Model,Variant Type,Price Base,Price Top,Fuel,Trans,Mileage,Color,Description";
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stock_template.csv`;
  a.click();
}
function handleSalesFileSelect(e) { selectedSalesFile = e.target.files[0]; const fileNameEl = document.getElementById('salesFileName'); if (fileNameEl) fileNameEl.innerHTML = `Selected: ${selectedSalesFile.name}`; }
function handleSalesDrop(e) { e.preventDefault(); selectedSalesFile = e.dataTransfer.files[0]; const fileNameEl = document.getElementById('salesFileName'); if (fileNameEl) fileNameEl.innerHTML = `Selected: ${selectedSalesFile.name}`; }
async function uploadSalesFile() {
  if (!selectedSalesFile) return showToast('Please select a file first!');
  const formData = new FormData(); formData.append('file', selectedSalesFile);
  const btn = document.getElementById('btnSalesUpload');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Uploading...'; }
  try {
    const res = await fetch(`${API}/sales/bulk-upload-cars`, { method: 'POST', body: formData });
    if (res.ok) { showToast('Success!'); toggleUploadInventory(); loadAllCars(); } else showToast('Failed!');
  } catch (e) { showToast('Error: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Upload'; } }
}

function toggleAddCarForm() {
  const form = document.getElementById("addCarForm"); if (!form) return;
  const isHidden = form.classList.contains("hidden");
  form.classList.toggle("hidden");
  document.getElementById("toggleAddCarBtn").textContent = form.classList.contains("hidden") ? "➕ Add New Car" : "➖ Hide Form";
  if (!isHidden) {
    // Clearing form when hiding
    ["make", "model", "variant", "mileage", "exPriceBase", "exPriceTop", "description"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.getElementById("carType").value = "";
    document.getElementById("newCarTypeRow").style.display = "none";
    document.getElementById("newCarType").value = "";
    ["color", "fuel", "transmission"].forEach(type => {
      const tagsEl = document.getElementById(type + "Tags");
      if (tagsEl) tagsEl.innerHTML = "";
      const inputEl = document.getElementById(type + "Input");
      if (inputEl) inputEl.value = "";
    });
    const carImagesEl = document.getElementById("carImages");
    if (carImagesEl) carImagesEl.value = "";
    const brochureEl = document.getElementById("brochurePdf");
    if (brochureEl) brochureEl.value = "";
    const carImagesListEl = document.getElementById("carImagesList");
    if (carImagesListEl) carImagesListEl.textContent = "";
  } else {
    // Loading data when showing
    loadCarTypes("carType");
  }
}

document.addEventListener("DOMContentLoaded", () => { loadAllCars(); loadCarTypes("carType"); loadCarTypes("editCarType"); });

window.addCar = addCar; window.loadAllCars = loadAllCars; window.deleteCar = deleteCar;
window.openViewCarModal = openViewCarModal; window.closeViewModal = closeViewModal;
window.openEditCarModal = openEditCarModal; window.closeEditModal = closeEditModal;
window.saveEditCar = saveEditCar; window.addEditTag = addEditTag; window.removeEditTag = removeEditTag;
window.previewEditImage = previewEditImage; window.toggleAddCarForm = toggleAddCarForm;
window.filterCars = filterCars; window.resetCarFilters = resetCarFilters; window.exportCSV = exportCSV;
window.toggleUploadInventory = toggleUploadInventory; window.downloadSalesTemplate = downloadSalesTemplate;
window.handleSalesFileSelect = handleSalesFileSelect; window.handleSalesDrop = handleSalesDrop; window.uploadSalesFile = uploadSalesFile;
window.lazyLoadCarImages = lazyLoadCarImages; window.loadCarImageById = loadCarImageById;
window.switchSalesView = switchSalesView;
