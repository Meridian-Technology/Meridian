import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './XmlViewer.scss';

const XmlViewer = ({ xml, className = '' }) => {
  // Format the XML string with proper indentation
  const formatXml = (xml) => {
    let formatted = '';
    let indent = '';
    const tab = '  '; // 2 spaces for indentation
    
    xml.split(/>\s*</).forEach((node) => {
      if (node.match(/^\/\w/)) {
        // Closing tag
        indent = indent.substring(tab.length);
      }
      
      formatted += indent + '<' + node + '>\n';
      
      if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith("?")) {
        // Opening tag
        indent += tab;
      }
    });
    
    return formatted.substring(1, formatted.length - 1);
  };

  return (
    <div className={`xml-viewer ${className}`}>
      <SyntaxHighlighter
        language="xml"
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          borderRadius: '4px',
          padding: '16px',
        }}
      >
        {formatXml(xml)}
      </SyntaxHighlighter>
    </div>
  );
};

export default XmlViewer; 