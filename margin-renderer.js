/*
 * Read-only Margin renderer.
 *
 * This file has no dependency on Tauri, the Studio editor, or the application
 * database. It can be loaded with a normal script tag and exposes a small
 * browser-global API:
 *
 *   MarginRenderer.render(text)                  // return HTML
 *   MarginRenderer.renderInto(text)              // write to #margin-doc
 *   MarginRenderer.renderInto(text, element)     // write to an element
 *
 * The renderer also works in CommonJS environments so its output can be
 * exercised without a browser.
 */

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.MarginRenderer = api;
        root.createMarginRenderer = api.create;
        root.renderMarginDocument = function (text, options) {
            return api.renderInto(text, 'margin-doc', options);
        };
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const TABLE_WIDTH_UNITS = 48;

    const DEFAULT_OPTIONS = {
        interactiveHyperlinks: true,
        interactiveImages: true,
        interactiveFiles: true,
        interactiveNoteLinks: true,
        interactiveTables: true,
        embedYouTube: false,
        targetBlank: true
    };

    function asText(value) {
        return value == null ? '' : String(value);
    }

    function escapeHTML(value) {
        return asText(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttribute(value) {
        return escapeHTML(value);
    }

    function featureEnabled(options, name) {
        if (options.featureCache && typeof options.featureCache[name] === 'boolean') {
            return options.featureCache[name];
        }
        return options[name] !== false;
    }

    function parseMetadata(line) {
        const trimmedLine = asText(line).trim();
        if (!trimmedLine.startsWith('<<') || !trimmedLine.endsWith('>>')) {
            return null;
        }

        const content = trimmedLine.slice(2, -2).trim();
        if (!content) {
            return { headerRow: false, headerColumn: false, widths: null };
        }

        const tokens = content.split(/\s+/);
        let widths = null;
        const widthsToken = tokens.find(token => token.startsWith('widths-'));
        if (widthsToken) {
            const values = widthsToken.slice(7).split(',').map(value => parseInt(value, 10));
            if (values.length > 0 && values.every(value => Number.isFinite(value) && value >= 1)) {
                widths = values;
            }
        }

        return {
            headerRow: tokens.includes('header-row'),
            headerColumn: tokens.includes('header-column'),
            widths
        };
    }

    function parseDocumentHeader(lines) {
        if (!lines.length || !lines[0].trim().startsWith('{')) {
            return lines;
        }

        try {
            const metadata = JSON.parse(lines[0]);
            if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
                return lines.slice(1);
            }
        } catch (error) {
            // A malformed first line is content, not a metadata header.
        }

        return lines;
    }

    function splitTaskMetadata(text) {
        const source = asText(text);
        const match = source.match(/\s*(\{[^{}]*"_id"\s*:\s*"[^"]*"[^{}]*\})\s*$/);
        if (!match) {
            return { text: source, meta: null };
        }

        try {
            const meta = JSON.parse(match[1]);
            if (meta && typeof meta._id === 'string') {
                return { text: source.slice(0, match.index), meta };
            }
        } catch (error) {
            // Invalid trailing JSON remains visible task text.
        }

        return { text: source, meta: null };
    }

    function normalizeLinkType(type) {
        return type === 'button' || type === 'button-secondary' ? type : 'link';
    }

    function splitLinkMetadata(text) {
        const source = asText(text);
        const match = source.match(/\s(\{.*\})\s*$/);
        if (!match) {
            return { text: source, meta: null };
        }

        try {
            const meta = JSON.parse(match[1]);
            if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
                return { text: source, meta: null };
            }
            if (!Object.prototype.hasOwnProperty.call(meta, 'title') &&
                !Object.prototype.hasOwnProperty.call(meta, 'type')) {
                return { text: source, meta: null };
            }
            return { text: source.slice(0, match.index), meta };
        } catch (error) {
            return { text: source, meta: null };
        }
    }

    function parseLinkLine(line) {
        const source = asText(line).trim();
        const linkData = splitLinkMetadata(source);
        const url = linkData.text.trim();
        if (!/^https?:\/\/[^\s<]+$/i.test(url)) {
            return null;
        }

        const title = linkData.meta && typeof linkData.meta.title === 'string'
            ? linkData.meta.title.trim()
            : '';
        return {
            url,
            title: title || url,
            type: normalizeLinkType(linkData.meta && linkData.meta.type),
            meta: linkData.meta
        };
    }

    function taskStatusFromMarker(marker) {
        if (marker === '/') return 'progress';
        if (marker === '|') return 'complete';
        return 'pending';
    }

    function taskMarkerFromStatus(status) {
        if (status === 'progress') return '/';
        if (status === 'complete') return '|';
        return '-';
    }

    function taskTextIsImportant(text) {
        return asText(text).includes('!');
    }

    function defaultTaskIcon(status) {
        if (status === 'progress') {
            return '<svg class="task-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
                '<path d="M2 8a6 6 0 1 0 12 0H2Z" fill="currentColor"/>' +
                '</svg>';
        }
        if (status === 'complete') {
            return '<svg class="task-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
                '<circle cx="8" cy="8" r="7" fill="currentColor"/>' +
                '</svg>';
        }
        return '<svg class="task-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
            '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '</svg>';
    }

    function defaultRenderTask(task, options) {
        const indentClass = task.indentLevel > 0 ? ` task-indent-${task.indentLevel}` : '';
        const importantClass = taskTextIsImportant(task.text) ? ' task-important' : '';
        const statusLabel = task.status === 'complete'
            ? 'Complete'
            : task.status === 'progress' ? 'In progress' : 'Pending';
        const icon = typeof options.renderTaskIcon === 'function'
            ? options.renderTaskIcon(task.status, task)
            : defaultTaskIcon(task.status);

        return `<div class="task task-${task.status}${indentClass}${importantClass}" data-task-status="${task.status}">` +
            `<span class="task-icon-holder" aria-label="${statusLabel}">${icon}</span>` +
            `<span>${renderInlineContent(task.text, true, options)}</span>` +
            '</div>';
    }

    function youtubeVideoId(url) {
        const match = asText(url).match(
            /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtube(?:-nocookie)?\.com\/watch\?.*[&;]v=)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/
        );
        return match ? match[1] : null;
    }

    function safeExternalHref(url) {
        const value = asText(url).trim();
        return /^https?:\/\//i.test(value) ? value : null;
    }

    function safeResourceUrl(url) {
        const value = asText(url).trim();
        if (!value || /^(?:javascript|vbscript|file):/i.test(value)) {
            return null;
        }
        if (/^data:(?!image\/(?:gif|jpeg|jpg|png|webp);)/i.test(value)) {
            return null;
        }
        return value;
    }

    function decodeEscapedText(value) {
        return asText(value)
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }

    function addInlineToken(tokens, html) {
        const token = `\u0000${tokens.length}\u0000`;
        tokens.push(html);
        return token;
    }

    function renderInlineContent(text, skipEmphasis, options) {
        if (typeof options.renderInline === 'function') {
            return options.renderInline(asText(text), !!skipEmphasis);
        }

        let html = escapeHTML(text);
        const tokens = [];

        if (featureEnabled(options, 'interactiveNoteLinks')) {
            html = html.replace(/\[\[\s*([^\[\]\s|]+)\s*\]\]/g, (match, docId) => {
                return addInlineToken(tokens, renderInlineNoteLink(docId, options));
            });
        }

        if (featureEnabled(options, 'mentions') && options.renderMention !== false) {
            html = html.replace(/(?<!\w)@([A-Za-z0-9_-]+)/g, (match, name) => {
                if (typeof options.renderMention === 'function') {
                    return addInlineToken(tokens, options.renderMention(name, match));
                }
                return addInlineToken(
                    tokens,
                    `<span class="mention" data-person="${escapeAttribute(name)}">@${escapeHTML(name)}</span>`
                );
            });
        }

        if (featureEnabled(options, 'interactiveHyperlinks')) {
            html = html.replace(/https?:\/\/[^\s<]+/gi, match => {
                const rawUrl = decodeEscapedText(match);
                const href = safeExternalHref(rawUrl);
                if (!href) return match;

                if (options.embedYouTube) {
                    const videoId = youtubeVideoId(rawUrl);
                    if (videoId) {
                        const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
                        return addInlineToken(
                            tokens,
                            `<span class="youtube-embed" data-youtube-url="${escapeAttribute(rawUrl)}">` +
                            `<iframe src="${escapeAttribute(embedUrl)}" title="YouTube video" frameborder="0" ` +
                            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
                            'allowfullscreen loading="lazy"></iframe></span>'
                        );
                    }
                }

                const target = options.targetBlank === false ? '' : ' target="_blank" rel="noopener noreferrer"';
                return addInlineToken(
                    tokens,
                    `<a href="${escapeAttribute(href)}" class="external-link"${target}>${escapeHTML(rawUrl)}</a>`
                );
            });
        }

        if (featureEnabled(options, 'interactiveImages')) {
            html = html.replace(
                /file:\/\/(\S.*?\.(?:png|jpe?g|gif|webp|svg))(?=\s|$)/gi,
                (match, path) => {
                    const source = decodeEscapedText(`file://${path}`);
                    const resolved = typeof options.resolveAsset === 'function'
                        ? options.resolveAsset(source, { kind: 'image' })
                        : null;
                    const url = safeResourceUrl(resolved);
                    if (!url) return match;
                    return addInlineToken(
                        tokens,
                        `<img src="${escapeAttribute(url)}" data-image-src="${escapeAttribute(source)}" ` +
                        `class="inline-image" alt="${escapeAttribute(path)}" loading="lazy">`
                    );
                }
            );
        }

        if (featureEnabled(options, 'interactiveFiles')) {
            html = html.replace(
                /file:\/\/(\S.*?\.(?:pdf|docx?|pptx?|xlsx?|txt|zip))(?=\s|$)/gi,
                (match, path) => {
                    const source = decodeEscapedText(`file://${path}`);
                    const resolved = typeof options.resolveAsset === 'function'
                        ? options.resolveAsset(source, { kind: 'file' })
                        : null;
                    const href = safeResourceUrl(resolved);
                    if (!href) return match;
                    const target = options.targetBlank === false ? '' : ' target="_blank" rel="noopener noreferrer"';
                    return addInlineToken(
                        tokens,
                        `<a href="${escapeAttribute(href)}" class="external-link file-link"${target}>` +
                        `${escapeHTML(path)}</a>`
                    );
                }
            );
        }

        if (!skipEmphasis) {
            html = html.replace(/\*(\S(?:[^*\n]*\S)?|\S)\*/g, '<strong>$1</strong>');
            html = html.replace(/(?<!\w)_(\S(?:[^_\n]*\S)?|\S)_(?!\w)/g, '<em>$1</em>');
        }

        return html.replace(/\u0000(\d+)\u0000/g, (token, index) => tokens[Number(index)] || '');
    }

    function splitTableCells(line) {
        let body = asText(line).trim();
        if (body.startsWith(':')) {
            body = body.slice(1);
        }
        // A colon preceded by whitespace starts a new cell. URL colons such as
        // the one in "https://" therefore remain part of the cell.
        return body.split(/\s+:/).map(cell => cell.trim());
    }

    function createBalancedWidths(columnCount) {
        if (!columnCount || columnCount < 1) return [TABLE_WIDTH_UNITS];
        const base = Math.floor(TABLE_WIDTH_UNITS / columnCount);
        const remainder = TABLE_WIDTH_UNITS - (base * columnCount);
        const widths = new Array(columnCount).fill(base);
        for (let index = 0; index < remainder; index++) {
            widths[index] += 1;
        }
        return widths;
    }

    function normalizeWidths(raw, columnCount) {
        let widths = Array.isArray(raw)
            ? raw.map(value => Math.max(1, Math.round(Number(value) || 0)))
            : [];

        if (columnCount != null) {
            if (widths.length < columnCount) {
                widths = widths.concat(createBalancedWidths(columnCount - widths.length));
            }
            if (widths.length > columnCount) {
                widths = widths.slice(0, columnCount);
            }
        }

        if (!widths.length) {
            return createBalancedWidths(columnCount || 1);
        }

        const sum = widths.reduce((total, width) => total + width, 0);
        if (sum === TABLE_WIDTH_UNITS) {
            return widths;
        }

        const rounded = widths.map(width => Math.max(1, Math.round((width / sum) * TABLE_WIDTH_UNITS)));
        let drift = TABLE_WIDTH_UNITS - rounded.reduce((total, width) => total + width, 0);
        while (drift !== 0) {
            const step = drift > 0 ? 1 : -1;
            let index = 0;
            for (let candidate = 1; candidate < rounded.length; candidate++) {
                if (step > 0 && rounded[candidate] > rounded[index]) index = candidate;
                if (step < 0 && rounded[candidate] > rounded[index] && rounded[candidate] > 1) index = candidate;
            }
            if (step < 0 && rounded[index] <= 1) break;
            rounded[index] += step;
            drift -= step;
        }
        return rounded;
    }

    function isFormula(value) {
        return /^=(?:sum|avg|min|max)-(?:row|column)$/.test(asText(value).trim());
    }

    function numericValue(value) {
        const parsed = parseFloat(asText(value).trim());
        return Number.isNaN(parsed) ? null : parsed;
    }

    function renderFormulaResult(value) {
        return `<span class="formula-result">${escapeHTML(String(value))}</span>`;
    }

    function renderDefaultTable(rows, metadata, options) {
        const columnCount = Math.max(1, ...rows.map(row => row.cells.length));
        const matrix = rows.map(row => {
            const cells = row.cells.slice();
            while (cells.length < columnCount) cells.push('');
            return cells;
        });
        const widths = normalizeWidths(metadata && metadata.widths, columnCount);
        const headerRow = !!(metadata && metadata.headerRow);
        const headerColumn = !!(metadata && metadata.headerColumn);
        const memo = new Map();
        const active = new Set();

        function isHeaderCell(row, column) {
            return (headerRow && row === 0) || (headerColumn && column === 0);
        }

        function calculate(row, column) {
            const key = `${row},${column}`;
            if (memo.has(key)) return memo.get(key);
            if (active.has(key)) return null;

            const raw = asText(matrix[row][column]).trim();
            const direct = numericValue(raw);
            if (!isFormula(raw)) {
                memo.set(key, direct);
                return direct;
            }

            active.add(key);
            const values = [];
            const formulaParts = raw.slice(1).split('-');
            const operation = formulaParts[0];
            const axis = formulaParts[1];
            if (axis === 'row') {
                for (let candidate = 0; candidate < column; candidate++) {
                    if (!isHeaderCell(row, candidate)) {
                        const value = calculate(row, candidate);
                        if (value !== null) values.push(value);
                    }
                }
            } else {
                for (let candidate = 0; candidate < row; candidate++) {
                    if (!isHeaderCell(candidate, column)) {
                        const value = calculate(candidate, column);
                        if (value !== null) values.push(value);
                    }
                }
            }

            let result = 0;
            if (operation === 'sum') {
                result = values.reduce((total, value) => total + value, 0);
            } else if (operation === 'avg') {
                result = values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
            } else if (operation === 'min') {
                result = values.length ? Math.min(...values) : 0;
            } else if (operation === 'max') {
                result = values.length ? Math.max(...values) : 0;
            }

            active.delete(key);
            memo.set(key, result);
            return result;
        }

        const html = [];
        const widthAttribute = widths.join(',');
        html.push(`<table class="margin-table" data-widths="${escapeAttribute(widthAttribute)}">`);
        html.push('<colgroup>');
        widths.forEach(width => {
            html.push(`<col style="width: ${(width / TABLE_WIDTH_UNITS * 100).toFixed(4)}%">`);
        });
        html.push('</colgroup>');
        html.push(headerRow ? '<thead>' : '<tbody>');

        matrix.forEach((row, rowIndex) => {
            if (headerRow && rowIndex === 1) {
                html.push('</thead><tbody>');
            }
            html.push('<tr>');
            row.forEach((cell, columnIndex) => {
                const header = isHeaderCell(rowIndex, columnIndex);
                const tag = header ? 'th' : 'td';
                const raw = asText(cell).trim();
                const formula = isFormula(raw);
                const attrs = formula
                    ? ` data-original-content="${escapeAttribute(raw)}"`
                    : '';
                const content = formula
                    ? renderFormulaResult(calculate(rowIndex, columnIndex))
                    : renderInlineContent(cell, false, options);
                html.push(`<${tag}${attrs}>${content || '<br>'}</${tag}>`);
            });
            html.push('</tr>');
        });

        html.push(headerRow && matrix.length === 1 ? '</thead></table>' : '</tbody></table>');
        return html.join('');
    }

    function defaultRenderNoteLink(docId, options) {
        const resolved = typeof options.resolveNoteLink === 'function'
            ? options.resolveNoteLink(docId)
            : null;

        if (!resolved) {
            return `<p class="wiki-line wiki-link-missing"><span class="wiki-link-id">` +
                `${escapeHTML(`[[${docId}]]`)}</span></p>`;
        }

        const title = typeof resolved === 'string'
            ? resolved
            : (resolved.title || resolved.Title || docId);
        const href = typeof resolved === 'object'
            ? safeResourceUrl(resolved.href || resolved.url || '')
            : null;
        const hrefAttribute = href ? ` href="${escapeAttribute(href)}"` : '';
        const target = href && options.targetBlank !== false
            ? ' target="_blank" rel="noopener noreferrer"'
            : '';
        return `<p class="wiki-line"><a class="wiki-link"${hrefAttribute}${target}>` +
            `${escapeHTML(title)}</a></p>`;
    }

    function renderInlineNoteLink(docId, options) {
        const resolved = typeof options.resolveNoteLink === 'function'
            ? options.resolveNoteLink(docId)
            : null;
        if (resolved == null || resolved === false) {
            return `<span class="wiki-link inline-wiki-link wiki-link-missing" data-note-id="${escapeAttribute(docId)}">` +
                `${escapeHTML(`[[${docId}]]`)}</span>`;
        }

        const title = typeof resolved === 'string'
            ? resolved
            : (resolved.title || resolved.Title || docId);
        const href = typeof resolved === 'object'
            ? safeResourceUrl(resolved.href || resolved.url || '')
            : null;
        const hrefAttribute = href ? ` href="${escapeAttribute(href)}"` : '';
        const target = href && options.targetBlank !== false
            ? ' target="_blank" rel="noopener noreferrer"'
            : '';
        return `<a class="wiki-link inline-wiki-link" data-note-id="${escapeAttribute(docId)}"${hrefAttribute}${target}>` +
            `${escapeHTML(title)}</a>`;
    }

    function externalLinkClassNames(type) {
        if (type === 'button') return 'external-link link-button';
        if (type === 'button-secondary') return 'external-link link-button link-button-secondary';
        return 'external-link';
    }

    function renderExternalLinkMarkup(link, options) {
        if (!featureEnabled(options, 'interactiveHyperlinks')) {
            return escapeHTML(link.url);
        }

        const href = safeExternalHref(link.url);
        if (!href) {
            return escapeHTML(link.url);
        }

        const target = options.targetBlank === false
            ? ''
            : ' target="_blank" rel="noopener noreferrer"';
        return `<a href="${escapeAttribute(href)}" class="${externalLinkClassNames(link.type)}"${target}>` +
            `${escapeHTML(link.title)}</a>`;
    }

    function defaultRenderLinkLine(link, options) {
        return `<p class="external-link-line" data-link-url="${escapeAttribute(link.url)}">` +
            `${renderExternalLinkMarkup(link, options)}</p>`;
    }

    function renderTaskLine(line, options) {
        const match = asText(line).match(/^( *)([-/|]) /);
        if (!match) return null;

        const indentLevel = Math.min(Math.floor(match[1].length / 2), 3);
        const marker = match[2];
        const status = taskStatusFromMarker(marker);
        const taskData = splitTaskMetadata(asText(line).slice(match[0].length));
        const task = {
            marker,
            status,
            indentLevel,
            text: taskData.text,
            meta: taskData.meta,
            rawLine: asText(line)
        };

        if (typeof options.renderTask === 'function') {
            return options.renderTask(task, options);
        }
        return defaultRenderTask(task, options);
    }

    function renderLine(line, lineIndex, options) {
        const source = asText(line);
        const trimmedLine = source.trim();

        if (lineIndex === 0) {
            return `<h1>${renderInlineContent(source, false, options)}</h1>`;
        }

        if (trimmedLine.startsWith('#')) {
            return `<p><span class="tag">${escapeHTML(trimmedLine)}</span></p>`;
        }

        const wikiMatch = trimmedLine.match(/^\[\[\s*([^\[\]\s]+)\s*\]\]$/);
        if (wikiMatch) {
            if (typeof options.renderNoteLink === 'function') {
                return options.renderNoteLink(wikiMatch[1], options);
            }
            return defaultRenderNoteLink(wikiMatch[1], options);
        }

        const link = parseLinkLine(source);
        if (link && !(options.embedYouTube && !link.meta && youtubeVideoId(link.url))) {
            if (typeof options.renderLinkLine === 'function') {
                return options.renderLinkLine(link, options);
            }
            return defaultRenderLinkLine(link, options);
        }

        if (source.startsWith('>>> ')) {
            return `<h4>${renderInlineContent(source.slice(4), false, options)}</h4>`;
        }
        if (source.startsWith('>> ')) {
            return `<h3>${renderInlineContent(source.slice(3), false, options)}</h3>`;
        }
        if (source.startsWith('> ')) {
            return `<h2>${renderInlineContent(source.slice(2), false, options)}</h2>`;
        }

        const task = renderTaskLine(source, options);
        if (task !== null) {
            return task;
        }

        const bulletMatch = source.match(/^( {2,})?\* /);
        if (bulletMatch) {
            const leadingSpaces = (source.match(/^( *)/) || ['', ''])[1].length;
            const indentLevel = Math.min(Math.floor(leadingSpaces / 2), 3);
            const indentClass = indentLevel > 0 ? ` bullet-indent-${indentLevel}` : '';
            const text = source.replace(/^ *\* /, '');
            return `<div class="bullet${indentClass}">${renderInlineContent(text, false, options) || '<br>'}</div>`;
        }

        const numberedMatch = source.match(/^( {2,})?\+ /);
        if (numberedMatch) {
            const leadingSpaces = (source.match(/^( *)/) || ['', ''])[1].length;
            const indentLevel = Math.min(Math.floor(leadingSpaces / 2), 3);
            const indentClass = indentLevel > 0 ? ` numbered-indent-${indentLevel}` : '';
            const text = source.replace(/^ *\+ /, '');
            return `<div class="numbered${indentClass}">${renderInlineContent(text, false, options) || '<br>'}</div>`;
        }

        if (source.startsWith('! ')) {
            return `<div class="important-block">${renderInlineContent(source.slice(2), false, options) || '<br>'}</div>`;
        }

        if (/^why\?\s/i.test(source)) {
            return `<div class="justification">${renderInlineContent(source.slice(5), false, options) || '<br>'}</div>`;
        }

        if (/^info:\s/i.test(source)) {
            return `<div class="info-block">${renderInlineContent(source.slice(6), false, options) || '<br>'}</div>`;
        }

        if (source.startsWith('? ')) {
            return `<div class="question-block">${renderInlineContent(source.slice(2), false, options) || '<br>'}</div>`;
        }

        if (source.startsWith('" ')) {
            return `<div class="blockquote">${renderInlineContent(source.slice(2), false, options) || '<br>'}</div>`;
        }

        if (source.startsWith('A. ')) {
            return `<div class="answer-block">${renderInlineContent(source.slice(3), false, options) || '<br>'}</div>`;
        }

        if (trimmedLine === '---') {
            return '<hr class="margin-hr">';
        }

        if (trimmedLine.startsWith('`')) {
            return `<p class="code-block">${escapeHTML(trimmedLine.slice(1))}</p>`;
        }

        if (source.trim()) {
            return `<p>${renderInlineContent(source, false, options)}</p>`;
        }
        return '<p><br></p>';
    }

    function renderDocument(text, options) {
        const lines = parseDocumentHeader(asText(text).replace(/\r\n?/g, '\n').split('\n'));
        const output = [];
        const state = {
            tableRows: null,
            tableMetadata: null,
            pendingMetadata: null
        };

        function flushTable() {
            if (!state.tableRows) return;
            const rows = state.tableRows;
            const metadata = state.tableMetadata || {};
            const tableHTML = typeof options.renderTable === 'function'
                ? options.renderTable(rows, metadata, options)
                : renderDefaultTable(rows, metadata, options);
            if (tableHTML) output.push(tableHTML);
            state.tableRows = null;
            state.tableMetadata = null;
        }

        lines.forEach((line, index) => {
            const metadata = parseMetadata(line);
            if (metadata !== null) {
                flushTable();
                state.pendingMetadata = metadata;
                return;
            }

            const isTableRow = asText(line).trim().startsWith(':');
            if (isTableRow && index !== 0) {
                if (!state.tableRows) {
                    state.tableRows = [];
                    state.tableMetadata = state.pendingMetadata || {};
                    state.pendingMetadata = null;
                }
                state.tableRows.push({
                    line: asText(line),
                    cells: splitTableCells(line)
                });
                return;
            }

            flushTable();
            state.pendingMetadata = null;
            output.push(renderLine(line, index, options));
        });

        flushTable();
        return output.join('\n');
    }

    function mergeOptions(base, overrides) {
        return Object.assign({}, DEFAULT_OPTIONS, base || {}, overrides || {});
    }

    function resolveTarget(target) {
        if (target && typeof target === 'object' && target.nodeType === 1) {
            return target;
        }

        const documentObject = typeof document !== 'undefined' ? document : null;
        if (!documentObject) {
            throw new Error('MarginRenderer.renderInto requires a browser document');
        }

        if (target == null || target === '') {
            return documentObject.getElementById('margin-doc');
        }

        if (typeof target === 'string') {
            return documentObject.getElementById(target.replace(/^#/, '')) || null;
        }

        return null;
    }

    function createMarginRenderer(defaultOptions) {
        const baseOptions = defaultOptions || {};
        return {
            render(text, options) {
                return renderDocument(text, mergeOptions(baseOptions, options));
            },
            renderInto(text, target, options) {
                const hasExplicitTarget = target == null
                    || typeof target === 'string'
                    || (target && typeof target === 'object' && target.nodeType === 1);
                const targetValue = hasExplicitTarget ? target : 'margin-doc';
                const renderOptions = hasExplicitTarget ? options : target;
                const element = resolveTarget(targetValue == null ? 'margin-doc' : targetValue);
                if (!element) {
                    const label = targetValue == null ? '#margin-doc' : String(targetValue);
                    throw new Error(`MarginRenderer target not found: ${label}`);
                }
                element.innerHTML = renderDocument(text, mergeOptions(baseOptions, renderOptions));
                element.classList.add('margin-document');
                return element;
            },
            renderToElement(text, target, options) {
                return this.renderInto(text, target, options);
            },
            parseInline(text, skipEmphasis, options) {
                return renderInlineContent(text, skipEmphasis, mergeOptions(baseOptions, options));
            },
            parseMetadata
        };
    }

    const defaultRenderer = createMarginRenderer();

    return {
        TABLE_WIDTH_UNITS,
        create: createMarginRenderer,
        render(text, options) {
            return defaultRenderer.render(text, options);
        },
        renderInto(text, target, options) {
            return defaultRenderer.renderInto(text, target, options);
        },
        renderToElement(text, target, options) {
            return defaultRenderer.renderInto(text, target, options);
        },
        parseInline(text, skipEmphasis, options) {
            return defaultRenderer.parseInline(text, skipEmphasis, options);
        },
        parseMetadata,
        escapeHTML
    };
}));
