/* Nicknames such as 어⃢서 (U+20E2 COMBINING ENCLOSING SCREEN) render broken in web fonts.
   Draw the screen frame around the two characters ourselves, as phones and the game show it.
   Display only: the text content (and every stored name) stays exactly the same. */
(()=>{'use strict';
 const MARKS='⃝⃞⃢';const SHAPE={'⃝':'circle','⃞':'square','⃢':'screen'};
 const RE=new RegExp('([^\\s'+MARKS+'])(['+MARKS+'])([^\\s'+MARKS+']?)','g');
 const SKIP=new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','OPTION','SELECT','TITLE','NOSCRIPT']);
 function splitEnclosed(text){const out=[];let last=0;RE.lastIndex=0;for(let m;(m=RE.exec(text));){if(m.index>last)out.push({text:text.slice(last,m.index)});out.push({base:m[1],mark:m[2],next:m[3],shape:SHAPE[m[2]]});last=RE.lastIndex;}if(last<text.length)out.push({text:text.slice(last)});return out;}
 function wrap(node){
  const parts=splitEnclosed(node.nodeValue);if(parts.length===1&&parts[0].text!==undefined)return;
  const doc=node.ownerDocument,frag=doc.createDocumentFragment();
  for(const p of parts){
   if(p.text!==undefined){frag.appendChild(doc.createTextNode(p.text));continue;}
   const box=doc.createElement('span');box.className='enc-name enc-'+p.shape;
   const mark=doc.createElement('span');mark.className='enc-mark';mark.textContent=p.mark;
   box.append(p.base,mark,p.next);frag.appendChild(box);
  }
  node.parentNode.replaceChild(frag,node);
 }
 function scan(root){
  if(!root)return;
  if(root.nodeType===3){const el=root.parentElement;if(el&&!SKIP.has(el.tagName)&&!el.closest('.enc-name,[contenteditable],svg'))wrap(root);return;}
  if(root.nodeType!==1&&root.nodeType!==11)return;if(root.nodeType===1&&(SKIP.has(root.tagName)||root.closest('.enc-name,[contenteditable],svg')))return;
  const walker=root.ownerDocument.createTreeWalker(root,4),hits=[];for(let n;(n=walker.nextNode());)if(RE.test(n.nodeValue)){RE.lastIndex=0;hits.push(n);}
  RE.lastIndex=0;for(const n of hits)scan(n);
 }
 if(typeof document==='undefined'){if(typeof module!=='undefined')module.exports={splitEnclosed};return;}
 const start=()=>{scan(document.body);new MutationObserver(list=>{for(const r of list){if(r.type==='characterData')scan(r.target);else for(const n of r.addedNodes)scan(n);}}).observe(document.body,{childList:true,subtree:true,characterData:true});};
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
