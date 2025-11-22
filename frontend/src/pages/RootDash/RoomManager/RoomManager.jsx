import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './RoomManager.scss';
import apiRequest from '../../../utils/postRequest';
import deleteRequest from '../../../utils/deleteRequest';
import Popup from '../../../components/Popup/Popup';
import { useFetch } from '../../../hooks/useFetch';
import { useGradient } from '../../../hooks/useGradient';

function RoomManager(){
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0, currentPage: 1 });
  const [isSearching, setIsSearching] = useState(false);
  const { AdminGrad } = useGradient();


  const [form, setForm] = useState({ name: '', image: '', attributes: '' });
  const [formErrors, setFormErrors] = useState({});
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit' | 'delete'
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounce search input
  useEffect(() => {
    if (search !== debouncedSearch) {
      setIsSearching(true);
    }
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(search);
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [search, debouncedSearch]);

  // Reset page when search changes
  useEffect(() => {
    if (debouncedSearch !== search) return; // Don't reset page while debouncing
    setPage(1);
  }, [debouncedSearch, search]);

  const queryParams = useMemo(() => ({ search: debouncedSearch, page, limit }), [debouncedSearch, page, limit]);
  const { data: roomsResp, loading: roomsLoading, error: roomsError, refetch } = useFetch(`/admin/rooms`, {
    method: 'GET',
    params: queryParams
  });

  useEffect(()=>{
    if(roomsResp?.success){
      setRooms(roomsResp.rooms || []);
      setPagination(roomsResp.pagination || { total: 0, totalPages: 0, currentPage: 1 });
    }
    if(roomsError){ setError(roomsError); }
  }, [roomsResp, roomsError, roomsLoading]);

  // Helper function to highlight search matches
  const highlightMatch = (text, searchTerm) => {
    if (!searchTerm || !text) return text;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) => 
      regex.test(part) ? <mark key={index} className="search-highlight">{part}</mark> : part
    );
  };

  // Form validation
  const validateForm = () => {
    const errors = {};
    
    if (!form.name.trim()) {
      errors.name = 'Room name is required';
    } else if (form.name.trim().length < 2) {
      errors.name = 'Room name must be at least 2 characters';
    }
    
    if (form.image && !form.image.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i)) {
      errors.image = 'Please enter a valid image URL (jpg, png, gif, webp)';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form input changes with real-time validation
  const handleFormChange = (field, value) => {
    setForm({ ...form, [field]: value });
    
    // Clear error for this field when user starts typing
    if (formErrors[field]) {
      setFormErrors({ ...formErrors, [field]: '' });
    }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    try{
      const body = {
        name: form.name.trim(),
        image: form.image || '/classrooms/default.png',
        attributes: form.attributes ? form.attributes.split(',').map(s => s.trim()).filter(Boolean) : []
      };
      const resp = await apiRequest('/admin/rooms', body, { method: 'POST' });
      if(!resp.success) throw new Error(resp.message || 'Failed to create');
      setForm({ name: '', image: '', attributes: '' });
      setFormErrors({});
      refetch();
      setShowModal(false);
    } catch(err){
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitUpdate = async (e) => {
    e.preventDefault();
    if(!editing || !validateForm()) return;
    
    setIsSubmitting(true);
    try{
      const body = {
        name: form.name.trim(),
        image: form.image,
        attributes: form.attributes ? form.attributes.split(',').map(s => s.trim()).filter(Boolean) : undefined
      };
      const resp = await apiRequest(`/admin/rooms/${editing._id}`, body, { method: 'PUT' });
      if(!resp.success) throw new Error(resp.message || 'Failed to update');
      setEditing(null);
      setForm({ name: '', image: '', attributes: '' });
      setFormErrors({});
      refetch();
      setShowModal(false);
    } catch(err){
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onEdit = (room) => {
    setEditing(room);
    setSelectedRoom(room);
    setForm({
      name: room.name,
      image: room.image || '',
      attributes: (room.attributes || []).join(', ')
    });
    setFormErrors({});
    setModalMode('edit');
    setShowModal(true);
  };

  const onDelete = (room) => {
    setSelectedRoom(room);
    setModalMode('delete');
    setShowModal(true);
  };

  const performDelete = async () => {
    if(!selectedRoom) return;
    try{
      const resp = await deleteRequest(`/admin/rooms/${selectedRoom._id}`);
      if(!resp.success) throw new Error(resp.message || 'Failed to delete');
      setShowModal(false);
      setSelectedRoom(null);
      refetch();
    } catch(err){
      setError(err.message);
    }
  };

  return (
    <div className="room-manager dash">
      <header className="header">
          <h1>Room Manager</h1>
          <p>Manage campus rooms for events and study spaces.</p>
          <img src={AdminGrad} alt="" />
      </header>

      <div className="content">
      <div className="toolbar">
          <div className="search-container">
            <input 
              className="input" 
              placeholder="Search rooms by name or attributes (e.g., 'projector', 'wifi')" 
              value={search} 
              onChange={e => setSearch(e.target.value)}
            />
            {isSearching && <div className="search-spinner">⟳</div>}
          </div>
          <button
            className="btn btn-primary"
            onClick={()=>{ setEditing(null); setSelectedRoom(null); setForm({ name:'', image:'', attributes:''}); setFormErrors({}); setModalMode('create'); setShowModal(true); }}
          >
            Create Room
          </button>
        </div>
        <div className="list card">
          {(roomsLoading && !rooms.length) ? <div className="loading">Loading…</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {debouncedSearch && !roomsLoading && (
            <div className="search-results-info">
              Found {pagination.total || 0} room{(pagination.total || 0) !== 1 ? 's' : ''} matching "{debouncedSearch}"
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Image</th>
                <th>Attributes</th>
                <th>Main Search</th>
                <th style={{width: 160}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.length === 0 && !roomsLoading && !isSearching ? (
                <tr>
                  <td colSpan={5} className="empty">No rooms found.</td>
                </tr>
              ) : null}
              {rooms.map(room => (
                <tr key={room._id}>
                  <td className="name-cell">
                    <div className="name">{highlightMatch(room.name, debouncedSearch)}</div>
                    <div className="subtext">{room._id}</div>
                  </td>
                  <td><img src={room.image} alt="" className="thumb"/></td>
                  <td>
                    <div className="chips">
                      {(room.attributes || []).map(attr => (
                        <span className="chip" key={attr}>
                          {highlightMatch(attr, debouncedSearch)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${room.mainSearch ? 'ok' : 'muted'}`}>{room.mainSearch ? 'Yes' : 'No'}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={()=>onEdit(room)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={()=>onDelete(room)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Prev</button>
            <span>{page} / {pagination.totalPages || 1}</span>
            <button className="btn" disabled={page >= (pagination.totalPages||1)} onClick={()=>setPage(p=>p+1)}>Next</button>
          </div>
        </div>

        {/* Actions handled in Popup */}
      </div>

      <Popup isOpen={showModal} onClose={()=> setShowModal(false)}>
        <div className="modal-content">
          {modalMode === 'delete' ? (
            <div className="delete-modal">
              <h3>Delete Room</h3>
              <p>Are you sure you want to delete <b>{selectedRoom?.name}</b>? This action cannot be undone.</p>
              <div className="actions">
                <button className="btn" onClick={()=>setShowModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={performDelete}>Delete</button>
              </div>
            </div>
          ) : (
            <div className="form-modal">
              <h3>{modalMode === 'edit' ? 'Edit Room' : 'Create New Room'}</h3>
              <form onSubmit={modalMode === 'edit' ? submitUpdate : submitCreate}>
                <label>
                  <span className="label">Room Name *</span>
                  <input 
                    className={`input ${formErrors.name ? 'error' : ''}`}
                    placeholder="Enter room name (e.g., Library Study Room A)"
                    value={form.name} 
                    onChange={e => handleFormChange('name', e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                  {formErrors.name && <div className="input-error">{formErrors.name}</div>}
                </label>
                <label>
                  <span className="label">Image URL</span>
                  <div className="image-input-container">
                    <input 
                      className={`input ${formErrors.image ? 'error' : ''}`}
                      placeholder="https://example.com/image.jpg"
                      value={form.image} 
                      onChange={e => handleFormChange('image', e.target.value)}
                      disabled={isSubmitting}
                    />
                    {form.image && (
                      <div className="image-preview">
                        <img src={form.image} alt="Preview" onError={(e) => e.target.style.display = 'none'} />
                      </div>
                    )}
                  </div>
                  {formErrors.image && <div className="input-error">{formErrors.image}</div>}
                  <div className="input-help">Optional: URL to an image of the room</div>
                </label>
                <label>
                  <span className="label">Attributes</span>
                  <input 
                    className="input" 
                    placeholder="projector, whiteboard, outlets, wifi"
                    value={form.attributes} 
                    onChange={e => handleFormChange('attributes', e.target.value)}
                    disabled={isSubmitting}
                  />
                  <div className="input-help">Comma-separated list of room features</div>
                </label>
                <div className="actions">
                  <button type="button" className="btn" onClick={()=>setShowModal(false)} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <span>
                        <span className="spinner">⟳</span>
                        {modalMode === 'edit' ? 'Saving...' : 'Creating...'}
                      </span>
                    ) : (
                      modalMode === 'edit' ? 'Save Changes' : 'Create Room'
                    )}
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

export default RoomManager;
