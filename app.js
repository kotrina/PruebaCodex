import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs";

console.log("app.js cargado correctamente");

// Para evitar guerra de workers en despliegues sencillos
pdfjsLib.GlobalWorkerOptions.workerSrc = null;

const fileInput = document.getElementById("cvFile");
const apiKeyInput = document.getElementById("apiKey");
const fileMeta = document.getElementById("fileMeta");
const statusNode = document.getElementById("status");
const outputNode = document.getElementById("output");
const fullNameNode = document.getElementById("fullName");

const companiesNode = document.getElementById("companies");
const rolesNode = document.getElementById("roles");
const technologiesNode = document.getElementById("technologies");
const languagesNode = document.getElementById("languages");

if (
  !fileInput || !apiKeyInput || !fileMeta || !statusNode || !outputNode || !fullNameNode ||
  !companiesNode || !rolesNode || !technologiesNode || !languagesNode
) {
  console.error("Faltan elementos del DOM. Revisa los IDs del HTML.");
}

fileInput?.addEventListener("change", async (event) => {
  console.log("Evento change disparado");

  const file = event.target.files?.[0];
  const apiKey = apiKeyInput.value.trim();

  console.log("Archivo:", file);
  console.log("API key:", apiKey ? "OK" : "VACÍA");

  if (!file) return;

  if (!apiKey) {
    setStatus("Debes introducir una Gemini API key antes de analizar el CV.");
    outputNode.classList.add("hidden");
    return;
  }

  fileMeta.textContent = `${file.name} • ${(file.size / 1024).toFixed(1)} KB`;
  setStatus("Extrayendo texto del CV...");
  outputNode.classList.add("hidden");

  try {
    const text = await extractText(file);

    if (!text.trim()) {
      throw new Error("No se pudo extraer texto del archivo.");
    }

    const compactText = compactCvText(text);
    console.log("Longitud texto original:", text.length);
    console.log("Longitud texto enviado:", compactText.length);

    setStatus("Analizando CV con Gemini...");
    const profile = await extractProfileWithGemini(compactText, apiKey);

    renderProfile(profile);
    setStatus("Análisis completado.");
    outputNode.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`);
    outputNode.classList.add("hidden");
  }
});

async function extractText(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") return extractTextFromPdf(file);
  if (extension === "docx" || extension === "doc") return extractTextFromDocx(file);

  throw new Error("Formato no soportado. Usa PDF o DOCX.");
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("El navegador no pudo leer el archivo seleccionado."));
    };

    reader.onabort = () => {
      reject(new Error("La lectura del archivo fue cancelada."));
    };

    reader.readAsArrayBuffer(file);
  });
}

async function extractTextFromPdf(file) {
  try {
    // Usamos FileReader en vez de file.arrayBuffer() para evitar el NotReadableError en algunos navegadores/despliegues
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const data = new Uint8Array(arrayBuffer);

    const loadingTask = pdfjsLib.getDocument({
      data,
      disableWorker: true,
      disableStream: true,
      disableAutoFetch: true,
      isEvalSupported: false,
      useSystemFonts: true
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

  const requestBody = {
    systemInstruction: {
      parts: [
        {
          text:
            "Extrae datos de un CV tech y responde solo JSON válido. " +
            "No inventes. " +
            "companies = empleadores reales. " +
            "roles = puestos reales. " +
            "technologies = skills técnicas. " +
            "languages = idiomas humanos."
        }
      ]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Devuelve:\n` +
              `- fullName\n` +
              `- companies\n` +
              `- roles\n` +
              `- technologies\n` +
              `- languages\n\n` +
              `Reglas:\n` +
              `- No incluyas universidades, ciudades, meses, proyectos, headings, clouds sueltos, herramientas como empresas, ni palabras aisladas.\n` +
              `- Si falta algo, usa [] o "No identificado".\n\n` +
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
  };

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      throw new Error("La petición a Gemini ha tardado demasiado y ha expirado.");
    }

    throw new Error(
      "No se pudo conectar con Gemini. Comprueba la API key, localhost o producción y bloqueos del navegador."
    );
  } finally {
    clearTimeout(timeoutId);
  }

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
}

function cleanFullName(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || "No identificado";
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((item) => String(item).replace(/\s+/g, " ").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "es"));
}

function cleanCompanies(value) {
  const bannedExact = new Set([
    "aws", "azure", "docker", "github", "linkedin", "python", "java", "scala",
    "english", "spanish", "french", "granada", "andalusia", "cambridge",
    "education", "experience", "projects", "knowledge", "languages",
    "cloud", "data", "science", "development", "implementation",
    "bachelor", "master", "msc", "bsc",
    "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
    "the", "this", "today"
  ]);

  const bannedContains = [
    "university", "universidad", "github", "linkedin", "project", "language",
    "skill", "personal information", "personal skills", "computer science",
    "data science", "artificial intelligence", "deep learning",
    "object oriented", "app services", "function apps"
  ];

  return normalizeList(value).filter((item) => {
    const lower = item.toLowerCase();

    if (lower.length < 2) return false;
    if (bannedExact.has(lower)) return false;
    if (bannedContains.some((chunk) => lower.includes(chunk))) return false;
    if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(lower)) {
      return false;
    }
    if (/^[A-Z]?[a-z]+(?:\s[A-Z]?[a-z]+){0,2}$/.test(item) && bannedLikelyNoise(item)) {
      return false;
    }

    return true;
  });
}

function bannedLikelyNoise(item) {
  const noiseWords = [
    "cloud", "data", "science", "development", "functional", "implementation",
    "associate", "lead", "engineer", "devops", "intern", "bachelor",
    "master", "doctor", "phone", "location"
  ];

  const lower = item.toLowerCase();
  return noiseWords.some((word) => lower.includes(word));
}

function cleanRoles(value) {
  const bannedContains = [
    "github", "linkedin", "language", "university", "project",
    "knowledge", "education", "phone", "location"
  ];

  return normalizeList(value).filter((item) => {
    const lower = item.toLowerCase();
    if (lower.length < 3) return false;
    if (bannedContains.some((chunk) => lower.includes(chunk))) return false;
    return true;
  });
}

function cleanTechnologies(value) {
  const bannedContains = [
    "linkedin", "github profile", "date of birth", "phone", "location",
    "english", "spanish", "french"
  ];

  return normalizeList(value).filter((item) => {
    const lower = item.toLowerCase();
    if (lower.length < 2) return false;
    if (bannedContains.some((chunk) => lower.includes(chunk))) return false;
    return true;
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

  const normalized = normalizeList(value);
  const result = [];

  for (const item of normalized) {
    const lower = item.toLowerCase();
    if (allowed.has(lower)) {
      result.push(allowed.get(lower));
    }
  }

  return [...new Set(result)];
}

function renderProfile(profile) {
  fullNameNode.textContent = profile.fullName;
  fillList(companiesNode, profile.companies);
  fillList(rolesNode, profile.roles);
  fillList(technologiesNode, profile.technologies);
  fillList(languagesNode, profile.languages);
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

function setStatus(message) {
  statusNode.textContent = message;
}