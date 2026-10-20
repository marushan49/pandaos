/*!
MIT License

Copyright (c) 2026 Browser Use

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { z } from "zod";

export const SnapshotElementStateSchema = z.object({
  value: z.string().optional(),
  checked: z.string().optional(),
  selected: z.string().optional(),
  expanded: z.string().optional(),
  editable: z.boolean(),
  clickable: z.boolean(),
  secret: z.boolean().optional(),
  scrollUp: z.boolean().optional(),
  scrollDown: z.boolean().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
});

export type SnapshotElementState = z.infer<typeof SnapshotElementStateSchema>;

export const SnapshotGuardSchema = z.object({
  node: z.number().int(),
  pageKey: z.string(),
  target: z.string(),
});

const READ_STATE = String.raw`(() => {
  if (!document.body) return null;
  const cache = window.__jevFast ||= {ids:new WeakMap(), nodes:new Map(), next:1};
  const identity = e => {
    if (!cache.ids.has(e)) cache.ids.set(e,cache.next++);
    const id=cache.ids.get(e); cache.nodes.set(id,e); return id;
  };
  for (const [id,e] of cache.nodes) if (!e.isConnected) cache.nodes.delete(id);
  const safe = e => !['file','hidden'].includes(e.type);
  const sensitive = e => e.type==='password' ||
    (e.autocomplete||'').split(/\s+/).some(v=>/^cc-|password|one-time-code/.test(v)) ||
    /otp|cvv|cvc|iban|passw|security|\b(?:credit\s*card|card(?:\s*number)?|ssn|pin|cc\s*number)\b/i.test([e.name,e.id,e.getAttribute('placeholder'),e.getAttribute('aria-label')].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1 $2'));
  const visible = e => !e.closest('[aria-hidden="true"],[inert]') &&
    e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
  const name = (e,seen=new Set()) => {
    if (!e || seen.has(e)) return '';
    seen.add(e);
    const referenced=(e.getAttribute('aria-labelledby')||'').split(/\s+/)
      .map(id=>name(document.getElementById(id),seen)).filter(Boolean).join(' ');
    return referenced || e.getAttribute('aria-label') ||
      [...(e.labels||[])].map(l=>name(l,seen)).filter(Boolean).join(' ') ||
      (['button','submit','reset'].includes(e.type) ? e.value : '') || e.getAttribute('alt') ||
      (e.tagName==='INPUT' ? '' : [...e.childNodes].map(n=>n.nodeType===3 ? n.textContent :
        n.nodeType===1 && n.getAttribute('aria-hidden')!=='true' ? name(n,seen) : '').join(' ').trim()) ||
      e.getAttribute('title') || e.getAttribute('placeholder') || '';
  };
  const roles=['button','link','checkbox','radio','switch','tab','menuitem','menuitemradio',
    'option','gridcell','combobox','textbox','searchbox','spinbutton'];
  const selector='a[href],button,input,textarea,select,summary,[contenteditable="true"],'+
    roles.map(role=>'[role="'+role+'"]').join(',');
  const role = e => {
    const explicit=e.getAttribute('role');
    if (roles.includes(explicit)) return explicit;
    if (e.tagName==='BUTTON' || e.tagName==='SUMMARY') return 'button';
    if (e.tagName==='A') return 'link';
    if (e.tagName==='SELECT') return 'combobox';
    if (e.tagName==='TEXTAREA' || e.isContentEditable) return 'textbox';
    if (e.tagName==='INPUT') {
      if (['checkbox','radio'].includes(e.type)) return e.type;
      if (['button','submit','reset','image'].includes(e.type)) return 'button';
      if (e.type==='search') return 'searchbox';
      if (e.type==='number') return 'spinbutton';
      if (['text','email','url','tel','password'].includes(e.type)) return 'textbox';
    }
    return null;
  };
  cache.pageKey=()=>[performance.timeOrigin,location.href,scrollX,scrollY,innerWidth,innerHeight,
    [...document.querySelectorAll('input,textarea,select')].filter(safe)
      .map(e=>[identity(e),sensitive(e) ? String(e.value??e.textContent??'').length : e.value,e.checked,e.selectedIndex,e.disabled,e.readOnly])];
  cache.guard=e=>{
    if (!e?.isConnected || !visible(e)) return null;
    const scope=e.closest('form,dialog,[role="dialog"],article,li,tr,[role="row"]') || e.parentElement;
    return [identity(e),role(e),name(e),sensitive(e) ? String(e.value??e.textContent??'').length : e.value??null,e.checked??null,e.selectedIndex??null,
      e.readOnly??null,e.matches(':disabled'),e.getAttribute('aria-disabled'),
      e.getAttribute('aria-expanded'),e.getAttribute('aria-checked'),e.getAttribute('aria-selected'),
      e.getAttribute('href'),scope?.innerText?.slice(0,6000)||''];
  };
  const actions=[];
  for (const e of document.querySelectorAll(selector)) {
    if (!safe(e) || !visible(e) || e.matches(':disabled') || e.closest('[aria-disabled="true"]')) continue;
    const r=e.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2, rname=role(e);
    if (!rname || r.width<=0 || r.height<=0 || x<0 || y<0 || x>=innerWidth || y>=innerHeight) continue;
    if (rname==='gridcell' && e.querySelector('button,[role="button"]')) continue;
    const base={node:identity(e),role:rname,label:name(e)||rname,secret:sensitive(e),
      rect:{x:r.x,y:r.y,w:r.width,h:r.height}};
    for (const key of ['checked','selected','expanded']) {
      const value=e.getAttribute('aria-'+key);
      if (value!==null) base[key]=value;
    }
    if (['checkbox','radio'].includes(e.type)) base.checked=String(e.checked);
    if (e.tagName==='SELECT') {
      actions.push({...base,kind:'state',current_value:[...e.selectedOptions].map(o=>o.label).join(', ')});
      for (const o of e.options) if (!o.selected && !o.disabled && !o.closest('optgroup[disabled]'))
        actions.push({...base,kind:'select',value:o.value,
          current_value:[...e.selectedOptions].map(o=>o.label).join(', '),label:base.label+' → '+o.label});
    } else {
      const editable=!e.readOnly && e.getAttribute('aria-readonly')!=='true' &&
        (['textbox','searchbox','spinbutton'].includes(rname) ||
          (rname==='combobox' && ['INPUT','TEXTAREA'].includes(e.tagName)));
      const value=sensitive(e) ? '' : 'value' in e ? String(e.value) :
        e.isContentEditable || rname==='combobox' ? e.innerText.trim() : '';
      actions.push({...base,kind:editable?'fill':'click',value});
      if (editable) actions.push({...base,kind:'click',value,label:'Open '+base.label});
    }
  }
  const words=[], walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const range=document.createRange(); let node,length=0;
  while ((node=walker.nextNode()) && length<6000) {
    const value=node.textContent.trim(), parent=node.parentElement;
    if (!value || !parent || parent.closest('script,style,noscript,template') || !visible(parent)) continue;
    range.selectNodeContents(node); const r=range.getBoundingClientRect();
    if (r.width>0 && r.height>0 && r.bottom>0 && r.top<innerHeight && r.right>0 && r.left<innerWidth) {
      words.push(value); length+=value.length;
    }
  }
  const text=words.join('\n').slice(0,6000), height=document.documentElement.scrollHeight;
  const page_key=cache.pageKey(), guards={};
  for (const a of actions) if (!(a.node in guards)) guards[a.node]=cache.guard(cache.nodes.get(a.node));
  const semantics=actions.map(({rect,...action})=>action);
  const marker=[performance.timeOrigin,location.href,scrollX,scrollY,innerWidth,innerHeight,
    document.title,text,semantics,page_key[6]];
  const omitted_actions=Math.max(0,actions.length-250);
  actions.splice(250);
  actions.forEach((a,i)=>a.id='e'+(i+1));
  if (scrollY+innerHeight<height-2) actions.push({id:'scroll_down',kind:'scroll',label:'Scroll down',delta:560});
  if (scrollY>0) actions.push({id:'scroll_up',kind:'scroll',label:'Scroll up',delta:-560});
  actions.push({id:'wait',kind:'wait',label:'Wait for the page to update'});
  return {url:location.href,title:document.title,w:innerWidth,h:innerHeight,text,
    scroll:{y:scrollY,height},actions,marker,page_key,guards,omitted_actions};
})()`;

export function ultrafastSnapshotSource(legacySource: string): string {
  return `() => {
    const state = ${READ_STATE};
    if (!state) return [];
    const cache = window.__jevFast;
    const legacy = (${legacySource})();
    const selectors = new Map(legacy.map(node => [document.querySelector(node.selector), node]));
    const groups = new Map();
    for (const action of state.actions) {
      if (action.node === undefined) continue;
      const group = groups.get(action.node) || [];
      group.push(action);
      groups.set(action.node, group);
    }
    const selectorFor = element => {
      const parts = [];
      for (let current = element; current; current = current.parentElement) {
        if (current.id) { parts.unshift('#' + CSS.escape(current.id)); break; }
        const index = current.parentElement ? [...current.parentElement.children].indexOf(current) + 1 : 1;
        parts.unshift(current.tagName.toLowerCase() + ':nth-child(' + index + ')');
      }
      return parts.join(' > ');
    };
    const nodes = [];
    for (const [id, actions] of groups) {
      const element = cache.nodes.get(id);
      const first = actions[0];
      const existing = selectors.get(element);
      selectors.delete(element);
      const data = {
        editable: actions.some(a => a.kind === 'fill'),
        clickable: actions.some(a => a.kind === 'click'),
        ...(first.secret ? { secret: true } : { value: first.current_value ?? first.value ?? '' }),
      };
      for (const key of ['checked', 'selected', 'expanded']) {
        if (first[key] !== undefined) data[key] = first[key];
      }
      if (element.tagName === 'SELECT') {
        data.options = actions.filter(a => a.kind === 'select').map(a => ({
          label: a.label.slice(a.label.indexOf(' → ') + 3), value: a.value,
        }));
      }
      nodes.push({
        role: first.role,
        name: first.label.split(' → ')[0],
        selector: existing?.selector ?? selectorFor(element),
        state: data,
        guard: { node: id, pageKey: JSON.stringify(state.page_key), target: JSON.stringify(state.guards[id]) },
      });
    }
    for (const [element, node] of selectors) {
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth &&
          (node.role === 'heading' || node.role === 'img' || element.type === 'file')) nodes.push(node);
    }
    nodes.push({ role: 'text', name: state.text, selector: 'body', state: { editable: false, clickable: false, scrollUp: state.actions.some(a => a.id === 'scroll_up'), scrollDown: state.actions.some(a => a.id === 'scroll_down') } });
    return nodes;
  }`;
}

export const VALIDATE_ULTRAFAST_TARGET = `(expected) => {
  const cache = window.__jevFast;
  const element = cache?.nodes.get(expected.node);
  if (!cache || !element?.isConnected) return false;
  if (document.querySelector(expected.selector) !== element) return false;
  if (JSON.stringify(cache.pageKey()) !== expected.pageKey ||
      JSON.stringify(cache.guard(element)) !== expected.target) return false;
  const rect = element.getBoundingClientRect();
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight &&
    element.contains(document.elementFromPoint(x, y));
}`;
