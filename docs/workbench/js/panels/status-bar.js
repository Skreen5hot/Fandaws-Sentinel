/**
 * Status Bar — Bottom bar showing graph stats.
 *
 * Subscribes to: graph-changed
 */

/**
 * Initialize the Status Bar.
 * @param {HTMLElement} statusBar - #status-bar
 * @param {import('../workbench-state.js').WorkbenchStateManager} state
 */
export function initStatusBar(statusBar, state) {
  function update() {
    const graph = state.getGraph();
    const concepts = graph?.['fandaws:concepts'] || [];

    let propCount = 0;
    let relCount = 0;
    const bfoCounts = {};
    const ersCounts = { R1: 0, R2: 0, R3: 0 };

    for (const c of concepts) {
      const subs = c['rdfs:subClassOf'] || [];
      for (const entry of subs) {
        if (typeof entry === 'string' && entry.startsWith('bfo:')) {
          const label = entry.replace('bfo:', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
          bfoCounts[label] = (bfoCounts[label] || 0) + 1;
        }
        if (typeof entry === 'object') {
          if (entry['fandaws:restrictionKind'] === 'property') propCount++;
          if (entry['fandaws:restrictionKind'] === 'relationship') relCount++;
          const rr = entry['fandaws:routingRecord'];
          if (rr) {
            const reg = rr['fandaws:register'] || '';
            if (reg.includes('axiomatic')) ersCounts.R1++;
            else if (reg.includes('normative')) ersCounts.R2++;
            else if (reg.includes('aspirational')) ersCounts.R3++;
          }
        }
      }
    }

    let text = `${concepts.length} concepts | ${relCount} relationships | ${propCount} properties`;

    // BFO distribution
    const bfoKeys = Object.keys(bfoCounts);
    if (bfoKeys.length > 0) {
      const bfoParts = bfoKeys.map((k) => `${bfoCounts[k]} ${k}`);
      text += ` | BFO: ${bfoParts.join(', ')}`;
    }

    // ERS distribution
    const ersTotal = ersCounts.R1 + ersCounts.R2 + ersCounts.R3;
    if (ersTotal > 0) {
      const ersParts = [];
      if (ersCounts.R1 > 0) ersParts.push(`${ersCounts.R1} R1`);
      if (ersCounts.R2 > 0) ersParts.push(`${ersCounts.R2} R2`);
      if (ersCounts.R3 > 0) ersParts.push(`${ersCounts.R3} R3`);
      text += ` | ERS: ${ersParts.join(', ')}`;
    }

    statusBar.textContent = text;
  }

  state.bus.on('graph-changed', () => update());

  // Initial render
  update();
}
