'use client';
import {useState} from 'react';

const callingCodes='1 7 20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98 211 212 213 216 218 220 221 222 223 224 225 226 227 228 229 230 231 232 233 234 235 236 237 238 239 240 241 242 243 244 245 246 248 249 250 251 252 253 254 255 256 257 258 260 261 262 263 264 265 266 267 268 269 290 291 297 298 299 350 351 352 353 354 355 356 357 358 359 370 371 372 373 374 375 376 377 378 380 381 382 383 385 386 387 389 420 421 423 500 501 502 503 504 505 506 507 508 509 590 591 592 593 594 595 596 597 598 599 670 672 673 674 675 676 677 678 679 680 681 682 683 685 686 687 688 689 690 691 692 850 852 853 855 856 880 886 960 961 962 963 964 965 966 967 968 970 971 972 973 974 975 976 977 992 993 994 995 996 998'.split(' ');
export function CustomerPhone({value,onChange}:{value:string;onChange:(v:string)=>void}){
 const digits=(value??'').replace(/\D/g,'').replace(/^00/,'');
 const initial=digits.startsWith('0')?'972':callingCodes.find(c=>digits.startsWith(c))??'972';
 const [code,setCode]=useState('+'+initial),[number,setNumber]=useState(digits.startsWith('0')?digits:digits.slice(initial.length));
 const update=(c:string,n:string)=>{const national=n.replace(/[\u0660-\u0669]/g,ch=>String(ch.charCodeAt(0)-0x660)).replace(/[\u06f0-\u06f9]/g,ch=>String(ch.charCodeAt(0)-0x6f0)).replace(/\D/g,'').slice(0,10);setCode(c);setNumber(national);onChange(national?`${c}${national.replace(c==='+39'?/^$/:/^0/,'')}`:'');};
 return <div className="customer-phone-fields" dir="ltr"><label>رمز الدولة<input aria-label="رمز الدولة" type="tel" inputMode="tel" required pattern="\+[1-9][0-9]{0,2}" value={code} onChange={e=>update(e.target.value,number)} placeholder="+972"/></label><label>رقم الهاتف<input aria-label="رقم الهاتف" type="tel" inputMode="numeric" autoComplete="tel-national" required maxLength={10} pattern="[0-9]{5,10}" title="رقم الهاتف من 5 إلى 10 أرقام دون رمز الدولة" value={number} onChange={e=>update(code,e.target.value)} placeholder="0501234567"/></label></div>;
}
export {CustomerServices} from './CustomerCatalogue';
