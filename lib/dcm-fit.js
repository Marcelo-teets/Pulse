// Commercial research hints only. Never a credit rating, loan approval or assertion of funding need.
const patterns=[
  {id:"receivables",weight:35,label:"Referência a recebíveis/antecipação",re:/receb[ií]ve(?:is|l)|antecipa(?:[çc][aã]o|r)|securiti[sz]a|invoice financ/i},
  {id:"credit",weight:25,label:"Referência a crédito/financiamento",re:/\bcr[eé]dito\b|\blending\b|financia(?:mento|r)|\bconsignado\b|\bfidc\b/i},
  {id:"asset",weight:15,label:"Modelo com ativos/locação",re:/\bloca[çc][aã]o\b|\bleasing\b|\basset[- ]backed\b|aluguel de equipamentos/i},
  {id:"ecosystem",weight:10,label:"Ecossistema financeiro ou tecnologia",re:/\bfintech\b|\bsaas\b|\berp\b|\bpayments?\b|pagamento/i}
];
export function scoreCompany(company={}) {
 const evidence=[company.company_name,company.description].filter(Boolean).join(" ");
 const signals=patterns.filter(p=>p.re.test(evidence));
 let score=signals.reduce((sum,p)=>sum+p.weight,0);
 const headcount=String(company.employee_count||"");
 const range=headcount.match(/(\d[\d.,]*)\s*(?:-|a|to)\s*(\d[\d.,]*)/i);
 const parseNumber=v=>Number(String(v||"").replace(/\./g,"").replace(",","."));
 if(range && parseNumber(range[2])>=50){score+=15;signals.push({id:"scale",label:"Faixa de funcionários pode incluir 50+",weight:15});}
 score=Math.min(100,score);
 const hasCore=signals.some(x=>x.id==="credit"||x.id==="receivables"||x.id==="asset");
 return {score,fit:score>=60&&hasCore?"potencial_alto":score>=30&&hasCore?"investigar":"sem_evidencia_suficiente",
   signals:signals.map(x=>({code:x.id,label:x.label})),
   disclaimer:"Pontuação indicativa baseada em texto; não prova originação, elegibilidade nem necessidade de funding."};
}
