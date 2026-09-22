/**
 * Margin Format Converter
 * 
 * Bidirectional conversion between Margin markup format and HTML.
 * This module can be used in both browser and Deno test environments.
 * 
 * Usage:
 *   Browser: const converter = createMarginConverter(document, featureCache);
 *   Deno:    const converter = createMarginConverter(linkedomDocument, featureCache);
 */

// Default feature cache - all features enabled for testing
const DEFAULT_FEATURES = {
    interactiveHyperlinks: true,
    interactiveImages: true,
    interactiveFiles: true,
    interactiveTables: true
};

/**
 * Create a Margin converter instance
 * @param {Document} doc - DOM document object (browser document or LinkeDOM)
 * @param {Object} featureCache - Feature flags for conditional rendering
 * @param {Object} options - Additional options like icon renderers
 * @returns {Object} Converter with parseTextToHTML and extractPlainText methods
 */
function createMarginConverter(doc, featureCache = DEFAULT_FEATURES, options = {}) {
    // Table state tracking (encapsulated per instance)
    let currentTableMetadata = null;
    let isInTable = false;
    let tableRowIndex = 0;

    // Icon renderers - can be overridden for testing
    const renderTaskIcon = options.renderTaskIcon || function(type) {
        // Default: simple placeholder for testing
        return `<span class="task-icon task-icon-${type}"></span>`;
    };

    const renderExclamationIcon = options.renderExclamationIcon || function() {
        return `<span class="important-icon"></span>`;
    };

    const renderQuestionIcon = options.renderQuestionIcon || function() {
        return `<span class="question-icon"></span>`;
    };

    const renderAnswerIcon = options.renderAnswerIcon || function() {
        return `<span class="answer-icon"></span>`;
    };

    /**
     * Escape HTML special characters
     */
    function escapeHTML(text) {
        if (!text) return '';
        const div = doc.createElement('div');
        div.textContent = text;
        // NB: textContent->innerHTML escapes &, <, > but NOT quotes. parseInline
        // injects escaped text into double-quoted attributes (href/src), so quotes
        // must be escaped here to prevent attribute-injection XSS from note content.
        return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * Parse metadata line: <<header-row header-column widths-12,12,12,12>>
     * `widths-` is optional; when present it declares integer column widths in 48-unit space.
     */
    function parseMetadata(line) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('<<') && trimmedLine.endsWith('>>')) {
            const content = trimmedLine.slice(2, -2).trim();
            if (content === '') {
                return { headerRow: false, headerColumn: false, widths: null };
            }
            const tokens = content.split(/\s+/);
            let widths = null;
            for (const tok of tokens) {
                if (tok.startsWith('widths-')) {
                    const parts = tok.slice(7).split(',').map(s => s.trim());
                    const nums = parts.map(s => parseInt(s, 10));
                    if (nums.length > 0 && nums.every(n => Number.isFinite(n) && n >= 1)) {
                        widths = nums;
                    }
                    break;
                }
            }
            return {
                headerRow: tokens.includes('header-row'),
                headerColumn: tokens.includes('header-column'),
                widths: widths
            };
        }
        return null;
    }

    /**
     * Extract numeric value from cell text (for formulas)
     */
    function extractNumericValue(cellText) {
        if (!cellText) return null;
        
        // Create a temporary div to strip HTML tags and get plain text
        const tempDiv = doc.createElement('div');
        tempDiv.innerHTML = cellText;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';
        
        // Remove whitespace
        const trimmed = plainText.trim();
        
        // Attempt to parse as float
        const num = parseFloat(trimmed);
        
        // Return null if not a valid number (NaN check)
        if (isNaN(num)) {
            return null;
        }
        
        return num;
    }

    /**
     * Parse inline content (links, images)
     */
    function parseInline(text) {
        // Escape HTML first
        text = escapeHTML(text);

        // Parse web links: https://... → <a>...</a> (only if feature enabled)
        // Matching is case-insensitive so HTTPS:// and Https:// work too.
        if (featureCache.interactiveHyperlinks) {
            text = text.replace(/(https:\/\/[^\s]+)/gi, '<a href="$1" class="external-link">$1</a>');
        }

        // Parse image links: file://...image.ext → <img> (only if feature enabled)
        if (featureCache.interactiveImages) {
            text = text.replace(/file:\/\/([^\s]+\.(png|jpg|jpeg|gif|webp|svg))/gi, '<img data-image-src="file://$1" data-full-image-src="file://$1" class="inline-image" alt="Image" />');
        }

        // Parse file links: file://...doc.ext → <a> (only if feature enabled).
        // Allow spaces in the path (e.g. "file://My Report.pdf") - a file://
        // include runs to the end of the line, so match up to the extension at
        // the next whitespace or end of line rather than stopping at the first
        // space.
        if (featureCache.interactiveFiles) {
            text = text.replace(/file:\/\/(\S.*?\.(pdf|doc|docx))(?=\s|$)/gi, '<a href="file://$1" class="external-link file-link">$1</a>');
        }

        // Inline bold (*text*) and italic (_text_). Applied after URL/file/image
        // replacements so URLs containing _ aren't split. Boundaries require
        // non-whitespace immediately inside the markers; italic additionally
        // requires the surrounding chars not to be word characters so
        // intra-word underscores in URLs/identifiers don't trigger.
        text = text.replace(/\*(\S(?:[^*\n]*\S)?|\S)\*/g, '<strong>$1</strong>');
        text = text.replace(/(?<!\w)_(\S(?:[^_\n]*\S)?|\S)_(?!\w)/g, '<em>$1</em>');

        return text;
    }

    /**
     * Walk a node's children and reproduce margin inline markup
     * (*bold*, _italic_) as text. Used by extractPlainText so that
     * <strong>/<em> round-trip back into the source format.
     */
    function serializeInlineMarkup(node) {
        let out = '';
        if (!node) return out;
        for (const child of node.childNodes) {
            if (child.nodeType === 3 /* TEXT_NODE */) {
                out += child.textContent;
            } else if (child.nodeName === 'STRONG' || child.nodeName === 'B') {
                out += '*' + serializeInlineMarkup(child) + '*';
            } else if (child.nodeName === 'EM' || child.nodeName === 'I') {
                out += '_' + serializeInlineMarkup(child) + '_';
            } else if (child.nodeName === 'A') {
                out += child.textContent || child.getAttribute('href') || '';
            } else if (child.nodeName === 'IMG') {
                const src = child.getAttribute('data-image-src') || child.getAttribute('src') || '';
                if (src) out += src;
            } else if (child.nodeName === 'BR') {
                // ignore line breaks within an inline run
            } else {
                out += serializeInlineMarkup(child);
            }
        }
        return out;
    }

    /**
     * Render a table row
     */
    function renderTableRow(line, rowIndex, metadata) {
        // Cells are delimited by whitespace-colon-whitespace. Strip the leading ":"
        // row marker first, then split on the delimiter so colons inside cell
        // text (e.g. "study: foo") are preserved instead of breaking the column.
        let body = line.trim();
        if (body.startsWith(':')) {
            body = body.slice(1);
        }
        const columns = body.split(/\s+:/).map(s => s.trim());

        if (columns.length === 0) {
            return '';
        }

        let html = '';
        const isHeaderRow = metadata && metadata.headerRow && rowIndex === 0;
        const useHeaderColumn = metadata && metadata.headerColumn;

        // Open table tag on first row
        if (rowIndex === 0) {
            let tableAttrs = '';
            if (metadata && Array.isArray(metadata.widths) && metadata.widths.length > 0) {
                const widthsAttr = metadata.widths.join(',').replace(/"/g, '');
                tableAttrs = ` data-widths="${widthsAttr}"`;
            }
            html += `<table class="margin-table"${tableAttrs}>`;
            if (isHeaderRow) {
                html += '<thead>';
            } else {
                html += '<tbody>';
            }
        } else if (isHeaderRow && rowIndex === 1) {
            // Close thead and open tbody after header row
            html += '</thead><tbody>';
        }

        html += '<tr>';

        columns.forEach((cell, colIndex) => {
            // Determine if this cell should be a header
            const isHeaderCell = isHeaderRow || (useHeaderColumn && colIndex === 0);
            const cellTag = isHeaderCell ? 'th' : 'td';
            
            // Add cell position tracking
            const cellPos = `${rowIndex},${colIndex}`;
            let dataAttributes = ` data-cell-pos="${cellPos}"`;
            
            // Check for formulas
            const cellText = (cell || '').trim();
            const isSumRowFormula = cellText === '=sum-row';
            const isSumColumnFormula = cellText === '=sum-column';
            const isAvgRowFormula = cellText === '=avg-row';
            const isAvgColumnFormula = cellText === '=avg-column';
            const isMinRowFormula = cellText === '=min-row';
            const isMinColumnFormula = cellText === '=min-column';
            const isMaxRowFormula = cellText === '=max-row';
            const isMaxColumnFormula = cellText === '=max-column';
            let cellContent = '';
            
            if (isSumRowFormula && featureCache.interactiveTables) {
                let sum = 0;
                const dependencies = [];
                
                for (let i = 0; i < colIndex; i++) {
                    const isLeftCellHeader = isHeaderRow || (useHeaderColumn && i === 0);
                    if (isLeftCellHeader) continue;
                    
                    dependencies.push(`${rowIndex},${i}`);
                    const leftCellText = columns[i] || '';
                    const numericValue = extractNumericValue(leftCellText);
                    
                    if (numericValue !== null) {
                        sum += numericValue;
                    }
                }
                
                dataAttributes += ' data-original-content="=sum-row"';
                if (dependencies.length > 0) {
                    dataAttributes += ` data-formula-deps="${dependencies.join('|')}"`;
                }
                cellContent = `<span class="formula-result">${escapeHTML(String(sum))}</span>`;
            } else if (isSumColumnFormula && featureCache.interactiveTables) {
                dataAttributes += ' data-original-content="=sum-column"';
                cellContent = parseInline('0');
            } else if (isAvgRowFormula && featureCache.interactiveTables) {
                let sum = 0;
                let count = 0;
                const dependencies = [];
                
                for (let i = 0; i < colIndex; i++) {
                    const isLeftCellHeader = isHeaderRow || (useHeaderColumn && i === 0);
                    if (isLeftCellHeader) continue;
                    
                    dependencies.push(`${rowIndex},${i}`);
                    const leftCellText = columns[i] || '';
                    const numericValue = extractNumericValue(leftCellText);
                    
                    if (numericValue !== null) {
                        sum += numericValue;
                        count++;
                    }
                }
                
                const average = count > 0 ? sum / count : 0;
                dataAttributes += ' data-original-content="=avg-row"';
                if (dependencies.length > 0) {
                    dataAttributes += ` data-formula-deps="${dependencies.join('|')}"`;
                }
                cellContent = `<span class="formula-result">${escapeHTML(String(average))}</span>`;
            } else if (isAvgColumnFormula && featureCache.interactiveTables) {
                dataAttributes += ' data-original-content="=avg-column"';
                cellContent = parseInline('0');
            } else if (isMinRowFormula && featureCache.interactiveTables) {
                let minValue = null;
                const dependencies = [];
                
                for (let i = 0; i < colIndex; i++) {
                    const isLeftCellHeader = isHeaderRow || (useHeaderColumn && i === 0);
                    if (isLeftCellHeader) continue;
                    
                    dependencies.push(`${rowIndex},${i}`);
                    const leftCellText = columns[i] || '';
                    const numericValue = extractNumericValue(leftCellText);
                    
                    if (numericValue !== null) {
                        if (minValue === null || numericValue < minValue) {
                            minValue = numericValue;
                        }
                    }
                }
                
                dataAttributes += ' data-original-content="=min-row"';
                if (dependencies.length > 0) {
                    dataAttributes += ` data-formula-deps="${dependencies.join('|')}"`;
                }
                const result = minValue !== null ? minValue : 0;
                cellContent = `<span class="formula-result">${escapeHTML(String(result))}</span>`;
            } else if (isMinColumnFormula && featureCache.interactiveTables) {
                dataAttributes += ' data-original-content="=min-column"';
                cellContent = parseInline('0');
            } else if (isMaxRowFormula && featureCache.interactiveTables) {
                let maxValue = null;
                const dependencies = [];
                
                for (let i = 0; i < colIndex; i++) {
                    const isLeftCellHeader = isHeaderRow || (useHeaderColumn && i === 0);
                    if (isLeftCellHeader) continue;
                    
                    dependencies.push(`${rowIndex},${i}`);
                    const leftCellText = columns[i] || '';
                    const numericValue = extractNumericValue(leftCellText);
                    
                    if (numericValue !== null) {
                        if (maxValue === null || numericValue > maxValue) {
                            maxValue = numericValue;
                        }
                    }
                }
                
                dataAttributes += ' data-original-content="=max-row"';
                if (dependencies.length > 0) {
                    dataAttributes += ` data-formula-deps="${dependencies.join('|')}"`;
                }
                const result = maxValue !== null ? maxValue : 0;
                cellContent = `<span class="formula-result">${escapeHTML(String(result))}</span>`;
            } else if (isMaxColumnFormula && featureCache.interactiveTables) {
                dataAttributes += ' data-original-content="=max-column"';
                cellContent = parseInline('0');
            } else {
                // Normal rendering
                cellContent = parseInline(cell || '');
            }
            
            // Add <br> to empty cells
            const finalContent = cellContent || '<br>';
            html += `<${cellTag}${dataAttributes}>${finalContent}</${cellTag}>`;
        });

        html += '</tr>';

        return html;
    }

    /**
     * Parse a single line to HTML
     */
    function parseLine(line, lineIndex) {
        const trimmedLine = line.trim();

        // Check for metadata first (before other markup)
        const metadata = parseMetadata(trimmedLine);
        if (metadata !== null) {
            let result = '';
            if (isInTable) {
                result += '</tbody></table>';
                isInTable = false;
                tableRowIndex = 0;
            }
            
            if (featureCache.interactiveTables) {
                currentTableMetadata = metadata;
            } else {
                currentTableMetadata = null;
            }
            return result;
        }

        // Check for headings
        if (lineIndex === 0) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<h1>${parseInline(line)}</h1>`;
        }

        // Check for tags (lines starting with #)
        if (trimmedLine.startsWith('#')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<p><span class="tag">${escapeHTML(trimmedLine)}</span></p>`;
        }

        if (trimmedLine.startsWith('> ')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<h2>${parseInline(trimmedLine.substring(2))}</h2>`;
        }
        if (trimmedLine.startsWith('>> ')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<h3>${parseInline(trimmedLine.substring(3))}</h3>`;
        }
        if (trimmedLine.startsWith('>>> ')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<h4>${parseInline(trimmedLine.substring(4))}</h4>`;
        }

        // Check for tasks
        if (trimmedLine.startsWith('- ')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<div class="task task-pending">${renderTaskIcon('pending')}<span>${parseInline(trimmedLine.substring(2))}</span></div>`;
        }
        if (trimmedLine.startsWith('/ ')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<div class="task task-progress">${renderTaskIcon('progress')}<span>${parseInline(trimmedLine.substring(2))}</span></div>`;
        }
        if (trimmedLine.startsWith('| ')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<div class="task task-complete">${renderTaskIcon('complete')}<span>${parseInline(trimmedLine.substring(2))}</span></div>`;
        }

        // Check for bullets
        if (trimmedLine.startsWith('* ')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<div class="bullet">${parseInline(trimmedLine.substring(2))}</div>`;
        }

        // Check for numbered list items
        if (trimmedLine.startsWith('+ ')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            return `<div class="numbered">${parseInline(trimmedLine.substring(2))}</div>`;
        }

        // Check for important blocks
        if (trimmedLine.startsWith('! ')) {
            if (isInTable) {
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            const importantText = trimmedLine.substring(2);
            return `<div class="important-block">${parseInline(importantText)}</div>`;
        }

        // Check for table rows (lines starting with :)
        if (trimmedLine.startsWith(':')) {
            isInTable = true;
            const result = renderTableRow(trimmedLine, tableRowIndex, currentTableMetadata);
            tableRowIndex++;
            return result;
        }

        // Non-table line encountered - close table if we were in one
        let result = '';
        if (isInTable) {
            result += '</tbody></table>';
            isInTable = false;
            tableRowIndex = 0;
            currentTableMetadata = null;
        }

        // Check for justifications (why? ) - must check before question to avoid conflict
        if (/^why\?\s/i.test(trimmedLine)) {
            const justificationText = trimmedLine.substring(5);
            result += `<div class="justification">${parseInline(justificationText)}</div>`;
            return result;
        }

        // Check for question blocks (? )
        if (trimmedLine.startsWith('? ')) {
            const questionText = trimmedLine.substring(2);
            result += `<div class="question-block">${parseInline(questionText)}</div>`;
            return result;
        }

        // Check for answer blocks (A. )
        if (trimmedLine.startsWith('A. ')) {
            const answerText = trimmedLine.substring(3);
            result += `<div class="answer-block">${parseInline(answerText)}</div>`;
            return result;
        }

        // Check for horizontal rules (---)
        if (trimmedLine === '---') {
            result += '<hr class="margin-hr">';
            return result;
        }

        // Check for code blocks (lines starting with `)
        if (trimmedLine.startsWith('`')) {
            if (isInTable) {
                result += '</tbody></table>';
                isInTable = false;
                tableRowIndex = 0;
                currentTableMetadata = null;
            }
            const codeText = trimmedLine.substring(1);
            const escapedCode = escapeHTML(codeText);
            result += `<p class="code-block">${escapedCode}</p>`;
            return result;
        }

        // Regular paragraph
        if (line.trim()) {
            result += `<p>${parseInline(line)}</p>`;
        } else {
            result += '<p><br></p>';
        }

        return result;
    }

    /**
     * Convert Margin format text to HTML
     * @param {string} text - Margin format text
     * @returns {string} HTML string
     */
    function parseTextToHTML(text) {
        // Reset table state
        currentTableMetadata = null;
        isInTable = false;
        tableRowIndex = 0;

        const lines = text.split('\n');
        const htmlLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            htmlLines.push(parseLine(lines[i], i));
        }
        
        // Close table if still open at end
        let result = htmlLines.join('\n');
        if (isInTable) {
            result += '</tbody></table>';
        }
        
        return result;
    }

    /**
     * Extract text content from element (helper)
     */
    function extractTextContent(element) {
        let text = '';
        for (const child of element.childNodes) {
            if (child.nodeType === 3 /* Node.TEXT_NODE */) {
                text += child.textContent;
            } else if (child.nodeName === 'STRONG' || child.nodeName === 'B') {
                text += '*' + serializeInlineMarkup(child) + '*';
            } else if (child.nodeName === 'EM' || child.nodeName === 'I') {
                text += '_' + serializeInlineMarkup(child) + '_';
            } else if (child.nodeName === 'SPAN') {
                text += serializeInlineMarkup(child);
            } else if (child.nodeName === 'DIV') {
                text += extractTextContent(child);
            } else if (child.nodeName === 'A') {
                text += child.textContent;
            } else if (child.classList && child.classList.contains('tag')) {
                text += child.textContent;
            }
        }
        return text;
    }

    /**
     * Extract text from table cell
     */
    function extractCellText(cell) {
        const originalContent = cell.getAttribute('data-original-content');
        if (originalContent !== null) {
            return originalContent;
        }
        
        return serializeInlineMarkup(cell).trim();
    }

    /**
     * Convert HTML DOM to Margin format text
     * @param {Element} editorElement - DOM element containing the editor content
     * @returns {string} Margin format text
     */
    function extractPlainText(editorElement) {
        const lines = [];
        let isFirstLine = true;

        for (const child of editorElement.childNodes) {
            if (child.nodeType === 3 /* Node.TEXT_NODE */ && child.textContent.trim()) {
                lines.push(child.textContent);
            } else if (child.nodeName === 'TABLE' && child.classList.contains('margin-table')) {
                // Extract table metadata
                const thead = child.querySelector('thead');
                const hasHeaderRow = thead !== null;
                
                // Check for header column
                let headerColumn = false;
                const allRows = child.querySelectorAll('tr');
                if (allRows.length > 0) {
                    const tbody = child.querySelector('tbody');
                    const tbodyRows = tbody ? tbody.querySelectorAll('tr') : [];
                    const rowsToCheck = hasHeaderRow ? tbodyRows : allRows;
                    
                    if (rowsToCheck.length > 0) {
                        let allFirstCellsAreTh = true;
                        for (const row of rowsToCheck) {
                            const cells = row.querySelectorAll('th, td');
                            const firstCell = cells.length > 0 ? cells[0] : null;
                            if (!firstCell || firstCell.nodeName !== 'TH') {
                                allFirstCellsAreTh = false;
                                break;
                            }
                        }
                        headerColumn = allFirstCellsAreTh && rowsToCheck.length > 0;
                    } else if (hasHeaderRow && allRows.length > 1) {
                        const rowsAfterHeader = Array.from(allRows).slice(1);
                        if (rowsAfterHeader.length > 0) {
                            let allFirstCellsAreTh = true;
                            for (const row of rowsAfterHeader) {
                                const cells = row.querySelectorAll('th, td');
                                const firstCell = cells.length > 0 ? cells[0] : null;
                                if (!firstCell || firstCell.nodeName !== 'TH') {
                                    allFirstCellsAreTh = false;
                                    break;
                                }
                            }
                            headerColumn = allFirstCellsAreTh && rowsAfterHeader.length > 0;
                        }
                    }
                }

                // Output metadata if needed
                if (hasHeaderRow || headerColumn) {
                    const metadataParts = [];
                    if (hasHeaderRow) metadataParts.push('header-row');
                    if (headerColumn) metadataParts.push('header-column');
                    const metadataLine = '<<' + metadataParts.join(' ') + '>>';
                    lines.push(metadataLine);
                }

                // Extract table rows
                const rows = child.querySelectorAll('tr');
                for (const row of rows) {
                    const cells = row.querySelectorAll('th, td');
                    const cellTexts = Array.from(cells).map(cell => extractCellText(cell));
                    if (cellTexts.length > 0) {
                        lines.push(': ' + cellTexts.join(' : '));
                    }
                }
                isFirstLine = false;
            } else if (child.nodeName === 'H1') {
                if (isFirstLine) {
                    lines.push(serializeInlineMarkup(child));
                    isFirstLine = false;
                } else {
                    lines.push('> ' + serializeInlineMarkup(child));
                }
            } else if (child.nodeName === 'H2') {
                lines.push('> ' + serializeInlineMarkup(child));
                isFirstLine = false;
            } else if (child.nodeName === 'H3') {
                lines.push('>> ' + serializeInlineMarkup(child));
                isFirstLine = false;
            } else if (child.nodeName === 'H4') {
                lines.push('>>> ' + serializeInlineMarkup(child));
                isFirstLine = false;
            } else if (child.nodeName === 'DIV' && child.classList.contains('task-pending')) {
                lines.push('- ' + extractTextContent(child));
                isFirstLine = false;
            } else if (child.nodeName === 'DIV' && child.classList.contains('task-progress')) {
                lines.push('/ ' + extractTextContent(child));
                isFirstLine = false;
            } else if (child.nodeName === 'DIV' && child.classList.contains('task-complete')) {
                lines.push('| ' + extractTextContent(child));
                isFirstLine = false;
            } else if (child.nodeName === 'DIV' && child.classList.contains('bullet')) {
                lines.push('* ' + serializeInlineMarkup(child));
                isFirstLine = false;
            } else if (child.nodeName === 'DIV' && child.classList.contains('numbered')) {
                lines.push('+ ' + serializeInlineMarkup(child));
                isFirstLine = false;
            } else if (child.nodeName === 'DIV' && child.classList.contains('important-block')) {
                lines.push('! ' + serializeInlineMarkup(child));
                isFirstLine = false;
            } else if (child.nodeName === 'DIV' && (child.classList.contains('justification') ||
                (child.className && child.className.includes('justification')))) {
                lines.push('why? ' + serializeInlineMarkup(child));
                isFirstLine = false;
            } else if (child.nodeName === 'DIV' && child.classList.contains('question-block')) {
                // Extract question block - line with "? " prefix
                lines.push('? ' + serializeInlineMarkup(child));
                isFirstLine = false;
            } else if (child.nodeName === 'DIV' && child.classList.contains('answer-block')) {
                // Extract answer block - line with "A. " prefix
                lines.push('A. ' + serializeInlineMarkup(child));
                isFirstLine = false;
            } else if (child.nodeName === 'HR') {
                lines.push('---');
                isFirstLine = false;
            } else if (child.nodeName === 'P' && child.classList.contains('code-block')) {
                const codeContent = child.textContent || '';
                const codeLines = codeContent.split('\n');
                for (const codeLine of codeLines) {
                    lines.push('`' + codeLine);
                }
                isFirstLine = false;
            } else if (child.nodeName === 'P') {
                const tagSpan = child.querySelector('span.tag');
                if (tagSpan) {
                    lines.push(tagSpan.textContent);
                } else {
                    const img = child.querySelector('img.inline-image');
                    if (img) {
                        const imageSrc = img.getAttribute('data-image-src') || img.getAttribute('src');
                        if (imageSrc) {
                            if (imageSrc.startsWith('file://')) {
                                lines.push(imageSrc);
                            } else if (imageSrc.startsWith('data:')) {
                                const originalSrc = img.getAttribute('data-image-src');
                                if (originalSrc && originalSrc.startsWith('file://')) {
                                    lines.push(originalSrc);
                                }
                            }
                        }
                    }
                    
                    const textContent = child.textContent || '';
                    if (!img && textContent.trim()) {
                        lines.push(serializeInlineMarkup(child));
                    } else if (!img) {
                        lines.push('');
                    }
                }
                isFirstLine = false;
            }
        }

        return lines.join('\n');
    }

    // Markdown paste detection and conversion utilities

    /**
     * Strip markdown inline formatting to plain text or margin-compatible equivalents.
     */
    function stripInlineMarkdown(text) {
        if (!text) return '';
        // Images: ![alt](url) → url
        text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$2');
        // Links: [text](url) → url
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
        // Bold+italic: ***text*** or ___text___
        text = text.replace(/\*{3}([^*]+)\*{3}/g, '$1');
        text = text.replace(/_{3}([^_]+)_{3}/g, '$1');
        // Bold: **text** or __text__
        text = text.replace(/\*{2}([^*]+)\*{2}/g, '$1');
        text = text.replace(/_{2}([^_]+)_{2}/g, '$1');
        // Italic: *text* or _text_
        text = text.replace(/\*([^*]+)\*/g, '$1');
        text = text.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1');
        // Strikethrough: ~~text~~
        text = text.replace(/~~([^~]+)~~/g, '$1');
        // Inline code: `code`
        text = text.replace(/`([^`]+)`/g, '$1');
        return text;
    }

    /**
     * Detect whether pasted text is likely markdown format.
     * Uses a scoring system that only counts UNAMBIGUOUS markdown patterns
     * (patterns that don't exist in margin format).
     */
    function isMarkdown(text) {
        if (!text || text.trim().length === 0) return false;

        let score = 0;
        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            // ATX headings: # with space (margin tags #tag have no space)
            if (/^#{1,6}\s/.test(trimmed)) score += 2;
            // Code fences
            if (/^```/.test(trimmed)) score += 3;
            // Checkboxes: - [ ] or - [x]
            if (/^[-*]\s\[[ xX]\]/.test(trimmed)) score += 3;
            // Table separator: |---|---|
            if (/^\|[\s-:]+\|/.test(trimmed) && /---/.test(trimmed)) score += 3;
            if (score >= 2) return true;
        }

        // Inline patterns (full text)
        if (/\*\*[^*]+\*\*/.test(text) || /__[^_]+__/.test(text)) score += 2;
        if (score >= 2) return true;
        if (/(?<!!)\[[^\]]+\]\([^)]+\)/.test(text)) score += 2;
        if (score >= 2) return true;
        if (/!\[[^\]]*\]\([^)]+\)/.test(text)) score += 2;

        return score >= 2;
    }

    /**
     * Convert markdown text to margin format text.
     */
    function convertMarkdownToMargin(text) {
        const lines = text.split('\n');
        const result = [];
        let inCodeFence = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Code fence toggle
            if (/^```/.test(trimmed)) {
                inCodeFence = !inCodeFence;
                continue;
            }

            if (inCodeFence) {
                result.push('`' + line);
                continue;
            }

            // Horizontal rules: convert to margin ---
            if (/^(---+|\*\*\*+|___+)\s*$/.test(trimmed)) {
                result.push('---');
                continue;
            }

            // Table separator: skip
            if (/^\|[\s-:]+\|/.test(trimmed) && /---/.test(trimmed)) continue;

            // Table data row: | col1 | col2 |
            if (/^\|(.+)\|$/.test(trimmed)) {
                const cells = trimmed
                    .replace(/^\|/, '').replace(/\|$/, '')
                    .split('|')
                    .map(c => stripInlineMarkdown(c.trim()));
                result.push(': ' + cells.join(' : '));
                continue;
            }

            // Checkboxes: - [ ] or - [x]
            const checkboxMatch = trimmed.match(/^[-*]\s\[([ xX])\]\s?(.*)/);
            if (checkboxMatch) {
                const checked = checkboxMatch[1].toLowerCase() === 'x';
                const taskText = stripInlineMarkdown(checkboxMatch[2]);
                result.push(checked ? '| ' + taskText : '- ' + taskText);
                continue;
            }

            // ATX headings
            const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const headingText = stripInlineMarkdown(headingMatch[2]);
                if (level === 1) result.push('> ' + headingText);
                else if (level === 2) result.push('>> ' + headingText);
                else result.push('>>> ' + headingText);
                continue;
            }

            // Ordered lists: 1. item → * item
            const orderedMatch = trimmed.match(/^\d+\.\s+(.*)/);
            if (orderedMatch) {
                result.push('* ' + stripInlineMarkdown(orderedMatch[1]));
                continue;
            }

            // Unordered lists: - item or * item → * item
            const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)/);
            if (unorderedMatch) {
                result.push('* ' + stripInlineMarkdown(unorderedMatch[1]));
                continue;
            }

            // Blockquote: > text → plain text (can't use > in margin, it means heading)
            const blockquoteMatch = trimmed.match(/^>\s?(.*)/);
            if (blockquoteMatch) {
                result.push(stripInlineMarkdown(blockquoteMatch[1]));
                continue;
            }

            // Empty lines: preserve
            if (trimmed === '') {
                result.push('');
                continue;
            }

            // Regular text: strip inline markdown
            result.push(stripInlineMarkdown(trimmed));
        }

        return result.join('\n');
    }

    // Return public API
    return {
        parseTextToHTML,
        extractPlainText,
        // Expose helpers for advanced usage/testing
        parseInline,
        parseLine,
        parseMetadata,
        escapeHTML,
        extractCellText,
        extractTextContent,
        // Markdown paste conversion
        isMarkdown,
        convertMarkdownToMargin,
        stripInlineMarkdown
    };
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    // CommonJS (Node.js)
    module.exports = { createMarginConverter, DEFAULT_FEATURES };
} else if (typeof window !== 'undefined') {
    // Browser global
    window.createMarginConverter = createMarginConverter;
    window.MARGIN_DEFAULT_FEATURES = DEFAULT_FEATURES;
}
