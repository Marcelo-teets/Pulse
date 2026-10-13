// Prevent Excel/Sheets formula injection and preserve accented characters in CSV.
export function csvCell(value) {
 let s=String(value??"").replace(/\r\n/g,"\n");
 if (/^[\s\u0000-\u001f]*[=+@\-]/u.test(s)) s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export function csvDocument(headers, rows) {
 return "\uFEFF"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n")+"\r\n";
}
