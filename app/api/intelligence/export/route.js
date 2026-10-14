import {getPool} from "../../../../lib/db";
import {requireUser} from "../../../../lib/auth";
import {csvDocument} from "../../../../lib/csv-safe.js";
import {scoreCompany} from "../../../../lib/dcm-fit.js";
export const dynamic="force-dynamic";
export async function GET(request){
 const {user,response}=await requireUser();if(response)return response;
 const db=getPool();if(!db)return Response.json({error:"Banco indisponível"},{status:503});
 const type=new URL(request.url).searchParams.get("type");
 if(!["people","companies"].includes(type))return Response.json({error:"Tipo inválido"},{status:400});
 try{
 let head,rows;
 if(type==="people"){
 const param=user.role==="master"?[]:[user.id];
 const where=user.role==="master"?"":"WHERE EXISTS(SELECT 1 FROM public.pulse_user_people up WHERE up.person_id=p.id AND up.user_id=$1)";
 const res=await db.query("SELECT p.full_name,p.linkedin_url,p.current_title,p.current_company,p.location,p.last_seen_at FROM public.linkedin_people p "+where+" ORDER BY p.last_seen_at DESC LIMIT 2000",param);
 head=["Nome","LinkedIn","Cargo","Empresa atual","Localização","Última captura"];
 rows=res.rows.map(r=>[r.full_name,r.linkedin_url,r.current_title,r.current_company,r.location,r.last_seen_at?.toISOString?.()||r.last_seen_at]);
 }else{
 const param=user.role==="master"?[]:[user.id];
 const where=user.role==="master"?"":"WHERE EXISTS(SELECT 1 FROM public.pulse_user_companies uc WHERE uc.company_id=c.id AND uc.user_id=$1)";
 const res=await db.query("SELECT c.company_name,c.linkedin_url,c.website,c.description,c.employee_count,c.last_seen_at FROM public.linkedin_companies c "+where+" ORDER BY c.last_seen_at DESC LIMIT 2000",param);
 head=["Empresa","LinkedIn","Site","Descrição","Funcionários","Fit DCM indicativo","Score de sinais","Última captura"];
 rows=res.rows.map(r=>[r.company_name,r.linkedin_url,r.website,r.description,r.employee_count,scoreCompany(r).fit,scoreCompany(r).score,r.last_seen_at?.toISOString?.()||r.last_seen_at]);
 }
 return new Response(csvDocument(head,rows),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=pulse-"+type+".csv","cache-control":"no-store","x-content-type-options":"nosniff"}});
 }catch(error){console.error("Export failed",error);return Response.json({error:"Falha na exportação."},{status:500});}
}
