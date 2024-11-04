import React, { useState } from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className="tooltip-container"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && <div className="tooltip">{text}</div>}
      <style>{`
        .tooltip-container {
          position: relative;
          display: inline-block;
        }
        .tooltip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          padding: 4px 8px;
          background-color: #333;
          color: white;
          font-size: 12px;
          border-radius: 4px;
          white-space: nowrap;
          z-index: 1000;
          margin-bottom: 4px;
        }
      `}</style>
    </div>
  );
};

export default Tooltip; 