import React, { useMemo } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import './ParitySummary.scss';

export default function ParitySummary() {
    const response = useFetch('/admin/cms-parity/summary');
    const summary = useMemo(() => response?.data?.data || {}, [response?.data]);

    if (response.loading) {
        return <div className="atlas-parity-summary"><p className="atlas-parity-summary__state">Loading parity summary...</p></div>;
    }

    return (
        <section className="atlas-parity-summary">
            <header className="atlas-parity-summary__header">
                <h2>CMS Parity Summary</h2>
                <p>Operational counts across governance, budgets, and inventory modules.</p>
            </header>
            <div className="atlas-parity-summary__grid">
                {Object.entries(summary).map(([key, value]) => (
                    <article className="atlas-parity-summary__card" key={key}>
                        <h3>{key}</h3>
                        <strong>{String(value)}</strong>
                    </article>
                ))}
            </div>
        </section>
    );
}
