import React, { useState, useEffect } from 'react';
import type { Meeting } from '../types';

interface NotesModalProps {
  meeting: Meeting;
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: string, isSeriesNote: boolean) => Promise<void>;
}

const NotesModal: React.FC<NotesModalProps> = ({ meeting, isOpen, onClose, onSave }) => {
  const [noteDraft, setNoteDraft] = useState(meeting.notes || '');
  const [seriesNoteDraft, setSeriesNoteDraft] = useState(meeting.seriesNotes || '');

  useEffect(() => {
    setNoteDraft(meeting.notes || '');
    setSeriesNoteDraft(meeting.seriesNotes || '');
  }, [meeting]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Meeting Notes</h3>
        <div className="notes-container">
          <textarea
            placeholder="Add notes for this meeting..."
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
          {meeting.recurringEventId && (
            <>
              <h4>Series Notes</h4>
              <textarea
                placeholder="Add notes for the entire series..."
                value={seriesNoteDraft}
                onChange={(e) => setSeriesNoteDraft(e.target.value)}
              />
            </>
          )}
        </div>
        <div className="modal-buttons">
          <button onClick={() => {
            onSave(noteDraft, false);
            if (meeting.recurringEventId) {
              onSave(seriesNoteDraft, true);
            }
          }}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .modal {
          background: white;
          padding: 20px;
          border-radius: 8px;
          min-width: 300px;
        }

        .notes-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 15px 0;
        }

        .notes-container textarea {
          width: 100%;
          min-height: 100px;
          padding: 8px;
          margin: 15px 0;
        }

        .modal-buttons {
          display: flex;
          justify-content: space-between;
          margin-top: 20px;
        }

        .modal-buttons button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .modal-buttons button:first-child {
          background-color: #4CAF50;
          color: white;
        }

        .modal-buttons button:last-child {
          background-color: #ccc;
          color: #333;
        }
      `}</style>
    </div>
  );
};

export default NotesModal; 