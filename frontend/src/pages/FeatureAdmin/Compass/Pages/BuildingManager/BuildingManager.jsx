import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../../../../RootDash/RoomManager/RoomManager.scss';
import apiRequest from '../../../../../utils/postRequest';
import deleteRequest from '../../../../../utils/deleteRequest';
import Popup from '../../../../../components/Popup/Popup';
import { useFetch } from '../../../../../hooks/useFetch';
import { useGradient } from '../../../../../hooks/useGradient';

function formatMinutes(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return '—';
  const h = Math.floor(n / 60);
  const min = n % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function BuildingManager() {
  const [buildings, setBuildings] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0, currentPage: 1 });
  const [isSearching, setIsSearching] = useState(false);
  const { AdminGrad } = useGradient();

  const [form, setForm] = useState({ name: '', image: '', timeStart: '0', timeEnd: '1440' });
  const [formErrors, setFormErrors] = useState({});
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (search !== debouncedSearch) setIsSearching(true);
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch !== search) return;
    setPage(1);
  }, [debouncedSearch, search]);

  const queryParams = useMemo(() => ({ search: debouncedSearch, page, limit }), [debouncedSearch, page, limit]);
  const { data: listResp, loading: listLoading, error: listError, refetch } = useFetch('/admin/buildings', {
    method: 'GET',
    params: queryParams,
  });

  useEffect(() => {
    if (listResp?.success) {
      setBuildings(listResp.buildings || []);
      setPagination(listResp.pagination || { total: 0, totalPages: 0, currentPage: 1 });
    }
    if (listError) setError(listError);
  }, [listResp, listError]);

  const highlightMatch = (text, term) => {
    if (!term || !text) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = String(text).split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="search-highlight">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const validateForm = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Building name is required';
    const ts = Number(form.timeStart);
    const te = Number(form.timeEnd);
    if (!Number.isFinite(ts) || !Number.isFinite(te)) {
      errors.time = 'Start and end must be numbers (minutes from midnight)';
    } else if (te <= ts) errors.time = 'End must be greater than start';
    if (form.image && !/^https?:\/\/.+/i.test(form.image) && !form.image.startsWith('/')) {
      errors.image = 'Use a full URL or a path starting with /';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: '' }));
    if (field.startsWith('time') && formErrors.time) setFormErrors((prev) => ({ ...prev, time: '' }));
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        image: form.image.trim() || '/classrooms/default.png',
        time: { start: Number(form.timeStart), end: Number(form.timeEnd) },
      };
      const resp = await apiRequest('/admin/buildings', body, { method: 'POST' });
      if (!resp.success) throw new Error(resp.message || 'Failed to create');
      setForm({ name: '', image: '', timeStart: '0', timeEnd: '1440' });
      setFormErrors({});
      refetch();
      setShowModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitUpdate = async (e) => {
    e.preventDefault();
    if (!editing || !validateForm()) return;
    setIsSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        image: form.image.trim() || undefined,
        time: { start: Number(form.timeStart), end: Number(form.timeEnd) },
      };
      const resp = await apiRequest(`/admin/buildings/${editing._id}`, body, { method: 'PUT' });
      if (!resp.success) throw new Error(resp.message || 'Failed to update');
      setEditing(null);
      setForm({ name: '', image: '', timeStart: '0', timeEnd: '1440' });
      setFormErrors({});
      refetch();
      setShowModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onEdit = useCallback((b) => {
    setEditing(b);
    setSelectedBuilding(b);
    setForm({
      name: b.name || '',
      image: b.image || '',
      timeStart: String(b.time?.start ?? 0),
      timeEnd: String(b.time?.end ?? 1440),
    });
    setFormErrors({});
    setModalMode('edit');
    setShowModal(true);
  }, []);

  const onDelete = useCallback((b) => {
    setSelectedBuilding(b);
    setModalMode('delete');
    setShowModal(true);
  }, []);

  const performDelete = async () => {
    if (!selectedBuilding) return;
    try {
      const resp = await deleteRequest(`/admin/buildings/${selectedBuilding._id}`);
      if (!resp.success) throw new Error(resp.message || 'Failed to delete');
      setShowModal(false);
      setSelectedBuilding(null);
      refetch();
    } catch (err) {
      setError(err.message);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setSelectedBuilding(null);
    setForm({ name: '', image: '', timeStart: '0', timeEnd: '1440' });
    setFormErrors({});
    setModalMode('create');
    setShowModal(true);
  };

  return (
    <div className="room-manager building-manager dash">
      <header className="header">
        <h1>Building manager</h1>
        <p>Create and edit campus buildings. Classrooms link to a building; delete is blocked while any room still references it.</p>
        <img src={AdminGrad} alt="" />
      </header>

      <div className="content">
        <div className="toolbar">
          <div className="search-container">
            <input
              className="input"
              placeholder="Search buildings by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {isSearching ? <div className="search-spinner">⟳</div> : null}
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Add building
          </button>
        </div>

        <div className="list card">
          {listLoading && !buildings.length ? <div className="loading">Loading…</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {debouncedSearch && !listLoading ? (
            <div className="search-results-info">
              Found {pagination.total || 0} building
              {(pagination.total || 0) !== 1 ? 's' : ''} matching &quot;{debouncedSearch}&quot;
            </div>
          ) : null}
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Image</th>
                <th>Hours (min)</th>
                <th>Rating</th>
                <th style={{ width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {buildings.length === 0 && !listLoading && !isSearching ? (
                <tr>
                  <td colSpan={5} className="empty">
                    No buildings yet. Add one or run the classroom → building migration from Administrator → General.
                  </td>
                </tr>
              ) : null}
              {buildings.map((b) => (
                <tr key={b._id}>
                  <td className="name-cell">
                    <div className="name">{highlightMatch(b.name, debouncedSearch)}</div>
                    <div className="subtext">{b._id}</div>
                  </td>
                  <td>
                    <img src={b.image} alt="" className="thumb" />
                  </td>
                  <td>
                    <span className="subtext">
                      {formatMinutes(b.time?.start)}–{formatMinutes(b.time?.end)} ({b.time?.start ?? 0}–{b.time?.end ?? 0}{' '}
                      min)
                    </span>
                  </td>
                  <td>
                    {b.average_rating != null && b.number_of_ratings ? (
                      <span>
                        {Number(b.average_rating).toFixed(1)} ({b.number_of_ratings})
                      </span>
                    ) : (
                      <span className="subtext">—</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-sm" onClick={() => onEdit(b)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(b)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </button>
            <span>
              {page} / {pagination.totalPages || 1}
            </span>
            <button
              type="button"
              className="btn"
              disabled={page >= (pagination.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <Popup isOpen={showModal} onClose={() => setShowModal(false)}>
        <div className="modal-content">
          {modalMode === 'delete' ? (
            <div className="delete-modal">
              <h3>Delete building</h3>
              <p>
                Are you sure you want to delete <b>{selectedBuilding?.name}</b>? This cannot be undone if no classrooms
                use it.
              </p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-danger" onClick={performDelete}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="form-modal">
              <h3>{modalMode === 'edit' ? 'Edit building' : 'Add building'}</h3>
              <form onSubmit={modalMode === 'edit' ? submitUpdate : submitCreate}>
                <label>
                  <span className="label">Name *</span>
                  <input
                    className={`input ${formErrors.name ? 'error' : ''}`}
                    placeholder="e.g. Darrin Communications Center"
                    value={form.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    disabled={isSubmitting}
                  />
                  {formErrors.name ? <div className="input-error">{formErrors.name}</div> : null}
                </label>
                <label>
                  <span className="label">Image URL or path</span>
                  <input
                    className={`input ${formErrors.image ? 'error' : ''}`}
                    placeholder="https://… or /classrooms/default.png"
                    value={form.image}
                    onChange={(e) => handleFormChange('image', e.target.value)}
                    disabled={isSubmitting}
                  />
                  {formErrors.image ? <div className="input-error">{formErrors.image}</div> : null}
                  <div className="input-help">Defaults to /classrooms/default.png if left empty when creating.</div>
                </label>
                <label>
                  <span className="label">Open / close (minutes from midnight)</span>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={1440}
                      value={form.timeStart}
                      onChange={(e) => handleFormChange('timeStart', e.target.value)}
                      disabled={isSubmitting}
                      style={{ minWidth: 100 }}
                    />
                    <span>to</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={1440}
                      value={form.timeEnd}
                      onChange={(e) => handleFormChange('timeEnd', e.target.value)}
                      disabled={isSubmitting}
                      style={{ minWidth: 100 }}
                    />
                  </div>
                  {formErrors.time ? <div className="input-error">{formErrors.time}</div> : null}
                  <div className="input-help">Example: 0–1440 = full day. Shown as HH:MM in the table.</div>
                </label>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => setShowModal(false)} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving…' : modalMode === 'edit' ? 'Save' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </Popup>
    </div>
  );
}

export default BuildingManager;
