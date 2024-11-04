import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import type { Meeting } from '../types';

// For Chrome extensions, we can set the app element to document.body
Modal.setAppElement(document.body);

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

  const handleSave = () => {
    onSave(noteDraft, false);
    if (meeting.recurringEventId) {
      onSave(seriesNoteDraft, true);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={{
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        },
        content: {
          position: 'relative',
          top: 'auto',
          left: 'auto',
          right: 'auto',
          bottom: 'auto',
          maxWidth: '500px',
          width: '90%',
          padding: '24px',
          borderRadius: '8px',
          backgroundColor: 'white',
          maxHeight: '90vh',
          overflow: 'auto'
        }
      }}
    >
      <div className="modal-content">
        <h2 className="modal-title">{meeting.summary}</h2>
        
        <div className="notes-section">
          <label>Meeting Notes</label>
          <textarea
            placeholder="Add notes for this meeting..."
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
        </div>

        {meeting.recurringEventId && (
          <div className="notes-section">
            <label>Series Notes</label>
            <textarea
              placeholder="Add notes for the entire series..."
              value={seriesNoteDraft}
              onChange={(e) => setSeriesNoteDraft(e.target.value)}
            />
          </div>
        )}

        <div className="button-group">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave}>Save</button>
        </div>
      </div>

      <style jsx>{`
        .modal-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .modal-title {
          margin: 0;
          font-size: 1.5rem;
          color: #333;
        }

        .notes-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        label {
          font-weight: 500;
          color: #666;
        }

        textarea {
          width: 100%;
          min-height: 100px;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          resize: vertical;
          box-sizing: border-box;
          max-width: 100%;
        }

        textarea:focus {
          outline: none;
          border-color: #0066cc;
          box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.2);
        }

        .button-group {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 8px;
        }

        button {
          padding: 8px 16px;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .primary {
          background-color: #0066cc;
          color: white;
          border: none;
        }

        .primary:hover {
          background-color: #0052a3;
        }

        .secondary {
          background-color: white;
          color: #666;
          border: 1px solid #ddd;
        }

        .secondary:hover {
          background-color: #f5f5f5;
        }
      `}</style>
    </Modal>
  );
};

export default NotesModal; 