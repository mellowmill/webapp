/* Helpers for building a standalone static site from workspace notes. */
(function (root) {
    'use strict';

    const DEFAULT_OPTIONS = {
        sidebar: true,
        menuPosition: 'left',
        toc: true,
        previousNext: true,
        landingTitle: '',
        workspaceTitle: '',
        noteIndex: [],
        theme: {
            darkMode: false,
            lightPrimary: '#9ca3af',
            darkPrimary: '#9ca3af',
            lightBackground: '#f5f5f5',
            darkBackground: '#1e1e20',
            lightText: '#1a202c',
            darkText: '#f7fafc',
            fontSize: '100%',
            bodyFont: '',
            headingFont: '',
            os: ''
        },
        commonCss: '',
        rendererCss: '',
        tagsCustomOrder: []
    };

    const PUBLISH_CSS = `
html, body {
    margin: 0;
    min-height: 100%;
    background: var(--color-background);
    color: var(--color-text);
}

:root {
    --publish-sidebar-width: 244px;
    --publish-toc-width: 224px;
}

.publish-mobile-menu-toggle,
.publish-mobile-menu-backdrop {
    display: none;
}

.publish-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 100vh;
}

.publish-layout.has-sidebar {
    grid-template-columns: var(--publish-sidebar-width) minmax(0, 1fr);
}

.publish-layout.has-toc {
    grid-template-columns: minmax(0, 1fr) var(--publish-toc-width);
}

.publish-layout.has-sidebar.has-toc {
    grid-template-columns: var(--publish-sidebar-width) minmax(0, 1fr) var(--publish-toc-width);
}

.publish-layout.menu-top {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    grid-template-areas:
        "topbar"
        "main";
}

.publish-layout.menu-top.has-toc {
    grid-template-columns: minmax(0, 1fr) var(--publish-toc-width);
    grid-template-rows: auto 1fr;
    grid-template-areas:
        "topbar topbar"
        "main toc";
}

.publish-layout.menu-top .publish-topbar {
    grid-area: topbar;
}

.publish-layout.menu-top .publish-main {
    grid-area: main;
}

.publish-layout.menu-top .publish-toc {
    grid-area: toc;
}

.publish-sidebar,
.publish-toc {
    position: sticky;
    top: 0;
    align-self: start;
    height: 100vh;
    overflow-y: auto;
    padding: 28px 20px;
    box-sizing: border-box;
    border-color: var(--color-sidebar-border);
}

.publish-sidebar {
    background: var(--color-sidebar);
    border-right: 1px solid var(--color-sidebar-border);
}

.publish-topbar {
    background: var(--color-sidebar);
    border-bottom: 1px solid var(--color-sidebar-border);
}

.publish-toc {
    padding-top: 72px;
    padding-left: 0;
    background: var(--color-background);
    transform: translateX(-24px);
}

.publish-toc nav {
    padding-left: 12px;
    border-left: 1px solid var(--color-sidebar-border);
}

.publish-toc h2 {
    margin: 0 0 22px;
    color: var(--color-text);
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.publish-workspace-title {
    display: block;
    margin: 0 0 22px;
    color: var(--color-text);
    font-size: 1.05rem;
    font-weight: 700;
    text-decoration: none;
}

.publish-workspace-title:hover {
    color: var(--color-primary-dark);
}

.publish-sidebar .publish-workspace-title {
    text-align: center;
}

.publish-sidebar .publish-workspace-title .inline-image {
    margin-right: auto;
    margin-left: auto;
}

.publish-home-link {
    margin: 0 0 22px;
}

.publish-nav-group {
    margin: 0 0 22px;
}

.publish-nav-group-title {
    margin: 0 0 7px;
    color: var(--color-text-secondary);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.publish-sidebar ul,
.publish-toc ul {
    margin: 0;
    padding: 0;
    list-style: none;
}

.publish-sidebar a,
.publish-toc a {
    display: block;
    color: var(--color-text-secondary);
    text-decoration: none;
}

.publish-sidebar a {
    padding: 5px 8px;
    border-radius: 8px;
    font-size: 0.9rem;
    transition: background-color 120ms ease, color 120ms ease;
}

.publish-sidebar li + li {
    margin-top: 3px;
}

.publish-sidebar a:hover {
    background: var(--color-background2);
    background: color-mix(in srgb, var(--color-primary) 7%, var(--color-background));
    color: var(--color-primary-dark);
}

.publish-sidebar a[aria-current="page"] {
    background: var(--color-background2);
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-background));
    color: var(--color-primary-dark);
    font-weight: 700;
}

.publish-sidebar a:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
}

.publish-top-nav {
    width: min(100% - 48px, 1100px);
    margin: 0 auto;
    padding: 12px 0;
    border-top: 1px solid var(--color-sidebar-border);
}

.publish-top-nav-list,
.publish-top-nav-list ul {
    margin: 0;
    padding: 0;
    list-style: none;
}

.publish-top-nav-list {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
}

.publish-top-nav-list > li {
    position: relative;
}

.publish-top-nav-list > li > a,
.publish-top-nav summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    text-decoration: none;
    cursor: pointer;
}

.publish-top-nav summary {
    list-style: none;
}

.publish-top-nav summary::-webkit-details-marker {
    display: none;
}

.publish-top-nav-list > li > a:hover,
.publish-top-nav details[open] > summary,
.publish-top-nav a[aria-current="page"] {
    background: var(--color-background2);
    background: color-mix(in srgb, var(--color-primary) 12%, var(--color-background));
    color: var(--color-primary-dark);
}

.publish-top-nav-list > li > a:focus-visible,
.publish-top-nav summary:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
}

.publish-top-nav-list details > ul {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 20;
    display: none;
    min-width: 220px;
    padding: 6px;
    border: 1px solid var(--color-sidebar-border);
    border-radius: 8px;
    background: var(--color-background);
    box-shadow: 0 6px 18px var(--color-shadow-md);
}

.publish-top-nav-list details[open] > ul {
    display: block;
}

.publish-top-nav-list details > ul li + li {
    margin-top: 2px;
}

.publish-top-nav-list details > ul a {
    display: block;
    padding: 7px 9px;
    border-radius: 6px;
    color: var(--color-text-secondary);
    font-size: 0.88rem;
    text-decoration: none;
}

.publish-top-nav-list details > ul a:hover {
    background: var(--color-background2);
    color: var(--color-primary-dark);
}

.publish-toc a {
    padding: 4px 0;
    font-size: 0.82rem;
}

.publish-toc a:hover {
    color: var(--color-primary-dark);
}

.publish-toc .toc-level-3 {
    padding-left: 12px;
}

.publish-toc .toc-level-4 {
    padding-left: 24px;
}

.publish-main {
    min-width: 0;
}

.publish-content {
    width: min(100% - 48px, 760px);
    margin: 0 auto;
    padding: 52px 0 40px;
}

.publish-header,
.publish-footer {
    width: min(100% - 48px, 760px);
    margin: 0 auto;
}

.publish-topbar .publish-header {
    width: min(100% - 48px, 1100px);
}

.publish-footer {
    padding: 26px 0 40px;
    border-top: 1px solid var(--color-border);
}

.publish-article .margin-document,
.publish-header .margin-document,
.publish-footer .margin-document,
.publish-sidebar .margin-document {
    --margin-background: var(--color-background);
    --margin-background2: var(--color-background2);
    --margin-text: var(--color-text);
    --margin-text-secondary: var(--color-text-secondary);
    --margin-border: var(--color-border);
    --margin-primary: var(--color-primary);
    background: transparent;
}

.publish-article .margin-document h1 {
    margin-bottom: 22px;
}

.publish-article .margin-document h2,
.publish-article .margin-document h3,
.publish-article .margin-document h4 {
    scroll-margin-top: 24px;
}

.publish-page-nav {
    display: flex;
    gap: 16px;
    margin-top: 44px;
    padding-top: 20px;
    border-top: 1px solid var(--color-border);
}

.publish-page-nav a {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    min-height: 78px;
    box-sizing: border-box;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    padding: 16px 18px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-background2);
    color: var(--color-primary-dark);
    text-decoration: none;
}

.publish-page-nav a:hover {
    border-color: var(--color-primary);
    background: var(--color-background);
    text-decoration: none;
}

.publish-page-nav a:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
}

.publish-page-nav-label {
    color: var(--color-text-secondary);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    line-height: 1;
    text-transform: uppercase;
}

.publish-page-nav-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--color-primary-dark);
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.35;
}

.publish-page-nav-title-text {
    min-width: 0;
    overflow-wrap: anywhere;
}

.publish-page-nav-arrow {
    flex: 0 0 auto;
    font-size: 1.1em;
    line-height: 1;
}

.publish-page-nav .previous {
    align-items: flex-start;
    text-align: left;
}

.publish-page-nav .next {
    align-items: flex-end;
    text-align: right;
}

@media (max-width: 1050px) {
    .publish-layout.has-toc,
    .publish-layout.has-sidebar.has-toc {
        grid-template-columns: var(--publish-sidebar-width) minmax(0, 1fr);
    }

    .publish-layout.has-toc:not(.has-sidebar) {
        grid-template-columns: minmax(0, 1fr);
    }

    .publish-layout.has-toc .publish-toc {
        display: none;
    }

    .publish-layout.menu-top.has-toc {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas:
            "topbar"
            "main";
    }

    .publish-layout.menu-top.has-toc .publish-toc {
        display: none;
    }
}

@media (max-width: 720px) {
    .publish-layout.has-sidebar {
        grid-template-columns: minmax(0, 1fr);
    }

    .publish-layout.has-sidebar .publish-main {
        padding-top: 64px;
    }

    .publish-layout.has-sidebar .publish-sidebar {
        display: block;
        position: fixed;
        z-index: 1001;
        top: 0;
        bottom: 0;
        left: 0;
        width: min(86vw, 320px);
        height: 100vh;
        height: 100dvh;
        padding: max(72px, calc(env(safe-area-inset-top, 0px) + 72px)) 20px
            max(28px, env(safe-area-inset-bottom, 0px) + 28px)
            max(20px, env(safe-area-inset-left, 0px));
        overflow-y: auto;
        background: var(--color-sidebar);
        box-shadow: 8px 0 24px var(--color-shadow-lg);
        transform: translateX(-105%);
        visibility: hidden;
        transition: transform 180ms ease-out, visibility 180ms ease-out;
    }

    .publish-layout.has-sidebar.mobile-menu-open .publish-sidebar {
        transform: translateX(0);
        visibility: visible;
    }

    .publish-mobile-menu-toggle {
        position: fixed;
        z-index: 1002;
        top: max(12px, env(safe-area-inset-top, 0px));
        left: max(12px, env(safe-area-inset-left, 0px));
        display: inline-flex;
        width: 48px;
        height: 48px;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid var(--color-sidebar-border);
        border-radius: 10px;
        background: var(--color-sidebar);
        color: var(--color-text);
        cursor: pointer;
        box-shadow: 0 4px 14px var(--color-shadow-md);
    }

    .publish-mobile-menu-toggle:hover {
        background: var(--color-background2);
    }

    .publish-mobile-menu-toggle:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 3px;
    }

    .publish-mobile-menu-icon {
        display: inline-flex;
        width: 20px;
        flex-direction: column;
        gap: 4px;
    }

    .publish-mobile-menu-icon span {
        display: block;
        height: 2px;
        border-radius: 2px;
        background: currentColor;
        transition: transform 180ms ease-out, opacity 180ms ease-out;
    }

    .publish-mobile-menu-toggle[aria-expanded="true"] .publish-mobile-menu-icon span:first-child {
        transform: translateY(6px) rotate(45deg);
    }

    .publish-mobile-menu-toggle[aria-expanded="true"] .publish-mobile-menu-icon span:nth-child(2) {
        opacity: 0;
    }

    .publish-mobile-menu-toggle[aria-expanded="true"] .publish-mobile-menu-icon span:last-child {
        transform: translateY(-6px) rotate(-45deg);
    }

    .publish-mobile-menu-backdrop {
        position: fixed;
        z-index: 1000;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        padding: 0;
        border: 0;
        background: color-mix(in srgb, var(--color-text) 28%, transparent);
        cursor: pointer;
    }

    .publish-mobile-menu-backdrop[hidden] {
        display: none;
    }

    body.publish-mobile-menu-lock {
        overflow: hidden;
    }

    .publish-content,
    .publish-footer {
        width: min(100% - 32px, 760px);
    }

    .publish-topbar .publish-header {
        width: min(100% - 32px, 1100px);
    }

    .publish-top-nav {
        width: min(100% - 32px, 1100px);
    }
}

@media (max-width: 560px) {
    .publish-top-nav-list {
        align-items: stretch;
        flex-direction: column;
    }

    .publish-top-nav-list > li,
    .publish-top-nav-list > li > a,
    .publish-top-nav-list details,
    .publish-top-nav-list summary {
        width: 100%;
    }

    .publish-top-nav-list details > ul {
        position: static;
        min-width: 0;
        margin: 4px 0 0 12px;
        box-shadow: none;
    }

    .publish-page-nav {
        flex-direction: column;
        gap: 12px;
    }
}
`;

    function optionValue(options, key) {
        return options && options[key] !== undefined ? options[key] : DEFAULT_OPTIONS[key];
    }

    function normalizeMenuPosition(value) {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'top') return 'top';
        if (normalized === 'none') return 'none';
        return 'left';
    }

    function resolveMenuPosition(rawOptions) {
        if (rawOptions && rawOptions.menuPosition !== undefined) {
            return normalizeMenuPosition(rawOptions.menuPosition);
        }
        if (rawOptions && rawOptions.menu !== undefined) {
            return normalizeMenuPosition(rawOptions.menu);
        }
        if (rawOptions && rawOptions.publishMenuPosition !== undefined) {
            return normalizeMenuPosition(rawOptions.publishMenuPosition);
        }
        // Keep the builder API compatible with callers that predate the
        // left/top setting and used `sidebar: false` to hide the rail.
        return rawOptions && rawOptions.sidebar === false ? 'none' : 'left';
    }

    function noteValue(note, key, fallback) {
        if (!note) return fallback;
        const pascal = key.charAt(0).toUpperCase() + key.slice(1);
        return note[key] !== undefined ? note[key] : (note[pascal] !== undefined ? note[pascal] : fallback);
    }

    function normalizeNote(note) {
        return {
            id: Number(noteValue(note, 'id', 0)),
            title: String(noteValue(note, 'title', '') || '').trim(),
            content: String(noteValue(note, 'content', '') || ''),
            tags: Array.isArray(noteValue(note, 'tags', [])) ? noteValue(note, 'tags', []) : [],
            location: String(noteValue(note, 'location', '') || '')
        };
    }

    function escapeHTML(value) {
        if (root.MarginRenderer && typeof root.MarginRenderer.escapeHTML === 'function') {
            return root.MarginRenderer.escapeHTML(value);
        }
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeFileStem(title) {
        const sanitized = String(title || '')
            .split('')
            .map(character => '/\\:*?"<>|'.includes(character) ? '_' : character)
            .join('')
            .trim()
            .replace(/^\.+|\.+$/g, '');
        return sanitized || 'Untitled';
    }

    function sanitizeAssetName(source) {
        const raw = String(source || '').split(/[\\/]/).pop() || 'asset';
        const safe = raw
            .split('')
            .map(character => '/\\:*?"<>|'.includes(character) ? '_' : character)
            .join('')
            .trim()
            .replace(/^\.+|\.+$/g, '');
        return safe || 'asset';
    }

    function buildPageNames(notes) {
        const used = new Set();
        return notes.map(note => {
            const base = note.title.toLowerCase() === 'index'
                ? 'index'
                : sanitizeFileStem(note.title);
            let stem = base;
            let suffix = 2;
            while (used.has(`${stem}.html`.toLowerCase())) {
                stem = `${base}-${suffix}`;
                suffix += 1;
            }
            const file = `${stem}.html`;
            used.add(file.toLowerCase());
            return { note, stem, file };
        });
    }

    function resolveLandingPage(pages, rememberedTitle) {
        const byTitle = title => pages.find(page =>
            page.note.title.localeCompare(String(title || ''), undefined, { sensitivity: 'accent' }) === 0
        );
        const selected = byTitle(rememberedTitle);
        return { page: selected || null, automatic: false };
    }

    function avoidLandingAliasCollision(pages, landingPage) {
        if (!landingPage || landingPage.file.toLowerCase() === 'index.html') return;

        const conflictingPage = pages.find(page => page.file.toLowerCase() === 'index.html');
        if (!conflictingPage) return;

        const used = new Set(pages.map(page => page.file.toLowerCase()));
        used.delete(conflictingPage.file.toLowerCase());
        const base = sanitizeFileStem(conflictingPage.note.title);
        let suffix = 2;
        let stem = `${base}-${suffix}`;
        while (used.has(`${stem}.html`.toLowerCase())) {
            suffix += 1;
            stem = `${base}-${suffix}`;
        }
        conflictingPage.stem = stem;
        conflictingPage.file = `${stem}.html`;
    }

    function safeColor(value, fallback) {
        return /^(?:#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8})$/i.test(String(value || ''))
            ? value
            : fallback;
    }

    function contrastColor(hex) {
        const normalized = String(hex || '').replace('#', '');
        if (![3, 4, 6, 8].includes(normalized.length) || !/^[0-9a-f]+$/i.test(normalized)) {
            return '#ffffff';
        }
        const full = normalized.length <= 4
            ? normalized.slice(0, 3).split('').map(value => value + value).join('')
            : normalized.slice(0, 6);
        const channels = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16) / 255);
        const luminance = channels.map(value =>
            value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
        );
        const relativeLuminance = 0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2];
        return 1.05 / (relativeLuminance + 0.05) >= (relativeLuminance + 0.05) / 0.05
            ? '#ffffff'
            : '#1a202c';
    }

    function slugHeading(text, used) {
        const base = String(text || '')
            .toLowerCase()
            .trim()
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-+|-+$/g, '') || 'section';
        let slug = base;
        let suffix = 2;
        while (used.has(slug)) {
            slug = `${base}-${suffix}`;
            suffix += 1;
        }
        used.add(slug);
        return slug;
    }

    function renderHeadingAnchors(html) {
        if (typeof document === 'undefined') {
            return { html, headings: [] };
        }
        const host = document.createElement('div');
        host.innerHTML = html;
        const used = new Set();
        const headings = Array.from(host.querySelectorAll('h2, h3, h4')).map(element => {
            const text = element.textContent.trim();
            const id = slugHeading(text, used);
            element.id = id;
            return {
                level: Number(element.tagName.slice(1)),
                text,
                id
            };
        });
        return { html: host.innerHTML, headings };
    }

    function pageTitleLink(page, currentFile) {
        const current = page.file.toLowerCase() === String(currentFile || '').toLowerCase();
        return `<li><a href="${escapeHTML(page.file)}"${current ? ' aria-current="page"' : ''}>${escapeHTML(page.note.title)}</a></li>`;
    }

    function firstNoteTag(note) {
        const cachedTag = Array.isArray(note && note.tags)
            ? note.tags.find(tag => String(tag || '').trim())
            : '';
        if (cachedTag) return String(cachedTag).replace(/^#/, '').trim() || 'Other';

        const contentMatch = String(note && note.content || '').match(/(?:^|\n)\s*#(.+?)(?:\r?\n|$)/);
        if (contentMatch && contentMatch[1]) {
            const rawTag = contentMatch[1].trim();
            const nextTag = rawTag.search(/\s+#(?=\S)/);
            return (nextTag >= 0 ? rawTag.slice(0, nextTag) : rawTag).trim() || 'Other';
        }
        return 'Other';
    }

    function parseCustomOrder(value) {
        let parsed = value;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return [];
            try {
                parsed = JSON.parse(trimmed);
            } catch (error) {
                try {
                    parsed = JSON.parse(decodeURIComponent(trimmed));
                } catch {
                    return [];
                }
            }
        }

        if (!Array.isArray(parsed)) return [];
        const seen = new Set();
        return parsed
            .map(value => value === null || value === undefined ? '' : String(value))
            .map(value => value.trim())
            .filter(value => {
                if (!value || seen.has(value)) return false;
                seen.add(value);
                return true;
            });
    }

    function parseCustomOrders(value) {
        let parsed = value;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return new Map();
            try {
                parsed = JSON.parse(trimmed);
            } catch (error) {
                try {
                    parsed = JSON.parse(decodeURIComponent(trimmed));
                } catch {
                    return new Map();
                }
            }
        }

        if (Array.isArray(parsed)) {
            return new Map([['all', parseCustomOrder(parsed)]]);
        }
        if (!parsed || typeof parsed !== 'object') return new Map();

        const orders = new Map();
        Object.entries(parsed).forEach(([tag, order]) => {
            const tagKey = String(tag || '').replace(/^#/, '').trim();
            if (tagKey) orders.set(tagKey, parseCustomOrder(order));
        });
        return orders;
    }

    function getCategoryCustomOrder(customOrders, category) {
        const categoryKey = String(category || '').replace(/^#/, '').trim();
        if (!categoryKey) return [];

        const exactOrder = customOrders.get(categoryKey);
        if (exactOrder) return exactOrder;

        const matchingEntry = Array.from(customOrders.entries()).find(([tag]) =>
            tag.localeCompare(categoryKey, undefined, { sensitivity: 'base' }) === 0
        );
        return matchingEntry ? matchingEntry[1] : [];
    }

    function comparePageTitles(a, b) {
        const titleOrder = a.note.title.localeCompare(b.note.title, undefined, { sensitivity: 'base' });
        if (titleOrder) return titleOrder;
        return a.note.title.localeCompare(b.note.title, undefined, { sensitivity: 'variant' }) ||
            a.file.localeCompare(b.file, undefined, { sensitivity: 'base' });
    }

    function sortCategoryPages(pages, category, customOrders) {
        const customOrder = getCategoryCustomOrder(customOrders, category);
        const customRanks = new Map(customOrder.map((id, index) => [id, index]));

        return [...pages].sort((a, b) => {
            const aRank = customRanks.get(String(a.note.id));
            const bRank = customRanks.get(String(b.note.id));
            if (aRank !== undefined || bRank !== undefined) {
                if (aRank === undefined) return 1;
                if (bRank === undefined) return -1;
                if (aRank !== bRank) return aRank - bRank;
            }
            return comparePageTitles(a, b);
        });
    }

    function getCategoryCustomOrderRank(tagOrder, category) {
        if (!Array.isArray(tagOrder)) return undefined;
        const categoryKey = String(category || '').replace(/^#/, '').trim();
        if (!categoryKey) return undefined;

        const exactRank = tagOrder.indexOf(categoryKey);
        if (exactRank >= 0) return exactRank;

        const matchingRank = tagOrder.findIndex(tag =>
            String(tag).localeCompare(categoryKey, undefined, { sensitivity: 'base' }) === 0
        );
        return matchingRank >= 0 ? matchingRank : undefined;
    }

    function compareCategoryNames(a, b, tagOrder) {
        const aRank = getCategoryCustomOrderRank(tagOrder, a);
        const bRank = getCategoryCustomOrderRank(tagOrder, b);
        if (aRank !== undefined || bRank !== undefined) {
            if (aRank === undefined) return 1;
            if (bRank === undefined) return -1;
            if (aRank !== bRank) return aRank - bRank;
        }
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }

    function buildCategoryGroups(pages, customOrders, tagOrder) {
        const groups = new Map();
        pages.forEach(page => {
            const firstTag = firstNoteTag(page.note);
            if (!groups.has(firstTag)) groups.set(firstTag, []);
            groups.get(firstTag).push(page);
        });
        return Array.from(groups.entries()).sort((a, b) =>
            compareCategoryNames(a[0], b[0], tagOrder)
        ).map(([name, group]) => [name, sortCategoryPages(group, name, customOrders)]);
    }

    function renderSidebar(pages, currentFile, workspaceTitle, landingFile, landingPageFile, workspaceHtml, customOrders, categoryGroups) {
        const orderedGroups = categoryGroups || buildCategoryGroups(pages, customOrders);
        const workspaceLink = workspaceHtml
            ? `<a class="publish-workspace-title" href="${escapeHTML(landingFile)}"><div class="margin-document">${workspaceHtml}</div></a>`
            : `<a class="publish-workspace-title" href="${escapeHTML(landingFile)}">${escapeHTML(workspaceTitle || 'Workspace')}</a>`;
        const currentKey = String(currentFile || '').toLowerCase();
        const homeFiles = [landingFile, landingPageFile]
            .map(file => String(file || '').toLowerCase())
            .filter(Boolean);
        const homeCurrent = homeFiles.includes(currentKey);
        const homeLink = `<a class="publish-home-link" href="${escapeHTML(landingFile)}"${homeCurrent ? ' aria-current="page"' : ''}>Home</a>`;
        const landingKey = String(landingPageFile || '').toLowerCase();
        const groups = orderedGroups.map(([name, group]) => {
            const pagesForMenu = group.filter(page => page.file.toLowerCase() !== landingKey);
            if (!pagesForMenu.length) return '';
            return `<section class="publish-nav-group"><h3 class="publish-nav-group-title">${escapeHTML(name)}</h3><ul>` +
                pagesForMenu.map(page => pageTitleLink(page, currentFile)).join('') +
                '</ul></section>';
        }).join('');
        return `<aside id="publish-sidebar" class="publish-sidebar" aria-label="Site navigation">${workspaceLink}${homeLink}${groups}</aside>`;
    }

    function renderMobileMenuControls() {
        return `<button type="button" class="publish-mobile-menu-toggle" aria-controls="publish-sidebar" aria-expanded="false" aria-label="Open navigation menu">` +
            '<span class="publish-mobile-menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>' +
            '</button>' +
            '<button type="button" class="publish-mobile-menu-backdrop" aria-label="Close navigation menu" hidden></button>';
    }

    function renderSidebarScript() {
        return `<script>
(function () {
    const layout = document.querySelector('.publish-layout.has-sidebar');
    const sidebar = document.getElementById('publish-sidebar');
    const toggle = document.querySelector('.publish-mobile-menu-toggle');
    const backdrop = document.querySelector('.publish-mobile-menu-backdrop');
    if (!layout || !sidebar || !toggle || !backdrop) return;

    const mobileQuery = window.matchMedia('(max-width: 720px)');
    let lastFocusedElement = null;

    const setOpen = (isOpen) => {
        const open = Boolean(isOpen) && mobileQuery.matches;
        layout.classList.toggle('mobile-menu-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        backdrop.hidden = !open;
        document.body.classList.toggle('publish-mobile-menu-lock', open);
        if (mobileQuery.matches) {
            sidebar.toggleAttribute('inert', !open);
        } else {
            sidebar.removeAttribute('inert');
        }
    };

    const close = (restoreFocus) => {
        const wasOpen = layout.classList.contains('mobile-menu-open');
        setOpen(false);
        if (restoreFocus && wasOpen) {
            lastFocusedElement?.focus();
            lastFocusedElement = null;
        }
    };

    toggle.addEventListener('click', () => {
        const willOpen = !layout.classList.contains('mobile-menu-open');
        if (willOpen) {
            lastFocusedElement = toggle;
        }
        setOpen(willOpen);
        if (willOpen) {
            sidebar.querySelector('a')?.focus();
        }
    });

    backdrop.addEventListener('click', () => close(true));
    sidebar.addEventListener('click', event => {
        if (event.target instanceof Element && event.target.closest('a')) {
            close(false);
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && layout.classList.contains('mobile-menu-open')) {
            close(true);
        }
    });

    const syncViewport = () => {
        if (!mobileQuery.matches) {
            close(false);
        } else {
            setOpen(layout.classList.contains('mobile-menu-open'));
        }
    };
    if (mobileQuery.addEventListener) {
        mobileQuery.addEventListener('change', syncViewport);
    } else {
        mobileQuery.addListener(syncViewport);
    }
    syncViewport();
})();
</script>`;
    }

    function renderTopNav(pages, currentFile, landingFile, landingPageFile, customOrders, categoryGroups) {
        const orderedGroups = categoryGroups || buildCategoryGroups(pages, customOrders);
        const currentKey = String(currentFile || '').toLowerCase();
        const homeFiles = [landingFile, landingPageFile]
            .map(file => String(file || '').toLowerCase())
            .filter(Boolean);
        const homeCurrent = homeFiles.includes(currentKey);
        const homeLink = `<li class="publish-top-nav-home"><a href="${escapeHTML(landingFile)}"${homeCurrent ? ' aria-current="page"' : ''}>Home</a></li>`;
        const groups = orderedGroups.map(([name, group]) => {
            const pagesForMenu = group.filter(page => {
                const file = page.file.toLowerCase();
                return file !== String(landingPageFile || '').toLowerCase();
            });
            if (!pagesForMenu.length) return '';
            return `<li class="publish-top-nav-group"><details><summary>${escapeHTML(name)}</summary><ul>` +
                pagesForMenu.map(page => pageTitleLink(page, currentFile)).join('') +
                '</ul></details></li>';
        }).join('');
        return `<nav class="publish-top-nav" aria-label="Primary navigation"><ul class="publish-top-nav-list">${homeLink}${groups}</ul></nav>`;
    }

    function renderTopBar(pages, currentFile, context) {
        const header = context.workspaceHtml
            ? `<header class="publish-header"><div class="margin-document">${context.workspaceHtml}</div></header>`
            : '';
        return `<div class="publish-topbar">${header}${renderTopNav(
            pages,
            currentFile,
            context.landingFile,
            context.landingPageFile,
            context.customOrders,
            context.categoryGroups
        )}</div>`;
    }

    function renderTopNavScript() {
        return `<script>
(function () {
    const setMenuDisplay = (menu, isOpen) => {
        const menuList = menu.querySelector(':scope > ul');
        if (menuList) menuList.style.display = isOpen ? '' : 'none';
    };

    const closeMenus = (except) => {
        document.querySelectorAll('.publish-top-nav details[open]').forEach(menu => {
            if (menu !== except) {
                menu.removeAttribute('open');
                setMenuDisplay(menu, false);
            }
        });
    };

    document.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('.publish-top-nav details')) {
            closeMenus();
        }
    });

    document.querySelectorAll('.publish-top-nav details').forEach(menu => {
        menu.addEventListener('toggle', () => {
            setMenuDisplay(menu, menu.open);
            if (menu.open) closeMenus(menu);
        });
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const openMenus = Array.from(document.querySelectorAll('.publish-top-nav details[open]'));
        openMenus.forEach(menu => {
            menu.removeAttribute('open');
            setMenuDisplay(menu, false);
        });
        openMenus[0]?.querySelector('summary')?.focus();
    });
})();
</script>`;
    }

    function renderToc(headings) {
        if (!headings.length) return '';
        return `<aside class="publish-toc"><h2>Contents</h2><nav aria-label="Table of contents"><ul>` +
            headings.map(heading =>
                `<li class="toc-level-${heading.level}"><a href="#${escapeHTML(heading.id)}">${escapeHTML(heading.text)}</a></li>`
            ).join('') +
            '</ul></nav></aside>';
    }

    function renderSharedNoteContent(note, renderOptions) {
        if (!note) return '';
        renderOptions.__assetNoteId = note.id;
        const rendered = root.MarginRenderer.render(`${note.title}\n${note.content}`, renderOptions);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = rendered;
        if (wrapper.firstElementChild && wrapper.firstElementChild.tagName === 'H1') {
            wrapper.firstElementChild.remove();
        }
        return wrapper.innerHTML;
    }

    function renderSharedNote(note, className, renderOptions) {
        const html = renderSharedNoteContent(note, renderOptions);
        if (!html) return '';
        return `<div class="${className}"><div class="margin-document">${html}</div></div>`;
    }

    function renderPageNavLink(page, direction) {
        const isPrevious = direction === 'previous';
        const arrow = isPrevious ? '&larr;' : '&rarr;';
        const title = escapeHTML(page.note.title);
        const titleMarkup = isPrevious
            ? `<span class="publish-page-nav-arrow" aria-hidden="true">${arrow}</span><span class="publish-page-nav-title-text">${title}</span>`
            : `<span class="publish-page-nav-title-text">${title}</span><span class="publish-page-nav-arrow" aria-hidden="true">${arrow}</span>`;
        return `<a class="${direction}" href="${escapeHTML(page.file)}">` +
            `<span class="publish-page-nav-label">${isPrevious ? 'Previous' : 'Next'}</span>` +
            `<span class="publish-page-nav-title">${titleMarkup}</span>` +
            '</a>';
    }

    function themeCss(theme) {
        const current = theme && theme.darkMode ? 'dark' : 'light';
        const lightPrimary = safeColor((theme && theme.lightPrimary) || '', '#9ca3af');
        const darkPrimary = safeColor((theme && theme.darkPrimary) || '', lightPrimary);
        const lightBackground = safeColor((theme && theme.lightBackground) || '', '#f5f5f5');
        const darkBackground = safeColor((theme && theme.darkBackground) || '', '#1e1e20');
        const lightText = safeColor((theme && theme.lightText) || '', '#1a202c');
        const darkText = safeColor((theme && theme.darkText) || '', '#f7fafc');
        const paletteVariables = (background, text, primary) => `
    --color-background: ${background};
    --color-background2: color-mix(in srgb, ${background} 94%, ${text});
    --color-sidebar: color-mix(in srgb, ${background} 96%, ${text});
    --color-sidebar-border: color-mix(in srgb, ${text} 18%, ${background});
    --color-text: ${text};
    --color-text-secondary: color-mix(in srgb, ${text} 68%, ${background});
    --color-border: color-mix(in srgb, ${text} 18%, ${background});
    --color-border-strong: color-mix(in srgb, ${text} 36%, ${background});
    --color-primary: ${primary};
    --color-primary-hover: color-mix(in srgb, ${primary} 80%, ${text});
    --color-primary-dark: color-mix(in srgb, ${primary} 65%, ${text});
    --color-on-primary: ${contrastColor(primary)};
    --margin-background: ${background};
    --margin-background2: color-mix(in srgb, ${background} 94%, ${text});
    --margin-text: ${text};
    --margin-text-secondary: color-mix(in srgb, ${text} 68%, ${background});
    --margin-border: color-mix(in srgb, ${text} 18%, ${background});
    --margin-primary: ${primary};`;
        const fontSize = /^\d+(?:\.\d+)?%$/.test(String(theme && theme.fontSize || ''))
            ? theme.fontSize
            : '100%';
        const fontStacks = root.FONT_FAMILY_STACKS || {
            system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            inter: '"Inter", system-ui, sans-serif',
            gowunDodum: '"Gowun Dodum", sans-serif',
            segoeUi: '"Segoe UI", system-ui, sans-serif',
            helveticaNeue: '"Helvetica Neue", Arial, sans-serif',
            arial: 'Arial, Helvetica, sans-serif',
            georgia: 'Georgia, "Times New Roman", serif',
            playfairDisplay: '"Playfair Display", Georgia, serif'
        };
        const isMac = String(theme && theme.os || '') === 'mac';
        const bodyFont = fontStacks[String(theme && theme.bodyFont || '')] ||
            fontStacks[isMac ? 'system' : 'inter'];
        const headingFont = fontStacks[String(theme && theme.headingFont || '')] ||
            fontStacks[isMac ? 'system' : 'gowunDodum'];
        const fontVariables = `
    --font-family-base: ${bodyFont};
    --font-family-heading: ${headingFont};`;
        return `
:root {
${paletteVariables(lightBackground, lightText, lightPrimary)}
${fontVariables}
}

:root[data-theme="dark"] {
${paletteVariables(darkBackground, darkText, darkPrimary)}
${fontVariables}
}

:root[data-os="mac"] {
${fontVariables}
}

html {
    font-size: ${fontSize};
    color-scheme: ${current};
}
`;
    }

    function normalizeStyles(options) {
        return {
            commonCss: String(optionValue(options, 'commonCss') || ''),
            rendererCss: String(optionValue(options, 'rendererCss') || ''),
            publishCss: themeCss(options.theme) + PUBLISH_CSS
        };
    }

    function buildDocument(page, pages, context, renderOptions) {
        const rendered = root.MarginRenderer.render(
            `${page.note.title}\n${page.note.content}`,
            renderOptions
        );
        const anchored = renderHeadingAnchors(rendered);
        const hasToc = context.toc && anchored.headings.length > 0;
        const categoryPages = context.categoryPages.get(firstNoteTag(page.note)) || [];
        const index = categoryPages.findIndex(candidate => candidate.file === page.file);
        const previous = context.previousNext && index > 0 ? categoryPages[index - 1] : null;
        const next = context.previousNext && index >= 0 && index < categoryPages.length - 1
            ? categoryPages[index + 1]
            : null;
        const layoutClasses = [
            'publish-layout',
            context.sidebar ? 'has-sidebar' : '',
            context.toc ? 'has-toc' : '',
            context.menuPosition === 'top' ? 'menu-top' : ''
        ].filter(Boolean).join(' ');
        const topBar = context.menuPosition === 'top'
            ? renderTopBar(pages, page.file, context)
            : '';
        const topNavScript = context.menuPosition === 'top'
            ? renderTopNavScript()
            : '';
        const sidebarControls = context.sidebar
            ? renderMobileMenuControls()
            : '';
        const sidebarScript = context.sidebar
            ? renderSidebarScript()
            : '';
        const pageNav = context.previousNext && (previous || next)
            ? `<nav class="publish-page-nav" aria-label="Page navigation">` +
              (previous ? renderPageNavLink(previous, 'previous') : '') +
              (next ? renderPageNavLink(next, 'next') : '') +
              '</nav>'
            : '';
        const main = `<main class="publish-main"><article class="publish-content publish-article"><div class="margin-document">${anchored.html}</div>${pageNav}</article>` +
        `<div class="publish-footer">${context.footerHtml}</div></main>`;
        return {
            html: `<!doctype html><html lang="en"${context.os ? ' data-os="' + context.os + '"' : ''}${context.darkMode ? ' data-theme="dark"' : ''}><head>` +
                '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
                `<title>${escapeHTML(page.note.title)}</title>` +
                '<link rel="stylesheet" href="common.css"><link rel="stylesheet" href="margin-renderer.css">' +
                '<link rel="stylesheet" href="publish.css"></head><body>' +
                `<div class="${layoutClasses}">` +
                topBar +
                sidebarControls +
                (context.sidebar ? renderSidebar(pages, page.file, context.workspaceTitle, context.landingFile, context.landingPageFile, context.workspaceHtml, context.customOrders, context.categoryGroups) : '') +
                main +
                (hasToc ? renderToc(anchored.headings) : '') +
                `</div>${topNavScript}${sidebarScript}</body></html>`,
            headings: anchored.headings
        };
    }

    function buildPublishBundle(rawNotes, rawOptions) {
        const options = Object.assign({}, DEFAULT_OPTIONS, rawOptions || {});
        options.theme = Object.assign({}, DEFAULT_OPTIONS.theme, (rawOptions && rawOptions.theme) || {});
        const notes = (rawNotes || []).map(normalizeNote).filter(note => note.title);
        const pages = buildPageNames(notes.filter(note =>
            !['header', 'footer'].includes(note.title.toLowerCase())
        ));
        const landing = resolveLandingPage(pages, options.landingTitle);
        if (!landing.page) {
            const error = new Error('Choose a landing page before publishing.');
            error.code = 'landing-selection-required';
            error.availableTitles = pages.map(page => page.note.title);
            throw error;
        }
        avoidLandingAliasCollision(pages, landing.page);

        const assetMap = new Map();
        const assets = [];
        const noteById = new Map(notes.map(note => [note.id, note]));
        const renderOptions = {
            targetBlank: true,
            resolveAsset(source) {
                const currentPage = renderOptions.__currentPage;
                const assetNoteId = renderOptions.__assetNoteId || currentPage.note.id;
                const assetOwner = pages.find(page => page.note.id === assetNoteId);
                const assetOwnerNote = noteById.get(assetNoteId);
                const assetStem = assetOwner
                    ? assetOwner.stem
                    : sanitizeFileStem(assetOwnerNote ? assetOwnerNote.title : 'shared');
                const key = `${assetNoteId}\u0000${source}`;
                if (!assetMap.has(key)) {
                    const target = `assets/${assetStem}/${sanitizeAssetName(source)}`;
                    let uniqueTarget = target;
                    let suffix = 2;
                    while (assets.some(asset => asset.target.toLowerCase() === uniqueTarget.toLowerCase())) {
                        const dot = target.lastIndexOf('.');
                        uniqueTarget = dot > 0
                            ? `${target.slice(0, dot)}-${suffix}${target.slice(dot)}`
                            : `${target}-${suffix}`;
                        suffix += 1;
                    }
                    assetMap.set(key, uniqueTarget);
                    assets.push({
                        noteId: assetNoteId,
                        source,
                        target: uniqueTarget
                    });
                }
                return assetMap.get(key);
            },
            resolveNoteLink(docId) {
                const entry = (options.noteIndex || []).find(item =>
                    String(noteValue(item, 'docId', '') || '') === String(docId)
                );
                if (!entry) return null;
                const linkedPage = pages.find(candidate =>
                    candidate.note.title.localeCompare(String(noteValue(entry, 'title', '') || ''), undefined, { sensitivity: 'accent' }) === 0
                );
                return linkedPage
                    ? { title: linkedPage.note.title, href: linkedPage.file }
                    : { title: String(noteValue(entry, 'title', '') || docId) };
            }
        };

        const header = notes.find(note => note.title.toLowerCase() === 'header');
        const footer = notes.find(note => note.title.toLowerCase() === 'footer');
        const menuPosition = resolveMenuPosition(rawOptions);
        const context = {
            menuPosition,
            sidebar: menuPosition === 'left',
            toc: options.toc !== false,
            previousNext: options.previousNext !== false,
            darkMode: !!options.theme.darkMode,
            os: options.theme.os === 'mac' ? 'mac' : '',
            workspaceTitle: String(options.workspaceTitle || ''),
            landingFile: 'index.html',
            landingPageFile: landing.page.file,
            workspaceHtml: '',
            footerHtml: '',
            customOrders: parseCustomOrders(
                options.customOrders !== undefined
                    ? options.customOrders
                    : options.notesCustomOrder
            ),
            tagOrder: parseCustomOrder(options.tagsCustomOrder)
        };
        context.categoryGroups = buildCategoryGroups(pages, context.customOrders, context.tagOrder);
        context.categoryPages = new Map(context.categoryGroups);

        const files = [];
        const styles = normalizeStyles(options);
        files.push({ path: 'common.css', content: styles.commonCss });
        files.push({ path: 'margin-renderer.css', content: styles.rendererCss });
        files.push({ path: 'publish.css', content: styles.publishCss });

        pages.forEach(page => {
            renderOptions.__currentPage = page;
            renderOptions.__assetNoteId = page.note.id;
            context.workspaceHtml = renderSharedNoteContent(header, renderOptions);
            context.footerHtml = renderSharedNote(footer, 'publish-shared-note', renderOptions);
            renderOptions.__assetNoteId = page.note.id;
            const documentResult = buildDocument(page, pages, context, renderOptions);
            files.push({ path: page.file, content: documentResult.html });
        });

        if (landing.page.file !== 'index.html') {
            const landingFile = files.find(file => file.path === landing.page.file);
            files.push({ path: 'index.html', content: landingFile.content });
        }

        return {
            files,
            assets,
            landingTitle: landing.page.note.title,
            pageCount: pages.length,
            automaticLanding: landing.automatic
        };
    }

    function resolveLandingTitle(rawNotes, rememberedTitle) {
        const notes = (rawNotes || []).map(normalizeNote).filter(note =>
            note.title && !['header', 'footer'].includes(note.title.toLowerCase())
        );
        const pages = buildPageNames(notes);
        const landing = resolveLandingPage(pages, rememberedTitle);
        return landing.page ? landing.page.note.title : '';
    }

    root.PublishBuilder = {
        buildPublishBundle,
        buildPageNames,
        resolveLandingTitle,
        sanitizeFileStem,
        renderHeadingAnchors,
        publishCss: PUBLISH_CSS
    };
}(typeof window !== 'undefined' ? window : globalThis));
