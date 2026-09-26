import {applyDrafts} from './drafts.js';
const key=node=>node?.nodeType===1 ? node.id || node.dataset.key : null;
function patch(current,next) {
  if(current.nodeType!==next.nodeType || current.nodeName!==next.nodeName){current.replaceWith(next.cloneNode(true));return;}
  if(current.nodeType!==1){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
  // Alerts, confirmations and open search menus manage their own transient state.
  if(current.hasAttribute('data-preserve'))return;
  const busy=current.getAttribute('aria-busy')==='true';
  for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name) && attr.name!=='open' && !(busy && ['disabled','aria-busy'].includes(attr.name)))current.removeAttribute(attr.name);
  for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
  reconcile(current,next);
  if(['INPUT','TEXTAREA','SELECT'].includes(current.tagName) && current.value!==next.value)current.value=next.value;
}
function reconcile(parent,next) {
  let current=parent.firstChild;
  for(const desired of [...next.childNodes]) {
    const id=key(desired);
    if(id && key(current)!==id){const existing=[...parent.childNodes].find(node=>key(node)===id);if(existing)parent.insertBefore(existing,current);current=existing || current;}
    if(!current){parent.appendChild(desired.cloneNode(true));continue;}
    if(id && key(current)!==id || !id && key(current)){parent.insertBefore(desired.cloneNode(true),current);continue;}
    const following=current.nextSibling;patch(current,desired);current=following;
  }
  while(current){const next=current.nextSibling;current.remove();current=next;}
}
export function renderMarkup(element,html,scope) {
  if(!element)return;
  const template=document.createElement('template');template.innerHTML=html;
  if(scope){element.dataset.draftScope=scope;applyDrafts(template.content,scope);}
  reconcile(element,template.content);
}
