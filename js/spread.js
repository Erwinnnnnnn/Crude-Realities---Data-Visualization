// spread.js — WTI−WCS spread area chart (linked x-axis + shared hover)
import { MARGIN, brushExtent, setHoverDate } from './main.js';

const SPREAD_H = 330;
let svg, spreadG, xScale, yScale, width;
let _data = null;

// Called by chart.js mousemove to draw crosshair here (Gap 2)
export function drawSharedCrosshair(date) {
    if (!spreadG || !xScale) return;
    const height = SPREAD_H - MARGIN.top - MARGIN.bottom;
    const [x0, x1] = xScale.domain();
    if (date < x0 || date > x1) { spreadG.select('.sh-cross').attr('opacity', 0); return; }
    spreadG.select('.sh-cross')
        .attr('opacity', 0.4).attr('x1', xScale(date)).attr('x2', xScale(date));
}
export function clearSharedCrosshair() {
    if (spreadG) spreadG.select('.sh-cross').attr('opacity', 0);
}

export function initSpread(data) {
    _data = data;
    const container = document.getElementById('spread-container');
    const totalW = container.clientWidth;
    width  = totalW - MARGIN.left - MARGIN.right;
    const height = SPREAD_H - MARGIN.top - MARGIN.bottom;

    const svgEl = document.getElementById('spread-chart');
    svgEl.setAttribute('height', SPREAD_H);
    d3.select(svgEl).selectAll('*').remove();

    svg = d3.select(svgEl);
    spreadG = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    svg.append('defs').append('clipPath').attr('id', 'spread-clip')
        .append('rect').attr('width', width).attr('height', height + 4).attr('y', -4);

    xScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.month))
        .range([0, width]);

    yScale = d3.scaleLinear().range([height, 0]);

    spreadG.append('g').attr('class', 'axis axis-x').attr('transform', `translate(0,${height})`);
    spreadG.append('g').attr('class', 'axis axis-y');
    spreadG.append('g').attr('class', 'grid grid-y');

    spreadG.append('line').attr('class', 'zero-line')
        .attr('x1', 0).attr('x2', width)
        .attr('stroke', '#30363d').attr('stroke-width', 1);

    const areaG = spreadG.append('g')
        .attr('class', 'spread-area-group')
        .attr('clip-path', 'url(#spread-clip)');

    areaG.append('path').attr('class', 'spread-area-pos');
    areaG.append('path').attr('class', 'spread-area-neg');
    areaG.append('path').attr('class', 'spread-line-path');

    // Shared crosshair line for Gap 2
    spreadG.append('line').attr('class', 'sh-cross')
        .attr('opacity', 0).attr('y1', 0).attr('y2', height)
        .attr('stroke', '#8b949e').attr('stroke-width', 1);

    // Spread chart also drives shared hover back to main chart
    spreadG.append('rect')
        .attr('width', width).attr('height', height)
        .attr('fill', 'transparent')
        .on('mousemove', function(event) {
            const [mx] = d3.pointer(event);
            const hovDate = xScale.invert(mx);
            const bisect = d3.bisector(d => d.month).left;
            const i = bisect(data, hovDate, 1);
            const d0 = data[i-1], d1 = data[i];
            if (!d0) return;
            const row = !d1 || hovDate - d0.month < d1.month - hovDate ? d0 : d1;
            setHoverDate(row.month);
            drawSharedCrosshair(row.month);
            import('./chart.js').then(m => m.drawSharedCrosshair(row.month));
        })
        .on('mouseleave', function() {
            clearSharedCrosshair();
            setHoverDate(null);
            import('./chart.js').then(m => m.clearSharedCrosshair());
        });

    updateSpread(data);
}

export function updateSpread(data) {
    if (!spreadG) return;
    const height = SPREAD_H - MARGIN.top - MARGIN.bottom;

    const xDomain = brushExtent
        ? brushExtent
        : d3.extent(data, d => d.month);
    xScale.domain(xDomain);

    const inView = data.filter(d =>
        d.month >= xDomain[0] && d.month <= xDomain[1] && d.spread_wti_wcs != null
    );

    const vals = inView.map(d => d.spread_wti_wcs);
    const yMin = Math.min(0, d3.min(vals) ?? 0);
    const yMax = Math.max(0, d3.max(vals) ?? 50);
    const pad  = (yMax - yMin) * 0.1;
    yScale.domain([yMin - pad, yMax + pad]);

    // Zero line y position
    spreadG.select('.zero-line')
        .transition().duration(300)
        .attr('y1', yScale(0)).attr('y2', yScale(0));

    // Axes
    spreadG.select('.axis-x')
        .transition().duration(300)
        .call(d3.axisBottom(xScale).ticks(6).tickSizeOuter(0));

    spreadG.select('.axis-y')
        .transition().duration(300)
        .call(d3.axisLeft(yScale).ticks(4).tickFormat(d => `$${d}`).tickSizeOuter(0));

    spreadG.select('.grid-y')
        .transition().duration(300)
        .call(d3.axisLeft(yScale).ticks(4).tickSize(-width).tickFormat(''))
        .select('.domain').remove();

    // Area generators
    const areaPos = d3.area()
        .defined(d => d.spread_wti_wcs != null)
        .x(d => xScale(d.month))
        .y0(yScale(0))
        .y1(d => yScale(Math.max(0, d.spread_wti_wcs)))
        .curve(d3.curveMonotoneX);

    const areaNeg = d3.area()
        .defined(d => d.spread_wti_wcs != null)
        .x(d => xScale(d.month))
        .y0(yScale(0))
        .y1(d => yScale(Math.min(0, d.spread_wti_wcs)))
        .curve(d3.curveMonotoneX);

    const lineGen = d3.line()
        .defined(d => d.spread_wti_wcs != null)
        .x(d => xScale(d.month))
        .y(d => yScale(d.spread_wti_wcs))
        .curve(d3.curveMonotoneX);

    const areaG = spreadG.select('.spread-area-group');

    areaG.select('.spread-area-pos')
        .datum(data)
        .transition().duration(300)
        .attr('fill', '#f47067').attr('fill-opacity', 0.22)
        .attr('d', areaPos);

    areaG.select('.spread-area-neg')
        .datum(data)
        .transition().duration(300)
        .attr('fill', '#3fb950').attr('fill-opacity', 0.22)
        .attr('d', areaNeg);

    areaG.select('.spread-line-path')
        .datum(data)
        .transition().duration(300)
        .attr('fill', 'none')
        .attr('stroke', '#f47067')
        .attr('stroke-width', 1.5)
        .attr('d', lineGen);
}