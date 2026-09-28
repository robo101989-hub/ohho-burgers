// Keep all section headings visible; collapse only their contents.
export function installSectionDisclosures(root = document) {
  const saved = new Map();
  let scheduled = false;
  const selector = '#inventory, #overview, #reports, #daily-expenses';
  const keyFor = details => {
    const parts = [];
    for (let node = details; node; node = node.parentElement?.closest('details')) {
      const summary = node.querySelector(':scope > summary');
      parts.unshift(node.id || node.dataset.disclosureKey || summary?.textContent.replace(/OPEN|CLOSE/g, '').trim());
    }
    return `${details.closest('.section')?.id}:${parts.join('/')}`;
  };
  function enhance() {
    scheduled = false;
    root.querySelectorAll(`${selector.split(', ').map(s => s + ' article.inventory-panel').join(', ')}, #overview article.panel, #reports article.panel`).forEach(panel => {
      if (panel.dataset.collapsibleReady) return;
      const head = panel.querySelector(':scope > .inventory-panel-head, :scope > .panel-head');
      if (!head) return;
      panel.dataset.collapsibleReady = 'true';
      const body = document.createElement('div');
      body.className = 'section-disclosure-body';
      body.id = `${panel.id || 'section-' + root.querySelectorAll('[data-collapsible-ready]').length}-body`;
      for (const child of [...panel.childNodes]) if (child !== head) body.append(child);
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'secondary section-toggle'; toggle.textContent = 'CLOSE';
      toggle.setAttribute('aria-controls', body.id); toggle.setAttribute('aria-expanded', 'true');
      toggle.addEventListener('click', () => {
        body.hidden = !body.hidden;
        toggle.textContent = body.hidden ? 'OPEN' : 'CLOSE';
        toggle.setAttribute('aria-expanded', String(!body.hidden));
      });
      head.append(toggle); panel.append(body);
    });
    root.querySelectorAll(selector).forEach(section => section.querySelectorAll('details').forEach(details => {
      if (details.dataset.disclosureReady) return;
      const summary = details.querySelector(':scope > summary');
      if (!summary) return;
      const key = keyFor(details);
      if (saved.has(key)) details.open = saved.get(key);
      details.dataset.disclosureReady = 'true';
      summary.querySelectorAll(':scope > b').forEach(b => { if (/^(OPEN|CLOSE)$/.test(b.textContent.trim())) b.remove(); });
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'secondary disclosure-action';
      const update = () => { button.textContent = details.open ? 'CLOSE' : 'OPEN'; button.setAttribute('aria-expanded',String(details.open)); saved.set(key,details.open); };
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); details.open = !details.open; update(); });
      summary.append(button); details.addEventListener('toggle',update); update();
    }));
  }
  // Jump links and edit actions must reopen parent sections before scrolling.
  root.addEventListener('click', event => {
    const link = event.target.closest('[data-inventory-scroll]');
    if (link) reveal(document.getElementById(link.dataset.inventoryScroll));
  }, true);
  function reveal(target) {
    for (let node = target; node; node = node.parentElement) {
      if (node.tagName === 'DETAILS') node.open = true;
      if (node.classList?.contains('section-disclosure-body')) {
        node.hidden = false;
        const button = root.querySelector(`[aria-controls="${node.id}"]`);
        if (button) { button.textContent = 'CLOSE'; button.setAttribute('aria-expanded','true'); }
      }
      const body = node === target && node.querySelector?.(':scope > .section-disclosure-body');
      if (body) { body.hidden = false; const button = root.querySelector(`[aria-controls="${body.id}"]`); if(button){button.textContent='CLOSE';button.setAttribute('aria-expanded','true');} }
    }
  }
  enhance();
  const observer = new MutationObserver(() => { if (!scheduled) { scheduled = true; requestAnimationFrame(enhance); } });
  root.querySelectorAll(selector).forEach(section => observer.observe(section,{childList:true,subtree:true}));
  return { reveal, disconnect:()=>observer.disconnect() };
}
