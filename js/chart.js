// chart.js — main focus line chart
// Gaps implemented: (2) shared hover, (3) draw-on-load animation, (4) inline labels
import { SERIES, MARGIN, visible, priceMode, brushExtent, setHoverDate } from './main.js';

const MAIN_H = 380;

// Key events that get a permanent visible rotated label on the chart
const LABELED_EVENTS = new Set([
    'All-time high $147',
    'WTI goes negative: -$37',
    'WCS hits record $50 discount',
    'OPEC refuses to cut',
    'Russia invades Ukraine',
]);

const REAL_KEY = { wti: 'wti_real', brent: 'brent_real' };

function getVal(row, key) {
    if (priceMode === 'real') {
        if (REAL_KEY[key]) return row[REAL_KEY[key]];
        if (row.wti && row.wti_real && row[key] != null)
            return row[key] * (row.wti_real / row.wti);
    }
    return row[key];
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
export function showTooltip(event, html) {
    const tip = document.getElementById('tooltip');
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    positionTooltip(event);
}
export function positionTooltip(event) {
    const tip = document.getElementById('tooltip');
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + 220 > window.innerWidth)  x = event.clientX - 220 - pad;
    if (y + 180 > window.innerHeight) y = event.clientY - 180 - pad;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
}
export function hideTooltip() {
    document.getElementById('tooltip').classList.add('hidden');
}

// ── Event panel ───────────────────────────────────────────────────────────────
export function openEventPanel(ev) {
    const fmt = d3.timeFormat('%B %Y');
    document.getElementById('event-label').textContent  = ev.label;
    document.getElementById('event-detail').textContent = ev.detail;
    document.getElementById('event-date').textContent   = fmt(ev.date);
    const cat = document.getElementById('event-category');
    cat.textContent = ev.category.toUpperCase();
    cat.className   = 'event-category ' + ev.category;
    document.getElementById('event-panel').classList.remove('hidden');
}

document.getElementById('event-close')
    .addEventListener('click', () =>
        document.getElementById('event-panel').classList.add('hidden'));

// Listen for programmatic open-event dispatched by chapter buttons in main.js
document.getElementById('event-panel')
    .addEventListener('open-event', (e) => openEventPanel(e.detail));

// ── Module state ──────────────────────────────────────────────────────────────
let xScale, yScale, svg, chartG, width;
let isFirstDraw = true;

// Called externally by spread.js to draw shared crosshair (Gap 2)
export function drawSharedCrosshair(date) {
    if (!chartG || !xScale) return;
    const [x0, x1] = xScale.domain();
    if (date < x0 || date > x1) {
        chartG.select('.crosshair-x').attr('opacity', 0);
        return;
    }
    chartG.select('.crosshair-x')
        .attr('opacity', 0.4).attr('x1', xScale(date)).attr('x2', xScale(date));
}
export function clearSharedCrosshair() {
    if (chartG) chartG.select('.crosshair-x').attr('opacity', 0);
}

// ── initChart ─────────────────────────────────────────────────────────────────
export function initChart(data, events) {
    const container = document.getElementById('chart-container');
    width = container.clientWidth - MARGIN.left - MARGIN.right;
    const height = MAIN_H - MARGIN.top - MARGIN.bottom;

    const svgEl = document.getElementById('main-chart');
    svgEl.setAttribute('height', MAIN_H);
    d3.select(svgEl).selectAll('*').remove();

    svg = d3.select(svgEl);
    chartG = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Clip rect: extend 120px upward for rotated annotation labels,
    // and the same 120px downward so lines near the x-axis aren't cut off.
    const clipPad = 120;
    svg.append('defs').append('clipPath').attr('id', 'main-clip')
        .append('rect')
        .attr('x', 0)
        .attr('y', -clipPad)
        .attr('width', width)
        .attr('height', height + clipPad * 2);

    xScale = d3.scaleTime().domain(d3.extent(data, d => d.month)).range([0, width]);
    yScale = d3.scaleLinear().range([height, 0]);

    chartG.append('g').attr('class', 'axis axis-x').attr('transform', `translate(0,${height})`);
    chartG.append('g').attr('class', 'axis axis-y');
    chartG.append('g').attr('class', 'grid grid-y');
    chartG.append('g').attr('class', 'lines-group').attr('clip-path', 'url(#main-clip)');
    chartG.append('g').attr('class', 'annotations-group').attr('clip-path', 'url(#main-clip)');

    chartG.append('rect')
        .attr('class', 'overlay')
        .attr('width', width).attr('height', height)
        .attr('fill', 'transparent')
        .on('mousemove', (event) => onMouseMove(event, data, height))
        .on('mouseleave', () => {
            chartG.select('.crosshair-x').attr('opacity', 0);
            hideTooltip();
            setHoverDate(null);
            import('./spread.js').then(m => m.clearSharedCrosshair());
        });

    chartG.append('line').attr('class', 'crosshair crosshair-x').attr('opacity', 0)
        .attr('y1', 0).attr('y2', height);

    isFirstDraw = true;
    updateChart(data, events);
}

// ── updateChart ───────────────────────────────────────────────────────────────
export function updateChart(data, events) {
    if (!chartG) return;
    const height = MAIN_H - MARGIN.top - MARGIN.bottom;

    const xDomain = brushExtent ?? d3.extent(data, d => d.month);
    xScale.domain(xDomain);

    const inView = data.filter(d => d.month >= xDomain[0] && d.month <= xDomain[1]);

    let yMin = Infinity, yMax = -Infinity;
    for (const s of SERIES) {
        if (!visible.has(s.key)) continue;
        for (const row of inView) {
            const v = getVal(row, s.key);
            if (v == null) continue;
            if (v < yMin) yMin = v;
            if (v > yMax) yMax = v;
        }
    }
    if (!isFinite(yMin)) { yMin = 0; yMax = 150; }
    const pad = (yMax - yMin) * 0.07;
    yScale.domain([Math.max(0, yMin - pad), yMax + pad]);

    chartG.select('.axis-x').transition().duration(300)
        .call(d3.axisBottom(xScale).ticks(width < 500 ? 4 : 8).tickSizeOuter(0));
    chartG.select('.axis-y').transition().duration(300)
        .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => `$${d}`).tickSizeOuter(0));
    chartG.select('.grid-y').transition().duration(300)
        .call(d3.axisLeft(yScale).ticks(6).tickSize(-width).tickFormat(''))
        .select('.domain').remove();

    // ── Lines — draw-on-load animation on first render (Gap 3) ─────────────────
    const linesG = chartG.select('.lines-group');
    const lineGen = key => d3.line()
        .defined(d => getVal(d, key) != null)
        .x(d => xScale(d.month))
        .y(d => yScale(getVal(d, key)))
        .curve(d3.curveMonotoneX);

    SERIES.forEach(s => {
        const isVis = visible.has(s.key);
        let path = linesG.select(`.line.${s.key}`);
        const brandNew = path.empty();

        if (brandNew) {
            path = linesG.append('path')
                .attr('class', `line ${s.key}`)
                .attr('fill', 'none')
                .attr('stroke', s.color)
                .attr('stroke-width', 1.5);
        }

        path.datum(data).attr('d', lineGen(s.key));

        if (isFirstDraw && isVis) {
            // Stroke-dashoffset draw-on animation
            const len = path.node().getTotalLength();
            path
                .attr('stroke-dasharray', `${len} ${len}`)
                .attr('stroke-dashoffset', len)
                .attr('opacity', 1)
                .attr('pointer-events', 'all')
                .transition().duration(1800).ease(d3.easeCubicInOut)
                .attr('stroke-dashoffset', 0)
                .on('end', () => {
                    path.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
                });
        } else {
            path.attr('stroke-dasharray', null).attr('stroke-dashoffset', null)
                .transition().duration(300)
                .attr('opacity', isVis ? 1 : 0)
                .attr('pointer-events', isVis ? 'all' : 'none');
        }
    });

    isFirstDraw = false;

    // ── Annotations with inline labels for key events (Gap 4) ─────────────────
    const annG = chartG.select('.annotations-group');
    annG.selectAll('.ann-marker').remove();

    const visibleEvents = events.filter(e => e.date >= xDomain[0] && e.date <= xDomain[1]);

    const placed = [];
    for (const ev of visibleEvents) {
        const px = xScale(ev.date);
        if (placed.some(p => Math.abs(p - px) < 12)) continue;
        placed.push(px);

        const isLabeled = LABELED_EVENTS.has(ev.label);
        const yTop = isLabeled ? 16 : 6;

        const marker = annG.append('g')
            .attr('class', 'ann-marker')
            .attr('transform', `translate(${px},0)`)
            .style('cursor', 'pointer')
            .on('click', () => openEventPanel(ev))
            .on('mouseenter', function(event) {
                showTooltip(event,
                    `<div class="tooltip-date">${d3.timeFormat('%B %Y')(ev.date)}</div>
           <div style="font-size:12px;color:#e6edf3;margin-top:4px">${ev.label}</div>
           <div style="font-size:11px;color:#8b949e;margin-top:3px">Click for details</div>`
                );
                d3.select(this).select('circle').attr('r', isLabeled ? 5.5 : 4.5).attr('stroke', '#f0b429');
            })
            .on('mousemove', positionTooltip)
            .on('mouseleave', function() {
                hideTooltip();
                d3.select(this).select('circle').attr('r', isLabeled ? 4 : 3).attr('stroke', isLabeled ? '#8b949e' : '#484f58');
            });

        marker.append('line')
            .attr('y1', yTop + 6).attr('y2', height - 4)
            .attr('stroke', isLabeled ? '#8b949e' : '#484f58')
            .attr('stroke-width', isLabeled ? 1 : 0.8)
            .attr('stroke-dasharray', '3 3');

        marker.append('circle')
            .attr('cy', yTop + 3)
            .attr('r', isLabeled ? 4 : 3)
            .attr('fill', '#161b22')
            .attr('stroke', isLabeled ? '#8b949e' : '#484f58')
            .attr('stroke-width', 1.2);

        // Rotated inline label — every event gets one, key events get bigger/brighter
        const short = ev.label
            .replace('WCS hits record ', '')
            .replace('All-time high ', '')
            .replace('WTI goes negative: ', '')
            .replace('Russia invades ', '')
            .replace('OPEC refuses to cut', 'OPEC: no cut')
            .replace('Financial crisis crash', 'GFC crash')
            .replace('Hurricane ', '')
            .slice(0, 22);

        marker.append('text')
            .attr('y', yTop + 3)
            .attr('dy', '-6')
            .attr('text-anchor', 'start')
            .attr('transform', `rotate(-40, 0, ${yTop + 3})`)
            .attr('fill', isLabeled ? '#8b949e' : '#484f58')
            .attr('font-size', isLabeled ? '9.5px' : '8.5px')
            .attr('pointer-events', 'none')
            .text(short);
    }
}

// ── Mouse + shared hover crosshair (Gap 2) ────────────────────────────────────
function onMouseMove(event, data, height) {
    const [mx] = d3.pointer(event);
    const hovDate = xScale.invert(mx);
    const bisect = d3.bisector(d => d.month).left;
    const i = bisect(data, hovDate, 1);
    const d0 = data[i - 1], d1 = data[i];
    if (!d0) return;
    const row = !d1 || (hovDate - d0.month < d1.month - hovDate) ? d0 : d1;
    const px = xScale(row.month);

    chartG.select('.crosshair-x').attr('opacity', 0.5).attr('x1', px).attr('x2', px);

    // Push date to spread chart
    setHoverDate(row.month);
    import('./spread.js').then(m => m.drawSharedCrosshair(row.month));

    const fmt = d3.timeFormat('%B %Y');
    let rows = `<div class="tooltip-date">${fmt(row.month)}</div>`;
    for (const s of SERIES) {
        if (!visible.has(s.key)) continue;
        const v = getVal(row, s.key);
        if (v == null) continue;
        rows += `<div class="tooltip-row">
      <span class="tooltip-swatch" style="background:${s.color}"></span>
      <span class="tooltip-name">${s.label}</span>
      <span class="tooltip-val">$${v.toFixed(2)}</span>
    </div>`;
    }
    if (visible.has('wcs') && row.spread_wti_wcs != null) {
        rows += `<div class="tooltip-row" style="margin-top:6px;border-top:1px solid #30363d;padding-top:6px">
      <span class="tooltip-name" style="color:#8b949e">WTI−WCS spread</span>
      <span class="tooltip-val" style="color:#f47067">$${row.spread_wti_wcs.toFixed(2)}</span>
    </div>`;
    }
    showTooltip(event, rows);
}