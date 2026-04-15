import React from 'react';
import { useParams } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { useGradient } from '../../../hooks/useGradient';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import './DomainOverview.scss';

function formatTypeLabel(type) {
    if (!type) return '';
    return String(type).replace(/_/g, ' ');
}

function DomainOverview() {
    const { domainId } = useParams();
    const { AdminGrad } = useGradient();
    const domainData = useFetch(domainId ? `/api/domain/${domainId}` : null);
    const stakeholderRolesData = useFetch(domainId ? `/api/stakeholder-roles/domain/${domainId}` : null);

    const domain = domainData.data?.data;
    const stakeholderRoles = stakeholderRolesData.data?.data || [];

    if (domainData.loading) {
        return (
            <div className="domain-overview dash">
                <div className="domain-overview-loading">
                    <div className="domain-overview-loading-inner">
                        <Icon icon="mdi:loading" className="domain-overview__spin" />
                        <p>Loading domain overview…</p>
                    </div>
                </div>
            </div>
        );
    }

    if (domainData.error || !domain) {
        return (
            <div className="domain-overview dash">
                <div className="domain-overview__content">
                    <div className="domain-overview-error">
                        <Icon icon="mdi:alert-circle" />
                        <div>
                            <h3>Domain not found</h3>
                            <p>
                                The requested domain could not be loaded or you don&apos;t have permission to access
                                it.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const approvalEnabled = Boolean(domain.domainSettings?.approvalWorkflow?.enabled);
    const escalationH = domain.domainSettings?.approvalWorkflow?.escalationTimeout || 72;
    const maxCap = domain.domainSettings?.maxCapacity;
    const maxAdvance = domain.domainSettings?.bookingRules?.maxAdvanceBooking ?? 30;
    const allowRecur = domain.domainSettings?.bookingRules?.allowRecurring;
    const minDur = domain.domainSettings?.bookingRules?.minDuration ?? 0.5;
    const govKind = domain.spaceGovernance?.governingScope?.kind;
    const concernKind = domain.spaceGovernance?.concernScope?.kind;
    const scopeMode = domain.spaceGovernance?.scopeMode;
    const descriptionLead = domain.description?.trim() || '';

    const stats = [
        {
            key: 'roles',
            icon: 'mdi:account-group',
            value: stakeholderRoles.length,
            label: 'Stakeholder roles'
        },
        {
            key: 'events',
            icon: 'mdi:calendar-month-outline',
            value: '—',
            label: 'Events this month'
        },
        {
            key: 'approval',
            icon: 'mdi:shield-check',
            value: approvalEnabled ? 'On' : 'Off',
            label: 'Approval workflow'
        },
        {
            key: 'escalation',
            icon: 'mdi:clock-alert-outline',
            value: `${escalationH}h`,
            label: 'Escalation timeout'
        }
    ];

    return (
        <div className="domain-overview dash">
            <header className="domain-overview__header header">
                <h1>{domain.name}</h1>
                <p>Domain dashboard</p>
                <div className="domain-overview__header-badges" aria-label="Domain summary">
                    <span className="domain-overview__badge">{formatTypeLabel(domain.type)}</span>
                    {scopeMode && (
                        <span className="domain-overview__badge domain-overview__badge--muted">
                            Scope: {String(scopeMode)}
                        </span>
                    )}
                    <span
                        className={`domain-overview__badge ${domain.isActive ? 'domain-overview__badge--live' : 'domain-overview__badge--paused'}`}
                    >
                        {domain.isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
                <img src={AdminGrad} alt="" />
            </header>

            <div className="domain-overview__content">
                <p
                    className={`domain-overview__lead${descriptionLead ? '' : ' domain-overview__lead--muted'}`}
                >
                    {descriptionLead || 'No description has been added for this domain yet.'}
                </p>
                <section className="domain-overview__banner">
                    <div className="domain-overview__banner-header">
                        <Icon icon="mdi:view-dashboard-outline" />
                        <div>
                            <h2>At a glance</h2>
                            <p>
                                Quick read on stakeholders, approvals, and booking defaults for this domain. Use{' '}
                                <strong>Domain settings</strong> to change values.
                                {(govKind || concernKind) && (
                                    <>
                                        {' '}
                                        Space governance: <strong>{govKind || '—'}</strong> governing,{' '}
                                        <strong>{concernKind || '—'}</strong> concern.
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                </section>

                <ul className="domain-overview__stats">
                    {stats.map((s, index) => (
                        <li
                            key={s.key}
                            className="domain-overview__stat-card"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="domain-overview__stat-accent" aria-hidden />
                            <div className="domain-overview__stat-body">
                                <div className="domain-overview__stat-icon">
                                    <Icon icon={s.icon} />
                                </div>
                                <div>
                                    <p className="domain-overview__stat-value">{s.value}</p>
                                    <p className="domain-overview__stat-label">{s.label}</p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>

                <section className="domain-overview__panel">
                    <div className="domain-overview__panel-head">
                        <h2 className="domain-overview__panel-title">Domain configuration</h2>
                        <p className="domain-overview__panel-sub">
                            Capacity, booking windows, and recurrence rules applied to events associated with this
                            domain.
                        </p>
                    </div>
                    <div className="domain-overview__settings-grid">
                        <div className="domain-overview__setting-tile">
                            <Icon icon="mdi:account-group-outline" />
                            <div className="domain-overview__setting-text">
                                <span className="domain-overview__setting-label">Max capacity</span>
                                <span className="domain-overview__setting-value">
                                    {maxCap != null && maxCap !== '' ? `${maxCap} people` : 'No limit set'}
                                </span>
                            </div>
                        </div>
                        <div className="domain-overview__setting-tile">
                            <Icon icon="mdi:calendar-clock" />
                            <div className="domain-overview__setting-text">
                                <span className="domain-overview__setting-label">Max advance booking</span>
                                <span className="domain-overview__setting-value">{maxAdvance} days</span>
                            </div>
                        </div>
                        <div className="domain-overview__setting-tile">
                            <Icon icon="mdi:repeat" />
                            <div className="domain-overview__setting-text">
                                <span className="domain-overview__setting-label">Recurring events</span>
                                <span className="domain-overview__setting-value">
                                    {allowRecur ? 'Allowed' : 'Not allowed'}
                                </span>
                            </div>
                        </div>
                        <div className="domain-overview__setting-tile">
                            <Icon icon="mdi:timer-sand" />
                            <div className="domain-overview__setting-text">
                                <span className="domain-overview__setting-label">Min duration</span>
                                <span className="domain-overview__setting-value">{minDur} hours</span>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default DomainOverview;
