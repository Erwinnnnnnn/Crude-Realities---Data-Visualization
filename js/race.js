// race.js — animated bar chart race of WTI / Brent / WCS / Urals / OPEC
// Bars update every ~40ms, racing through months 2000→2025

const RACE_SERIES = [
    { key: 'wti',          label: 'WTI (USA)',      color: '#f0b429' },
    { key: 'brent',        label: 'Brent (Global)', color: '#58a6ff' },
    { key: 'wcs',          label: 'WCS (Canada)',   color: '#f47067' },
    { key: 'urals',        label: 'Urals (Russia)', color: '#bc8cff' },
    { key: 'opec_basket',  label: 'OPEC Basket',    color: '#3fb950' },
];

let initiated = false;

export function initRace(data) {
    if (initiated) return;
    initiated = true;

    const container = document.getElementById('race-container');
    const W = Math.max(300, (container.parentElement?.clientWidth || container.clientWidth || 700) - 48);
    const H = 340;  // extra 20px headroom for date label
    const MARGIN = { top: 44, right: 90, bottom: 30, left: 140 };  // top increased
    const iW = W - MARGIN.left - MARGIN.right;
    const iH = H - MARGIN.top - MARGIN.bottom;

    const svg = d3.select('#race-chart')
        .attr('width', W).attr('height', H)
        .attr('viewBox', `0 0 ${W} ${H}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('max-width', '100%');
    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Filter data to rows where at least one series has a value
    const frames = data.filter(d =>
        RACE_SERIES.some(s => d[s.key] != null)
    );

    let frameIdx = 0;
    let timer = null;
    let playing = false;

    // ── Scales ────────────────────────────────────────────────────────────────
    const xScale = d3.scaleLinear().range([0, iW]);
    const yScale = d3.scaleBand()
        .domain(RACE_SERIES.map(s => s.key))
        .range([0, iH])
        .padding(0.25);

    // Axes
    const xAxisG = g.append('g').attr('class', 'axis axis-x').attr('transform', `translate(0,${iH})`);
    g.append('g').attr('class', 'axis axis-y')
        .call(d3.axisLeft(yScale)
            .tickFormat(k => RACE_SERIES.find(s => s.key === k)?.label ?? k)
            .tickSizeOuter(0));

    // Date label
    const dateLabel = svg.append('text')
        .attr('x', MARGIN.left + iW)
        .attr('y', 28)
        .attr('fill', '#f0b429')
        .attr('font-size', '20px')
        .attr('font-weight', '700')
        .attr('text-anchor', 'end');

    // ── Draw a frame ─────────────────────────────────────────────────────────
    function drawFrame(idx, animate) {
        const row = frames[idx];
        const vals = RACE_SERIES.map(s => ({ key: s.key, value: row[s.key] ?? 0 }));
        const maxVal = d3.max(vals, d => d.value) || 150;

        xScale.domain([0, maxVal * 1.08]);

        xAxisG.transition().duration(animate ? 80 : 0)
            .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `$${d}`).tickSizeOuter(0));

        const dur = animate ? 80 : 0;
        const fmt = d3.timeFormat('%b %Y');
        dateLabel.text(fmt(row.month));

        // Bars
        const bars = g.selectAll('.race-bar')
            .data(vals, d => d.key);

        bars.join(
            enter => enter.append('rect')
                .attr('class', 'race-bar')
                .attr('x', 0)
                .attr('y', d => yScale(d.key))
                .attr('height', yScale.bandwidth())
                .attr('rx', 3)
                .attr('fill', d => RACE_SERIES.find(s => s.key === d.key)?.color ?? '#888')
                .attr('fill-opacity', 0.75)
                .attr('width', d => xScale(d.value)),
            update => update.transition().duration(dur)
                .attr('width', d => xScale(d.value)),
            exit => exit.remove()
        );

        // Value labels on bars
        const labels = g.selectAll('.race-val')
            .data(vals, d => d.key);

        labels.join(
            enter => enter.append('text')
                .attr('class', 'race-val')
                .attr('y', d => yScale(d.key) + yScale.bandwidth() / 2)
                .attr('dominant-baseline', 'central')
                .attr('fill', '#e6edf3')
                .attr('font-size', '12px')
                .attr('font-weight', '500')
                .attr('x', d => xScale(d.value) + 6)
                .text(d => d.value > 0 ? `$${d.value.toFixed(1)}` : '—'),
            update => update.transition().duration(dur)
                .attr('x', d => xScale(d.value) + 6)
                .text(d => d.value > 0 ? `$${d.value.toFixed(1)}` : '—'),
            exit => exit.remove()
        );
    }

    drawFrame(0, false);

    // ── Controls ──────────────────────────────────────────────────────────────
    const ctrlDiv = document.getElementById('race-controls');

    const playBtn = document.createElement('button');
    playBtn.id = 'race-play-btn';
    playBtn.className = 'chapter-btn active';
    playBtn.innerHTML = '&#9654; Play';
    ctrlDiv.appendChild(playBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'chapter-btn';
    resetBtn.textContent = 'Reset';
    ctrlDiv.appendChild(resetBtn);

    // Speed selector
    const speedLabel = document.createElement('label');
    speedLabel.style.cssText = 'font-size:12px;color:#8b949e;display:flex;align-items:center;gap:8px;margin-left:12px';
    speedLabel.innerHTML = `Speed: <input type="range" id="race-speed" min="20" max="200" value="60" step="20"
    style="width:100px;accent-color:#f0b429">`;
    ctrlDiv.appendChild(speedLabel);

    let speed = 60;
    document.getElementById('race-speed')?.addEventListener('input', function() {
        speed = +this.value;
        if (playing) { stop(); start(); }
    });

    function start() {
        playing = true;
        playBtn.innerHTML = '⏸ Pause';
        timer = setInterval(() => {
            frameIdx++;
            if (frameIdx >= frames.length) {
                frameIdx = frames.length - 1;
                stop();
                playBtn.innerHTML = '&#9654; Play';
                return;
            }
            drawFrame(frameIdx, true);
        }, speed);
    }

    function stop() {
        playing = false;
        clearInterval(timer);
        timer = null;
    }

    playBtn.addEventListener('click', () => {
        if (playing) { stop(); playBtn.innerHTML = '&#9654; Play'; }
        else {
            if (frameIdx >= frames.length - 1) frameIdx = 0;
            start();
        }
    });

    resetBtn.addEventListener('click', () => {
        stop();
        frameIdx = 0;
        playBtn.innerHTML = '&#9654; Play';
        drawFrame(0, false);
    });

    // Progress scrubber
    const scrubDiv = document.createElement('div');
    scrubDiv.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:6px';
    scrubDiv.innerHTML = `
    <span style="font-size:11px;color:#484f58">2000</span>
    <input type="range" id="race-scrub" min="0" max="${frames.length - 1}" value="0"
      style="flex:1;accent-color:#f0b429">
    <span style="font-size:11px;color:#484f58">2025</span>`;
    document.getElementById('race-controls').appendChild(scrubDiv);

    document.getElementById('race-scrub')?.addEventListener('input', function() {
        stop();
        playBtn.innerHTML = '&#9654; Play';
        frameIdx = +this.value;
        drawFrame(frameIdx, false);
    });

    // Keep scrubber in sync while playing
    const origStart = start;
    function startWithSync() {
        origStart();
        const syncTimer = setInterval(() => {
            const scrub = document.getElementById('race-scrub');
            if (scrub) scrub.value = frameIdx;
            if (!playing) clearInterval(syncTimer);
        }, 100);
    }

    playBtn.addEventListener('click', () => {}); // already bound above, just ensure sync
    // Replace start reference
    Object.defineProperty(window, '__raceStart', { value: startWithSync });
}