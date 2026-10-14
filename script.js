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

/**
 * Convierte el texto de una casilla en número.
 * Devuelve { ok: true, value } o { ok: false, reason: 'vacio' | 'invalido' }.
 * Un campo vacío NUNCA se interpreta como cero.
 */
function parseCellValue(rawText) {
    const text = String(rawText).trim();
    if (text === '') return { ok: false, reason: 'vacio' };
    // Entero o decimal, con signo opcional; acepta punto o coma decimal.
    if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(text)) return { ok: false, reason: 'invalido' };
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalido' };
    return { ok: true, value };
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

    for (let i = 0; i < m; i++) {
        const filaC = [];
        const filaDetalle = [];
        for (let j = 0; j < p; j++) {
            let suma = 0;
            const terminos = [];
            for (let k = 0; k < n; k++) {
                const producto = A[i][k] * B[k][j];
                terminos.push({ a: A[i][k], b: B[k][j], producto });
                suma += producto;
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
    if (Object.is(value, -0)) value = 0;
    const rounded = parseFloat(value.toFixed(10));
    return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Operando entre paréntesis si es negativo, para evitar ambigüedades. */
function formatOperand(value) {
    const text = formatNumber(value);
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
    module.exports = { parseCellValue, areDimensionsCompatible, multiplyMatrices, formatNumber, positionLabel };
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
                input.inputMode = 'decimal';
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
        const empty = [];
        const invalid = [];

        for (let r = 0; r < filas; r++) {
            const row = [];
            for (let c = 0; c < columnas; c++) {
                const input = $('celda' + letter + '_' + r + '_' + c);
                const parsed = parseCellValue(input.value);
                if (parsed.ok) {
                    row.push(parsed.value);
                    input.classList.remove('is-invalid');
                } else {
                    input.classList.add('is-invalid');
                    (parsed.reason === 'vacio' ? empty : invalid).push({ input, label: positionLabel(letter, r + 1, c + 1) });
                    row.push(NaN);
                }
            }
            matrix.push(row);
        }
        return { matrix, empty, invalid };
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
            if (invalid.length) parts.push('Hay entradas no válidas en: ' + summarizeLabels(invalid) + '. Usa solo números enteros o decimales.');
            showError(parts.join(' '));
            (empty[0] || invalid[0]).input.focus();
            return;
        }

        // 3) Cálculo
        const { C, details } = multiplyMatrices(readA.matrix, readB.matrix);

        // 4) Presentación
        renderResult(C, dimsA, dimsB);
        renderProcedure(readA.matrix, readB.matrix, details, dimsA, dimsB);

        resultArea.hidden = false;
        procedureArea.hidden = false;
        resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                cell.title = positionLabel('c', i + 1, j + 1);
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
