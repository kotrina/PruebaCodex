import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";

const fileInput = document.getElementById("cvFile");
const fileMeta = document.getElementById("fileMeta");
const statusNode = document.getElementById("status");
const outputNode = document.getElementById("output");
const fullNameNode = document.getElementById("fullName");

const companiesNode = document.getElementById("companies");
const rolesNode = document.getElementById("roles");
const technologiesNode = document.getElementById("technologies");
const languagesNode = document.getElementById("languages");

const ROLE_KEYWORDS = [
  "frontend", "backend", "full stack", "devops", "data engineer", "data scientist", "qa", "sre",
  "arquitecto", "ingeniero", "developer", "desarrollador", "tech lead", "cto", "product manager"
];

const TECH_KEYWORDS = [
  "javascript", "typescript", "python", "java", "c#", "c++", "go", "rust", "php", "ruby", "kotlin",
  "swift", "react", "angular", "vue", "node", "express", "nestjs", "django", "flask", "spring",
  "laravel", "docker", "kubernetes", "aws", "azure", "gcp", "postgresql", "mysql", "mongodb",
  "redis", "graphql", "rest", "terraform", "ansible", "git", "linux", "html", "css"
];

const LANGUAGE_KEYWORDS = [
  "español", "inglés", "francés", "alemán", "italiano", "portugués", "catalán", "valenciano"
];

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  fileMeta.textContent = `${file.name} • ${(file.size / 1024).toFixed(1)} KB`;
  setStatus("Procesando archivo...");
  outputNode.classList.add("hidden");

  try {
    const text = await extractText(file);
    if (!text.trim()) {
      throw new Error("No se pudo extraer texto del archivo.");
    }

    const profile = extractProfile(text);
    renderProfile(profile);
    setStatus("Análisis completado.");
    outputNode.classList.remove("hidden");
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
});

async function extractText(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return extractTextFromPdf(file);
  }

  if (extension === "docx") {
    return extractTextFromDocx(file);
  }

  if (extension === "doc") {
    throw new Error("El formato .doc no es compatible. Convierte el archivo a DOCX o PDF.");
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

function extractProfile(text) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    fullName: findName(lines),
    companies: unique(findCompanies(lines)),
    roles: unique(findByKeywords(normalizedText, ROLE_KEYWORDS)),
    technologies: unique(findByKeywords(normalizedText, TECH_KEYWORDS)),
    languages: unique(findByKeywords(normalizedText, LANGUAGE_KEYWORDS))
  };
}

function findName(lines) {
  const nameCandidate = lines.find(
    (line) =>
      /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?$/.test(line)
  );
  return nameCandidate ?? "No identificado";
}

function findCompanies(lines) {
  const indicators = ["empresa", "company", "experiencia", "trabajé", "trabaje", "cliente"];
  const companyRegex = /\b(?:[A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,3})\b/g;

  const scoped = lines.filter((line) =>
    indicators.some((indicator) => line.toLowerCase().includes(indicator))
  );

  const matches = scoped.flatMap((line) => line.match(companyRegex) ?? []);
  return matches.filter((name) => name.length > 2);
}

function findByKeywords(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword));
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "es"));
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
