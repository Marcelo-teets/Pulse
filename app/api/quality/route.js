import { getPool } from "../../../lib/db";
import { requireUser } from "../../../lib/auth";
import { computeQuality,evidenceFlags,REVIEW_FIELDS } from "../../../lib/quality-core.js";
import { canonicalPersonUrl } from "../../../lib/linkedin-identity.js";
export const dynamic="force-dynamic";
export async function GET() {
 const {user,response}=await requireUser(); if(response)return response;
 if(user.role!=="master")return Response.json({error:"Apenas master pode revisar capturas."},{status:403});
 const db=getPool(); if(!db)return Response.json({error:"Banco não configurado."},{status:503});
 try {
  const [captures,reviews]=await Promise.all([
   db.query("SELECT p.id::text AS capture_id,p.full_name,p.linkedin_url,p.location,p.current_title,p.current_company,p.captured_at,c.company_name,c.linkedin_url AS company_linkedin_url,c.description,c.website,c.employee_count FROM public.linkedin_profile_captures p LEFT JOIN public.linkedin_company_captures c ON c.person_capture_id=p.id ORDER BY p.captured_at DESC LIMIT 50"),
   db.query("SELECT r.capture_id::text,r.field_key,r.verdict,r.expected_value,r.reviewed_at,p.linkedin_url AS profile_key FROM public.pulse_capture_reviews r JOIN public.linkedin_profile_captures p ON p.id=r.capture_id ORDER BY r.reviewed_at DESC LIMIT 5000")
  ]);
  const reviewedIdentities=new Set();
  const metricRows=reviews.rows.filter(r=>{
   const identity=canonicalPersonUrl(r.profile_key)||String(r.profile_key||r.capture_id);
   if(!reviewedIdentities.has(identity)&&reviewedIdentities.size>=50)return false;
   reviewedIdentities.add(identity);return true;
  });
  const items=captures.rows.map(p=>({ ...p, evidence:evidenceFlags(p,{company_name:p.company_name,linkedin_url:p.company_linkedin_url,description:p.description,website:p.website,employee_count:p.employee_count}),
   reviews:Object.fromEntries(metricRows.filter(r=>r.capture_id===p.capture_id).map(r=>[r.field_key,{verdict:r.verdict,expected_value:r.expected_value}])) }));
  return Response.json({connected:true,items,stats:computeQuality(metricRows),fields:REVIEW_FIELDS});
 }catch(error){console.error("Quality read failed",error);return Response.json({error:"Erro de consulta da qualidade."},{status:500});}
}
export async function POST(request){
 const {user,response}=await requireUser();if(response)return response;
 if(user.role!=="master")return Response.json({error:"Forbidden"},{status:403});
 if(!request.headers.get("content-type")?.startsWith("application/json"))return Response.json({error:"JSON obrigatório"},{status:415});
 const origin=request.headers.get("origin");
 if(origin && origin!==new URL(request.url).origin)return Response.json({error:"Origin inválida"},{status:403});
 const input=await request.json().catch(()=>null);
 const field=String(input?.field_key||""),verdict=String(input?.verdict||"");
 const captureId=String(input?.capture_id||"");
 const expected=String(input?.expected_value||"").trim().slice(0,1000);
 if(!REVIEW_FIELDS.includes(field)||!["correct","incorrect","unknown"].includes(verdict)||!/^\d{1,18}$/.test(captureId)||Number(captureId)<=0)
  return Response.json({error:"Revisão inválida"},{status:400});
 if(verdict==="incorrect"&&!expected)return Response.json({error:"Informe o valor correto encontrado na página."},{status:400});
 const db=getPool();if(!db)return Response.json({error:"Banco indisponível"},{status:503});
 try{
  const result=await db.query("INSERT INTO public.pulse_capture_reviews(capture_id,field_key,verdict,expected_value,reviewer_id) SELECT p.id,$2,$3,$4,$5 FROM public.linkedin_profile_captures p WHERE p.id=$1::bigint ON CONFLICT(capture_id,field_key) DO UPDATE SET verdict=EXCLUDED.verdict,expected_value=EXCLUDED.expected_value,reviewer_id=EXCLUDED.reviewer_id,reviewed_at=NOW() RETURNING capture_id", [captureId,field,verdict,expected||null,user.id]);
  if(!result.rowCount)return Response.json({error:"Captura não encontrada"},{status:404});
  return Response.json({ok:true});
 }catch(error){console.error("Review write failed",error);return Response.json({error:"Falha ao registrar revisão."},{status:500});}
}
