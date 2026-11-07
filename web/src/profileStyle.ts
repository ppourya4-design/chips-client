import { DEFAULT_NAME_STYLE_CONFIG, isNameStyleId, type NameStyleConfig, type AvatarRingId } from "./nameEffects";

/** Compact, versioned profile style shared by local storage and DESCRIPTION. */
export type ProfileStyle = { name: NameStyleConfig; ring: AvatarRingId; talk: boolean; banner: string[]; direction: number; card: string[]; bannerImage?: string; avatarImage?: string; status?: string; xp?: number };
export const DEFAULT_PROFILE_STYLE: ProfileStyle = { name: DEFAULT_NAME_STYLE_CONFIG, ring: "gradient", talk: true, banner: ["#74e5ff", "#a74cfd"], direction: 135, card: ["#172334", "#26354a"] };
const KEY = "chips:profile-style", RINGS = new Set(["gradient", "speaking", "electric"]);
const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return ""; } };
const hex = (v: unknown) => typeof v === "string" && /^#?[\da-f]{6}$/i.test(v) ? `#${v.replace(/^#/, "").toLowerCase()}` : undefined;
export function normalizeProfileStyle(v: unknown): ProfileStyle {
 const x = v && typeof v === "object" ? v as Partial<ProfileStyle> : {}, n = x.name ?? DEFAULT_NAME_STYLE_CONFIG;
 const colors = (v: unknown, fallback: string[], max=5) => Array.isArray(v) ? v.slice(0,max).map(hex).filter((c): c is string => !!c) : fallback;
 return { name: { style: isNameStyleId(n.style) ? n.style : DEFAULT_NAME_STYLE_CONFIG.style, colors: colors(n.colors, []), voiceColors: colors(n.voiceColors, []) }, ring: RINGS.has(String(x.ring)) ? x.ring! : "gradient", talk: x.talk !== false, banner: colors(x.banner, DEFAULT_PROFILE_STYLE.banner, 3), direction: Number.isFinite(x.direction) ? Math.round(x.direction!) : 135, card: colors(x.card, DEFAULT_PROFILE_STYLE.card, 2), ...(typeof x.bannerImage === "string" && x.bannerImage.length < 1000000 ? { bannerImage: x.bannerImage } : {}), ...(typeof x.avatarImage === "string" && x.avatarImage.length < 1000000 ? { avatarImage: x.avatarImage } : {}), ...(typeof x.status === "string" ? { status: x.status.slice(0,80) } : {}), ...(Number.isFinite(x.xp) && x.xp! >= 0 ? { xp: x.xp } : {}) };
}
export function loadProfileStyle(): ProfileStyle { try { return normalizeProfileStyle(JSON.parse(localStorage.getItem(KEY) || "null")); } catch { return DEFAULT_PROFILE_STYLE; } }
export function saveProfileStyle(s: ProfileStyle): void { localStorage.setItem(KEY, JSON.stringify(normalizeProfileStyle(s))); }
export function encodeStyleToken(input: ProfileStyle): string {
 const s=normalizeProfileStyle(input), c=(x:string)=>x.slice(1).toLowerCase();
 const f=[`fx=${s.name.style}`,...s.name.colors.slice(0,2).map((x,i)=>`c${i+1}=${c(x)}`),`ring=${s.ring}`,`talk=${s.talk?1:0}`,`bg=${s.banner.map(c).join(",")}`,`dir=${s.direction}`,`card=${s.card.map(c).join(",")}`]; if(s.status)f.push(`st=${encodeURIComponent(s.status.slice(0,80))}`); if(s.xp!==undefined)f.push(`xp=${s.xp}`); return `[s:v1;${f.join(";")}]`;
}
export function parseStyleToken(description: string): ProfileStyle | null {
 const m=description.match(/\[s:v1;[^\]]*\]/); if(!m)return null;
 const fields=Object.fromEntries(m[0].slice(5,-1).split(";").map(p=>{const i=p.indexOf("=");return i<0?[p,""]:[p.slice(0,i),p.slice(i+1)];}));
 return normalizeProfileStyle({ name:{style:fields.fx,colors:[fields.c1,fields.c2].filter(Boolean).map(x=>`#${x}`)},ring:fields.ring,talk:fields.talk!=="0",banner:(fields.bg||"").split(",").filter(Boolean).map(x=>`#${x}`),direction:Number(fields.dir),card:(fields.card||"").split(",").filter(Boolean).map(x=>`#${x}`),status:fields.st?safeDecode(fields.st):undefined,xp:fields.xp===undefined?undefined:Number(fields.xp) });
}
export function replaceStyleToken(description:string, token:string):string { return /\[s:v1;[^\]]*\]/.test(description)?description.replace(/\[s:v1;[^\]]*\]/,token):`${description}${description.trim()?" ":""}${token}`; }
export function exportStylesJson():string{return JSON.stringify({version:1,style:loadProfileStyle()},null,2);}
export function importStylesJson(text:string):ProfileStyle{const x=JSON.parse(text),s=normalizeProfileStyle(x?.style??x);saveProfileStyle(s);return s;}
