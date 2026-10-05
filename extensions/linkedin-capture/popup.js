const $=(id)=>document.getElementById(id);
function msg(text,type=""){ $("message").textContent=text; $("message").className=`message ${type}`.trim(); $("statusDot").className=`dot ${type==="success"?"ok":type==="error"?"error":type==="busy"?"busy":""}`.trim(); }
function fmt(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString("pt-BR")}
function val(id,v){$(id).value=v||""}
function renderAuth(auth){
  const paired=!!auth?.paired;
  $("pairCard").classList.toggle("hidden",paired);
  $("deviceCard").classList.toggle("hidden",!paired);
  $("captureBtn").disabled=!paired;
  if(paired){$("deviceLabel").textContent=auth.device_name||"Chrome pareado";$("deviceId").textContent=auth.device_id||"";}
}
function render(state){
  $("outboxCount").textContent=String(state.outbox_count||0);
  const busy=["capturing_person","capturing_company","saving"].includes(state.status); $("captureBtn").disabled=busy||!state.paired; $("saveBtn").disabled=busy||!state.payload;
  const text={capturing_person:"Capturando a pessoa…",capturing_company:"Pessoa capturada. Coletando a empresa…",saving:"Salvando no Pulse…",queued:"Captura preservada na fila local. Será reenviada automaticamente.",saved:"Salvo no Pulse e enfileirado para o Google Sheets.",error:state.error||"Falha na operação.",ready:"Pessoa e empresa capturadas. Revise antes de salvar."}[state.status];
  if(text)msg(text,state.status==="saved"||state.status==="queued"?"success":state.status==="error"?"error":busy?"busy":"success");
  if(state.status==="ready"&&state.warning)msg(`Captura pronta. ${state.warning}`,"success");
  if(state.payload){const p=state.payload.person,c=state.payload.company;$("previewCard").classList.remove("hidden");val("fullName",p.full_name);val("linkedinUrl",p.linkedin_url);val("location",p.location);val("currentTitle",p.current_title);val("currentCompany",p.current_company);$("capturedAt").textContent=`Capturado em ${fmt(p.captured_at)}`;$("jsonPreview").textContent=JSON.stringify(p.raw_json||{},null,2);val("companyName",c.company_name);val("companyWebsite",c.website);val("employeeCount",c.employee_count);val("companyDescription",c.description);$("companyCapturedAt").textContent=`Capturado em ${fmt(c.captured_at)}`;}
  if(state.quality){const q=$("quality");q.classList.remove("hidden","good","warn");q.classList.add(state.quality.score>=80?"good":"warn");q.textContent=`Qualidade ${state.quality.score}%${state.quality.missing_fields?.length?` · faltando: ${state.quality.missing_fields.join(", ")}`:" · captura completa"}`;}
}
async function send(m){const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw new Error(r?.error||"Falha na extensão.");return r}
async function refresh(){try{const a=await send({type:"GET_AUTH_STATE"});renderAuth(a);const s=await send({type:"GET_STATE"});s.paired=a.paired;render(s)}catch{}}
$("pairBtn").addEventListener("click",async()=>{try{const code=$("pairingCode").value.trim();if(!code)throw new Error("Digite o código de pareamento.");msg("Pareando este Chrome…","busy");const r=await send({type:"PAIR_DEVICE",pairingCode:code,deviceName:$("deviceName").value.trim()||"Chrome"});renderAuth(r);$("pairingCode").value="";msg("Dispositivo pareado com sucesso.","success");await refresh()}catch(e){msg(e.message,"error")}});
$("captureBtn").addEventListener("click",async()=>{try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw new Error("Aba ativa não encontrada.");msg("Iniciando captura…","busy");const r=await send({type:"START_CAPTURE",tabId:tab.id});r.paired=true;render(r);msg(r.warning||"Captura pronta para revisão.","success")}catch(e){msg(e.message,"error");await refresh()}});
$("saveBtn").addEventListener("click",async()=>{try{const overrides={person:{full_name:$("fullName").value.trim(),linkedin_url:$("linkedinUrl").value.trim(),location:$("location").value.trim(),current_title:$("currentTitle").value.trim(),current_company:$("currentCompany").value.trim()},company:{company_name:$("companyName").value.trim(),website:$("companyWebsite").value.trim(),employee_count:$("employeeCount").value.trim(),description:$("companyDescription").value.trim()}};const r=await send({type:"SAVE_CAPTURE",overrides});r.paired=true;render(r)}catch(e){msg(e.message,"error")}});
$("retryBtn").addEventListener("click",async()=>{try{const r=await send({type:"RETRY_OUTBOX"});msg(`Reenvio concluído: ${r.sent||0} enviados; ${r.remaining||0} pendentes.`,"success");await refresh()}catch(e){msg(e.message,"error")}});
$("saveSettingsBtn").addEventListener("click",async()=>{try{await send({type:"SET_SETTINGS",apiEndpoint:$("apiEndpoint").value});msg("Endpoint salvo.","success")}catch(e){msg(e.message,"error")}});
(async()=>{try{const s=await send({type:"GET_SETTINGS"});val("apiEndpoint",s.apiEndpoint);await refresh();setInterval(refresh,700)}catch(e){msg(e.message,"error")}})();
