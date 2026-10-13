import { requireUser } from "../../../lib/auth";
import { getPool } from "../../../lib/db";
import { companySignals, safeCsv } from "../../../lib/pulse-intelligence.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const db = getPool();
  if (!db) return Response.json({ error: "Banco indisponível" }, { status: 503 });
  const query = new URL(request.url).searchParams;
  const type = query.get("type");
  if (!["people", "companies"].includes(type)) return Response.json({ error: "Exportação inválida." }, { status: 400 });
  const q = String(query.get("q") || "").trim().slice(0, 200);
  const role = String(query.get("role") || "").trim().slice(0, 100);
  const location = String(query.get("location") || "").trim().slice(0, 100);
  const company = String(query.get("company") || "").trim().slice(0, 100);
  const params = [];
  const filters = [];
  try {
    let sql;
    let cols;
    if (type === "people") {
      if (q) { params.push("%" + q + "%"); filters.push("(p.full_name ILIKE $" + params.length + " OR p.current_title ILIKE $" + params.length + " OR p.current_company ILIKE $" + params.length + ")"); }
      if (role) { params.push("%" + role + "%"); filters.push("p.current_title ILIKE $" + params.length); }
      if (location) { params.push("%" + location + "%"); filters.push("p.location ILIKE $" + params.length); }
      if (company) { params.push("%" + company + "%"); filters.push("co.company_name ILIKE $" + params.length); }
      if (user.role !== "master") { params.push(user.id); filters.push("EXISTS (SELECT 1 FROM public.pulse_user_people up WHERE up.person_id=p.id AND up.user_id=$" + params.length + "::bigint)"); }
      sql = "SELECT p.full_name, p.linkedin_url, p.location, p.current_title, p.current_company," +
        " co.company_name, co.website, p.last_seen_at" +
        " FROM public.linkedin_people p LEFT JOIN public.linkedin_current_roles r ON r.person_id=p.id" +
        " LEFT JOIN public.linkedin_companies co ON co.id=r.company_id";
      cols = [["full_name","Nome"],["linkedin_url","LinkedIn"],["current_title","Cargo"],["current_company","Empresa observada"],["company_name","Empresa canônica"],["location","Localização"],["website","Site"],["last_seen_at","Última captura"]];
    } else {
      if (q) { params.push("%" + q + "%"); filters.push("(c.company_name ILIKE $" + params.length + " OR c.description ILIKE $" + params.length + " OR c.website ILIKE $" + params.length + ")"); }
      if (user.role !== "master") { params.push(user.id); filters.push("EXISTS (SELECT 1 FROM public.pulse_user_companies uc WHERE uc.company_id=c.id AND uc.user_id=$" + params.length + "::bigint)"); }
      sql = "SELECT c.company_name,c.linkedin_url,c.description,c.website,c.employee_count,c.last_seen_at FROM public.linkedin_companies c";
      cols = [["company_name","Empresa"],["linkedin_url","LinkedIn"],["description","Descrição"],["website","Site"],["employee_count","Funcionários"],["signal_score","Score de sinais"],["signal_label","Classificação"],["last_seen_at","Última captura"]];
    }
    const result = await db.query(sql + (filters.length ? " WHERE " + filters.join(" AND ") : "") +
      " ORDER BY " + (type === "people" ? "p.last_seen_at" : "c.last_seen_at") + " DESC LIMIT 5000", params);
    const rows = type === "companies"
      ? result.rows.map((row) => { const signals = companySignals(row); return { ...row, signal_score: signals.score, signal_label: signals.label }; })
      : result.rows;
    const content = safeCsv(rows, cols.map(([key,label]) => ({ key,label })));
    return new Response(content, { headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=pulse-" + type + ".csv",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    } });
  } catch (error) {
    console.error("CSV export failed", error);
    return Response.json({ error: "Falha ao exportar dados." }, { status: 500 });
  }
}
