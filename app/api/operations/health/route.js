import {getPool} from "../../../../lib/db";
import {requireUser} from "../../../../lib/auth";
import {inspectSheetsConnection} from "../../../../lib/sheets-health.js";
export const dynamic="force-dynamic";
export async function GET(){
 const {user,response}=await requireUser();if(response)return response;
 if(user.role!=="master")return Response.json({error:"Forbidden"},{status:403});
 const db=getPool();if(!db)return Response.json({error:"Banco indisponível"},{status:503});
 try{
 const r=await db.query("SELECT count(*) FILTER (WHERE status='error')::int errors,count(*) FILTER (WHERE status='processing' AND last_attempt_at<NOW()-INTERVAL '15 minutes')::int stalled,count(*) FILTER (WHERE status='pending')::int pending,max(synced_at) last_sync FROM public.linkedin_sheet_sync_queue");
 const d=await db.query("SELECT count(*) FILTER (WHERE revoked_at IS NULL AND extension_version IS DISTINCT FROM '0.9.2')::int unverified_devices FROM public.linkedin_devices");
 const sheets=await inspectSheetsConnection();
 const m=r.rows[0];const warnings=[];
 if(sheets.state!=="ready")warnings.push("Integração Google Sheets indisponível: "+sheets.state+". Fila vazia não significa sincronização ativa.");
 if(m.errors>0)warnings.push("Existem falhas na fila Google Sheets.");
 if(m.stalled>0)warnings.push("Existem processamentos potencialmente travados.");
 if(d.rows[0].unverified_devices>0)warnings.push("Existem dispositivos que ainda não reportaram v0.9.2.");
 return Response.json({connected:true,metrics:{...m,...d.rows[0]},sheets,warnings,observed_at:new Date().toISOString()});
 }catch(error){console.error("Health error",error);return Response.json({error:"Saúde operacional indisponível"},{status:500});}
}
