export function normalizePhone(value:string) {
 let digits=value.replace(/[\u0660-\u0669]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[\u06f0-\u06f9]/g,c=>String(c.charCodeAt(0)-0x6f0)).replace(/[^0-9]/g,'');
 if(digits.startsWith('00'))digits=digits.slice(2);
 if(/^0[2-9]\d{7,8}$/.test(digits))digits='972'+digits.slice(1);
 if(!/^[1-9]\d{7,14}$/.test(digits))throw new Error('رقم هاتف غير صالح؛ أدخلي رمز الدولة');
 return digits;
}
