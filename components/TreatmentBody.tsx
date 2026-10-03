'use client';
import {regionLabels} from '@/lib/service-selection';
const skin='#f3d4c5';
const regions:Record<string,{x:number;y:number;side:number}>={BEARD:{x:110,y:77,side:0},FACE:{x:110,y:57,side:0},NECK:{x:110,y:92,side:1},UNDERARMS:{x:73,y:142,side:0},CHEST:{x:109,y:136,side:0},ARMS:{x:53,y:204,side:0},ABDOMEN:{x:110,y:198,side:0},BACK:{x:110,y:153,side:1},LOWER_BACK:{x:110,y:211,side:1},BIKINI:{x:110,y:255,side:0},THIGHS:{x:83,y:310,side:0},BUTTOCKS:{x:89,y:264,side:1},LEGS:{x:82,y:381,side:0}};
export default function TreatmentBody({selected,available,onToggle,gender='FEMALE'}:{gender?:'FEMALE'|'MALE';selected:string[];available:string[];onToggle:(r:string)=>void}){
 return <div className="treatment-figures">{[0,1].map(side=><figure key={side}><figcaption>{side?'خلف الجسم':'أمام الجسم'}</figcaption><svg viewBox="0 0 220 480" aria-label={side?'مناطق الجسم الخلفية':'مناطق الجسم الأمامية'}>
 <ellipse cx="109" cy="465" rx="56" ry="7" fill="#e9e0ee"/>
 <path d="M98 72L96 98Q67 103 61 130L48 190 35 248Q32 265 43 265L53 248 69 195 78 154Q81 196 70 227Q66 257 75 288L78 358 77 432 69 455Q73 464 95 458L104 434 109 332 116 432 123 458Q146 464 151 455L141 432 143 358 145 289Q157 257 149 227Q137 196 141 154L151 195 168 248 176 265Q190 268 184 249L171 190 158 130Q153 106 122 98L120 72Z" fill={skin} stroke="#bc9289" strokeWidth="1.3"/>
 <ellipse cx="109" cy="57" rx="25" ry="34" fill={skin} stroke="#bc9289" strokeWidth="1.3"/>
 {side?<path d="M85 70Q70 20 109 21Q148 20 134 71L118 90H98Z" fill="#65433e"/>:<><path d="M83 48Q81 17 111 21Q140 24 136 49Q125 45 115 30Q103 45 83 48" fill="#65433e"/><path d="M93 58h8m16 0h8m-21 20q6 4 12 0M110 60l-3 9 5 1" fill="none" stroke="#8c6157" strokeWidth="1.5"/></>}
 {gender==='FEMALE'&&<ellipse cx="109" cy="16" rx="16" ry="12" fill="#65433e"/>}
 {gender==='MALE'?<path d="M81 111L97 103Q109 114 121 103L141 112L150 151L138 154L139 229H78L80 154L68 151Z" fill="#fffafa" stroke="#c9b3c4"/>:<path d="M81 114l6-9 6 29q17 10 35 0l6-29 6 9-1 57q-29 10-58 0Z" fill="#fffafa" stroke="#c9b3c4"/>}
 <path d="M72 238q37 16 78 0l-11 35-28 12-27-12Z" fill="#fffafa" stroke="#c9b3c4"/>
 {Object.entries(regions).filter(([r,p])=>available.includes(r)&&(p.side===side||['ARMS','LEGS'].includes(r))).map(([r,p])=><g key={r} role="button" tabIndex={0} aria-label={regionLabels[r]} aria-pressed={selected.includes(r)} onClick={()=>onToggle(r)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onToggle(r);}}} style={{cursor:'pointer'}}><title>{regionLabels[r]}</title><circle cx={p.x} cy={p.y} r="17" fill={selected.includes(r)?'#9772b666':'#fff4'} stroke={selected.includes(r)?'#775197':'#a37cb0'} strokeWidth="2"/><circle cx={p.x} cy={p.y} r="4" fill={selected.includes(r)?'#775197':'#71456f'}/></g>)}
 </svg></figure>)}</div>;
}
