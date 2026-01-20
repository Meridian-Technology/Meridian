import React, { useState, useEffect } from 'react';
import './ResourcesManagement.scss';
import apiRequest from '../../../utils/postRequest';
import { useFetch } from '../../../hooks/useFetch';
import { useGradient } from '../../../hooks/useGradient';
import Popup from '../../../components/Popup/Popup';
import { Icon } from '@iconify-icon/react';
import ResourceEditorModal from './ResourceEditorModal';

function ResourcesManagement() {
  const [resources, setResources] = useState([]);
  const [expandedResources, setExpandedResources] = useState(new Set());
  const [editingResource, setEditingResource] = useState(null);
  const [editingPath, setEditingPath] = useState([]); // Path to resource being edited
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [showPopulateModal, setShowPopulateModal] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);
  const { AdminGrad } = useGradient();

  const { data: resourcesResp, loading, error: fetchError, refetch } = useFetch('/api/resources/admin', {
    method: 'GET'
  });

  useEffect(() => {
    if (resourcesResp?.success && resourcesResp.data) {
      setResources(resourcesResp.data.resources || []);
      setJsonText(JSON.stringify({ resources: resourcesResp.data.resources || [] }, null, 2));
    }
    if (fetchError) {
      setError(fetchError);
    }
  }, [resourcesResp, fetchError]);

  const toggleExpand = (path) => {
    const pathKey = path.join('/');
    setExpandedResources(prev => {
      const next = new Set(prev);
      if (next.has(pathKey)) {
        next.delete(pathKey);
      } else {
        next.add(pathKey);
      }
      return next;
    });
  };

  const getResourceByPath = (path) => {
    let current = resources;
    for (let i = 0; i < path.length; i++) {
      const resource = current.find(r => r.id === path[i]);
      if (!resource) return null;
      if (i === path.length - 1) return resource;
      if (resource.type === 'subpage' && resource.subResources) {
        current = resource.subResources;
      } else {
        return null;
      }
    }
    return null;
  };

  const updateResourceByPath = (path, updates) => {
    const newResources = [...resources];
    let current = newResources;
    
    for (let i = 0; i < path.length - 1; i++) {
      const index = current.findIndex(r => r.id === path[i]);
      if (index === -1) return newResources;
      if (current[index].type === 'subpage' && current[index].subResources) {
        current = current[index].subResources;
      } else {
        return newResources;
      }
    }
    
    const finalIndex = current.findIndex(r => r.id === path[path.length - 1]);
    if (finalIndex !== -1) {
      current[finalIndex] = { ...current[finalIndex], ...updates };
    }
    
    return newResources;
  };

  const deleteResourceByPath = (path) => {
    const newResources = [...resources];
    let current = newResources;
    
    for (let i = 0; i < path.length - 1; i++) {
      const index = current.findIndex(r => r.id === path[i]);
      if (index === -1) return newResources;
      if (current[index].type === 'subpage' && current[index].subResources) {
        current = current[index].subResources;
      } else {
        return newResources;
      }
    }
    
    const finalIndex = current.findIndex(r => r.id === path[path.length - 1]);
    if (finalIndex !== -1) {
      current.splice(finalIndex, 1);
    }
    
    return newResources;
  };

  const addResourceByPath = (path, newResource) => {
    if (path.length === 0) {
      return [...resources, newResource];
    }
    
    const newResources = [...resources];
    let current = newResources;
    
    for (let i = 0; i < path.length; i++) {
      const index = current.findIndex(r => r.id === path[i]);
      if (index === -1) return newResources;
      if (current[index].type === 'subpage') {
        if (!current[index].subResources) {
          current[index].subResources = [];
        }
        current = current[index].subResources;
      } else {
        return newResources;
      }
    }
    
    current.push(newResource);
    return newResources;
  };

  const handleEdit = (path) => {
    const resource = getResourceByPath(path);
    if (!resource) return;
    
    setEditingPath(path);
    setEditingResource(resource);
    setShowAddModal(true);
  };

  const handleAdd = (parentPath = []) => {
    setEditingPath(parentPath);
    setEditingResource(null);
    setShowAddModal(true);
  };

  const handleDelete = (path) => {
    setEditingPath(path);
    setShowDeleteModal(true);
  };


  const handleDeleteConfirm = () => {
    const newResources = deleteResourceByPath(editingPath);
    setResources(newResources);
    setJsonText(JSON.stringify({ resources: newResources }, null, 2));
    setShowDeleteModal(false);
    setEditingPath([]);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const resp = await apiRequest('/api/resources', { resources }, { method: 'PUT' });
      if (!resp.success) {
        throw new Error(resp.message || 'Failed to save resources');
      }
      refetch();
      setError(null);
      alert('Resources saved successfully!');
    } catch (err) {
      setError(err.message || 'Failed to save resources');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePopulate = async () => {
    setIsPopulating(true);
    setError(null);
    try {
      const resp = await apiRequest('/api/resources/dev/populate', {}, { method: 'POST' });
      if (!resp.success) {
        throw new Error(resp.message || 'Failed to populate database');
      }
      setShowPopulateModal(false);
      refetch();
      alert(`Database populated successfully! ${resp.data?.resourcesCount || 0} resources loaded.`);
    } catch (err) {
      setError(err.message || 'Failed to populate database');
    } finally {
      setIsPopulating(false);
    }
  };

  const renderResource = (resource, path, level = 0) => {
    const pathKey = path.join('/');
    const isExpanded = expandedResources.has(pathKey);
    const isSubpage = resource.type === 'subpage';
    const hasSubResources = isSubpage && resource.subResources && resource.subResources.length > 0;
    
    return (
      <div key={resource.id} className="resource-item" style={{ marginLeft: `${level * 24}px` }}>
        <div className="resource-header">
          <div className="resource-info">
            {isSubpage && (
              <button
                className="expand-button"
                onClick={() => toggleExpand(path)}
                disabled={!hasSubResources}
              >
                <Icon 
                  icon={isExpanded ? "mdi:chevron-down" : "mdi:chevron-right"} 
                  style={{ opacity: hasSubResources ? 1 : 0.3 }}
                />
              </button>
            )}
            {!isSubpage && <span className="expand-spacer" />}
            <div 
              className="resource-color" 
              style={{ backgroundColor: resource.color }}
            />
            <div className="resource-details">
              <div className="resource-title-row">
                <span className="resource-title">{resource.title}</span>
                <span className="resource-type-badge">{resource.type}</span>
              </div>
              <div className="resource-description">{resource.description}</div>
              <div className="resource-meta">
                <span className="resource-id">ID: {resource.id}</span>
                {resource.type === 'link' && resource.url && (
                  <span className="resource-url">{resource.url}</span>
                )}
                {resource.type === 'action' && resource.action && (
                  <span className="resource-action">Action: {resource.action}</span>
                )}
              </div>
            </div>
          </div>
          <div className="resource-actions">
            {isSubpage && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => handleAdd(path)}
                title="Add sub-resource"
              >
                <Icon icon="mdi:plus" /> Add
              </button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => handleEdit(path)}
              title="Edit resource"
            >
              <Icon icon="mdi:pencil" /> Edit
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => handleDelete(path)}
              title="Delete resource"
            >
              <Icon icon="mdi:delete" /> Delete
            </button>
          </div>
        </div>
        {isSubpage && isExpanded && hasSubResources && (
          <div className="sub-resources">
            {resource.subResources.map((subResource) => 
              renderResource(subResource, [...path, subResource.id], level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="resources-management dash">
      <header className="header">
        <h1>Resources Management</h1>
        <p>Manage mobile app resources configuration.</p>
        <img src={AdminGrad} alt="" />
      </header>

      <div className="content">
        <div className="toolbar">
          <div className="info">
            <p>Current version: {resourcesResp?.data?.version || 'N/A'}</p>
            {resourcesResp?.data?.lastUpdated && (
              <p>Last updated: {new Date(resourcesResp.data.lastUpdated).toLocaleString()}</p>
            )}
            <p>Total resources: {resources.length}</p>
          </div>
          <div className="actions">
            {process.env.NODE_ENV !== 'production' && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowPopulateModal(true)}
                disabled={loading}
              >
                <Icon icon="mdi:database-import" /> Populate from JSON
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => setShowJsonModal(true)}
              disabled={loading}
            >
              <Icon icon="mdi:code-json" /> JSON Editor
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={loading || isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="resources-list-container">
          <div className="list-header">
            <h3>Resources</h3>
            <button
              className="btn btn-primary"
              onClick={() => handleAdd([])}
              disabled={loading}
            >
              <Icon icon="mdi:plus" /> Add Resource
            </button>
          </div>

          {loading && !resources.length ? (
            <div className="loading">Loading resources...</div>
          ) : resources.length === 0 ? (
            <div className="empty-state">
              <Icon icon="mdi:book-open-outline" style={{ fontSize: '48px', color: '#9ca3af' }} />
              <p>No resources found. Click "Add Resource" to create one.</p>
            </div>
          ) : (
            <div className="resources-list">
              {resources.map((resource) => renderResource(resource, [resource.id]))}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Resource Modal */}
      <Popup 
        isOpen={showAddModal} 
        onClose={() => { setShowAddModal(false); setEditingPath([]); }}
        customClassName="wide-content"
        defaultStyling={false}
      >
        <ResourceEditorModal
          resource={editingPath.length > 0 ? getResourceByPath(editingPath) : null}
          onSave={(resourceData) => {
            let newResources;
            if (editingPath.length > 0 && getResourceByPath(editingPath)) {
              newResources = updateResourceByPath(editingPath, resourceData);
            } else {
              newResources = addResourceByPath(editingPath, resourceData);
            }
            setResources(newResources);
            setJsonText(JSON.stringify({ resources: newResources }, null, 2));
            setShowAddModal(false);
            setEditingPath([]);
            setEditingResource(null);
          }}
          onCancel={() => { 
            setShowAddModal(false); 
            setEditingPath([]); 
            setEditingResource(null);
          }}
        />
      </Popup>

      {/* Delete Confirmation Modal */}
      <Popup isOpen={showDeleteModal} onClose={() => { setShowDeleteModal(false); setEditingPath([]); }}>
        <div className="modal-content">
          <div className="delete-modal">
            <h3>Delete Resource</h3>
            <p>
              Are you sure you want to delete <b>{getResourceByPath(editingPath)?.title}</b>?
              {getResourceByPath(editingPath)?.type === 'subpage' && getResourceByPath(editingPath)?.subResources?.length > 0 && (
                <span className="warning-text"> This will also delete all sub-resources.</span>
              )}
            </p>
            <div className="actions">
              <button className="btn" onClick={() => { setShowDeleteModal(false); setEditingPath([]); }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      </Popup>

      {/* JSON Editor Modal */}
      <Popup isOpen={showJsonModal} onClose={() => setShowJsonModal(false)}>
        <div className="modal-content json-modal">
          <h3>JSON Editor</h3>
          <p className="help-text">Advanced: Edit resources as JSON</p>
          <textarea
            className="json-editor"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => {
              try {
                const parsed = JSON.parse(jsonText);
                if (!parsed.resources || !Array.isArray(parsed.resources)) {
                  setError('JSON must have a "resources" array');
                  return;
                }
                setResources(parsed.resources || []);
                setError(null);
                setShowJsonModal(false);
              } catch (err) {
                setError(`Invalid JSON: ${err.message}`);
              }
            }}>
              Apply Changes
            </button>
            <button className="btn" onClick={() => setShowJsonModal(false)}>
              Close
            </button>
          </div>
        </div>
      </Popup>

      {/* Populate Modal */}
      <Popup isOpen={showPopulateModal} onClose={() => setShowPopulateModal(false)}>
        <div className="modal-content">
          <div className="populate-modal">
            <h3>Populate Database</h3>
            <p>
              This will populate the database with resources from the mobile app's <code>resources.json</code> file.
              This action is only available in development mode.
            </p>
            <p className="warning">
              <strong>Warning:</strong> This will overwrite the current resources configuration.
            </p>
            <div className="actions">
              <button className="btn" onClick={() => setShowPopulateModal(false)} disabled={isPopulating}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handlePopulate} disabled={isPopulating}>
                {isPopulating ? 'Populating...' : 'Populate Database'}
              </button>
            </div>
          </div>
        </div>
      </Popup>
    </div>
  );
}

export default ResourcesManagement;
