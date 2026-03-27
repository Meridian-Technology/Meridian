import React, { useMemo, useState } from 'react';
import { authenticatedRequest, useFetch } from '../../../../hooks/useFetch';
import './ParitySummary.scss';

export default function ParitySummary() {
    const response = useFetch('/admin/cms-parity/summary');
    const summary = useMemo(() => response?.data?.data || {}, [response?.data]);
    const [exportState, setExportState] = useState('');

    const exportSummary = async (format) => {
        const exportResponse = await authenticatedRequest(`/admin/cms-parity/export?format=${format}`);
        if (exportResponse.error) {
            setExportState(exportResponse.error);
            return;
        }
        if (format === 'json') {
            setExportState('JSON export fetched successfully.');
            return;
        }
        setExportState('CSV export generated.');
    };

    const exceptionEntries = Object.entries(summary?.exceptions || {});
    const summaryEntries = Object.entries(summary).filter(([key]) => key !== 'exceptions');

    if (response.loading) {
        return <div className="atlas-parity-summary"><p className="atlas-parity-summary__state">Loading parity summary...</p></div>;
    }

    return (
        <section className="atlas-parity-summary">
            <header className="atlas-parity-summary__header">
                <h2>CMS Parity Summary</h2>
                <p>Operational counts across governance, budgets, and inventory modules.</p>
                <div className="atlas-parity-summary__actions">
                    <button type="button" onClick={() => exportSummary('json')}>Export JSON</button>
                    <button type="button" onClick={() => exportSummary('csv')}>Export CSV</button>
                </div>
            </header>
            <div className="atlas-parity-summary__grid">
                {summaryEntries.map(([key, value]) => (
                    <article className="atlas-parity-summary__card" key={key}>
                        <h3>{key}</h3>
                        <strong>{String(value)}</strong>
                    </article>
                ))}
            </div>
            {exceptionEntries.length > 0 && (
                <div className="atlas-parity-summary__exceptions">
                    <h3>Exceptions</h3>
                    <ul>
                        {exceptionEntries.map(([key, value]) => (
                            <li key={key}>
                                <span>{key}</span>
                                <strong>{String(value)}</strong>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {exportState && <p className="atlas-parity-summary__state">{exportState}</p>}
        </section>
    );
}
