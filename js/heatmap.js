// heatmap.js — monthly % returns heatmap
// Rows = years, Columns = months, Color = % change that month
// Series selector at top (WTI default)

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
let initiated = false;

export function initHeatmap(data) {
    if (initiated) return;
    initiated = true;

    const SERIES_OPTS = [
        { key: 'wti',   label: 'WTI',   color: '#f0b429' },
        { key: 'brent', label: 'Brent', color: '#58a6ff' },
        { key: 'wcs',   label: 'WCS',   color: '#f47067' },
        { key: 'urals', label: 'Urals', color: '#bc8cff' },
    ];

    let activeKey = 'wti';

    const container = document.getElementById('heatmap-container');
    const W = Math.max(300, (container.parentElement?.clientWidth || container.clientWidth || 700) - 48);

    // ── Series selector buttons ───────────────────────────────────────────────
    const btnRow = document.getElementById('heatmap-btns');
    SERIES_OPTS.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'series-btn' + (s.key === activeKey ? ' active' : '');
        btn.dataset.key = s.key;
        btn.innerHTML = `<span class="swatch" style="background:${s.color}"></span>${s.label}`;
        btn.addEventListener('click', () => {
            activeKey = s.key;
            btnRow.querySelectorAll('.series-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.key === s.key));
            draw(activeKey);
        });
        btnRow.appendChild(btn);
    });

    // ── Compute monthly returns ───────────────────────────────────────────────
    function getReturns(key) {
        const sorted = data.filter(d => d[key] != null).sort((a, b) => a.month - b.month);
        const returns = [];
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1][key];
            const curr = sorted[i][key];
            const pct = ((curr - prev) / prev) * 100;
            returns.push({
                year:  sorted[i].month.getFullYear(),
                month: sorted[i].month.getMonth(),   // 0-indexed
                pct,
                curr,
            });
        }
        return returns;
    }

    // ── Draw ──────────────────────────────────────────────────────────────────
    const MARGIN = { top: 30, right: 20, bottom: 10, left: 48 };

    function draw(key) {
        const returns = getReturns(key);
        const years = [...new Set(returns.map(d => d.year))].sort();

        const cellW = Math.floor((W - MARGIN.left - MARGIN.right) / 12);
        const cellH = Math.max(16, Math.floor((380 - MARGIN.top - MARGIN.bottom) / years.length));
        const H = cellH * years.length + MARGIN.top + MARGIN.bottom + 28;  // +28 for legend row at top

        d3.select('#heatmap-chart').selectAll('*').remove();
        const svg = d3.select('#heatmap-chart')
            .attr('width', W).attr('height', H)
            .attr('viewBox', `0 0 ${W} ${H}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('max-width', '100%');
        const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top + 28})`);

        // Colour scale — diverging, centred at 0
        const maxAbs = Math.min(d3.max(returns, d => Math.abs(d.pct)), 25);
        const colorScale = d3.scaleDivergingSqrt()
            .domain([-maxAbs, 0, maxAbs])
            .interpolator(d3.interpolateRdYlGn)
            .clamp(true);

        // Month axis
        g.selectAll('.mth-label')
            .data(MONTHS_SHORT)
            .join('text')
            .attr('class', 'mth-label')
            .attr('x', (d, i) => i * cellW + cellW / 2)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .attr('fill', '#8b949e')
            .attr('font-size', '10px')
            .text(d => d);

        // Year axis
        g.selectAll('.yr-label')
            .data(years)
            .join('text')
            .attr('class', 'yr-label')
            .attr('x', -6)
            .attr('y', (d, i) => i * cellH + cellH / 2)
            .attr('text-anchor', 'end')
            .attr('dominant-baseline', 'central')
            .attr('fill', '#8b949e')
            .attr('font-size', '10px')
            .text(d => d);

        const tip = document.getElementById('tooltip');

        // Cells
        g.selectAll('.hm-cell')
            .data(returns)
            .join('rect')
            .attr('class', 'hm-cell')
            .attr('x', d => d.month * cellW + 1)
            .attr('y', d => years.indexOf(d.year) * cellH + 1)
            .attr('width', cellW - 2)
            .attr('height', cellH - 2)
            .attr('rx', 2)
            .attr('fill', d => colorScale(d.pct))
            .attr('opacity', 0)   // animate in
            .attr('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                tip.innerHTML = `
          <div class="tooltip-date">${MONTHS_SHORT[d.month]} ${d.year}</div>
          <div class="tooltip-row">
            <span class="tooltip-name">${key.toUpperCase()} price</span>
            <span class="tooltip-val">$${d.curr.toFixed(2)}</span>
          </div>
          <div class="tooltip-row">
            <span class="tooltip-name">Monthly return</span>
            <span class="tooltip-val" style="color:${d.pct >= 0 ? '#3fb950' : '#f47067'}">
              ${d.pct >= 0 ? '+' : ''}${d.pct.toFixed(1)}%
            </span>
          </div>`;
                tip.classList.remove('hidden');
                let x = event.clientX + 14, y = event.clientY + 14;
                if (x + 200 > window.innerWidth) x = event.clientX - 214;
                tip.style.left = x + 'px'; tip.style.top = y + 'px';
                d3.select(this).attr('opacity', 1).attr('stroke', '#e6edf3').attr('stroke-width', 1.5);
            })
            .on('mousemove', function(event) {
                let x = event.clientX + 14, y = event.clientY + 14;
                if (x + 200 > window.innerWidth) x = event.clientX - 214;
                tip.style.left = x + 'px'; tip.style.top = y + 'px';
            })
            .on('mouseleave', function() {
                tip.classList.add('hidden');
                d3.select(this).attr('stroke', 'none');
            })
            .transition().duration(600).delay((d, i) => i * 0.8)
            .attr('opacity', 0.88);

        // Colour legend — placed top-right, above the grid
        const legendW = Math.min(200, W - MARGIN.left - 40);
        const legendG = svg.append('g')
            .attr('transform', `translate(${W - legendW - 20}, 8)`);

        const defs = svg.append('defs');
        const grad = defs.append('linearGradient').attr('id', 'hm-grad');
        const stops = d3.range(0, 1.01, 0.1);
        stops.forEach(t => {
            grad.append('stop').attr('offset', `${t * 100}%`)
                .attr('stop-color', colorScale(d3.interpolateNumber(-maxAbs, maxAbs)(t)));
        });

        legendG.append('rect')
            .attr('width', legendW).attr('height', 7).attr('rx', 3)
            .attr('fill', 'url(#hm-grad)');

        legendG.append('text').attr('x', 0).attr('y', 18)
            .attr('fill', '#484f58').attr('font-size', '9px').text(`−${maxAbs.toFixed(0)}%`);
        legendG.append('text').attr('x', legendW / 2).attr('y', 18)
            .attr('text-anchor', 'middle').attr('fill', '#484f58').attr('font-size', '9px').text('0%');
        legendG.append('text').attr('x', legendW).attr('y', 18)
            .attr('text-anchor', 'end').attr('fill', '#484f58').attr('font-size', '9px').text(`+${maxAbs.toFixed(0)}%`);
    }

    draw(activeKey);
}