"use client";
import {useEffect,useState} from "react";
import PageShell from "../../components/PageShell";
export default function HistoricoPage(){
 const [data,setData]=useState({items:[],note:""}),[message,setMessage]=useState("Carregando...");
 useEffect(()=>{
  const id=new URLSearchParams(window.location.search).get("person_id");
  if(!id || !/^\d+$/.test(id)){setMessage("ID de pessoa inválido.");return;}
  fetch("/api/intelligence/history?person_id="+encodeURIComponent(id),{cache:"no-store"}).then(async response=>{
   if(response.status===401){window.location.href="/auth";return;}
   const value=await response.json();if(!response.ok)throw Error(value.error||"Falha na consulta");
   setData(value);setMessage("");
  }).catch(error=>setMessage(error.message));
 },[]);
 return <PageShell title="Histórico profissional">
  <section className="section-intro"><div><p className="eyebrow">OBSERVAÇÕES DO PULSE</p><h2>Mudanças de cargo e empresa</h2><p>Somente eventos identificados após o início do acompanhamento; não é um currículo integral.</p></div><a href="/pessoas" className="ghost-button">Voltar a pessoas</a></section>
  <article className="panel"><div className="table-wrap"><table><thead><tr><th>Data observada</th><th>Evento</th><th>Empresa anterior</th><th>Empresa atual</th><th>Cargo anterior</th><th>Cargo atual</th></tr></thead><tbody>
   {data.items.length?data.items.map((r,i)=><tr key={i}><td>{r.observed_at?new Date(r.observed_at).toLocaleString("pt-BR"):"—"}</td><td>{r.event_kind==="changed"?"Mudança":"Primeira observação"}</td><td>{r.previous_company||"—"}</td><td>{r.current_company||"—"}</td><td>{r.previous_title||"—"}</td><td>{r.current_title||"—"}</td></tr>)
   :<tr><td colSpan={6}>{message||"Nenhum evento de mudança registrado."}</td></tr>}
  </tbody></table></div></article>
 </PageShell>;
}
