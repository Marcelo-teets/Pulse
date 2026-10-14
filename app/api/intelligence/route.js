import {getPool} from "../../../lib/db";
import {requireUser} from "../../../lib/auth";
import {scoreCompany} from "../../../lib/dcm-fit.js";
export const dynamic="force-dynamic";
export async function GET(request){
 const {user,response}=await requireUser();if(response)return response;
 const db=getPool();if(!db)return Response.json({error:"Banco indisponível"},{status:503});
 const u=new URL(request.url);
 const q=String(u.searchParams.get("q")||"").trim().slice(0,100);
 const page=Math.min(10000,Math.max(1,Number.parseInt(u.searchParams.get("page")||"1",10)||1));
 const limit=50,offset=(page-1)*limit;
 const filters=[],params=[];
 if(q){params.push("%"+q+"%");filters.push("(c.company_name ILIKE $1 OR c.description ILIKE $1 OR c.website ILIKE $1)");}
 if(user.role!=="master"){params.push(user.id);filters.push("EXISTS(SELECT 1 FROM public.pulse_user_companies uc WHERE uc.company_id=c.id AND uc.user_id=$"+params.length+")");}
 const where=filters.length?"WHERE "+filters.join(" AND "):"";
 try{
 const [list,count]=await Promise.all([
   db.query("SELECT c.id::text,c.company_name,c.linkedin_url,c.description,c.website,c.employee_count,c.last_seen_at FROM public.linkedin_companies c "+where+" ORDER BY c.last_seen_at DESC LIMIT $"+(params.length+1)+" OFFSET $"+(params.length+2),[...params,limit,offset]),
   db.query("SELECT count(*)::int AS count FROM public.linkedin_companies c "+where,params)
 ]);
 return Response.json({items:list.rows.map(c=>({...c,fit:scoreCompany(c)})),total:count.rows[0]?.count||0,page,limit,score_scope:"Sinais textuais observados, não nota de risco de crédito"});
 }catch(error){console.error("Intelligence query failed",error);return Response.json({error:"Falha na inteligência comercial"},{status:500});}
}
