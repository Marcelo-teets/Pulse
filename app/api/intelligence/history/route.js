import {getPool} from "../../../../lib/db";
import {requireUser} from "../../../../lib/auth";
export const dynamic="force-dynamic";
export async function GET(request){
 const {user,response}=await requireUser();if(response)return response;
 const personId=String(new URL(request.url).searchParams.get("person_id")||"");
 if(!/^\d{1,18}$/.test(personId)||Number(personId)<=0)return Response.json({error:"person_id inválido"},{status:400});
 const db=getPool();if(!db)return Response.json({error:"Banco indisponível"},{status:503});
 try{
 const params=[personId];
 const scope=user.role==="master"?"":"AND EXISTS(SELECT 1 FROM public.pulse_user_people up WHERE up.person_id=e.person_id AND up.user_id=$2)";
 if(user.role!=="master")params.push(user.id);
 const res=await db.query("SELECT e.event_kind,e.previous_title,e.current_title,e.observed_at,p.company_name AS previous_company,c.company_name AS current_company FROM public.pulse_role_events e LEFT JOIN public.linkedin_companies p ON p.id=e.previous_company_id LEFT JOIN public.linkedin_companies c ON c.id=e.current_company_id WHERE e.person_id=$1 "+scope+" ORDER BY e.observed_at DESC LIMIT 100",params);
 return Response.json({items:res.rows,note:"Histórico das mudanças observadas pelo Pulse; não representa histórico integral do LinkedIn."});
 }catch(error){console.error("Role history failed",error);return Response.json({error:"Histórico indisponível"},{status:500});}
}
