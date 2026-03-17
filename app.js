import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs";

console.log("app.js cargado");

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  console.log("Inicializando app...");

  const els = {
    fileInput: document.getElementById("cvFile"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    apiKeyInput: document.getElementById("apiKey"),
    fileMeta: document.getElementById("fileMeta"),
    statusNode: document.getElementById("status"),
    outputNode: document.getElementById("output"),
    fullNameNode: document.getElementById("fullName"),
    companiesNode: document.getElementById("companies"),
    rolesNode: document.getElementById("roles"),
    technologiesNode: document.getElementById("technologies"),
    languagesNode: document.getElementById("languages")
  };

  const missing = Object.entries(els)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    console.error("Faltan elementos del DOM:", missing);
    if (els.statusNode) {
      els.statusNode.textContent = `Error de interfaz. Faltan elementos: ${missing.join(", ")}`;
    }
    return;
  }

  let selectedFile = null;

  els.fileInput.addEventListener("change", (event) => {
    console.log("Archivo cambiado");

    selectedFile = event.target.files?.[0] || null;

    if (!selectedFile) {
      els.fileMeta.textContent = "Aún no has seleccionado ningún archivo.";
      setStatus(els.statusNode, "No hay archivo seleccionado.");
      return;
    }

    els.fileMeta.textContent = `${selectedFile.name} • ${(selectedFile.size / 1024).toFixed(1)} KB`;
    setStatus(els.statusNode, "Archivo seleccionado. Pulsa “Analizar CV”.");
  });

  els.analyzeBtn.addEventListener("click", async () => {
    console.log("Click en Analizar CV");

    const apiKey = els.apiKeyInput.value.trim();

    if (!selectedFile) {
      setStatus(els.statusNode, "Selecciona un archivo antes de analizar.");
      return;
    }

    if (!apiKey) {
      setStatus(els.statusNode, "Debes introducir una Gemini API key antes de analizar el CV.");
      return;
    }

    els.outputNode.classList.add("hidden");

    try {
      setStatus(els.statusNode, "Leyendo archivo...");
      const text = await extractText(selectedFile);

      if (!text.trim()) {
        throw new Error("No se pudo extraer texto del archivo.");
      }

      const fullCvText = compactCvText(text);

      console.log("Longitud texto original:", text.length);
      console.log("Longitud texto enviado:", fullCvText.length);

      setStatus(els.statusNode, "Consultando Gemini...");
      const profile = await extractProfileWithGemini(fullCvText, apiKey);

      renderProfile(els, profile);
      els.outputNode.classList.remove("hidden");
      setStatus(els.statusNode, "Análisis completado.");
    } catch (error) {
      console.error("Error en análisis:", error);
      setStatus(els.statusNode, `Error: ${error.message}`);
      els.outputNode.classList.add("hidden");
    }
  });
}

function setStatus(node, message) {
  console.log("STATUS:", message);
  node.textContent = message;
}

async function extractText(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return extractTextFromPdf(file);
  }

  if (extension === "docx" || extension === "doc") {
    return extractTextFromDocx(file);
  }

  throw new Error("Formato no soportado. Usa PDF o DOCX.");
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("El navegador no pudo leer el archivo seleccionado."));
    reader.onabort = () => reject(new Error("La lectura del archivo fue cancelada."));

    reader.readAsArrayBuffer(file);
  });
}

async function extractTextFromPdf(file) {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const data = new Uint8Array(arrayBuffer);

    const loadingTask = pdfjsLib.getDocument({
      data,
      disableStream: true,
      disableAutoFetch: true
    });

    const pdf = await loadingTask.promise;
    const pages = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      pages.push(pageText);
    }

    return pages.join("\n");
  } catch (error) {
    throw new Error(`No se pudo leer el PDF. ${error.message}`);
  }
}

async function extractTextFromDocx(file) {
  if (!window.mammoth) {
    throw new Error("La librería para leer DOCX no está disponible.");
  }

  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    throw new Error(`No se pudo leer el DOCX. ${error.message}`);
  }
}

function compactCvText(text) {
  const cleaned = text
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const MAX_CHARS = 18000;
  return cleaned.length <= MAX_CHARS ? cleaned : cleaned.slice(0, MAX_CHARS);
}

async function extractProfileWithGemini(cvText, apiKey) {
  const schema = {
    type: "OBJECT",
    properties: {
      fullName: { type: "STRING" },
      companies: { type: "ARRAY", items: { type: "STRING" } },
      roles: { type: "ARRAY", items: { type: "STRING" } },
      technologies: { type: "ARRAY", items: { type: "STRING" } },
      languages: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: ["fullName", "companies", "roles", "technologies", "languages"]
  };

  const model = "gemini-2.5-flash-lite";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "Extrae datos de un CV tech y responde solo JSON válido. " +
                "No inventes. companies = empleadores reales. roles = puestos reales. " +
                "technologies = skills técnicas. languages = idiomas humanos."
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  `Devuelve fullName, companies, roles, technologies y languages.\n` +
                  `No incluyas universidades, ciudades, meses, proyectos, headings ni palabras aisladas.\n\n` +
                  `CV:\n${cvText}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini respondió con error (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) {
      throw new Error("Gemini no devolvió contenido parseable.");
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Gemini devolvió una respuesta que no es JSON válido.");
    }

    return {
      fullName: cleanFullName(parsed.fullName),
      companies: cleanCompanies(parsed.companies),
      roles: cleanRoles(parsed.roles),
      technologies: cleanTechnologies(parsed.technologies),
      languages: cleanLanguages(parsed.languages)
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("La petición a Gemini ha tardado demasiado y ha expirado.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanFullName(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || "No identificado";
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value.map((item) => String(item).replace(/\s+/g, " ").trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "es"));
}

function cleanCompanies(value) {
  const banned = [
    "aws", "azure", "docker", "github", "linkedin", "python", "java", "scala",
    "english", "spanish", "french", "education", "experience", "projects",
    "knowledge", "languages", "cloud", "data", "science"
  ];

  return normalizeList(value).filter((item) => {
    const lower = item.toLowerCase();
    return !banned.includes(lower) && !lower.includes("university") && !lower.includes("project");
  });
}

function cleanRoles(value) {
  return normalizeList(value).filter((item) => {
    const lower = item.toLowerCase();
    return !lower.includes("github") && !lower.includes("linkedin");
  });
}

function cleanTechnologies(value) {
  return normalizeList(value).filter((item) => {
    const lower = item.toLowerCase();
    return !["english", "spanish", "french"].includes(lower);
  });
}

function cleanLanguages(value) {
  const allowed = new Map([
    ["spanish", "Spanish"],
    ["english", "English"],
    ["french", "French"],
    ["german", "German"],
    ["italian", "Italian"],
    ["portuguese", "Portuguese"],
    ["catalan", "Catalan"]
  ]);

  return normalizeList(value)
    .map((item) => allowed.get(item.toLowerCase()))
    .filter(Boolean);
}

function renderProfile(els, profile) {
  els.fullNameNode.textContent = profile.fullName;
  fillList(els.companiesNode, profile.companies);
  fillList(els.rolesNode, profile.roles);
  fillList(els.technologiesNode, profile.technologies);
  fillList(els.languagesNode, profile.languages);
}

function fillList(node, items) {
  node.innerHTML = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "No detectado";
    li.classList.add("muted");
    node.append(li);
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    node.append(li);
  }
}