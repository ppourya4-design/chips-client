import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { zipSync, strToU8 } from "fflate";
import { parseIconPack, iconPackCss } from "../src/iconpack";
const source = (file:string)=>readFileSync(new URL(file,import.meta.url),"utf8");

test("all application UI SVG references resolve to the bundled sprite",()=>{
 const sprite=source("../public/icons.svg");
 const ids=new Set([...sprite.matchAll(/id="ui-([^"]+)"/g)].map(m=>m[1]));
 const app=source("../src/App.tsx");
 for(const m of app.matchAll(/<UiIcon name="([^"]+)"/g)) assert.ok(ids.has(m[1]),m[1]);
 const sections=app.slice(app.indexOf("const OPTIONS_SECTIONS"),app.indexOf("interface AudioSettings"));
 for(const m of sections.matchAll(/icon: "([^"]+)"/g))assert.ok(ids.has(m[1]),m[1]);
 assert.match(source("../src/UiIcon.tsx"),/aria-hidden="true"/);
 assert.doesNotMatch(sprite,/<script|https?:\/\/(?!www.w3.org)/);
});

test("no emoji UI literals in TSX or the English interface dictionary",()=>{
 const dir=new URL("../src/",import.meta.url);
 for(const file of readdirSync(dir).filter(f=>f.endsWith(".tsx"))){
  const text=source(`../src/${file}`);
  const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visit=(n:ts.Node)=>{
   if(ts.isJsxText(n)||ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n))assert.doesNotMatch(n.getText(ast),/\p{Extended_Pictographic}/u,`${file}: ${n.getText(ast).slice(0,80)}`);
   ts.forEachChild(n,visit);
  };visit(ast);
 }
 assert.doesNotMatch(source("../src/locales/en.json"),/\p{Extended_Pictographic}/u);
 assert.match(source("../src/App.tsx"),/chips-mark.svg/);
});

test("icon-pack import/render only accepts SVG UI assets; raster entries fall back to built-ins",async()=>{
 const pngOnly=zipSync({"16x16_input_muted.png":new Uint8Array([1,2,3])});
 assert.equal(await parseIconPack(new File([pngOnly],"raster.zip")),null);
 const mixed=zipSync({"16x16_input_muted.svg":strToU8('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>'),"16x16_output_muted.png":new Uint8Array([1])});
 const pack=await parseIconPack(new File([mixed],"vector.zip"));assert.ok(pack?.icons.micMuted?.startsWith("data:image/svg+xml;"));assert.equal(pack?.icons.soundMuted,undefined);
 assert.equal(iconPackCss({id:"old",name:"old",icons:{soundMuted:"data:image/png;base64,AA=="}}),"");
 assert.match(iconPackCss(pack!),/data:image\/svg\+xml/);
});
