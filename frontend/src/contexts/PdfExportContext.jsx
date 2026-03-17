import React, { createContext, useContext } from 'react';
import { Icon as IconifyIcon } from '@iconify-icon/react';
import { Icon as IconifyReact } from '@iconify/react';

const PdfExportContext = createContext(false);

export function PdfExportProvider({ forExport, children }) {
    return (
        <PdfExportContext.Provider value={!!forExport}>
            {children}
        </PdfExportContext.Provider>
    );
}

/**
 * Icon component that renders inline SVG when inside PDF export context.
 * html2canvas cannot capture iconify-icon (shadow DOM); @iconify/react renders inline SVG.
 */
export function PdfIcon(props) {
    const forExport = useContext(PdfExportContext);
    const IconComponent = forExport ? IconifyReact : IconifyIcon;
    return <IconComponent {...props} />;
}
