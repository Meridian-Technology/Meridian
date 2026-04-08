import axios from 'axios';

/**
 * Download a budget export (CSV/JSON) with session cookies — avoids SPA 404 on raw links.
 */
export async function downloadBudgetExport(url, filename) {
    const res = await axios.get(url, {
        withCredentials: true,
        responseType: 'blob'
    });
    const type = res.headers['content-type'] || 'application/octet-stream';
    const blob = new Blob([res.data], { type });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename || 'budget-export';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
}
