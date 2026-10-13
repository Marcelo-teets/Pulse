"use client";
import {useCallback,useEffect,useState} from "react";
import PageShell from "../components/PageShell";
const labels={potencial_alto:"Potencial alto",investigar:"Investigar",sem_evidencia_suficiente:"Sem evidência suficiente"};
export default function IntelligencePage(){
 const [q,setQ]=useState(""),[page,setPage]=useState(1),[data,setData]=useState({items:[],total:0}),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
 const load=useCallback(async(term="",p=1)=>{
  setLoading(true);try{const r=await fetch("/api/intelligence?q="+encodeURIComponent(term)+"&page="+p,{cache:"no-store"});
   if(r.status===401){window.location.href="/auth";return;}
   const json=await r.json();if(!r.ok)throw Error(json.error||"Falha");setData(json);setPage(p);setMessage("");
  }catch(e){setMessage(e.message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{load()},[load]);
 return <PageShell title="Inteligência comercial" actions={<a className="ghost-button" href="/api/intelligence/export?type=companies">Exportar empresas CSV</a>}>
  <section className="section-intro"><div><p className="eyebrow">DCM — SINAIS COMERCIAIS</p><h2>Oportunidades por evidência</h2><p>Score indicativo baseado em informações públicas capturadas, sem presumir funding, recebíveis elegíveis ou rating de crédito.</p></div><div className="big-counter"><span>Empresas</span><strong>{data.total||0}</strong></div></section>
  <article className="panel"><div className="panel-header"><h3>Explorar empresas</h3><form className="search-box wide" onSubmit={e=>{e.preventDefault();load(q,1)}}>
   <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Empresa, setor, descrição ou site"/><button className="ghost-button" type="submit">Buscar</button>
  </form></div><div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Fit</th><th>Score de sinais</th><th>Evidências</th><th>Site</th></tr></thead>
  <tbody>{data.items.length?data.items.map(c=><tr key={c.id}>
   <td><b>{c.company_name}</b><small>{c.employee_count||"Funcionários não informados"}</small></td>
   <td>{labels[c.fit.fit]}</td><td><strong>{c.fit.score}/100</strong></td>
   <td>{c.fit.signals.length?c.fit.signals.map(x=>x.label).join(" · "):"Sem sinais suficientes"}</td>
   <td>{c.website?<a href={c.website} target="_blank" rel="noreferrer">Site ↗</a>:"—"}</td>
  </tr>):<tr><td colSpan={5}>{loading?"Carregando...":"Nenhuma empresa encontrada."}</td></tr>}</tbody></table></div>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:16}}>
   <button className="ghost-button" type="button" disabled={loading||page<=1} onClick={()=>load(q,page-1)}>Anterior</button>
   <span>Página {page} de {Math.max(1,Math.ceil((data.total||0)/50))}</span>
   <button className="ghost-button" type="button" disabled={loading||page*50>=data.total} onClick={()=>load(q,page+1)}>Próxima</button>
  </div></article>
  {message&&<p role="status">{message}</p>}
  <p style={{marginTop:12}}>A pontuação ajuda a pesquisar empresas. A qualificação efetiva exige validação do modelo de recebíveis, volumes, prazos, carteira e estrutura.</p>
 </PageShell>;
}
