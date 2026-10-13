"use client";
import {useCallback,useEffect,useState} from "react";
import PageShell from "../components/PageShell";
const LABELS={full_name:"Nome",linkedin_url:"URL da pessoa",location:"Localização",current_title:"Cargo atual",current_company:"Empresa no perfil",company_name:"Nome da empresa",company_linkedin_url:"URL da empresa",description:"Descrição",website:"Site",employee_count:"Nº funcionários"};
export default function QualityPage(){
 const [data,setData]=useState({items:[],fields:[],stats:{fields:{},profiles_reviewed:0},connected:true});
 const [selected,setSelected]=useState("");
 const [field,setField]=useState("full_name");
 const [verdict,setVerdict]=useState("correct");
 const [expected,setExpected]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);
  try{const r=await fetch("/api/quality",{cache:"no-store"});if(r.status===401){window.location.href="/auth";return;}
   const json=await r.json();if(!r.ok)throw Error(json.error||"Falha na consulta");
   setData(json);setSelected(old=>json.items.some(x=>x.capture_id===old)?old:json.items[0]?.capture_id||"");
  }catch(e){setMessage(e.message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{load()},[load]);
 const current=data.items.find(x=>x.capture_id===selected);
 async function save(event){
  event.preventDefault();if(!current)return;setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/quality",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({capture_id:selected,field_key:field,verdict,expected_value:expected})});
   const result=await r.json();if(!r.ok)throw Error(result.error||"Falha ao salvar");
   setExpected("");setMessage("Revisão registrada. A captura original não foi alterada.");await load();
  }catch(e){setMessage(e.message);}finally{setBusy(false);}
 }
 const stats=data.stats||{};
 return <PageShell title="Qualidade de captura">
  <section className="section-intro"><div><p className="eyebrow">HOMOLOGAÇÃO — V0.9.2</p><h2>Precisão auditada por campo</h2><p>Compare com o LinkedIn autenticado e registre a verdade observada. Testes sintéticos não entram nesta métrica.</p></div><div className="big-counter"><span>Perfis revisados</span><strong>{stats.profiles_reviewed||0} / 30–50</strong></div></section>
  <article className="panel" style={{padding:20,marginBottom:20}}>
   <h3>{stats.homologated?"Critérios quantitativos aprovados":"Homologação pendente"}</h3>
   <p>{stats.homologated?"As métricas por campo passaram. Ainda são necessários os testes end-to-end de produção.":"Requer 30–50 perfis reais, quatro campos críticos revisados e precisão mínima de 98% por campo crítico."}</p>
   <div className="table-wrap"><table><thead><tr><th>Campo</th><th>Corretos</th><th>Incorretos</th><th>Indeterminados</th><th>Precisão observada</th></tr></thead><tbody>
   {(data.fields||Object.keys(LABELS)).map(key=>{const m=stats.fields?.[key]||{};return <tr key={key}><td>{LABELS[key]}</td><td>{m.correct||0}</td><td>{m.incorrect||0}</td><td>{m.unknown||0}</td><td>{m.precision===null||m.precision===undefined?"Sem amostra":m.precision+"%"}</td></tr>})}
   </tbody></table></div>
  </article>
  <article className="panel" style={{padding:20}}>
   <h3>Revisão manual de evidências</h3><p>A pessoa e a empresa devem ser conferidas nas páginas correspondentes. Use “Não verificável” quando o campo não estiver visível.</p>
   <label style={{display:"block",marginBottom:12}}>Captura
    <select style={{display:"block",width:"100%",padding:12,marginTop:6}} value={selected} onChange={e=>setSelected(e.target.value)}>
     {data.items.map(p=><option key={p.capture_id} value={p.capture_id}>{p.full_name} — {p.current_company} — {p.capture_id}</option>)}
    </select>
   </label>
   {current?<><p><a href={current.linkedin_url} target="_blank" rel="noreferrer">Abrir perfil original ↗</a>{current.company_linkedin_url?<> · <a href={current.company_linkedin_url} target="_blank" rel="noreferrer">Abrir empresa ↗</a></>:null}</p>
   <p>Indicador de evidência: <b>{current.evidence?.evidence_score??"—"}/100</b> (completude, não precisão).</p>
   {current.evidence?.flags?.length>0&&<p>Atenção: {current.evidence.flags.join(", ")}</p>}
   <form onSubmit={save}>
    <label>Campo a revisar<select style={{display:"block",width:"100%",padding:12,marginTop:6,marginBottom:12}} value={field} onChange={e=>{setField(e.target.value);setExpected("");}}>
     {(data.fields||[]).map(key=><option key={key} value={key}>{LABELS[key]}</option>)}
    </select></label>
    <p>Valor capturado: <b>{current[field]||"— (não preenchido)"}</b>. Registro atual: <b>{current.reviews?.[field]?.verdict||"não avaliado"}</b>.</p>
    <label>Comparação com a fonte<select style={{display:"block",width:"100%",padding:12,marginTop:6,marginBottom:12}} value={verdict} onChange={e=>setVerdict(e.target.value)}>
     <option value="correct">Correto</option><option value="incorrect">Incorreto</option><option value="unknown">Não verificável</option>
    </select></label>
    {verdict==="incorrect"&&<label>Valor correto conforme evidência<input required maxLength={1000} value={expected} onChange={e=>setExpected(e.target.value)} style={{display:"block",width:"100%",padding:12,marginTop:6,marginBottom:12}} placeholder="Digite o valor visualizado na página"/></label>}
    <button type="submit" className="primary-button" disabled={busy||loading}>{busy?"Registrando...":"Registrar revisão"}</button>
   </form></>:<p>{loading?"Carregando capturas...":"Nenhuma captura disponível. É necessário coletar perfis reais primeiro."}</p>}
   {message&&<p role="status">{message}</p>}
  </article>
 </PageShell>;
}
