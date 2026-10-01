const DEFAULT_API_ENDPOINT = "https://br-delicate-glade-b46j1hyc-linkedin.compute.c-6.us-east-2.aws.neon.tech/";
const DEFAULT_API_TOKEN = "";

let capturedProfile = null;
let capturedCompany = null;

const $ = (id) => document.getElementById(id);
const message = $("message");
const statusDot = $("statusDot");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`.trim();
  statusDot.className = `dot ${type === "success" ? "ok" : type === "error" ? "error" : ""}`.trim();
}

function formatCapturedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function render(profile, company) {
  capturedProfile = profile;
  capturedCompany = company;
  $("previewCard").classList.remove("hidden");
  $("name").textContent = profile.full_name || "Nome não identificado";
  $("linkedinUrl").textContent = profile.linkedin_url || "URL não identificada";
  $("location").textContent = profile.location || "Localização não identificada";
  $("currentTitle").textContent = profile.current_title || "—";
  $("currentCompany").textContent = profile.current_company || "—";
  $("capturedAt").textContent = formatCapturedAt(profile.captured_at);
  $("jsonPreview").textContent = JSON.stringify(profile.raw_json || {}, null, 2);
  $("companyName").textContent = company?.company_name || profile.current_company || "—";
  $("companyWebsite").textContent = company?.website || "—";
  $("employeeCount").textContent = company?.employee_count || "—";
  $("companyCapturedAt").textContent = formatCapturedAt(company?.captured_at);
  $("companyDescription").textContent = company?.description || "Descrição não identificada";
  $("saveBtn").disabled = !(profile && company?.company_name);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getApiSettings() {
  const stored = await chrome.storage.local.get(["apiEndpoint", "apiToken"]);
  return {
    apiEndpoint: stored.apiEndpoint || DEFAULT_API_ENDPOINT,
    apiToken: stored.apiToken || DEFAULT_API_TOKEN
  };
}

function companyAboutUrl(companyUrl) {
  if (!companyUrl) return "";
  try {
    const url = new URL(companyUrl);
    const match = url.pathname.match(/^\/company\/[^/?#]+/i);
    if (!match) return "";
    url.pathname = `${match[0].replace(/\/$/, "")}/about/`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.status === "complete") return;
    await sleep(350);
  }
  throw new Error("A página da empresa demorou demais para carregar.");
}

async function extractCompanyFromLinkedIn(companyUrl, fallbackName) {
  const aboutUrl = companyAboutUrl(companyUrl);
  if (!aboutUrl) throw new Error("Não foi possível localizar a página da empresa atual no LinkedIn.");

  const tab = await chrome.tabs.create({ url: aboutUrl, active: false });
  try {
    await waitForTabComplete(tab.id);
    await sleep(1200);
    let response;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_COMPANY" });
        if (response?.ok && response?.company?.company_name) break;
      } catch {}
      await sleep(700);
    }
    if (!response?.ok) throw new Error(response?.error || "Não consegui extrair os dados da empresa.");
    return { ...response.company, company_name: response.company.company_name || fallbackName || "" };
  } finally {
    if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

$("captureBtn").addEventListener("click", async () => {
  try {
    $("captureBtn").disabled = true;
    $("saveBtn").disabled = true;
    setMessage("Capturando a pessoa…");
    const tab = await getActiveTab();
    if (!tab?.id || !/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\//i.test(tab.url || "")) {
      throw new Error("Abra um perfil do LinkedIn no formato linkedin.com/in/... antes de capturar.");
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PROFILE" });
    if (!response?.ok) throw new Error(response?.error || "O extrator não respondeu.");
    const profile = response.profile;
    const companyUrl = profile?._company_url;
    delete profile._company_url;
    setMessage("Pessoa capturada. Coletando os dados da empresa atual…");
    const company = await extractCompanyFromLinkedIn(companyUrl, profile.current_company);
    render(profile, company);
    setMessage("Pessoa e empresa capturadas. Revise e salve.", "success");
  } catch (error) {
    capturedProfile = null;
    capturedCompany = null;
    setMessage(error?.message || "Falha na captura.", "error");
  } finally {
    $("captureBtn").disabled = false;
  }
});

$("saveBtn").addEventListener("click", async () => {
  try {
    if (!capturedProfile || !capturedCompany) throw new Error("Capture a pessoa e a empresa primeiro.");
    const { apiEndpoint, apiToken } = await getApiSettings();
    if (!apiToken) throw new Error("Configure o token da API antes do primeiro uso.");
    $("saveBtn").disabled = true;
    setMessage("Salvando no Pulse…");
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-extension-token": apiToken },
      body: JSON.stringify({ person: capturedProfile, company: capturedCompany })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Falha na API (${response.status}).`);
    setMessage(`Salvo no Pulse. Pessoa #${payload.person_id}; empresa #${payload.company_id}. Google Sheets será sincronizado automaticamente.`, "success");
  } catch (error) {
    setMessage(error?.message || "Falha ao salvar.", "error");
  } finally {
    $("saveBtn").disabled = !(capturedProfile && capturedCompany);
  }
});

$("saveSettingsBtn").addEventListener("click", async () => {
  const apiEndpoint = $("apiEndpoint").value.trim() || DEFAULT_API_ENDPOINT;
  const apiToken = $("apiToken").value.trim();
  await chrome.storage.local.set({ apiEndpoint, apiToken });
  $("apiEndpoint").value = apiEndpoint;
  $("apiToken").value = apiToken;
  setMessage("Configuração salva.", "success");
});

(async () => {
  const settings = await getApiSettings();
  $("apiEndpoint").value = settings.apiEndpoint;
  $("apiToken").value = settings.apiToken;
})();
