// src/components/DrawingToolbox.tsx
// Left-side 36px icon palette for the trade page chart.
// Emits the active tool via onToolChange.

import React from 'react';

export type DrawingTool =
  | 'cursor'
  | 'trendline'
  | 'hline'
  | 'ray'
  | 'riskbox'
  | 'bracket'
  | 'fibonacci'
  | 'text'
  | 'eraser';

interface DrawingToolboxProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
}

interface ToolDef {
  id: DrawingTool;
  label: string;
  icon: React.ReactNode;
}

function CursorIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <path d="M3 2l10 5.5-4.5 1L6 13 3 2z" />
    </svg>
  );
}
function TrendIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <line x1="2" y1="13" x2="14" y2="3" />
      <circle cx="2" cy="13" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14" cy="3" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function HLineIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <line x1="1" y1="8" x2="15" y2="8" />
      <circle cx="1" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function RayIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <line x1="2" y1="12" x2="15" y2="4" />
      <circle cx="2" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <polyline points="13,3 15,4 13,6" fill="none" />
    </svg>
  );
}
function RiskBoxIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <rect x="2" y="4" width="12" height="8" rx="1" />
    </svg>
  );
}
function BracketIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" strokeWidth="1.5" className="w-3.5 h-3.5">
      <line x1="2" y1="5" x2="14" y2="5" stroke="#26a69a" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="#2962ff" strokeWidth="2" />
      <line x1="2" y1="11" x2="14" y2="11" stroke="#ef5350" />
      <line x1="2" y1="5" x2="2" y2="11" stroke="currentColor" />
      <line x1="14" y1="5" x2="14" y2="11" stroke="currentColor" />
    </svg>
  );
}
function FibIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-3.5 h-3.5">
      <line x1="2" y1="3" x2="14" y2="3" />
      <line x1="2" y1="6" x2="14" y2="6" opacity="0.7" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="11" x2="14" y2="11" opacity="0.7" />
      <line x1="2" y1="13" x2="14" y2="13" />
      <line x1="3" y1="3" x2="3" y2="13" strokeDasharray="1 1" />
    </svg>
  );
}
function TextIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <text x="3" y="13" fontSize="11" fontWeight="900" fontFamily="serif">T</text>
    </svg>
  );
}
function EraserIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <path d="M3 13l3-3 6-6 3 3-6 6H3z" />
      <line x1="3" y1="13" x2="14" y2="13" />
    </svg>
  );
}

const TOOL_GROUPS: ToolDef[][] = [
  [{ id: 'cursor', label: 'Select', icon: <CursorIcon /> }],
  [
    { id: 'trendline', label: 'Trend Line', icon: <TrendIcon /> },
    { id: 'hline', label: 'Horizontal Line', icon: <HLineIcon /> },
    { id: 'ray', label: 'Ray', icon: <RayIcon /> },
  ],
  [
    { id: 'riskbox', label: 'Risk Box', icon: <RiskBoxIcon /> },
    { id: 'bracket', label: 'SL/TP Bracket', icon: <BracketIcon /> },
  ],
  [
    { id: 'fibonacci', label: 'Fibonacci', icon: <FibIcon /> },
    { id: 'text', label: 'Text', icon: <TextIcon /> },
  ],
  [{ id: 'eraser', label: 'Erase Drawing', icon: <EraserIcon /> }],
];

export function DrawingToolbox({ activeTool, onToolChange }: DrawingToolboxProps) {
  return (
    <div className="w-9 bg-sim-surface border-r border-sim-border flex flex-col items-center py-2 gap-0.5 flex-shrink-0">
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col items-center gap-0.5 w-full">
          {gi > 0 && <div className="w-5 h-px bg-sim-border my-1" />}
          {group.map((tool) => (
            <button
              key={tool.id}
              title={tool.label}
              onClick={() => onToolChange(tool.id)}
              className={`w-7 h-7 rounded flex items-center justify-center transition-colors border ${
                activeTool === tool.id
                  ? 'bg-sim-blue/20 text-sim-blue border-sim-blue/40'
                  : 'text-sim-muted hover:bg-sim-hover hover:text-sim-text border-transparent'
              }`}
            >
              {tool.icon}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
