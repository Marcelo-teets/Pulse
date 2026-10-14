import {getPool} from "../../../../lib/db";
import {requireUser} from "../../../../lib/auth";
export async function POST(request){
 const {user,response}=await requireUser();if(response)return response;
 if(user.role!=="master")return Response.json({error:"Forbidden"},{status:403});
 if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"Origin inválida"},{status:403});
 const db=getPool();if(!db)return Response.json({error:"Banco indisponível"},{status:503});
 try{
 const result=await db.query("WITH selected AS (SELECT id FROM public.linkedin_sheet_sync_queue WHERE status='error' ORDER BY next_attempt_at LIMIT 100 FOR UPDATE SKIP LOCKED) UPDATE public.linkedin_sheet_sync_queue q SET status='pending',next_attempt_at=NOW(),last_error=NULL FROM selected WHERE q.id=selected.id RETURNING q.id");
 return Response.json({ok:true,queued:result.rowCount,message:"Registros reenfileirados; o cron existente realiza o envio."});
 }catch(error){console.error("Retry enqueue failed",error);return Response.json({error:"Não foi possível reenfileirar."},{status:500});}
}
