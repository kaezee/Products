import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
const L = await import("/home/user/Products/Kronicler/app/node_modules/lucide-react/dist/esm/lucide-react.mjs");
const I=(n,s=13)=>renderToStaticMarkup(React.createElement(L[n],{size:s,strokeWidth:1.75}));
const link=(ic,t)=>`<button class="crumb-link">${I(ic)}${t}</button>`;
const cur=(t,on=true,ic)=>`<span class="crumb-cur${on?' on':''}">${ic?I(ic):''}${t}</span>`;
const sep=`<span class="crumb-sep">›</span>`;
const bar=(inner)=>`<nav class="crumbs">${inner}</nav>`;
const block=(title,html)=>`<div style="margin:18px 0"><div style="font:600 11px/1 var(--sans);color:var(--faint);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">${title}</div><div class="card" style="padding:16px 20px">${html}<h2 style="font-family:var(--serif);font-weight:500;font-size:24px;margin:2px 0 0">${title.split('—').pop().trim()}</h2></div></div>`;
const html=`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///home/user/Products/Kronicler/app/dist/assets/index-2ESWCITO.css">
<style>body{padding:28px;background:var(--canvas);max-width:840px;margin:0 auto}</style></head>
<body data-theme="paper">
<h1 style="font-family:var(--serif);font-weight:500">Breadcrumb states</h1>
${block("Section — Manuscript (list)", bar(link('overview','Overview')+sep+cur('Manuscript',true,'manuscript')))}
${block("Leaf — a chapter", bar(link('overview','Overview')+sep+`<button class="crumb-link">${I('manuscript')}Manuscript</button>`+sep+cur('Ch. 7 · The Salt Ledger',true)))}
${block("Leaf — an entity", bar(link('overview','Overview')+sep+`<button class="crumb-link">${I('library')}Library</button>`+sep+cur('Yuna Skarsgard',true)))}
${block("Search", bar(link('overview','Overview')+sep+cur('“salt”',true,'search')))}
${block("Top-level — Timeline", bar(link('overview','Overview')+sep+cur('Timeline',true,'timeline')))}
</body></html>`;
fs.writeFileSync("/home/user/Products/Kronicler/app/_crumb.html",html);console.log("ok");
