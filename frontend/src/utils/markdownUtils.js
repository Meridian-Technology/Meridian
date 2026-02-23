import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true });

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li'];

function sanitizeHtml(html) {
    return DOMPurify.sanitize(String(html || ''), { ALLOWED_TAGS });
}

/** True if content appears to be HTML (from WYSIWYG editor) */
function isHtml(content) {
    return /<[a-z][\s\S]*>/i.test(content);
}

/**
 * Parse markdown or HTML to sanitized HTML for display.
 * Handles both legacy markdown and HTML from WYSIWYG editor.
 */
export function parseMarkdownDescription(text) {
    if (!text || typeof text !== 'string') return '';
    if (isHtml(text)) return sanitizeHtml(text);
    try {
        const html = marked.parse(text);
        return sanitizeHtml(html || '');
    } catch {
        return sanitizeHtml(text);
    }
}

/**
 * Strip HTML tags and return plain text.
 */
function htmlToPlainText(html) {
    if (!html || typeof html !== 'string') return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .trim();
}

/**
 * Truncate HTML/rich text to approximately N lines of plain text.
 * Use for previews where -webkit-line-clamp fails on nested HTML.
 * @param {string} html - HTML string to truncate
 * @param {number} maxLines - Max lines to show (default 3)
 * @param {number} charsPerLine - Approximate chars per line (default 90)
 * @returns {string} Truncated plain text with ellipsis if needed
 */
export function truncateHtmlToLines(html, maxLines = 3, charsPerLine = 90) {
    const plain = htmlToPlainText(html);
    const maxChars = maxLines * charsPerLine;
    if (plain.length <= maxChars) return plain;
    return plain.slice(0, maxChars).trim() + '…';
}

/**
 * Convert stored value (markdown or HTML) to HTML for the WYSIWYG editor.
 * Returns at least <p><br></p> so contenteditable has a valid structure.
 */
export function valueToEditorHtml(value) {
    if (!value || typeof value !== 'string') return '<p><br></p>';
    if (isHtml(value)) {
        const sanitized = sanitizeHtml(value);
        return sanitized || '<p><br></p>';
    }
    try {
        const html = marked.parse(value);
        return sanitizeHtml(html || '') || '<p><br></p>';
    } catch {
        return `<p>${DOMPurify.sanitize(value)}</p>`;
    }
}
