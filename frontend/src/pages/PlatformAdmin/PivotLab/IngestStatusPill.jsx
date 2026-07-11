import React from 'react';

function IngestStatusPill({ status }) {
  if (status === 'published') {
    return <span className="pivot-lab__pill pivot-lab__pill--ok">Published</span>;
  }
  if (status === 'staged') {
    return <span className="pivot-lab__pill pivot-lab__pill--info">Staged</span>;
  }
  if (status === 'draft') {
    return <span className="pivot-lab__pill pivot-lab__pill--warn">Draft</span>;
  }
  return <span className="pivot-lab__pill">—</span>;
}

export default IngestStatusPill;
