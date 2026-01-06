import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom'; // Allows for nested routes to be rendered within this layout
import Banner from '../../components/Banner/Banner'; // Import your Banner component
function Layout() {
  const [visible, setVisible] = useState(false);

  const [viewport, setViewport] = useState("100vh");
  useEffect(() => {
      let height = window.innerHeight;
      setViewport(height + 'px');
      //add listener
  },[]);
  
  return (
    <div style={{minHeight: viewport, position: 'relative', overflowX: 'hidden', width: '100%'}}>
      {/* The Banner is rendered here and will appear across all pages */}
      <Banner visible={visible} setVisible={setVisible} bannerType="default" />
      
      {/* This will render the content of the page (children) */}
      <main style={{minHeight: viewport, overflowX: 'hidden', width: '100%'}}>
        <div className="out" style={{minHeight: viewport, overflowX: 'hidden', width: '100%'}}>
            <Outlet />      
        </div>
      </main>
    </div>
  );
}

export default Layout;
