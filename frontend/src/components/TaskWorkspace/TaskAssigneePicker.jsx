import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { memberUserInitials, userDisplayName } from './taskWorkspaceUtils';
import './TaskWorkspace.scss';

function memberToUser(member) {
    return member?.user_id || null;
}

export default function TaskAssigneePicker({
    members = [],
    value,
    onChange,
    disabled = false,
    compact = false,
    className = ''
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef(null);

    const selectedUser = useMemo(() => {
        if (!value) return null;
        const id = String(value);
        for (const m of members) {
            const u = memberToUser(m);
            if (u && String(u._id) === id) return u;
        }
        return null;
    }, [members, value]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return members;
        return members.filter((m) => {
            const u = memberToUser(m);
            if (!u) return false;
            const name = (u.name || '').toLowerCase();
            const username = (u.username || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            return name.includes(q) || username.includes(q) || email.includes(q);
        });
    }, [members, query]);

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const handlePick = useCallback(
        (userId) => {
            onChange?.(userId || null);
            setOpen(false);
            setQuery('');
        },
        [onChange]
    );

    const stop = (e) => {
        e.stopPropagation();
    };

    return (
        <div
            ref={rootRef}
            className={`task-workspace-assignee ${compact ? 'task-workspace-assignee--compact' : ''} ${open ? 'task-workspace-assignee--dropdown-open' : ''} ${className}`.trim()}
            onClick={stop}
            onKeyDown={stop}
        >
            <button
                type="button"
                className="task-workspace-assignee__trigger"
                disabled={disabled}
                draggable={false}
                onClick={() => !disabled && setOpen((o) => !o)}
            >
                {selectedUser?.picture ? (
                    <img
                        src={selectedUser.picture}
                        alt=""
                        className="task-workspace-assignee__avatar"
                    />
                ) : (
                    <span className="task-workspace-assignee__avatar-fallback">
                        {selectedUser ? memberUserInitials(selectedUser) : <Icon icon="mdi:account-outline" />}
                    </span>
                )}
                <span className="task-workspace-assignee__label">
                    {selectedUser ? userDisplayName(selectedUser) : 'Assign'}
                </span>
                <Icon icon="mdi:chevron-down" className="task-workspace-assignee__chevron" />
            </button>
            {open && (
                <div className="task-workspace-assignee__dropdown">
                    <input
                        className="task-workspace-assignee__search"
                        placeholder="Search members…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    <ul className="task-workspace-assignee__list">
                        <li>
                            <button
                                type="button"
                                className="task-workspace-assignee__option task-workspace-assignee__option--muted"
                                onClick={() => handlePick(null)}
                            >
                                Unassigned
                            </button>
                        </li>
                        {filtered.map((m) => {
                            const u = memberToUser(m);
                            if (!u?._id) return null;
                            return (
                                <li key={String(u._id)}>
                                    <button
                                        type="button"
                                        className="task-workspace-assignee__option"
                                        onClick={() => handlePick(String(u._id))}
                                    >
                                        {u.picture ? (
                                            <img src={u.picture} alt="" className="task-workspace-assignee__avatar" />
                                        ) : (
                                            <span className="task-workspace-assignee__avatar-fallback">
                                                {memberUserInitials(u)}
                                            </span>
                                        )}
                                        <span className="task-workspace-assignee__label">{userDisplayName(u)}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
