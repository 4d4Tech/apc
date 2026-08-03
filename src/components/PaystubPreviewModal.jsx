import React, { useState, useEffect, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize2,
  Minimize2,
  Printer,
  Download,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
  ExternalLink,
  Move,
  Sun,
  Moon,
  Grid,
  Maximize,
  Sparkles
} from 'lucide-react';
import { drawPaystubCanvas } from '../utils/paystubCanvasRenderer';

export const PaystubPreviewModal = ({ pdfData, onClose }) => {
  if (!pdfData) return null;

  // Handles both single paystub or array of paystubs
  const pdfItems = Array.isArray(pdfData) ? pdfData : [pdfData];
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const currentItem = pdfItems[currentPageIndex] || pdfItems[0];
  const { url, filename, rawData } = currentItem;

  // Viewport & Render States
  const [viewMode, setViewMode] = useState(rawData ? 'canvas' : 'pdf'); // 'canvas' or 'pdf'
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [backdropTheme, setBackdropTheme] = useState('dark'); // 'dark' | 'light' | 'grid'
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Render canvas whenever rawData, currentPageIndex, or viewMode changes
  useEffect(() => {
    if (viewMode === 'canvas' && canvasRef.current && rawData) {
      drawPaystubCanvas(canvasRef.current, rawData);
    }
  }, [viewMode, rawData, currentPageIndex]);

  // Keyboard Navigation Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      switch (e.key) {
        case '=':
        case '+':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
        case 'f':
        case 'F':
          e.preventDefault();
          handleResetZoom();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          if (e.shiftKey) handleRotateCcw();
          else handleRotateCw();
          break;
        case 'ArrowLeft':
          if (currentPageIndex > 0) {
            e.preventDefault();
            setCurrentPageIndex(prev => prev - 1);
            handleResetZoom();
          }
          break;
        case 'ArrowRight':
          if (currentPageIndex < pdfItems.length - 1) {
            e.preventDefault();
            setCurrentPageIndex(prev => prev + 1);
            handleResetZoom();
          }
          break;
        case 'p':
        case 'P':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handlePrint();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPageIndex, pdfItems.length]);

  // Mouse / Touch Drag Panning Handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel Zoom
  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) handleZoomIn();
      else handleZoomOut();
    }
  };

  // Zoom Functions
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 3.5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.4));
  const handleResetZoom = () => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  const handleFitWidth = () => {
    setZoom(1.35);
    setPan({ x: 0, y: 0 });
  };

  const handleRotateCw = () => setRotation(prev => (prev + 90) % 360);
  const handleRotateCcw = () => setRotation(prev => (prev - 90 + 360) % 360);

  // Print Helper
  const handlePrint = () => {
    if (!url) return;
    const printWindow = window.open(url, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const employeeName = rawData?.employee?.name || 'Paystub';
  const payPeriodEnd = rawData?.payPeriod?.endDate || '';

  return (
    <div
      className="modal-overlay paystub-modal-overlay"
      onClick={onClose}
      style={{
        padding: isFullscreen ? '0' : '1rem',
        backgroundColor: 'rgba(5, 10, 24, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000
      }}
    >
      <div
        className={`paystub-modal-container ${isFullscreen ? 'fullscreen' : ''}`}
        onClick={e => e.stopPropagation()}
        style={{
          width: isFullscreen ? '100vw' : '96vw',
          height: isFullscreen ? '100vh' : '94vh',
          maxWidth: isFullscreen ? '100vw' : '1600px',
          maxHeight: isFullscreen ? '100vh' : '96vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0f172a',
          borderRadius: isFullscreen ? '0' : '16px',
          border: isFullscreen ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 30px 60px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          transition: 'all 0.25s ease-in-out'
        }}
      >
        {/* Top Control Header Toolbar */}
        <header
          className="paystub-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1.25rem',
            backgroundColor: '#1e293b',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#f8fafc',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          {/* Title & Page Info */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <FileText size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#ffffff' }}>
                {employeeName} {payPeriodEnd ? `(${payPeriodEnd})` : ''}
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                APC Paystub Preview
              </span>
            </div>

            {/* Pagination Controls if multi-page/batch */}
            {pdfItems.length > 1 && (
              <div
                className="flex items-center gap-1 ml-4 px-2 py-1 rounded-md"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
              >
                <button
                  className="btn-icon"
                  disabled={currentPageIndex === 0}
                  onClick={() => {
                    setCurrentPageIndex(prev => prev - 1);
                    handleResetZoom();
                  }}
                  title="Previous Page (Left Arrow)"
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: '0.825rem', padding: '0 0.5rem', color: '#cbd5e1' }}>
                  Page {currentPageIndex + 1} of {pdfItems.length}
                </span>
                <button
                  className="btn-icon"
                  disabled={currentPageIndex === pdfItems.length - 1}
                  onClick={() => {
                    setCurrentPageIndex(prev => prev + 1);
                    handleResetZoom();
                  }}
                  title="Next Page (Right Arrow)"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Center Navigation & Viewing Controls */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* View Mode Switcher */}
            {rawData && (
              <div
                className="flex p-1 rounded-lg mr-2"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
              >
                <button
                  className={`btn-toolbar ${viewMode === 'canvas' ? 'active' : ''}`}
                  onClick={() => setViewMode('canvas')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    borderRadius: '6px',
                    backgroundColor: viewMode === 'canvas' ? '#3b82f6' : 'transparent',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Sparkles size={14} /> Interactive
                </button>
                <button
                  className={`btn-toolbar ${viewMode === 'pdf' ? 'active' : ''}`}
                  onClick={() => setViewMode('pdf')}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem',
                    borderRadius: '6px',
                    backgroundColor: viewMode === 'pdf' ? '#3b82f6' : 'transparent',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <FileText size={14} /> PDF Reader
                </button>
              </div>
            )}

            {/* Zoom Controls */}
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              <button
                className="btn-toolbar-icon"
                onClick={handleZoomOut}
                title="Zoom Out (-)"
              >
                <ZoomOut size={16} />
              </button>

              <select
                value={Math.round(zoom * 100)}
                onChange={(e) => {
                  setZoom(Number(e.target.value) / 100);
                }}
                style={{
                  backgroundColor: 'transparent',
                  color: '#e2e8f0',
                  border: 'none',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '0.2rem 0.4rem'
                }}
              >
                <option value={50} style={{ background: '#1e293b' }}>50%</option>
                <option value={75} style={{ background: '#1e293b' }}>75%</option>
                <option value={100} style={{ background: '#1e293b' }}>100%</option>
                <option value={125} style={{ background: '#1e293b' }}>125%</option>
                <option value={150} style={{ background: '#1e293b' }}>150%</option>
                <option value={200} style={{ background: '#1e293b' }}>200%</option>
                <option value={300} style={{ background: '#1e293b' }}>300%</option>
              </select>

              <button
                className="btn-toolbar-icon"
                onClick={handleZoomIn}
                title="Zoom In (+)"
              >
                <ZoomIn size={16} />
              </button>

              <button
                className="btn-toolbar-icon"
                onClick={handleResetZoom}
                title="Reset Zoom & Pan (0 or F)"
              >
                <Maximize size={15} />
              </button>
            </div>

            {/* Rotation Controls */}
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              <button
                className="btn-toolbar-icon"
                onClick={handleRotateCcw}
                title="Rotate Counter-Clockwise (Shift + R)"
              >
                <RotateCcw size={16} />
              </button>
              <button
                className="btn-toolbar-icon"
                onClick={handleRotateCw}
                title="Rotate Clockwise (R)"
              >
                <RotateCw size={16} />
              </button>
            </div>

            {/* Backdrop Theme Switcher */}
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              <button
                className={`btn-toolbar-icon ${backdropTheme === 'dark' ? 'active' : ''}`}
                onClick={() => setBackdropTheme('dark')}
                title="Dark Backdrop"
              >
                <Moon size={15} />
              </button>
              <button
                className={`btn-toolbar-icon ${backdropTheme === 'light' ? 'active' : ''}`}
                onClick={() => setBackdropTheme('light')}
                title="Light Backdrop"
              >
                <Sun size={15} />
              </button>
              <button
                className={`btn-toolbar-icon ${backdropTheme === 'grid' ? 'active' : ''}`}
                onClick={() => setBackdropTheme('grid')}
                title="Grid Contrast Backdrop"
              >
                <Grid size={15} />
              </button>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary flex items-center gap-1"
              onClick={handlePrint}
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.85rem',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.15)'
              }}
              title="Print Paystub (Ctrl+P)"
            >
              <Printer size={16} /> <span className="hidden sm:inline">Print</span>
            </button>

            <a
              href={url}
              download={filename}
              className="btn btn-primary flex items-center gap-1"
              style={{
                padding: '0.4rem 0.85rem',
                fontSize: '0.85rem',
                backgroundColor: '#10b981',
                borderColor: '#10b981',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 600
              }}
              title="Download PDF File"
            >
              <Download size={16} /> Download PDF
            </a>

            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-toolbar-icon"
              title="Open PDF in New Window Tab"
              style={{ color: '#94a3b8' }}
            >
              <ExternalLink size={18} />
            </a>

            {/* Fullscreen Toggle */}
            <button
              className="btn-toolbar-icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}
              style={{ color: '#94a3b8' }}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            {/* Close Button */}
            <button
              className="btn-toolbar-icon modal-close-btn"
              onClick={onClose}
              title="Close Preview (Esc)"
              style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '6px', borderRadius: '8px' }}
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Main Viewing Stage */}
        <div
          ref={containerRef}
          className={`paystub-stage ${backdropTheme}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
            userSelect: 'none',
            backgroundColor:
              backdropTheme === 'dark'
                ? '#090d16'
                : backdropTheme === 'light'
                ? '#e2e8f0'
                : '#111827',
            backgroundImage:
              backdropTheme === 'grid'
                ? 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)'
                : 'none',
            backgroundSize: '24px 24px',
            padding: '2rem'
          }}
        >
          <div
            className="paystub-view-wrapper"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
              borderRadius: '8px',
              overflow: 'hidden'
            }}
          >
            {viewMode === 'canvas' && rawData ? (
              <canvas
                ref={canvasRef}
                style={{
                  width: '1000px',
                  height: '708px',
                  display: 'block',
                  backgroundColor: '#0b1c3c'
                }}
              />
            ) : (
              <iframe
                src={url}
                title="Paystub PDF Preview"
                style={{
                  width: '1000px',
                  height: '708px',
                  border: 'none',
                  backgroundColor: '#ffffff'
                }}
              />
            )}
          </div>
        </div>

        {/* Bottom Floating Control / Shortcut Info Bar */}
        <footer
          style={{
            padding: '0.5rem 1.25rem',
            backgroundColor: '#1e293b',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            color: '#94a3b8'
          }}
        >
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Move size={14} /> Click & drag to pan
            </span>
            <span>•</span>
            <span>Scroll or +/- to Zoom ({Math.round(zoom * 100)}%)</span>
            <span>•</span>
            <span>Rotation: {rotation}°</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowKeyboardHelp(!showKeyboardHelp)}
              style={{
                background: 'none',
                border: 'none',
                color: '#60a5fa',
                cursor: 'pointer',
                fontSize: '0.8rem',
                textDecoration: 'underline'
              }}
            >
              {showKeyboardHelp ? 'Hide Shortcuts' : 'Keyboard Shortcuts'}
            </button>
          </div>
        </footer>

        {/* Keyboard Shortcuts Overlay Modal / Drawer */}
        {showKeyboardHelp && (
          <div
            style={{
              position: 'absolute',
              bottom: '40px',
              right: '20px',
              backgroundColor: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)',
              zIndex: 10,
              color: '#f8fafc',
              fontSize: '0.85rem',
              maxWidth: '300px'
            }}
          >
            <div className="flex justify-between items-center mb-2">
              <strong style={{ color: '#60a5fa' }}>Navigation Shortcuts</strong>
              <button
                onClick={() => setShowKeyboardHelp(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1rem', lineHeight: '1.7' }}>
              <li><kbd style={kbdStyle}>+</kbd> / <kbd style={kbdStyle}>-</kbd> : Zoom in / out</li>
              <li><kbd style={kbdStyle}>0</kbd> or <kbd style={kbdStyle}>F</kbd> : Reset zoom & fit</li>
              <li><kbd style={kbdStyle}>R</kbd> / <kbd style={kbdStyle}>Shift+R</kbd> : Rotate 90°</li>
              <li><kbd style={kbdStyle}>←</kbd> / <kbd style={kbdStyle}>→</kbd> : Prev / Next page</li>
              <li><kbd style={kbdStyle}>Ctrl+P</kbd> : Print Paystub</li>
              <li><kbd style={kbdStyle}>Esc</kbd> : Close modal</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

const kbdStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.15)',
  padding: '1px 5px',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontFamily: 'monospace'
};
