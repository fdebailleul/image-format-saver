// === Image Format Saver — Popup Script ===

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Éléments DOM
const qualitySlider = $("#quality");
const qualityValue = $("#qualityValue");
const resizeMode = $("#resizeMode");
const maxWidthGroup = $("#maxWidthGroup");
const percentageGroup = $("#percentageGroup");
const percentageSlider = $("#percentage");
const percentageValue = $("#percentageValue");
const btnSave = $("#btnSave");
const statusMessage = $("#statusMessage");
const defaultFormat = $("#defaultFormat");

// Dernière image cliquée (stockée par le context menu)
let lastImageUrl = null;

// --- Initialisation ---
document.addEventListener("DOMContentLoaded", () => {
  chargerParametres();
  setupOnglets();
  setupControles();
  setupBatch();
});

// --- Onglets ---
function setupOnglets() {
  $$(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach(t => t.classList.remove("active"));
      $$(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      $(`#tab-${tab.dataset.tab}`).classList.add("active");
    });
  });
}

// --- Contrôles paramètres ---
function setupControles() {
  qualitySlider.addEventListener("input", () => {
    qualityValue.textContent = qualitySlider.value;
  });

  percentageSlider.addEventListener("input", () => {
    percentageValue.textContent = percentageSlider.value;
  });

  resizeMode.addEventListener("change", () => {
    maxWidthGroup.classList.toggle("hidden", resizeMode.value !== "maxWidth");
    percentageGroup.classList.toggle("hidden", resizeMode.value !== "percentage");
  });

  btnSave.addEventListener("click", sauvegarderParametres);

  // Estimation de taille
  $("#btnEstimate").addEventListener("click", estimerTaille);

  // Notification toggle (optional permission)
  const notifToggle = $("#notifToggle");
  chrome.permissions.contains({ permissions: ["notifications"] }, (granted) => {
    notifToggle.checked = granted;
  });
  notifToggle.addEventListener("change", () => {
    if (notifToggle.checked) {
      chrome.permissions.request({ permissions: ["notifications"] }, (granted) => {
        notifToggle.checked = granted;
      });
    } else {
      chrome.permissions.remove({ permissions: ["notifications"] });
    }
  });

  // Vérifier s'il y a une image récente
  chrome.storage.local.get("lastImageUrl", (data) => {
    if (data.lastImageUrl) {
      lastImageUrl = data.lastImageUrl;
      $("#estimateSection").classList.remove("hidden");
    }
  });
}

// --- Charger les paramètres ---
function chargerParametres() {
  chrome.storage.local.get("settings", (data) => {
    const s = data.settings || {};
    if (s.quality) qualitySlider.value = Math.round(s.quality * 100);
    qualityValue.textContent = qualitySlider.value;
    if (s.resizeMode) resizeMode.value = s.resizeMode;
    if (s.maxWidth) $("#maxWidth").value = s.maxWidth;
    if (s.percentage) {
      percentageSlider.value = s.percentage;
      percentageValue.textContent = s.percentage;
    }
    if (s.defaultFormat) defaultFormat.value = s.defaultFormat;

    maxWidthGroup.classList.toggle("hidden", resizeMode.value !== "maxWidth");
    percentageGroup.classList.toggle("hidden", resizeMode.value !== "percentage");
  });
}

// --- Sauvegarder les paramètres ---
function sauvegarderParametres() {
  const settings = {
    quality: parseInt(qualitySlider.value) / 100,
    resizeMode: resizeMode.value,
    maxWidth: parseInt($("#maxWidth").value) || 1920,
    percentage: parseInt(percentageSlider.value) || 100,
    defaultFormat: defaultFormat.value
  };

  chrome.storage.local.set({ settings }, () => {
    afficherStatus("Paramètres sauvegardés", "success");
  });
}

// --- Estimation de taille ---
function estimerTaille() {
  if (!lastImageUrl) return;

  const btn = $("#btnEstimate");
  btn.disabled = true;
  btn.textContent = "Estimation…";

  const format = defaultFormat.value;
  const mimeMap = {
    "save-jpg": "image/jpeg",
    "save-png": "image/png",
    "save-webp": "image/webp",
  };

  chrome.runtime.sendMessage({
    action: "estimateSize",
    srcUrl: lastImageUrl,
    mimeType: mimeMap[format] || "image/webp",
    quality: parseInt(qualitySlider.value) / 100,
    resizeMode: resizeMode.value,
    maxWidth: parseInt($("#maxWidth").value) || 1920,
    percentage: parseInt(percentageSlider.value) || 100
  }, (response) => {
    btn.disabled = false;
    btn.textContent = "Estimer la taille";

    if (response && response.success) {
      $("#originalSize").textContent = formaterTaille(response.originalSize);
      $("#estimatedSize").textContent = formaterTaille(response.estimatedSize);
      const ratio = ((1 - response.estimatedSize / response.originalSize) * 100);
      $("#reduction").textContent = ratio > 0 ? `-${ratio.toFixed(0)}%` : `+${Math.abs(ratio).toFixed(0)}%`;
    } else {
      afficherStatus("Impossible d'estimer la taille", "error");
    }
  });
}

// --- Batch ---
function setupBatch() {
  $("#btnScan").addEventListener("click", scannerImages);
  $("#selectAll").addEventListener("change", (e) => {
    $$(".image-item").forEach(item => {
      item.classList.toggle("selected", e.target.checked);
    });
  });
  $("#btnBatchConvert").addEventListener("click", lancerBatch);
}

function scannerImages() {
  const btn = $("#btnScan");
  btn.disabled = true;
  btn.textContent = "Scan en cours…";

  chrome.runtime.sendMessage({ action: "scanImages" }, (response) => {
    btn.disabled = false;
    btn.textContent = "Scanner les images de la page";

    if (!response || !response.success || response.images.length === 0) {
      afficherStatus("Aucune image trouvée sur cette page", "error");
      return;
    }

    const images = response.images;
    $("#imageCount").textContent = `${images.length} image${images.length > 1 ? "s" : ""}`;
    $("#scanResults").classList.remove("hidden");

    const grid = $("#imageGrid");
    grid.innerHTML = "";

    images.forEach((img) => {
      const item = document.createElement("div");
      item.className = "image-item selected";
      item.dataset.src = img.src;

      const imgEl = document.createElement("img");
      imgEl.src = img.src;
      imgEl.alt = img.alt;
      imgEl.loading = "lazy";

      const check = document.createElement("span");
      check.className = "check";
      check.textContent = "\u2713";

      const dims = document.createElement("span");
      dims.className = "dimensions";
      dims.textContent = `${img.width}x${img.height}`;

      item.appendChild(imgEl);
      item.appendChild(check);
      item.appendChild(dims);

      item.addEventListener("click", () => {
        item.classList.toggle("selected");
        updateSelectAll();
      });
      grid.appendChild(item);
    });
  });
}

function updateSelectAll() {
  const items = $$(".image-item");
  const selected = $$(".image-item.selected");
  $("#selectAll").checked = items.length === selected.length;
}

function lancerBatch() {
  const selected = $$(".image-item.selected");
  if (selected.length === 0) {
    afficherStatus("Sélectionnez au moins une image", "error");
    return;
  }

  const images = Array.from(selected).map(item => item.dataset.src);
  const mimeType = $("#batchFormat").value;

  // Lire les paramètres actuels
  chrome.storage.local.get("settings", (data) => {
    const s = data.settings || {};

    $("#batchProgress").classList.remove("hidden");
    $("#btnBatchConvert").disabled = true;
    $("#progressFill").style.width = "30%";
    $("#progressText").textContent = `Conversion de ${images.length} images…`;

    chrome.runtime.sendMessage({
      action: "batchConvert",
      images,
      mimeType,
      quality: s.quality || 0.92,
      resizeMode: s.resizeMode || "none",
      maxWidth: s.maxWidth || 1920,
      percentage: s.percentage || 100
    }, (response) => {
      $("#progressFill").style.width = "100%";
      $("#btnBatchConvert").disabled = false;

      if (response && response.success) {
        $("#progressText").textContent = `${response.count} image${response.count > 1 ? "s" : ""} convertie${response.count > 1 ? "s" : ""} avec succès`;
      } else {
        $("#progressText").textContent = response?.error || "Erreur lors de la conversion";
      }

      setTimeout(() => {
        $("#batchProgress").classList.add("hidden");
        $("#progressFill").style.width = "0%";
      }, 3000);
    });
  });
}

// --- Utilitaires ---
function formaterTaille(octets) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(2)} Mo`;
}

function afficherStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  statusMessage.classList.remove("hidden");
  setTimeout(() => statusMessage.classList.add("hidden"), 3000);
}
