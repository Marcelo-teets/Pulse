import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { classifySheetsFailure, inspectSheetsConnection } from "../lib/sheets-health.js";

const disabled = {error:{message:"Google Sheets API has not been used in project 116474980565 before or it is disabled."}};
assert.equal(classifySheetsFailure(403,disabled),"api_disabled");
assert.equal(classifySheetsFailure(403,{error:{message:"Forbidden"}}),"permission_denied");
assert.equal(classifySheetsFailure(404),"sheet_not_found");
assert.equal(classifySheetsFailure(401),"auth_failed");
assert.equal(classifySheetsFailure(429),"rate_limited");
assert.equal(classifySheetsFailure(500),"unreachable");

const missing = await inspectSheetsConnection({env:{},fetcher:async()=>{throw Error("must not call Google")},force:true});
assert.equal(missing.state,"not_configured");

const keys = generateKeyPairSync("rsa",{modulusLength:2048});
const env = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "pulse-test@example.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: keys.privateKey.export({type:"pkcs8",format:"pem"}),
  GOOGLE_SHEET_ID: "non-sensitive-test-id"
};
const jsonResponse=(status,data)=>({ok:status>=200&&status<300,status,async json(){return data}});
const tabs=["Pessoas","Empresas","Capturas","Operação"];
const mock=(status,body)=>{
  let calls=0;
  const fetcher=async(url,options)=>{
    calls++;
    if(calls===1){
      assert.equal(url,"https://oauth2.googleapis.com/token");
      assert.equal(options.method,"POST");
      assert.ok(options.body.get("assertion").split(".").length===3,"Google JWT must be signed");
      return jsonResponse(200,{access_token:"test-token"});
    }
    assert.match(url,/sheets\.googleapis\.com\/v4\/spreadsheets\/non-sensitive-test-id/);
    assert.equal(options.headers.authorization,"Bearer test-token");
    return jsonResponse(status,body);
  };
  return {fetcher,count:()=>calls};
};
const healthy=mock(200,{sheets:tabs.map(title=>({properties:{title}}))});
const good=await inspectSheetsConnection({env,fetcher:healthy.fetcher,force:true});
assert.equal(good.state,"ready");
assert.equal(healthy.count(),2);
assert.ok(!JSON.stringify(good).includes("test-token"),"API must never expose Google token");
const bad=mock(403,disabled);
assert.equal((await inspectSheetsConnection({env,fetcher:bad.fetcher,force:true})).state,"api_disabled");
const incomplete=mock(200,{sheets:[{properties:{title:"Pessoas"}}]});
assert.deepEqual((await inspectSheetsConnection({env,fetcher:incomplete.fetcher,force:true})).missing_tabs,["Capturas","Empresas","Operação"]);
const denied=mock(403,{error:{message:"Permission denied"}});
assert.equal((await inspectSheetsConnection({env,fetcher:denied.fetcher,force:true})).state,"permission_denied");
const oauthFailed=await inspectSheetsConnection({env,fetcher:async()=>jsonResponse(401,{error:"invalid_client"}),force:true});
assert.equal(oauthFailed.state,"auth_failed");
console.log("Sheets API availability QA: disabled, missing permission, missing tabs, token secrecy, OAuth and read-only success OK.");
