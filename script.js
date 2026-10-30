/* ==========================================================
   NEXUS DATA - Lógica de la aplicación
   JavaScript puro, sin dependencias.
   ========================================================== */

'use strict';

/* ---------- Configuración general ---------- */
const APP_VERSION = '1.0.0';   // Cambia aquí la versión: se actualiza en toda la interfaz.
const MIN_DIM = 1;
const MAX_DIM = 10;
const DEFAULT_DIMS = { A: { filas: 2, columnas: 3 }, B: { filas: 3, columnas: 2 } };

/* ==========================================================
   1. FUNCIONES MATEMÁTICAS (independientes del DOM)
   ========================================================== */

/* ---------- Fracciones exactas (BigInt) ---------- */

/** Una fracción es { n, d } con d > 0 y reducida al mínimo. */
function isFraction(value) {
    return typeof value === 'object' && value !== null && typeof value.n === 'bigint';
}

function bigGcd(a, b) {
    if (a < 0n) a = -a;
    if (b < 0n) b = -b;
    while (b !== 0n) { [a, b] = [b, a % b]; }
    return a;
}

function makeFraction(n, d) {
    if (d === 0n) throw new Error('Denominador cero.');
    if (d < 0n) { n = -n; d = -d; }
    const g = bigGcd(n, d) || 1n;
    return { n: n / g, d: d / g };
}

function fractionAdd(x, y) { return makeFraction(x.n * y.d + y.n * x.d, x.d * y.d); }
function fractionMul(x, y) { return makeFraction(x.n * y.n, x.d * y.d); }
function fractionToNumber(x) { return Number(x.n) / Number(x.d); }

/** Texto de una fracción: entero si d = 1, de lo contrario "n/d". */
function formatFraction(x) {
    return x.d === 1n ? x.n.toString() : x.n.toString() + '/' + x.d.toString();
}

/** Convierte un decimal en texto ("-0,25") a fracción exacta. */
function decimalTextToFraction(text) {
    let sign = 1n;
    if (text[0] === '-') sign = -1n;
    if (text[0] === '-' || text[0] === '+') text = text.slice(1);
    const [entera, decimal = ''] = text.replace(',', '.').split('.');
    const digits = (entera || '0') + decimal;
    return makeFraction(sign * BigInt(digits), 10n ** BigInt(decimal.length));
}

/* ---------- Radicales exactos (BigInt) ---------- */

/**
 * Un radical es { r: [ { s, q }, ... ] } y representa Σ q·√s, donde cada s es un entero
 * libre de cuadrados (s = 1 es la parte racional), q es una fracción { n, d } distinta de
 * cero y los términos van ordenados por s. Un arreglo vacío es el cero.
 */
function isRadical(value) {
    return typeof value === 'object' && value !== null && Array.isArray(value.r);
}

function radicalFromFraction(f) {
    return { r: f.n === 0n ? [] : [{ s: 1n, q: f }] };
}

function radicalFromMap(map) {
    const terms = [];
    Array.from(map.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).forEach(s => {
        const q = map.get(s);
        if (q.n !== 0n) terms.push({ s, q });
    });
    return { r: terms };
}

function radicalAdd(x, y) {
    const map = new Map();
    [x, y].forEach(rad => rad.r.forEach(t => {
        map.set(t.s, map.has(t.s) ? fractionAdd(map.get(t.s), t.q) : t.q);
    }));
    return radicalFromMap(map);
}

function radicalMul(x, y) {
    const map = new Map();
    x.r.forEach(a => y.r.forEach(b => {
        // √a·√b = g·√((a/g)(b/g)), con g = mcd(a, b): el radicando resultante sigue libre de cuadrados.
        const g = bigGcd(a.s, b.s);
        const s = (a.s / g) * (b.s / g);
        const q = fractionMul(fractionMul(a.q, b.q), makeFraction(g, 1n));
        map.set(s, map.has(s) ? fractionAdd(map.get(s), q) : q);
    }));
    return radicalFromMap(map);
}

/** Inverso de un radical de un solo término: 1/(q·√s) = √s/(q·s). */
function radicalInverse(x) {
    const t = x.r[0];
    return { r: [{ s: t.s, q: makeFraction(t.q.d, t.q.n * t.s) }] };
}

function radicalToNumber(x) {
    return x.r.reduce((total, t) => total + fractionToNumber(t.q) * Math.sqrt(Number(t.s)), 0);
}

/** Texto de un radical: "√2/2", "2√3/5", "1/2 + √3/3", "0". */
function formatRadical(x) {
    if (x.r.length === 0) return '0';
    return x.r.map((t, index) => {
        const negative = t.q.n < 0n;
        const abs = negative ? -t.q.n : t.q.n;
        const den = t.q.d !== 1n ? '/' + t.q.d.toString() : '';
        const body = t.s === 1n
            ? abs.toString() + den
            : (abs === 1n ? '' : abs.toString()) + '√' + t.s.toString() + den;
        if (index === 0) return (negative ? '-' : '') + body;
        return (negative ? ' - ' : ' + ') + body;
    }).join('');
}

/** Descompone un entero positivo como k²·s con s libre de cuadrados. */
function squareFreeParts(radicand) {
    let n = Number(radicand);
    let k = 1;
    let s = 1;
    for (let p = 2; p * p <= n; p++) {
        let exponent = 0;
        while (n % p === 0) { n /= p; exponent++; }
        k *= Math.pow(p, Math.floor(exponent / 2));
        if (exponent % 2) s *= p;
    }
    return { k: BigInt(k), s: BigInt(s * n) };
}

const RADICAL_WORD = /√|sqrt|ra[ií]z/;

/** Un término es un entero o c√r (ej.: 3, √2, 2√3, -5√7, sqrt(2), raiz3). Devuelve un radical o null. */
function parseRadicalTerm(text) {
    const m = text.match(/^([+-]?)\s*(\d+)?\s*(?:\*?\s*(?:√|sqrt|ra[ií]z)\s*(?:\(\s*(\d+)\s*\)|(\d+)))?$/);
    if (!m) return null;
    const hasCoef = m[2] !== undefined;
    const radicandText = m[3] !== undefined ? m[3] : m[4];
    if (!hasCoef && radicandText === undefined) return null;
    if (radicandText !== undefined && radicandText.length > 12) return null;

    const sign = m[1] === '-' ? -1n : 1n;
    const coef = hasCoef ? BigInt(m[2]) : 1n;
    if (radicandText === undefined) return radicalFromFraction(makeFraction(sign * coef, 1n));

    const radicand = BigInt(radicandText);
    if (radicand === 0n || coef === 0n) return { r: [] };
    const { k, s } = squareFreeParts(radicand);
    return { r: [{ s, q: makeFraction(sign * coef * k, 1n) }] };
}

/** Casilla con raíz: término o término/término (el denominador puede ser negativo). */
function parseRadicalCell(text) {
    const parts = text.split('/');
    if (parts.length > 2) return null;
    const numerator = parseRadicalTerm(parts[0].trim());
    if (!numerator) return null;
    if (parts.length === 1) return numerator;
    const denominator = parseRadicalTerm(parts[1].trim());
    if (!denominator || denominator.r.length === 0) return null;   // denominador 0 no válido
    return radicalMul(numerator, radicalInverse(denominator));
}

/**
 * Convierte el texto de una casilla en número.
 * Acepta enteros, decimales (punto o coma), fracciones (ej.: 3/4, -2/5, 3/-4)
 * y fracciones con raíces cuadradas (ej.: √2/2, 3/√5, 2√3/-4, sqrt(2)/2).
 * Devuelve { ok: true, value, fraction, isFraction } (o radical e isRadical si hay raíces) o
 *         { ok: false, reason: 'vacio' | 'invalido' }.
 * Un campo vacío NUNCA se interpreta como cero. Un denominador 0 es inválido.
 */
function parseCellValue(rawText) {
    const text = String(rawText).trim().replace(/\u2212/g, '-');
    if (text === '') return { ok: false, reason: 'vacio' };

    // Fracción con raíces cuadradas (ej.: √2/2, 3/√5, 2√3/-4).
    const lower = text.toLowerCase();
    if (RADICAL_WORD.test(lower)) {
        const radical = parseRadicalCell(lower);
        if (!radical) return { ok: false, reason: 'invalido' };
        return { ok: true, value: radicalToNumber(radical), radical, fraction: null, isFraction: false, isRadical: true };
    }

    // Fracción: entero / entero, con signo opcional en el numerador y en el denominador.
    const fractionMatch = text.match(/^([+-]?)(\d+)\s*\/\s*([+-]?)(\d+)$/);
    if (fractionMatch) {
        const den = BigInt(fractionMatch[4]);
        if (den === 0n) return { ok: false, reason: 'invalido' };
        const num = BigInt(fractionMatch[2]) * (fractionMatch[1] === '-' ? -1n : 1n);
        const fraction = makeFraction(num, den * (fractionMatch[3] === '-' ? -1n : 1n));
        return { ok: true, value: fractionToNumber(fraction), fraction, isFraction: true };
    }

    // Entero o decimal, con signo opcional; acepta punto o coma decimal.
    if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(text)) return { ok: false, reason: 'invalido' };
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalido' };
    return { ok: true, value, fraction: decimalTextToFraction(text), isFraction: false };
}

/** Verifica la condición: columnas de A = filas de B. */
function areDimensionsCompatible(columnasA, filasB) {
    return columnasA === filasB;
}

/**
 * Producto matricial C = A × B con ciclos anidados.
 * A es m×n y B es n×p; C es m×p.
 * c_ij = Σ_{k=1..n} a_ik · b_kj
 * Devuelve la matriz C y, para cada c_ij, el detalle de los productos.
 */
function multiplyMatrices(A, B) {
    const m = A.length;
    const n = A[0].length;
    const p = B[0].length;

    if (B.length !== n) {
        throw new Error('Las columnas de A deben coincidir con las filas de B.');
    }

    const C = [];
    const details = [];

    // Si los elementos son fracciones o radicales se calcula con aritmética exacta.
    const useRadicals = isRadical(A[0][0]);
    const useFractions = isFraction(A[0][0]);
    const multiply = useRadicals ? radicalMul : useFractions ? fractionMul : (x, y) => x * y;
    const add = useRadicals ? radicalAdd : useFractions ? fractionAdd : (x, y) => x + y;

    for (let i = 0; i < m; i++) {
        const filaC = [];
        const filaDetalle = [];
        for (let j = 0; j < p; j++) {
            let suma = useRadicals ? { r: [] } : useFractions ? makeFraction(0n, 1n) : 0;
            const terminos = [];
            for (let k = 0; k < n; k++) {
                const producto = multiply(A[i][k], B[k][j]);
                terminos.push({ a: A[i][k], b: B[k][j], producto });
                suma = add(suma, producto);
            }
            filaC.push(suma);
            filaDetalle.push({ fila: i, columna: j, terminos, suma });
        }
        C.push(filaC);
        details.push(filaDetalle);
    }
    return { C, details };
}

/** Da formato a un número evitando ruido de punto flotante (0.1+0.2 → 0.3). */
function formatNumber(value) {
    if (isRadical(value)) return formatRadical(value);
    if (isFraction(value)) return formatFraction(value);
    if (Object.is(value, -0)) value = 0;
    const rounded = parseFloat(value.toFixed(10));
    return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Operando entre paréntesis si es negativo (o fracción), para evitar ambigüedades. */
function formatOperand(value) {
    const text = formatNumber(value);
    if (isRadical(value)) {
        const plain = value.r.length === 0 ||
            (value.r.length === 1 && value.r[0].s === 1n && value.r[0].q.d === 1n && value.r[0].q.n > 0n);
        return plain ? text : '(' + text + ')';
    }
    if (isFraction(value)) return (value.n < 0n || value.d !== 1n) ? '(' + text + ')' : text;
    return value < 0 ? '(' + text + ')' : text;
}

/** Números en subíndice: 1 → ₁, 12 → ₁₂ */
function toSubscript(number) {
    const digits = '₀₁₂₃₄₅₆₇₈₉';
    return String(number).split('').map(d => digits[Number(d)]).join('');
}

/** Referencia de posición, ej.: A₁₁ o c₁,₁₀ (con coma si algún índice es de dos cifras). */
function positionLabel(letter, row, col) {
    const sep = (row >= 10 || col >= 10) ? ',' : '';
    return letter + toSubscript(row) + sep + toSubscript(col);
}

/* Exportación para pruebas en Node (no afecta al navegador). */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseCellValue, areDimensionsCompatible, multiplyMatrices, formatNumber, positionLabel, isFraction, fractionToNumber, isRadical, radicalToNumber };
}

/* ==========================================================
   2. INTERFAZ (solo se ejecuta en el navegador)
   ========================================================== */
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initApp);
}

function initApp() {
    /* ---------- Referencias al DOM ---------- */
    const $ = (id) => document.getElementById(id);

    const selects = {
        A: { filas: $('filasA'), columnas: $('columnasA') },
        B: { filas: $('filasB'), columnas: $('columnasB') }
    };
    const grids = { A: $('gridA'), B: $('gridB') };
    const dimLabels = { A: $('dimA'), B: $('dimB') };

    const compatibilityBox = $('compatibilidad');
    const errorBox = $('mensajeError');
    const resultArea = $('areaResultado');
    const procedureArea = $('areaProcedimiento');
    const resultGrid = $('gridResultado');
    const procedureBox = $('procedimiento');

    /* Valores guardados de las casillas (para conservar lo escrito al cambiar dimensiones). */
    const stored = { A: [], B: [] };

    /* Teclado propio en dispositivos táctiles (teléfonos y tabletas). */
    const useTouchKeypad = !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);

    /* ---------- Versión ---------- */
    document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = APP_VERSION; });

    /* ---------- Utilidades DOM ---------- */
    function createElement(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function getDims(letter) {
        return {
            filas: Number(selects[letter].filas.value),
            columnas: Number(selects[letter].columnas.value)
        };
    }

    /* ==========================================================
       NAVEGACIÓN
       ========================================================== */
    const navLinks = document.querySelectorAll('[data-nav]');
    const views = document.querySelectorAll('.view');
    const mainNav = $('mainNav');
    const menuToggle = $('menuToggle');
    const validViews = Array.from(views).map(v => v.id);

    function showView(viewId) {
        if (!validViews.includes(viewId)) viewId = 'multiplicacion';

        views.forEach(view => {
            const active = view.id === viewId;
            view.hidden = !active;
            view.classList.toggle('is-visible', active);
        });

        document.querySelectorAll('.nav-link').forEach(link => {
            const active = link.dataset.nav === viewId;
            link.classList.toggle('is-active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });

        closeMenu();
        window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function closeMenu() {
        mainNav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Abrir menú');
    }

    menuToggle.addEventListener('click', () => {
        const open = mainNav.classList.toggle('is-open');
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && mainNav.classList.contains('is-open')) {
            closeMenu();
            menuToggle.focus();
        }
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const target = link.dataset.nav;
            try { history.pushState(null, '', '#' + target); } catch (e) { /* ignorar en entornos restringidos */ }
            showView(target);
        });
    });

    window.addEventListener('popstate', () => showView(location.hash.replace('#', '')));
    showView(location.hash.replace('#', '') || 'multiplicacion');

    /* Pestañas de "Acerca de" */
    const subtabs = Array.from(document.querySelectorAll('.subtab'));

    function showSubtab(name) {
        subtabs.forEach(tab => {
            const active = tab.dataset.subtab === name;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            const panel = $(tab.getAttribute('aria-controls'));
            panel.hidden = !active;
            panel.classList.toggle('is-visible', active);
        });
    }

    subtabs.forEach((tab, index) => {
        tab.addEventListener('click', () => showSubtab(tab.dataset.subtab));
        tab.addEventListener('keydown', (event) => {
            let nextIndex = null;
            if (event.key === 'ArrowRight') nextIndex = (index + 1) % subtabs.length;
            if (event.key === 'ArrowLeft') nextIndex = (index - 1 + subtabs.length) % subtabs.length;
            if (nextIndex !== null) {
                event.preventDefault();
                subtabs[nextIndex].focus();
                showSubtab(subtabs[nextIndex].dataset.subtab);
            }
        });
    });

    /* ==========================================================
       IMÁGENES OPCIONALES (si faltan, la app sigue funcionando)
       ========================================================== */
    function handleMissingImage(img) {
        const mark = img.closest('.brand-mark');
        const splashBox = img.closest('.splash');
        if (mark) mark.classList.add('no-image');
        else if (splashBox) splashBox.classList.add('no-image');
        else img.hidden = true;
    }

    document.querySelectorAll('img').forEach(img => {
        if (img.complete && img.naturalWidth === 0) handleMissingImage(img);
        img.addEventListener('error', () => handleMissingImage(img));
    });

    /* ==========================================================
       SELECTORES DE DIMENSIONES
       ========================================================== */
    function fillSelect(select, selected) {
        select.innerHTML = '';
        for (let n = MIN_DIM; n <= MAX_DIM; n++) {
            const option = createElement('option', '', String(n));
            option.value = String(n);
            select.appendChild(option);
        }
        select.value = String(selected);
    }

    ['A', 'B'].forEach(letter => {
        fillSelect(selects[letter].filas, DEFAULT_DIMS[letter].filas);
        fillSelect(selects[letter].columnas, DEFAULT_DIMS[letter].columnas);
    });

    /* ==========================================================
       CUADRÍCULAS DE ENTRADA
       ========================================================== */
    function saveCurrentValues(letter) {
        const values = [];
        grids[letter].querySelectorAll('.cell-input').forEach(input => {
            const r = Number(input.dataset.row);
            const c = Number(input.dataset.col);
            if (!values[r]) values[r] = [];
            values[r][c] = input.value;
        });
        stored[letter] = values;
    }

    function buildGrid(letter) {
        const { filas, columnas } = getDims(letter);
        const grid = grids[letter];
        grid.innerHTML = '';
        grid.style.gridTemplateColumns = 'repeat(' + columnas + ', auto)';

        for (let r = 0; r < filas; r++) {
            for (let c = 0; c < columnas; c++) {
                const cell = createElement('div', 'cell');
                const inputId = 'celda' + letter + '_' + r + '_' + c;
                const label = positionLabel(letter, r + 1, c + 1);

                const labelEl = createElement('label', 'cell-label', label);
                labelEl.setAttribute('for', inputId);

                const input = document.createElement('input');
                input.type = 'text';
                // En pantallas táctiles se usa el teclado propio (con signos y fracciones).
                input.inputMode = useTouchKeypad ? 'none' : 'decimal';
                input.autocomplete = 'off';
                input.className = 'cell-input';
                input.id = inputId;
                input.dataset.matrix = letter;
                input.dataset.row = String(r);
                input.dataset.col = String(c);
                input.setAttribute('aria-label', 'Matriz ' + letter + ', fila ' + (r + 1) + ', columna ' + (c + 1));

                // Solo se recupera lo escrito en posiciones que siguen existiendo.
                const previous = stored[letter][r] && stored[letter][r][c];
                input.value = previous !== undefined ? previous : '';

                input.addEventListener('input', () => input.classList.remove('is-invalid'));
                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') { event.preventDefault(); calculate(); }
                });

                cell.append(labelEl, input);
                grid.appendChild(cell);
            }
        }
        updateDimLabel(letter);
    }

    function updateDimLabel(letter) {
        const { filas, columnas } = getDims(letter);
        dimLabels[letter].textContent = filas + ' × ' + columnas;
    }

    function hideResults() {
        resultArea.hidden = true;
        procedureArea.hidden = true;
        resultGrid.innerHTML = '';
        procedureBox.innerHTML = '';
    }

    function hideError() {
        errorBox.hidden = true;
        errorBox.textContent = '';
    }

    function updateCompatibility() {
        const a = getDims('A');
        const b = getDims('B');
        compatibilityBox.className = 'status';
        if (areDimensionsCompatible(a.columnas, b.filas)) {
            compatibilityBox.classList.add('status-ok');
            compatibilityBox.textContent =
                'Dimensiones compatibles: A (' + a.filas + ' × ' + a.columnas + ') × B (' + b.filas + ' × ' + b.columnas +
                ') da como resultado C (' + a.filas + ' × ' + b.columnas + ').';
        } else {
            compatibilityBox.classList.add('status-warn');
            compatibilityBox.textContent =
                'Dimensiones no compatibles: las columnas de A (' + a.columnas + ') deben coincidir con las filas de B (' + b.filas + ').';
        }
    }

    function onDimensionChange(event) {
        const letter = event.target.dataset.matriz;
        saveCurrentValues(letter);
        buildGrid(letter);
        hideResults();
        hideError();
        updateCompatibility();
    }

    ['A', 'B'].forEach(letter => {
        selects[letter].filas.addEventListener('change', onDimensionChange);
        selects[letter].columnas.addEventListener('change', onDimensionChange);
    });

    /* ==========================================================
       LECTURA Y VALIDACIÓN
       ========================================================== */
    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    /** Lee una matriz desde la cuadrícula. Devuelve { matrix, problems }. */
    function readMatrix(letter) {
        const { filas, columnas } = getDims(letter);
        const matrix = [];
        const fractions = [];
        const radicals = [];
        const empty = [];
        const invalid = [];
        let hasFraction = false;
        let hasRadical = false;

        for (let r = 0; r < filas; r++) {
            const row = [];
            const fractionRow = [];
            const radicalRow = [];
            for (let c = 0; c < columnas; c++) {
                const input = $('celda' + letter + '_' + r + '_' + c);
                const parsed = parseCellValue(input.value);
                if (parsed.ok) {
                    row.push(parsed.value);
                    fractionRow.push(parsed.fraction);
                    radicalRow.push(parsed.isRadical ? parsed.radical : radicalFromFraction(parsed.fraction));
                    if (parsed.isFraction) hasFraction = true;
                    if (parsed.isRadical) hasRadical = true;
                    input.classList.remove('is-invalid');
                } else {
                    input.classList.add('is-invalid');
                    (parsed.reason === 'vacio' ? empty : invalid).push({ input, label: positionLabel(letter, r + 1, c + 1) });
                    row.push(NaN);
                    fractionRow.push(null);
                    radicalRow.push(null);
                }
            }
            matrix.push(row);
            fractions.push(fractionRow);
            radicals.push(radicalRow);
        }
        return { matrix, fractions, radicals, hasFraction, hasRadical, empty, invalid };
    }

    function summarizeLabels(items) {
        const labels = items.slice(0, 8).map(i => i.label).join(', ');
        return items.length > 8 ? labels + ' y ' + (items.length - 8) + ' más' : labels;
    }

    /* ==========================================================
       CÁLCULO
       ========================================================== */
    function calculate() {
        hideError();
        hideResults();

        const dimsA = getDims('A');
        const dimsB = getDims('B');

        // 1) Validación matemática de dimensiones
        if (!areDimensionsCompatible(dimsA.columnas, dimsB.filas)) {
            showError('No se puede multiplicar: las columnas de A (' + dimsA.columnas +
                ') deben coincidir con las filas de B (' + dimsB.filas + '). Ajusta las dimensiones e inténtalo de nuevo.');
            return;
        }

        // 2) Validación de valores
        const readA = readMatrix('A');
        const readB = readMatrix('B');
        const empty = [...readA.empty, ...readB.empty];
        const invalid = [...readA.invalid, ...readB.invalid];

        if (empty.length || invalid.length) {
            const parts = [];
            if (empty.length) parts.push('Faltan valores en: ' + summarizeLabels(empty) + '.');
            if (invalid.length) parts.push('Hay entradas no válidas en: ' + summarizeLabels(invalid) + '. Usa solo números enteros, decimales, fracciones (por ejemplo 3/4 o 3/-4) o fracciones con raíces (por ejemplo √2/2); el denominador no puede ser 0.');
            showError(parts.join(' '));
            (empty[0] || invalid[0]).input.focus();
            return;
        }

        // 3) Cálculo
        // Si alguna casilla es una fracción (o tiene raíces), todo se calcula y muestra de forma exacta.
        const useRadicals = readA.hasRadical || readB.hasRadical;
        const useFractions = readA.hasFraction || readB.hasFraction;
        const matrixA = useRadicals ? readA.radicals : useFractions ? readA.fractions : readA.matrix;
        const matrixB = useRadicals ? readB.radicals : useFractions ? readB.fractions : readB.matrix;
        const { C, details } = multiplyMatrices(matrixA, matrixB);

        // 4) Presentación
        renderResult(C, dimsA, dimsB);
        renderProcedure(matrixA, matrixB, details, dimsA, dimsB);

        resultArea.hidden = false;
        procedureArea.hidden = false;
        resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /** true si el radical contiene alguna raíz (no es un número racional). */
    function hasIrrational(value) {
        return isRadical(value) && value.r.some(t => t.s !== 1n);
    }

    function renderResult(C, dimsA, dimsB) {
        const m = dimsA.filas;
        const p = dimsB.columnas;
        $('operacionTexto').textContent = 'A × B = C';
        $('dimC').textContent = m + ' × ' + p;

        resultGrid.innerHTML = '';
        resultGrid.style.gridTemplateColumns = 'repeat(' + p + ', auto)';
        for (let i = 0; i < m; i++) {
            for (let j = 0; j < p; j++) {
                const cell = createElement('div', 'result-cell', formatNumber(C[i][j]));
                cell.setAttribute('role', 'cell');
                cell.title = positionLabel('c', i + 1, j + 1) +
                    (isFraction(C[i][j]) && C[i][j].d !== 1n ? ' ≈ ' + formatNumber(fractionToNumber(C[i][j])) : '') +
                    (hasIrrational(C[i][j]) ? ' ≈ ' + formatNumber(radicalToNumber(C[i][j])) : '');
                resultGrid.appendChild(cell);
            }
        }
    }

    /* ==========================================================
       PROCEDIMIENTO PASO A PASO (generado dinámicamente)
       ========================================================== */
    function renderProcedure(A, B, details, dimsA, dimsB) {
        procedureBox.innerHTML = '';
        const n = dimsA.columnas;

        details.forEach((rowDetails, i) => {
            const group = createElement('details', 'proc-group');
            if (i === 0) group.open = true;

            const summary = createElement('summary');
            summary.appendChild(createElement('span', '', 'Fila ' + (i + 1) + ' del resultado'));
            summary.appendChild(createElement('span', 'count', rowDetails.length + (rowDetails.length === 1 ? ' elemento' : ' elementos')));
            group.appendChild(summary);

            const items = createElement('div', 'proc-items');

            rowDetails.forEach(detail => {
                const j = detail.columna;
                const name = positionLabel('c', i + 1, j + 1);
                const item = createElement('div', 'proc-item');

                item.appendChild(createElement('h4', '', 'Elemento ' + name));
                item.appendChild(createElement('p', 'sub',
                    'Fila ' + (i + 1) + ' de A × columna ' + (j + 1) + ' de B (' + n + (n === 1 ? ' producto' : ' productos') + ').'));

                const rowValues = A[i].map(formatNumber).join(', ');
                const colValues = B.map(row => formatNumber(row[j])).join(', ');
                addLine(item, 'Fila ' + (i + 1) + ' de A', '[ ' + rowValues + ' ]');
                addLine(item, 'Columna ' + (j + 1) + ' de B', '[ ' + colValues + ' ]');

                const multiplications = detail.terminos
                    .map(t => '(' + formatOperand(t.a) + ' × ' + formatOperand(t.b) + ')')
                    .join(' + ');
                addLine(item, 'Multiplicaciones', name + ' = ' + multiplications);

                const partials = detail.terminos.map(t => formatOperand(t.producto)).join(' + ');
                addLine(item, 'Productos parciales', name + ' = ' + partials);

                const final = createElement('p', 'proc-line proc-final');
                final.appendChild(createElement('span', 'lbl', 'Suma final'));
                final.appendChild(document.createTextNode(name + ' = '));
                final.appendChild(createElement('span', 'value', formatNumber(detail.suma)));
                if (hasIrrational(detail.suma)) {
                    final.appendChild(document.createTextNode('  ≈ ' + formatNumber(radicalToNumber(detail.suma))));
                }
                item.appendChild(final);

                items.appendChild(item);
            });

            group.appendChild(items);
            procedureBox.appendChild(group);
        });
    }

    function addLine(parent, label, content) {
        const line = createElement('p', 'proc-line');
        line.appendChild(createElement('span', 'lbl', label));
        line.appendChild(document.createTextNode(content));
        parent.appendChild(line);
    }

    $('btnExpandir').addEventListener('click', () => {
        procedureBox.querySelectorAll('details').forEach(d => { d.open = true; });
    });
    $('btnContraer').addEventListener('click', () => {
        procedureBox.querySelectorAll('details').forEach(d => { d.open = false; });
    });

    /* ==========================================================
       EJEMPLO Y LIMPIEZA
       ========================================================== */
    function setDimensions(letter, filas, columnas) {
        selects[letter].filas.value = String(filas);
        selects[letter].columnas.value = String(columnas);
    }

    function loadExample() {
        const exampleA = [[1, 2, 3], [4, 5, 6]];
        const exampleB = [[7, 8], [9, 10], [11, 12]];

        setDimensions('A', 2, 3);
        setDimensions('B', 3, 2);
        stored.A = exampleA.map(row => row.map(String));
        stored.B = exampleB.map(row => row.map(String));
        buildGrid('A');
        buildGrid('B');
        updateCompatibility();
        hideError();
        hideResults();
        $('btnCalcular').focus();
    }

    function clearAll() {
        stored.A = [];
        stored.B = [];
        buildGrid('A');
        buildGrid('B');
        hideError();
        hideResults();
        updateCompatibility();
        const first = grids.A.querySelector('.cell-input');
        if (first) first.focus();
    }

    $('btnCalcular').addEventListener('click', calculate);
    $('btnEjemplo').addEventListener('click', loadExample);
    $('btnLimpiar').addEventListener('click', clearAll);

    /* ==========================================================
       TECLADO AUXILIAR (solo en dispositivos táctiles)
       Dígitos, signos y fracción, sin depender del teclado del sistema.
       ========================================================== */
    if (useTouchKeypad) setupTouchKeypad();

    function setupTouchKeypad() {
        const keys = [
            { label: '7', value: '7' }, { label: '8', value: '8' }, { label: '9', value: '9' },
            { label: '⌫', action: 'borrar', aria: 'Borrar', cls: 'key-fn' },
            { label: '4', value: '4' }, { label: '5', value: '5' }, { label: '6', value: '6' },
            { label: '−', action: 'menos', aria: 'Signo menos', cls: 'key-fn' },
            { label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' },
            { label: '/', value: '/', aria: 'Fracción', cls: 'key-fn' },
            { label: '0', value: '0' }, { label: '.', value: '.', aria: 'Punto decimal' },
            { label: '+', action: 'mas', aria: 'Signo más', cls: 'key-fn' },
            { label: '√', value: '√', aria: 'Raíz cuadrada', cls: 'key-fn' },
            { label: 'Sig. ›', action: 'siguiente', aria: 'Siguiente casilla', cls: 'key-next' }
        ];

        const pad = createElement('div', 'keypad');
        pad.id = 'tecladoAuxiliar';
        pad.hidden = true;
        pad.setAttribute('role', 'group');
        pad.setAttribute('aria-label', 'Teclado numérico con signos, fracciones y raíces');

        const closeBtn = createElement('button', 'keypad-close', 'Ocultar teclado ✕');
        closeBtn.type = 'button';
        closeBtn.tabIndex = -1;
        pad.appendChild(closeBtn);

        const keysBox = createElement('div', 'keypad-keys');
        keys.forEach(key => {
            const btn = createElement('button', 'keypad-key' + (key.cls ? ' ' + key.cls : ''), key.label);
            btn.type = 'button';
            btn.tabIndex = -1;
            if (key.aria) btn.setAttribute('aria-label', key.aria);
            if (key.value) btn.dataset.value = key.value;
            if (key.action) btn.dataset.action = key.action;
            keysBox.appendChild(btn);
        });
        pad.appendChild(keysBox);
        document.body.appendChild(pad);

        let activeInput = null;

        function notifyInput(input) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function insertText(input, text) {
            const start = input.selectionStart === null ? input.value.length : input.selectionStart;
            const end = input.selectionEnd === null ? start : input.selectionEnd;
            input.value = input.value.slice(0, start) + text + input.value.slice(end);
            const pos = start + text.length;
            input.setSelectionRange(pos, pos);
            notifyInput(input);
        }

        function deleteBackward(input) {
            const start = input.selectionStart === null ? input.value.length : input.selectionStart;
            const end = input.selectionEnd === null ? start : input.selectionEnd;
            if (start !== end) {
                input.value = input.value.slice(0, start) + input.value.slice(end);
                input.setSelectionRange(start, start);
            } else if (start > 0) {
                input.value = input.value.slice(0, start - 1) + input.value.slice(start);
                input.setSelectionRange(start - 1, start - 1);
            }
            notifyInput(input);
        }

        /**
         * Pone o quita el signo al inicio del numerador o, si el cursor está después de la
         * barra "/", al inicio del denominador (el signo "+" o "−" tocado dos veces se quita).
         */
        function toggleLeadingSign(input, sign) {
            const value = input.value;
            const pos = input.selectionStart === null ? value.length : input.selectionStart;
            const slash = value.indexOf('/');
            let base = 0;
            if (slash !== -1 && pos > slash) {
                base = slash + 1;
                while (value[base] === ' ') base++;
            }
            const current = (value.slice(base).match(/^[+-]/) || [''])[0];
            const next = current === sign ? '' : sign;
            input.value = value.slice(0, base) + next + value.slice(base + current.length);
            const newPos = Math.max(base, pos + next.length - current.length);
            input.setSelectionRange(newPos, newPos);
            notifyInput(input);
        }

        function focusNext(input) {
            const all = Array.from(document.querySelectorAll('.cell-input'));
            const next = all[all.indexOf(input) + 1];
            if (next) next.focus();
            else hidePad(true);
        }

        function showPad() {
            pad.hidden = false;
            document.body.classList.add('keypad-open');
        }

        function hidePad(blurInput) {
            pad.hidden = true;
            document.body.classList.remove('keypad-open');
            if (blurInput && activeInput) activeInput.blur();
        }

        function pressKey(btn) {
            if (!activeInput) return;
            const action = btn.dataset.action;
            if (action === 'borrar') deleteBackward(activeInput);
            else if (action === 'menos') toggleLeadingSign(activeInput, '-');
            else if (action === 'mas') toggleLeadingSign(activeInput, '+');
            else if (action === 'siguiente') focusNext(activeInput);
            else if (btn.dataset.value) insertText(activeInput, btn.dataset.value);
        }

        // pointerdown + preventDefault: la casilla conserva el foco mientras se pulsan las teclas.
        pad.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            const btn = event.target.closest('button');
            if (!btn) return;
            if (btn === closeBtn) hidePad(true);
            else pressKey(btn);
        });
        pad.addEventListener('mousedown', (event) => event.preventDefault());

        document.addEventListener('focusin', (event) => {
            const target = event.target;
            if (target.classList && target.classList.contains('cell-input')) {
                activeInput = target;
                showPad();
                // Evita que el teclado tape la casilla activa.
                setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
            } else if (!pad.contains(target)) {
                hidePad(false);
            }
        });
    }

    /* ==========================================================
       PANTALLA DE BIENVENIDA
       ========================================================== */
    const splash = $('splash');
    const splashButton = $('splashBtn');
    const appRegions = document.querySelectorAll('.site-header, .site-main, .site-footer, .skip-link');

    function setAppInert(isInert) {
        appRegions.forEach(region => {
            if (isInert) region.setAttribute('inert', '');
            else region.removeAttribute('inert');
        });
    }

    function enterApp() {
        setAppInert(false);
        document.body.classList.remove('splash-active');
        splash.classList.add('is-leaving');
        setTimeout(() => { splash.hidden = true; }, 650);
        $('contenido-principal').focus({ preventScroll: true });
    }

    setAppInert(true);
    splashButton.addEventListener('click', enterApp);
    splashButton.focus({ preventScroll: true });

    /* ---------- Estado inicial ---------- */
    buildGrid('A');
    buildGrid('B');
    updateCompatibility();
}
