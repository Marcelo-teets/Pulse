import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.TEST_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/pulse_test";
const db = new Pool({ connectionString, max: 8 });

async function apply(path) {
  const sql = fs.readFileSync(path, "utf8");
  await db.query(sql);
}

try {
  await apply("migrations/001_linkedin_capture.sql");
  await apply("migrations/002_linkedin_capture_hardening.sql");
  await apply("migrations/003_multi_user_auth.sql");
  await apply("migrations/004_company_linkedin_identity.sql");
  await apply("migrations/005_login_rate_limit.sql");

  // Simulate separate serverless cold starts initializing the same schema concurrently.
  const schemaA = await import("../lib/schema.js?instance=a");
  const schemaB = await import("../lib/schema.js?instance=b");
  await Promise.all([schemaA.ensureSchema(db), schemaB.ensureSchema(db)]);

  const expectedTables = [
    "linkedin_profile_captures","linkedin_company_captures","linkedin_sheet_sync_queue",
    "linkedin_people","linkedin_companies","linkedin_current_roles","linkedin_devices",
    "linkedin_pairing_codes","linkedin_api_audit","pulse_users","pulse_sessions",
    "pulse_user_people","pulse_user_companies","pulse_schema_meta","pulse_login_attempts"
  ];
  const tables = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
  );
  const tableNames = new Set(tables.rows.map((r) => r.table_name));
  for (const name of expectedTables) assert.ok(tableNames.has(name), `missing table ${name}`);

  const views = await db.query(
    "SELECT table_name FROM information_schema.views WHERE table_schema='public'"
  );
  const viewNames = new Set(views.rows.map((r) => r.table_name));
  for (const name of ["linkedin_device_status","linkedin_api_audit_safe","linkedin_ops_summary","linkedin_canonical_contacts","linkedin_sheet_sync_payload"]) {
    assert.ok(viewNames.has(name), `missing view ${name}`);
  }

  const users = await db.query(`
    INSERT INTO public.pulse_users(email,full_name,password_hash,role)
    VALUES
      ('u1@example.com','User One','x','user'),
      ('u2@example.com','User Two','x','user'),
      ('master@example.com','Master','x','master')
    RETURNING id,email,role
  `);
  const u1 = users.rows.find((r) => r.email === "u1@example.com").id;
  const u2 = users.rows.find((r) => r.email === "u2@example.com").id;

  const p1 = await db.query(`
    INSERT INTO public.linkedin_profile_captures(request_id,full_name,linkedin_url,location,current_title,current_company,captured_at,raw_json,owner_user_id)
    VALUES ('00000000-0000-4000-8000-000000000001','Pessoa Um','https://www.linkedin.com/in/pessoa-um','SP','CFO','Empresa QA',NOW(),'{}',$1)
    RETURNING id
  `, [u1]);
  const pc1 = p1.rows[0].id;
  const c1 = await db.query(`
    INSERT INTO public.linkedin_company_captures(request_id,person_capture_id,company_name,description,website,employee_count,captured_at,owner_user_id)
    VALUES ('00000000-0000-4000-8000-000000000001',$1,'Empresa QA','Descrição QA','https://example.com','11-50',NOW(),$2)
    RETURNING id
  `, [pc1,u1]);
  const cc1 = c1.rows[0].id;

  const p2 = await db.query(`
    INSERT INTO public.linkedin_profile_captures(request_id,full_name,linkedin_url,location,current_title,current_company,captured_at,raw_json,owner_user_id)
    VALUES ('00000000-0000-4000-8000-000000000002','Pessoa Dois','https://www.linkedin.com/in/pessoa-dois','RJ','CEO','Empresa QA',NOW(),'{}',$1)
    RETURNING id
  `, [u2]);
  const pc2 = p2.rows[0].id;
  const c2 = await db.query(`
    INSERT INTO public.linkedin_company_captures(request_id,person_capture_id,company_name,description,website,employee_count,captured_at,owner_user_id)
    VALUES ('00000000-0000-4000-8000-000000000002',$1,'Empresa QA','Descrição QA','https://example.com','11-50',NOW(),$2)
    RETURNING id
  `, [pc2,u2]);

  // Queue trigger must create exactly one item per company capture.
  const queue = await db.query("SELECT person_capture_id,company_capture_id,status FROM public.linkedin_sheet_sync_queue ORDER BY id");
  assert.equal(queue.rowCount, 2);
  assert.ok(queue.rows.every((r) => r.status === "pending"));

  const cp1 = await db.query(`
    INSERT INTO public.linkedin_people(linkedin_url,full_name,location,current_title,current_company,last_capture_id,owner_user_id)
    VALUES ('https://www.linkedin.com/in/pessoa-um','Pessoa Um','SP','CFO','Empresa QA',$1,$2)
    RETURNING id
  `, [pc1,u1]);
  const cp2 = await db.query(`
    INSERT INTO public.linkedin_people(linkedin_url,full_name,location,current_title,current_company,last_capture_id,owner_user_id)
    VALUES ('https://www.linkedin.com/in/pessoa-dois','Pessoa Dois','RJ','CEO','Empresa QA',$1,$2)
    RETURNING id
  `, [pc2,u2]);

  const company = await db.query(`
    INSERT INTO public.linkedin_companies(company_key,company_name,description,website,employee_count,last_capture_id,owner_user_id)
    VALUES ('qa-company','Empresa QA','Descrição QA','https://example.com','11-50',$1,$2)
    RETURNING id
  `, [cc1,u1]);
  const companyId = company.rows[0].id;

  await db.query(`
    INSERT INTO public.linkedin_current_roles(person_id,company_id,current_title) VALUES
      ($1,$3,'CFO'),($2,$3,'CEO')
  `, [cp1.rows[0].id,cp2.rows[0].id,companyId]);
  await db.query(`
    INSERT INTO public.pulse_user_people(user_id,person_id) VALUES ($1,$2),($3,$4)
  `, [u1,cp1.rows[0].id,u2,cp2.rows[0].id]);
  await db.query(`
    INSERT INTO public.pulse_user_companies(user_id,company_id) VALUES ($1,$3),($2,$3)
  `, [u1,u2,companyId]);

  const scopedCount = await db.query(`
    SELECT count(r.person_id) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.pulse_user_people up
      WHERE up.person_id=r.person_id AND up.user_id=$1
    ))::int AS people_count
    FROM public.linkedin_companies c
    LEFT JOIN public.linkedin_current_roles r ON r.company_id=c.id
    WHERE c.id=$2
    GROUP BY c.id
  `, [u1,companyId]);
  assert.equal(scopedCount.rows[0].people_count, 1);

  const masterCount = await db.query(`
    SELECT count(r.person_id)::int AS people_count
    FROM public.linkedin_companies c
    LEFT JOIN public.linkedin_current_roles r ON r.company_id=c.id
    WHERE c.id=$1
    GROUP BY c.id
  `, [companyId]);
  assert.equal(masterCount.rows[0].people_count, 2);

  await db.query(`
    INSERT INTO public.linkedin_devices(device_id,device_name,token_hash,extension_version,owner_user_id,token_expires_at)
    VALUES ('qa-device','QA Chrome','qa-hash','0.8.9',$1,NOW()+INTERVAL '90 days')
  `, [u1]);
  await db.query(`
    INSERT INTO public.linkedin_api_audit(event_type,device_id,request_id,extension_version,success,http_status,details)
    VALUES ('capture_saved','qa-device','00000000-0000-4000-8000-000000000001','0.8.9',true,201,'{"quality_score":100}')
  `);

  const deviceView = await db.query("SELECT status,owner_user_id FROM public.linkedin_device_status WHERE device_id='qa-device'");
  assert.equal(deviceView.rows[0].status, "active");
  assert.equal(String(deviceView.rows[0].owner_user_id), String(u1));

  const auditView = await db.query("SELECT owner_user_id,success,http_status FROM public.linkedin_api_audit_safe WHERE device_id='qa-device'");
  assert.equal(String(auditView.rows[0].owner_user_id), String(u1));
  assert.equal(auditView.rows[0].success, true);
  assert.equal(auditView.rows[0].http_status, 201);

  const ops = await db.query("SELECT * FROM public.linkedin_ops_summary");
  assert.equal(Number(ops.rows[0].unique_people), 2);
  assert.equal(Number(ops.rows[0].unique_companies), 1);
  assert.equal(Number(ops.rows[0].active_devices), 1);

  // Schema initialization must remain safe after data already exists.
  const schemaC = await import("../lib/schema.js?instance=c");
  await schemaC.ensureSchema(db);
  const stillThere = await db.query("SELECT count(*)::int AS n FROM public.linkedin_people");
  assert.equal(stillThere.rows[0].n, 2);
  const schemaVersion = await db.query("SELECT version FROM public.pulse_schema_meta WHERE key='runtime'");
  assert.equal(schemaVersion.rows[0].version, 6);
  const companyIdentityColumns = await db.query(
    "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name='linkedin_url' AND table_name IN ('linkedin_company_captures','linkedin_companies') ORDER BY table_name"
  );
  assert.equal(companyIdentityColumns.rowCount, 2);

  console.log("Postgres integration QA: OK");
} finally {
  await db.end();
}
