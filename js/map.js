// map.js — world bubble map, pump prices for 6 countries
// Slider lives in HTML below the SVG — not inside SVG coordinates

const COUNTRY_META = {
    'pump_usa':     { name: 'USA',     coords: [-100, 38],  region: 'americas', labelDy: 1  },
    'pump_canada':  { name: 'Canada',  coords: [ -96, 62],  region: 'americas', labelDy: 1  },
    'pump_uk':      { name: 'UK',      coords: [  -2, 54],  region: 'europe',   labelDy: 1  },
    'pump_germany': { name: 'Germany', coords: [  10, 51],  region: 'europe',   labelDy: 1  },
    'pump_france':  { name: 'France',  coords: [   2, 46],  region: 'europe',   labelDy: 1  },
    'pump_japan':   { name: 'Japan',   coords: [ 138, 36],  region: 'asia',     labelDy: 1  },
};

const REGION_COLOR = {
    americas: '#f0b429',
    europe:   '#58a6ff',
    asia:     '#f47067',
};

// MAP_H is just the map — slider goes in HTML below
const MAP_H = 380;
let initiated = false;

export function initMap(data) {
    if (initiated) return;
    initiated = true;

    const wrap = document.getElementById('map-wrap');
    const W = Math.max(300, wrap.clientWidth || 700);

    const svg = d3.select('#map-chart')
        .attr('width', W)
        .attr('height', MAP_H)
        .attr('viewBox', `0 0 ${W} ${MAP_H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('max-width', '100%')
        .style('display', 'block');

    svg.selectAll('*').remove();

    // ── Year list — derived from any available pump column ───────────────────
    const PUMP_KEYS = Object.keys(COUNTRY_META);  // ['pump_usa', 'pump_canada', ...]

    // Try each pump key until we find one with data
    let years = [];
    for (const key of PUMP_KEYS) {
        years = [...new Set(
            data.filter(d => d[key] != null).map(d => d.month.getFullYear())
        )].sort();
        if (years.length) break;
    }

    // Last resort: use all years in the dataset
    if (!years.length) {
        years = [...new Set(data.map(d => d.month.getFullYear()))].sort();
    }

    // Debug — remove after confirming map works
    console.log('[map] years:', years, '| pump_usa sample:',
        data.slice(0,5).map(d => ({ month: d.month, pump_usa: d.pump_usa }))
    );

    let currentYear = years[years.length - 1];

    // ── Projection — full MAP_H, no slider zone to worry about ───────────────
    const projection = d3.geoNaturalEarth1()
        .scale(W / 5.8)
        .translate([W / 2, MAP_H / 2]);

    const path = d3.geoPath().projection(projection);

    // ── SVG layers ────────────────────────────────────────────────────────────
    const mapG  = svg.append('g');
    const dotsG = svg.append('g');

    // ── TopoJSON world (non-blocking) ─────────────────────────────────────────
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        .then(world => {
            mapG.selectAll('path')
                .data(topojson.feature(world, world.objects.countries).features)
                .join('path')
                .attr('d', path)
                .attr('fill', '#1c2128')
                .attr('stroke', '#30363d')
                .attr('stroke-width', 0.4);
            mapG.append('path')
                .datum(d3.geoGraticule()())
                .attr('d', path)
                .attr('fill', 'none')
                .attr('stroke', '#21262d')
                .attr('stroke-width', 0.3);
            dotsG.raise();
        })
        .catch(() => {
            // Fallback background
            mapG.append('rect')
                .attr('width', W).attr('height', MAP_H)
                .attr('fill', '#161b22').attr('stroke', '#30363d');
        });

    // ── Radius scale ──────────────────────────────────────────────────────────
    // Domain spans realistic pump price range (~40–180 ¢/L).
    // Let's set the normal range from 50-120, other stuff should show more variability
    // To get 5× area difference: area ∝ r², so r_max = r_min × √5 ≈ 2.236
    // Using r_min=8, r_max=18 gives area ratio of (50/5)² ≈ 5.06×
    const rScale = d3.scaleSqrt().domain([50, 120]).range([5, 50]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    let _firstDotDraw = true;
    function getYearAvg(key, year) {
        const vals = data
            .filter(d => d.month.getFullYear() === year && d[key] != null)
            .map(d => d[key]);
        if (_firstDotDraw && key === 'pump_usa') {
            console.log(`[map] getYearAvg pump_usa year=${year}: ${vals.length} values, sample=`, vals.slice(0,3));
            // Also show what keys exist on a row that has data near this year
            const sampleRow = data.find(d => d.month.getFullYear() === year);
            if (sampleRow) {
                const pumpKeys = Object.keys(sampleRow).filter(k => k.startsWith('pump'));
                console.log('[map] pump keys on row:', pumpKeys, '| values:', pumpKeys.map(k => sampleRow[k]));
            }
        }
        return vals.length ? d3.mean(vals) : null;
    }

    const tip = document.getElementById('tooltip');

    // ── Draw dots ─────────────────────────────────────────────────────────────
    function drawDots(year) {
        const dots = Object.entries(COUNTRY_META)
            .map(([key, meta]) => ({
                key, ...meta,
                value: getYearAvg(key, year),
                projected: projection(meta.coords),
            }))
            .filter(d => d.value != null && d.projected);

        const groups = dotsG.selectAll('.map-dot')
            .data(dots, d => d.key);

        const enter = groups.enter().append('g').attr('class', 'map-dot');

        enter.append('circle')
            .attr('cx', d => d.projected[0])
            .attr('cy', d => d.projected[1])
            .attr('r', 0)
            .attr('fill', d => REGION_COLOR[d.region])
            .attr('fill-opacity', 0.28)
            .attr('stroke', d => REGION_COLOR[d.region])
            .attr('stroke-width', 1.8)
            .attr('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                const wtiVals = data.filter(r => r.month.getFullYear() === year && r.wti != null);
                const wtiAvg  = wtiVals.length ? d3.mean(wtiVals, r => r.wti).toFixed(2) : 'N/A';
                tip.innerHTML = `
          <div class="tooltip-date">${d.name} · ${year}</div>
          <div class="tooltip-row">
            <span class="tooltip-swatch" style="background:${REGION_COLOR[d.region]}"></span>
            <span class="tooltip-name">Pump price (ex-tax)</span>
            <span class="tooltip-val">${d.value.toFixed(1)} ¢/L</span>
          </div>
          <div class="tooltip-row">
            <span class="tooltip-name" style="color:#8b949e">WTI avg that year</span>
            <span class="tooltip-val">$${wtiAvg}/bbl</span>
          </div>`;
                tip.classList.remove('hidden');
                positionTip(event);
                d3.select(this).attr('fill-opacity', 0.55).attr('stroke-width', 2.5);
            })
            .on('mousemove', positionTip)
            .on('mouseleave', function() {
                tip.classList.add('hidden');
                d3.select(this).attr('fill-opacity', 0.28).attr('stroke-width', 1.8);
            });

        enter.append('text')
            .attr('text-anchor', 'middle')
            .attr('fill', d => REGION_COLOR[d.region])
            .attr('font-size', '10px')
            .attr('font-weight', '500')
            .attr('pointer-events', 'none');

        const merged = enter.merge(groups);

        merged.select('circle')
            .transition().duration(500)
            .attr('cx', d => d.projected[0])
            .attr('cy', d => d.projected[1])
            .attr('r',  d => rScale(d.value));

        merged.select('text')
            .attr('x', d => d.projected[0])
            .attr('y', d => d.projected[1] - rScale(d.value) - 5)
            .text(d => d.name);

        groups.exit().remove();
        _firstDotDraw = false;
    }

    function positionTip(event) {
        let x = event.clientX + 14, y = event.clientY + 14;
        if (x + 220 > window.innerWidth) x = event.clientX - 234;
        if (y + 120 > window.innerHeight) y = event.clientY - 134;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }

    drawDots(currentYear);

    // ── Region legend (top-left inside SVG) ───────────────────────────────────
    const legG = svg.append('g').attr('transform', 'translate(14, 14)');
    Object.entries(REGION_COLOR).forEach(([region, color], i) => {
        legG.append('circle').attr('cx', 5).attr('cy', i * 20 + 5).attr('r', 5)
            .attr('fill', color).attr('fill-opacity', 0.5).attr('stroke', color);
        legG.append('text').attr('x', 15).attr('y', i * 20 + 5)
            .attr('dominant-baseline', 'central')
            .attr('fill', '#8b949e').attr('font-size', '11px')
            .text(region.charAt(0).toUpperCase() + region.slice(1));
    });

    // ── HTML slider — lives below the SVG, not inside it ──────────────────────
    const sliderWrap = document.getElementById('map-slider-wrap');
    sliderWrap.innerHTML = '';   // clear on re-init

    const sliderW = Math.min(W - 80, 560);

    // Year label + range input
    sliderWrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0 4px;justify-content:center">
      <span style="font-size:11px;color:#484f58">${years[0]}</span>
      <input type="range" id="map-year-slider"
        min="0" max="${years.length - 1}" value="${years.length - 1}"
        style="width:${sliderW}px;accent-color:#f0b429;cursor:pointer">
      <span style="font-size:11px;color:#484f58">${years[years.length - 1]}</span>
      <span id="map-year-label"
        style="font-size:14px;font-weight:600;color:#f0b429;min-width:40px">${currentYear}</span>
    </div>`;

    document.getElementById('map-year-slider').addEventListener('input', function() {
        currentYear = years[+this.value];
        document.getElementById('map-year-label').textContent = currentYear;
        drawDots(currentYear);
    });
}