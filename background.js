// === Image Format Saver — Service Worker (background.js) ===

const FORMATS = {
  "save-jpg":  { mime: "image/jpeg", ext: "jpg"  },
  "save-png":  { mime: "image/png",  ext: "png"  },
  "save-webp": { mime: "image/webp", ext: "webp" }
};

const SETTINGS_DEFAULTS = {
  quality: 0.92,
  resizeMode: "none",
  maxWidth: 1920,
  percentage: 100,
  defaultFormat: "save-webp"
};

// --- Création du menu contextuel ---
function creerMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "image-format-saver",
      title: "Enregistrer l'image sous…",
      contexts: ["image"]
    });
    chrome.contextMenus.create({
      id: "save-jpg",
      parentId: "image-format-saver",
      title: "Format JPG",
      contexts: ["image"]
    });
    chrome.contextMenus.create({
      id: "save-png",
      parentId: "image-format-saver",
      title: "Format PNG",
      contexts: ["image"]
    });
    chrome.contextMenus.create({
      id: "save-webp",
      parentId: "image-format-saver",
      title: "Format WebP",
      contexts: ["image"]
    });
    console.log("[IFS] Menus contextuels créés");
  });
}

chrome.runtime.onInstalled.addListener(() => {
  creerMenus();
  chrome.storage.local.get("settings", (data) => {
    if (!data.settings) {
      chrome.storage.local.set({ settings: SETTINGS_DEFAULTS });
    }
  });
});

// Recréer aussi au démarrage du service worker (robustesse MV3)
chrome.runtime.onStartup.addListener(() => {
  creerMenus();
});

// --- Gestion du clic sur une option du menu ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const format = FORMATS[info.menuItemId];
  if (!format) return;

  console.log("[IFS] Menu cliqué:", info.menuItemId, "→", format.mime);
  chrome.storage.local.set({ lastImageUrl: info.srcUrl });

  chrome.storage.local.get("settings", (data) => {
    const settings = data.settings || SETTINGS_DEFAULTS;
    const nomFichier = extraireNomFichier(info.srcUrl, format.ext);
    traiterImage(info.srcUrl, format.mime, nomFichier, tab.id, settings);
  });
});

// --- Raccourci clavier ---
chrome.commands.onCommand.addListener((command) => {
  if (command !== "save-default") return;
  console.log("[IFS] Raccourci clavier déclenché");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;

    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const hovered = document.querySelector("img:hover");
        if (hovered && hovered.src) return hovered.src;
        const images = Array.from(document.querySelectorAll("img[src]"));
        if (images.length === 0) return null;
        images.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
        return images[0].src;
      }
    }).then((results) => {
      const srcUrl = results?.[0]?.result;
      if (!srcUrl) {
        afficherNotification("Aucune image trouvée", "Aucune image détectée sur cette page.");
        return;
      }
      chrome.storage.local.get("settings", (data) => {
        const settings = data.settings || SETTINGS_DEFAULTS;
        const format = FORMATS[settings.defaultFormat] || FORMATS["save-webp"];
        const nomFichier = extraireNomFichier(srcUrl, format.ext);
        traiterImage(srcUrl, format.mime, nomFichier, tabId, settings);
      });
    }).catch((err) => {
      console.error("[IFS] Erreur raccourci:", err);
      afficherNotification("Erreur", err.message);
    });
  });
});

// --- Messages depuis popup ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "scanImages") {
    handleScanImages(sendResponse);
    return true;
  }
  if (message.action === "batchConvert") {
    handleBatchConvert(message, sendResponse);
    return true;
  }
  if (message.action === "estimateSize") {
    handleEstimateSize(message, sendResponse);
    return true;
  }
});

async function handleScanImages(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) throw new Error("Aucun onglet actif");

    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => {
        const images = document.querySelectorAll("img[src]");
        const seen = new Set();
        const list = [];
        images.forEach(img => {
          const src = img.src;
          if (!src || seen.has(src) || src.startsWith("data:")) return;
          if (img.naturalWidth < 50 || img.naturalHeight < 50) return;
          seen.add(src);
          list.push({
            src,
            width: img.naturalWidth,
            height: img.naturalHeight,
            alt: img.alt || ""
          });
        });
        return list;
      }
    });
    sendResponse({ success: true, images: results?.[0]?.result || [] });
  } catch (err) {
    console.error("[IFS] Erreur scan:", err);
    sendResponse({ success: false, error: err.message });
  }
}

async function handleBatchConvert(message, sendResponse) {
  try {
    const { images, mimeType, quality, resizeMode, maxWidth, percentage } = message;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) throw new Error("Aucun onglet actif");

    const format = Object.values(FORMATS).find(f => f.mime === mimeType);
    const ext = format ? format.ext : "webp";
    const convertedFiles = [];

    for (const imgSrc of images) {
      try {
        const response = await fetch(imgSrc);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64Input = arrayBufferToBase64(arrayBuffer);
        const dataUrlInput = `data:${blob.type || "image/png"};base64,${base64Input}`;

        const resultats = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: convertirImage,
          args: [dataUrlInput, mimeType, quality || 0.92, resizeMode || "none", maxWidth || 1920, percentage || 100]
        });

        const dataUrl = resultats?.[0]?.result;
        if (dataUrl) {
          const nomFichier = extraireNomFichier(imgSrc, ext);
          convertedFiles.push({ name: nomFichier, dataUrl });
        }
      } catch (e) {
        console.error("[IFS] Erreur batch pour", imgSrc, e);
      }
    }

    if (convertedFiles.length === 0) {
      throw new Error("Aucune image n'a pu être convertie");
    }

    if (convertedFiles.length === 1) {
      chrome.downloads.download({
        url: convertedFiles[0].dataUrl,
        filename: convertedFiles[0].name,
        saveAs: true
      });
      sendResponse({ success: true, count: 1 });
      return;
    }

    const zipDataUrl = creerZip(convertedFiles);
    chrome.downloads.download({
      url: zipDataUrl,
      filename: `images_${ext}.zip`,
      saveAs: true
    });

    afficherNotification("Lot terminé", `${convertedFiles.length} images converties et zippées.`);
    sendResponse({ success: true, count: convertedFiles.length });
  } catch (err) {
    console.error("[IFS] Erreur batch:", err);
    afficherNotification("Erreur batch", err.message);
    sendResponse({ success: false, error: err.message });
  }
}

async function handleEstimateSize(message, sendResponse) {
  try {
    const { srcUrl, mimeType, quality, resizeMode, maxWidth, percentage } = message;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) throw new Error("Aucun onglet actif");

    const response = await fetch(srcUrl);
    const blob = await response.blob();
    const originalSize = blob.size;

    const arrayBuffer = await blob.arrayBuffer();
    const base64Input = arrayBufferToBase64(arrayBuffer);
    const dataUrlInput = `data:${blob.type || "image/png"};base64,${base64Input}`;

    const resultats = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: convertirImage,
      args: [dataUrlInput, mimeType, quality, resizeMode, maxWidth, percentage]
    });

    const dataUrl = resultats?.[0]?.result;
    if (!dataUrl) throw new Error("Conversion échouée");

    const base64 = dataUrl.split(",")[1];
    const estimatedSize = Math.round(base64.length * 3 / 4);

    sendResponse({ success: true, originalSize, estimatedSize });
  } catch (err) {
    console.error("[IFS] Erreur estimation:", err);
    sendResponse({ success: false, error: err.message });
  }
}

// --- Conversion et téléchargement ---
async function traiterImage(srcUrl, mimeType, nomFichier, tabId, settings) {
  try {
    console.log("[IFS] Traitement:", mimeType, nomFichier);

    const response = await fetch(srcUrl);
    if (!response.ok) {
      throw new Error(`Fetch échoué: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    console.log("[IFS] Image récupérée:", blob.size, "octets, type:", blob.type);

    // Convertir blob en data URL via ArrayBuffer (plus fiable que FileReader dans SW)
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const imageDataUrl = `data:${blob.type || "image/png"};base64,${base64}`;

    const quality = settings.quality || 0.92;
    const resizeMode = settings.resizeMode || "none";
    const maxWidth = settings.maxWidth || 1920;
    const percentage = settings.percentage || 100;

    console.log("[IFS] Injection conversion, mimeType:", mimeType, "qualité:", quality);

    const resultats = await chrome.scripting.executeScript({
      target: { tabId },
      func: convertirImage,
      args: [imageDataUrl, mimeType, quality, resizeMode, maxWidth, percentage]
    });

    const dataUrlConvertie = resultats?.[0]?.result;

    if (!dataUrlConvertie) {
      const erreur = resultats?.[0]?.error;
      console.error("[IFS] Conversion échouée. Erreur injection:", erreur);
      afficherNotification("Échec", "La conversion de l'image a échoué.");
      return;
    }

    // Vérifier que le type MIME résultant est correct
    const mimeResultat = dataUrlConvertie.split(";")[0].split(":")[1];
    console.log("[IFS] Conversion OK. MIME résultat:", mimeResultat, "attendu:", mimeType);

    if (mimeResultat !== mimeType) {
      console.warn("[IFS] MIME mismatch! Le navigateur a converti en", mimeResultat, "au lieu de", mimeType);
      afficherNotification(
        "Format non supporté",
        `Votre navigateur ne supporte pas la conversion en ${mimeType.split("/")[1].toUpperCase()}. Essayez JPG, PNG ou WebP.`
      );
      return;
    }

    chrome.downloads.download({
      url: dataUrlConvertie,
      filename: nomFichier,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("[IFS] Erreur téléchargement:", chrome.runtime.lastError.message);
        afficherNotification("Erreur", chrome.runtime.lastError.message);
      } else {
        console.log("[IFS] Téléchargement lancé, id:", downloadId);
        afficherNotification("Sauvegardé", `${nomFichier} enregistré avec succès.`);
      }
    });

  } catch (erreur) {
    console.error("[IFS] Erreur traitement:", erreur);
    afficherNotification("Erreur", erreur.message);
  }
}

// --- Conversion ArrayBuffer → base64 (fiable dans service worker) ---
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Traiter par blocs pour éviter les dépassements de pile
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// --- Notification Chrome (permission optionnelle) ---
function afficherNotification(titre, message) {
  chrome.permissions.contains({ permissions: ["notifications"] }, (granted) => {
    if (!granted) {
      console.log("[IFS]", titre, ":", message);
      return;
    }
    try {
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: `Image Format Saver — ${titre}`,
        message: message
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn("[IFS] Notification échouée:", chrome.runtime.lastError.message);
        }
      });
    } catch (e) {
      console.warn("[IFS] Impossible d'afficher la notification:", e.message);
    }
  });
}

// --- Nom de fichier ---
function extraireNomFichier(url, extension) {
  try {
    const pathname = new URL(url).pathname;
    let nom = pathname.split("/").pop() || "image";
    nom = nom.split("?")[0].split("#")[0];
    const pointIndex = nom.lastIndexOf(".");
    if (pointIndex > 0) {
      nom = nom.substring(0, pointIndex);
    }
    nom = decodeURIComponent(nom);
    nom = nom.replace(/[^a-zA-Z0-9_\-\.]/g, "_").substring(0, 100);
    if (!nom) nom = "image";
    return `${nom}.${extension}`;
  } catch {
    return `image.${extension}`;
  }
}

// --- ZIP minimal ---
function creerZip(fichiers) {
  const entries = [];
  let offset = 0;

  for (const fichier of fichiers) {
    const base64 = fichier.dataUrl.split(",")[1];
    const binaryString = atob(base64);
    const data = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      data[i] = binaryString.charCodeAt(i);
    }

    const nameBytes = new TextEncoder().encode(fichier.name);
    const crc = crc32(data);

    const header = new Uint8Array(30 + nameBytes.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 0, true);
    hv.setUint16(8, 0, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, 0, true);
    hv.setUint32(14, crc, true);
    hv.setUint32(18, data.length, true);
    hv.setUint32(22, data.length, true);
    hv.setUint16(26, nameBytes.length, true);
    hv.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    entries.push({ header, data, nameBytes, crc, offset });
    offset += header.length + data.length;
  }

  const centralParts = [];
  let centralSize = 0;

  for (const entry of entries) {
    const cd = new Uint8Array(46 + entry.nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, entry.crc, true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, entry.nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, entry.offset, true);
    cd.set(entry.nameBytes, 46);

    centralParts.push(cd);
    centralSize += cd.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + 22;
  const zipBuffer = new Uint8Array(totalSize);
  let pos = 0;

  for (const entry of entries) {
    zipBuffer.set(entry.header, pos);
    pos += entry.header.length;
    zipBuffer.set(entry.data, pos);
    pos += entry.data.length;
  }
  for (const cd of centralParts) {
    zipBuffer.set(cd, pos);
    pos += cd.length;
  }
  zipBuffer.set(eocd, pos);

  // Convertir en data URL via base64
  const zipBase64 = arrayBufferToBase64(zipBuffer.buffer);
  return `data:application/zip;base64,${zipBase64}`;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ===================================================================
// Fonction injectée dans la page via chrome.scripting.executeScript.
// IMPORTANT : cette fonction s'exécute dans le contexte de la page,
// pas dans le service worker.
// ===================================================================
function convertirImage(imageDataUrl, mimeType, quality, resizeMode, maxWidth, percentage) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        // Redimensionnement
        if (resizeMode === "maxWidth" && maxWidth && w > maxWidth) {
          const ratio = maxWidth / w;
          w = maxWidth;
          h = Math.round(h * ratio);
        } else if (resizeMode === "percentage" && percentage && percentage < 100) {
          const ratio = percentage / 100;
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");

        // Fond blanc pour JPG (pas de canal alpha en JPEG)
        if (mimeType === "image/jpeg") {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, w, h);
        }

        ctx.drawImage(img, 0, 0, w, h);

        // Qualité de compression (pas applicable pour PNG)
        const q = (mimeType === "image/png") ? undefined : quality;

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("toBlob a retourné null pour " + mimeType));
            return;
          }

          // Vérifier le type réel du blob
          console.log("[IFS-page] toBlob type:", blob.type, "demandé:", mimeType, "taille:", blob.size);

          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("FileReader échoué"));
          reader.readAsDataURL(blob);
        }, mimeType, q);

      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => reject(new Error("Impossible de charger l'image depuis data URL"));
    img.src = imageDataUrl;
  });
}
