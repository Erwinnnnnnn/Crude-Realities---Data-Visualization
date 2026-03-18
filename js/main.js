// main.js — entry point
// Loads data, builds series config, initialises all chart modules.

import { initChart, updateChart } from './chart.js';
import { initSpread, updateSpread } from './spread.js';
import { initContext, moveContextBrush } from './context.js';
import { initMap } from './map.js';
import { initHeatmap } from './heatmap.js';
import { initScatter } from './scatter.js';
import { initRace } from './race.js';
import { initScroll } from './scroll.js';

// ── Story chapters ─────────────────────────────────────────────────────────────
// Each chapter zooms to a date range, optionally forces a series set visible,
// and pre-opens a named event annotation by label match.
const CHAPTERS = [
    {
        id: 'overview',
        label: 'Overview',
        range: ['2000-01-01', '2025-12-01'],
        series: ['wti', 'brent', 'wcs', 'urals'],
        highlight: null,
    },
    {
        id: 'crash2008',
        label: '2008 Crash',
        range: ['2007-01-01', '2009-06-01'],
        series: ['wti', 'brent', 'wcs'],
        highlight: 'All-time high $147',
    },
    {
        id: 'shaleglut',
        label: 'Shale Glut',
        range: ['2014-01-01', '2017-06-01'],
        series: ['wti', 'brent', 'opec_basket'],
        highlight: 'OPEC refuses to cut',
    },
    {
        id: 'canadacrisis',
        label: 'Canada Crisis',
        range: ['2017-01-01', '2020-01-01'],
        series: ['wti', 'wcs'],
        highlight: 'WCS hits record $50 discount',
    },
    {
        id: 'covid',
        label: 'COVID & War',
        range: ['2019-10-01', '2023-01-01'],
        series: ['wti', 'brent', 'urals'],
        highlight: 'WTI goes negative: -$37',
    },
];

// ── Series config ─────────────────────────────────────────────────────────────
// Add / remove entries here to change what appears in the viz.
export const SERIES = [
    { key: 'wti',          label: 'WTI',         color: '#f0b429', defaultOn: true  },
    { key: 'brent',        label: 'Brent',        color: '#58a6ff', defaultOn: true  },
    { key: 'wcs',          label: 'WCS',          color: '#f47067', defaultOn: true  },
    { key: 'urals',        label: 'Urals',        color: '#bc8cff', defaultOn: true  },
    { key: 'opec_basket',  label: 'OPEC Basket',  color: '#3fb950', defaultOn: false },
];

// Which series keys are currently visible — mutable, shared across modules
export const visible = new Set(SERIES.filter(s => s.defaultOn).map(s => s.key));

// ── Margin/size constants (shared by all chart modules) ───────────────────────
export const MARGIN = { top: 100, right: 32, bottom: 22, left: 52 };

// ── Price mode: 'nominal' | 'real' ───────────────────────────────────────────
export let priceMode = 'nominal';
export function setPriceMode(m) { priceMode = m; }

// ── State shared by context brush → chart ─────────────────────────────────────
// brushExtent holds the current [Date, Date] zoom window; null = full range
export let brushExtent = null;
export function setBrushExtent(ext) { brushExtent = ext; }

// ── Shared hover date — so both charts light up the same date ─────────────────
export let hoverDate = null;
export function setHoverDate(d) { hoverDate = d; }

// ── Load data ─────────────────────────────────────────────────────────────────
async function load() {
    const [rawRows, events] = await Promise.all([
        d3.csv('data/oil_monthly.csv'),
        d3.json('data/events.json'),
    ]);

    // Parse dates and numeric fields
    const parseMonth = d3.timeParse('%Y-%m-%d');
    const numFields = [
        'wti','brent','wcs','urals','opec_basket',
        'us_gasoline_usd_gal',
        'spread_wti_wcs','spread_wti_brent',
        'wti_real','brent_real','cpi',
        'pump_uk','pump_germany','pump_france',
        'pump_japan','pump_canada','pump_usa',
    ];

    const data = rawRows
        .map(d => {
            const row = { month: parseMonth(d.month) };
            for (const f of numFields) {
                row[f] = d[f] === '' || d[f] == null ? null : +d[f];
            }
            return row;
        })
        .filter(d => d.month !== null)
        .sort((a, b) => a.month - b.month);

    // Parse event dates
    events.forEach(e => { e.date = parseMonth(e.date); });

    return { data, events };
}

// ── Build series toggle buttons ───────────────────────────────────────────────
function buildToggles(onToggle) {
    const container = document.getElementById('series-toggles');
    for (const s of SERIES) {
        const btn = document.createElement('button');
        btn.className = 'series-btn' + (visible.has(s.key) ? ' active' : '');
        btn.dataset.key = s.key;
        btn.innerHTML = `<span class="swatch" style="background:${s.color}"></span>${s.label}`;
        btn.addEventListener('click', () => {
            if (visible.has(s.key)) {
                visible.delete(s.key);
                btn.classList.remove('active');
            } else {
                visible.add(s.key);
                btn.classList.add('active');
            }
            onToggle();
        });
        container.appendChild(btn);
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    const { data, events } = await load();
    const parseMonth = d3.timeParse('%Y-%m-%d');

    // Helper: redraw everything
    function redrawAll() {
        updateChart(data, events);
        updateSpread(data);
    }

    // Initialise all chart modules
    initChart(data, events);
    initSpread(data);
    initContext(data, (ext) => {
        setBrushExtent(ext);
        redrawAll();
    });

    // Series toggle buttons
    buildToggles(redrawAll);

    // Nominal / Real toggle
    document.querySelectorAll('.toggle-btn[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            setPriceMode(btn.dataset.mode);
            document.querySelectorAll('.toggle-btn[data-mode]').forEach(b =>
                b.classList.toggle('active', b === btn)
            );
            redrawAll();
        });
    });

    // ── Story chapter buttons ─────────────────────────────────────────────────
    const chapContainer = document.getElementById('chapter-btns');
    CHAPTERS.forEach(ch => {
        const btn = document.createElement('button');
        btn.className = 'chapter-btn' + (ch.id === 'overview' ? ' active' : '');
        btn.textContent = ch.label;
        btn.addEventListener('click', () => {
            // Update active state
            chapContainer.querySelectorAll('.chapter-btn')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Set visible series
            visible.clear();
            ch.series.forEach(k => visible.add(k));
            // Sync toggle buttons
            document.querySelectorAll('.series-btn').forEach(b => {
                b.classList.toggle('active', visible.has(b.dataset.key));
            });

            // Set brush extent
            const ext = ch.range
                ? [parseMonth(ch.range[0]), parseMonth(ch.range[1])]
                : null;
            setBrushExtent(ext);
            moveContextBrush(ext);

            redrawAll();

            // Pre-open event panel for the highlight event
            if (ch.highlight) {
                const ev = events.find(e => e.label === ch.highlight);
                if (ev) {
                    // small delay so chart redraws first
                    setTimeout(() => {
                        document.getElementById('event-panel')
                            .dispatchEvent(new CustomEvent('open-event', { detail: ev }));
                    }, 350);
                }
            }
        });
        chapContainer.appendChild(btn);
    });

    // ── Play button ───────────────────────────────────────────────────────────
    const playBtn = document.getElementById('play-btn');
    let playing = false;
    let playTimer = null;

    playBtn.addEventListener('click', () => {
        if (playing) {
            playing = false;
            clearInterval(playTimer);
            playBtn.innerHTML = '&#9654; Play';
            playBtn.classList.remove('playing');
            return;
        }
        playing = true;
        playBtn.textContent = '⏸ Pause';
        playBtn.classList.add('playing');

        // Reset to full range first
        setBrushExtent(null);
        moveContextBrush(null);

        const startDate = data[0].month;
        const endDate   = data[data.length - 1].month;
        const totalMs   = endDate - startDate;
        const stepMs    = totalMs / 140;

        let current = new Date(startDate);
        playTimer = setInterval(() => {
            current = new Date(+current + stepMs);
            if (current >= endDate) {
                current = endDate;
                clearInterval(playTimer);
                playing = false;
                playBtn.innerHTML = '&#9654; Play';
                playBtn.classList.remove('playing');
            }
            setBrushExtent([startDate, current]);
            moveContextBrush([startDate, current]);
            redrawAll();
        }, 40);
    });

    // Window resize — reinitialise
    window.addEventListener('resize', () => {
        initChart(data, events);
        initSpread(data);
        initContext(data, (ext) => {
            setBrushExtent(ext);
            redrawAll();
        });
    });

    // ── Scrollytelling — init each section when it enters view ────────────────
    initScroll({
        benchmarks: () => {
            // already initialised above; just re-trigger draw-on-load animation
            // by resetting isFirstDraw via re-init
            initChart(data, events);
        },
        map:     () => initMap(data),
        heatmap: () => initHeatmap(data),
        scatter: () => initScatter(data),
        race:    () => initRace(data),
    });
})();