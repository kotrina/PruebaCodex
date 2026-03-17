import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";

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

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  const apiKey = apiKeyInput.value.trim();

  if (!file) {
    return;
  }

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

    setStatus("Analizando CV con Gemini...");
    const profile = await extractProfileWithGemini(text, apiKey);

    renderProfile(profile);
    setStatus("Análisis completado.");
    outputNode.classList.remove("hidden");
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    outputNode.classList.add("hidden");
  }
});

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

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    pages.push(pageText);
  }

  return pages.join("\n");
}

async function extractTextFromDocx(file) {
  if (!window.mammoth) {
    throw new Error("La librería para leer DOCX no está disponible.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value;
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

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "Eres un parser de CVs tech. Extrae entidades con precisión y responde solo JSON válido según el esquema."
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `Extrae esta información del CV: nombre y apellidos, empresas donde trabajó, roles, tecnologías e idiomas.\n` +
                `Si algo no aparece, devuelve [] para listas y 'No identificado' para fullName.\n\nCV:\n${cvText}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`No se pudo consultar Gemini (${response.status}). ${errorText}`);
  }

  const payload = await response.json();
  const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!raw) {
    throw new Error("Gemini no devolvió contenido parseable.");
  }

  const parsed = JSON.parse(raw);

  return {
    fullName: parsed.fullName || "No identificado",
    companies: normalizeList(parsed.companies),
    roles: normalizeList(parsed.roles),
    technologies: normalizeList(parsed.technologies),
    languages: normalizeList(parsed.languages)
  };
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
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
