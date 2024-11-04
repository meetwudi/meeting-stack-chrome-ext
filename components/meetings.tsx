import React, { useEffect, useState, useCallback, useRef } from 'react'
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import update from 'immutability-helper'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'
import NotesModal from './NotesModal';
import Tooltip from './Tooltip';

interface Meeting {
  id: string;
  summary: string;
  startTime: string;
  endTime: string;
  responseStatus: 'accepted' | 'declined' | 'needsAction' | 'tentative';
  organizer: {
    email: string;
    self: boolean;
  };
  order?: number;
  recurringEventId?: string;
  notes?: string;
  seriesNotes?: string;
}

interface DateRange {
  label: string;
  getDateRange: () => { start: Date; end: Date };
}

const DND_ITEM_TYPE = 'row'

const DATE_RANGES: DateRange[] = [
  {
    label: 'This Week',
    getDateRange: () => {
      const start = new Date();
      // Get to this week's Monday
      start.setDate(start.getDate() - start.getDay() + 1);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(start);
      // Set to Friday
      end.setDate(end.getDate() + 4);
      end.setHours(23, 59, 59, 999);
      
      return { start, end };
    }
  },
  {
    label: 'Next Week',
    getDateRange: () => {
      const start = new Date();
      // Get to next Monday
      start.setDate(start.getDate() - start.getDay() + 8);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(start);
      // Set to Friday
      end.setDate(end.getDate() + 4);
      end.setHours(23, 59, 59, 999);
      
      return { start, end };
    }
  }
];

// Add this helper function near the top of the file
const formatDuration = (startTime: string, endTime: string): string => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
  
  if (durationMinutes >= 60) {
    const hours = Math.floor(durationMinutes / 60);
    return `${hours}h`;
  }
  return `${durationMinutes}m`;
};

// Add these helper functions near the top of the file
const getStorageKey = (start: Date): string => {
  return `meetingOrder_${start.toISOString().split('T')[0]}`;
};

const storeMeetingOrder = async (meetings: Meeting[], start: Date) => {
  const orderMap = Object.fromEntries(
    meetings.map((meeting, index) => [meeting.id, index])
  );
  await chrome.storage.local.set({ [getStorageKey(start)]: orderMap });
};

const getMeetingOrder = async (start: Date): Promise<Record<string, number>> => {
  const result = await chrome.storage.local.get(getStorageKey(start));
  return result[getStorageKey(start)] || {};
};

// Add these helper functions for notes storage
const getNoteStorageKey = (meetingId: string): string => {
  return `meetingNote_${meetingId}`;
};

const getSeriesNoteStorageKey = (recurringEventId: string): string => {
  return `seriesNote_${recurringEventId}`;
};

const storeNote = async (meetingId: string, note: string) => {
  await chrome.storage.local.set({ [getNoteStorageKey(meetingId)]: note });
};

const storeSeriesNote = async (recurringEventId: string, note: string) => {
  await chrome.storage.local.set({ [getSeriesNoteStorageKey(recurringEventId)]: note });
};

// Row component for handling drag and drop
const TableRow = ({ row, index, moveRow }: { 
  row: any, 
  index: number, 
  moveRow: (dragIndex: number, hoverIndex: number) => void 
}) => {
  const dropRef = useRef<HTMLTableRowElement>(null)
  const dragRef = useRef<HTMLSpanElement>(null)

  const [{ isDragging }, drag, preview] = useDrag({
    type: DND_ITEM_TYPE,
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })

  const [, drop] = useDrop({
    accept: DND_ITEM_TYPE,
    hover(item: { index: number }, monitor) {
      if (!dropRef.current) return
      const dragIndex = item.index
      const hoverIndex = index

      if (dragIndex === hoverIndex) return

      const hoverBoundingRect = dropRef.current.getBoundingClientRect()
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2
      const clientOffset = monitor.getClientOffset()
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return

      moveRow(dragIndex, hoverIndex)
      item.index = hoverIndex
    },
  })

  preview(drop(dropRef))
  drag(dragRef)

  return (
    <tr
      ref={dropRef}
      style={{ opacity: isDragging ? 0.5 : 1, borderBottom: '1px solid #ddd' }}
    >
      <td style={{ padding: '8px' }}>
        <span
          ref={dragRef}
          className="drag-handle"
          style={{ 
            cursor: 'grab', 
            opacity: 0,
            userSelect: 'none',
          }}
        >
          ⋮⋮
        </span>
      </td>
      {row.getVisibleCells().map((cell: any) => (
        <td key={cell.id} style={{ padding: '8px' }}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  )
}

const ResponseButton = ({ 
  onClick, 
  icon, 
  title, 
  active = false 
}: { 
  onClick: () => void, 
  icon: string, 
  title: string,
  active?: boolean 
}) => (
  <button 
    onClick={onClick} 
    title={title}
    style={{
      padding: '4px 8px',
      opacity: active ? 1 : 0.7,
      cursor: 'pointer',
    }}
  >
    {icon}
  </button>
);

function Meetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [selectedRange, setSelectedRange] = useState<DateRange>(DATE_RANGES[0])
  const [userEmail, setUserEmail] = useState<string>('')
  const [showSingleAttendee, setShowSingleAttendee] = useState(false)
  const [showDeclined, setShowDeclined] = useState(false)
  const [showFree, setShowFree] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

  useEffect(() => {
    chrome.identity.getProfileUserInfo((userInfo) => {
      console.log(userInfo)
      setUserEmail(userInfo.email)
    })
  }, [])

  useEffect(() => {
    fetchMeetings(selectedRange.getDateRange())
  }, [selectedRange])

  const fetchMeetings = async ({ start, end }: { start: Date; end: Date }) => {
    setLoading(true);
    try {
      const storedOrder = await getMeetingOrder(start);
      
      chrome.identity.getAuthToken({ 'interactive': false }, async (token) => {
        if (!token) return;

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
          `timeMin=${start.toISOString()}&` +
          `timeMax=${end.toISOString()}&` +
          `orderBy=startTime&` +
          `singleEvents=true`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        )

        const data = await response.json()
        
        // Load notes for all meetings
        const meetingsWithNotes = await Promise.all(
          filterMeetings(data.items).map(async (item: any) => {
            // Get individual meeting notes
            const noteKey = getNoteStorageKey(item.id);
            const noteResult = await chrome.storage.local.get(noteKey);
            const notes = noteResult[noteKey];

            // Get series notes if it's a recurring meeting
            let seriesNotes;
            if (item.recurringEventId) {
              const seriesKey = getSeriesNoteStorageKey(item.recurringEventId);
              const seriesResult = await chrome.storage.local.get(seriesKey);
              seriesNotes = seriesResult[seriesKey];
            }

            return {
              id: item.id,
              summary: item.summary,
              startTime: item.start.dateTime,
              endTime: item.end.dateTime,
              responseStatus: item.attendees?.find((a: any) => a.self)?.responseStatus || 'needsAction',
              organizer: item.organizer,
              order: storedOrder[item.id] ?? Number.MAX_SAFE_INTEGER,
              recurringEventId: item.recurringEventId,
              notes,
              seriesNotes,
            };
          })
        );

        const filteredMeetings = meetingsWithNotes
          .filter(meeting => showDeclined || meeting.responseStatus !== 'declined')
          .sort((a, b) => a.order - b.order);

        setMeetings(filteredMeetings);
        setLoading(false);
      });
    } catch (error) {
      console.error('Error fetching meetings:', error);
      setLoading(false);
    }
  };

  const fetchMeetingsQuietly = async (start: Date, end: Date): Promise<Meeting[]> => {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ 'interactive': false }, async (token) => {
        if (!token) return resolve([]);

        const storedOrder = await getMeetingOrder(start);

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
          `timeMin=${start.toISOString()}&` +
          `timeMax=${end.toISOString()}&` +
          `orderBy=startTime&` +
          `singleEvents=true`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        const data = await response.json();
        
        // Load notes for all meetings
        const meetingsWithNotes = await Promise.all(
          filterMeetings(data.items).map(async (item: any) => {
            // Get individual meeting notes
            const noteKey = getNoteStorageKey(item.id);
            const noteResult = await chrome.storage.local.get(noteKey);
            const notes = noteResult[noteKey];

            // Get series notes if it's a recurring meeting
            let seriesNotes;
            if (item.recurringEventId) {
              const seriesKey = getSeriesNoteStorageKey(item.recurringEventId);
              const seriesResult = await chrome.storage.local.get(seriesKey);
              seriesNotes = seriesResult[seriesKey];
            }

            return {
              id: item.id,
              summary: item.summary,
              startTime: item.start.dateTime,
              endTime: item.end.dateTime,
              responseStatus: item.attendees?.find((a: any) => a.self)?.responseStatus || 'needsAction',
              organizer: item.organizer,
              order: storedOrder[item.id] ?? Number.MAX_SAFE_INTEGER,
              recurringEventId: item.recurringEventId,
              notes,
              seriesNotes,
            };
          })
        );

        const filteredMeetings = meetingsWithNotes
          .filter(meeting => showDeclined || meeting.responseStatus !== 'declined')
          .sort((a, b) => a.order - b.order);

        resolve(filteredMeetings);
      });
    });
  };

  const updateMeetingResponse = async (meetingId: string, response: 'accepted' | 'declined' | 'tentative' | 'needsAction') => {
    setUpdating(true)
    try {
      setMeetings(prevMeetings => 
        prevMeetings.map(meeting => 
          meeting.id === meetingId 
            ? { ...meeting, responseStatus: response }
            : meeting
        )
      )

      chrome.identity.getAuthToken({ 'interactive': false }, async (token) => {
        if (!token) return;

        const getResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${meetingId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            }
          }
        );
        const event = await getResponse.json();

        const updatedEvent = {
          ...event,
          attendees: event.attendees?.map((attendee: any) => 
            attendee.self ? { ...attendee, responseStatus: response } : attendee
          )
        };

        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${meetingId}?sendUpdates=all`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedEvent)
          }
        );

        const { start, end } = selectedRange.getDateRange();
        const updatedMeetings = await fetchMeetingsQuietly(start, end);
        setMeetings(updatedMeetings);
      });
    } catch (error) {
      console.error('Error updating meeting:', error);
      fetchMeetings(selectedRange.getDateRange());
    } finally {
      setUpdating(false)
    }
  };

  const cancelMeeting = async (meetingId: string) => {
    setUpdating(true)
    try {
      setMeetings(prevMeetings => 
        prevMeetings.filter(meeting => meeting.id !== meetingId)
      )

      chrome.identity.getAuthToken({ 'interactive': false }, async (token) => {
        if (!token) return;

        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${meetingId}?sendUpdates=all`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
            }
          }
        );
      });
    } catch (error) {
      console.error('Error canceling meeting:', error);
      fetchMeetings(selectedRange.getDateRange());
    } finally {
      setUpdating(false)
    }
  };

  const moveRow = useCallback((dragIndex: number, hoverIndex: number) => {
    setMeetings((prevMeetings) => {
      const newMeetings = update(prevMeetings, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, prevMeetings[dragIndex]],
        ],
      });
      const { start } = selectedRange.getDateRange();
      storeMeetingOrder(newMeetings, start);
      return newMeetings;
    });
  }, [selectedRange]);

  const formatDuration = (startTime: string, endTime: string): string => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    
    if (durationMinutes >= 60) {
      const hours = Math.floor(durationMinutes / 60);
      return `${hours}h`;
    }
    return `${durationMinutes}m`;
  };

  const moveToTop = useCallback((index: number) => {
    setMeetings(prevMeetings => {
      const meeting = prevMeetings[index];
      const newMeetings = [
        meeting,
        ...prevMeetings.filter((_, i) => i !== index)
      ];
      const { start } = selectedRange.getDateRange();
      storeMeetingOrder(newMeetings, start);
      return newMeetings;
    });
  }, [selectedRange]);

  const moveToBottom = useCallback((index: number) => {
    setMeetings(prevMeetings => {
      const meeting = prevMeetings[index];
      const newMeetings = [
        ...prevMeetings.filter((_, i) => i !== index),
        meeting
      ];
      const { start } = selectedRange.getDateRange();
      storeMeetingOrder(newMeetings, start);
      return newMeetings;
    });
  }, [selectedRange]);

  const filterMeetings = (items: any[]) => {
    return items
      .filter((item: any) => item.eventType === 'default')
      .filter((item: any) => item.transparency !== 'transparent' || showFree)
      .filter((item: any) => showSingleAttendee || (item.attendees && item.attendees.length > 1))
  }

  const handleNotesClick = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setIsNotesModalOpen(true);
  };

  const handleNoteSave = async (note: string, isSeriesNote: boolean = false) => {
    if (!selectedMeeting) return;

    if (isSeriesNote && selectedMeeting.recurringEventId) {
      await storeSeriesNote(selectedMeeting.recurringEventId, note);
      setMeetings(prevMeetings => 
        prevMeetings.map(meeting => 
          meeting.recurringEventId === selectedMeeting.recurringEventId
            ? { ...meeting, seriesNotes: note }
            : meeting
        )
      );
    } else {
      await storeNote(selectedMeeting.id, note);
      setMeetings(prevMeetings => 
        prevMeetings.map(meeting => 
          meeting.id === selectedMeeting.id
            ? { ...meeting, notes: note }
            : meeting
        )
      );
    }
    setIsNotesModalOpen(false);
    setSelectedMeeting(null);
  };

  const table = useReactTable({
    data: meetings,
    columns: [
      {
        header: 'Summary',
        accessorKey: 'summary',
      },
      {
        header: 'Start Time',
        accessorKey: 'startTime',
        cell: ({ getValue }) => {
          const date = new Date(getValue() as string);
          return date.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
        },
      },
      {
        header: 'Duration',
        cell: ({ row }) => formatDuration(row.original.startTime, row.original.endTime),
      },
      {
        header: 'Status',
        accessorKey: 'responseStatus',
      },
      {
        header: 'Actions',
        cell: ({ row }) => (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <Tooltip text="Move to top">
              <span 
                onClick={() => moveToTop(row.index)} 
                style={{ cursor: 'pointer' }}
              >⬆️</span>
            </Tooltip>
            <Tooltip text="Move to bottom">
              <span 
                onClick={() => moveToBottom(row.index)} 
                style={{ cursor: 'pointer' }}
              >⬇️</span>
            </Tooltip>
            <Tooltip text="Accept">
              <span 
                onClick={() => updateMeetingResponse(row.original.id, 'accepted')}
                style={{ 
                  cursor: 'pointer',
                  opacity: row.original.responseStatus === 'accepted' ? 1 : 0.5 
                }}
              >✅</span>
            </Tooltip>
            <Tooltip text="Maybe">
              <span 
                onClick={() => updateMeetingResponse(row.original.id, 'tentative')}
                style={{ 
                  cursor: 'pointer',
                  opacity: row.original.responseStatus === 'tentative' ? 1 : 0.5 
                }}
              >❓</span>
            </Tooltip>
            <Tooltip text="Decline">
              <span 
                onClick={() => updateMeetingResponse(row.original.id, 'declined')}
                style={{ 
                  cursor: 'pointer',
                  opacity: row.original.responseStatus === 'declined' ? 1 : 0.5 
                }}
              >❌</span>
            </Tooltip>
            {row.original.organizer.self && (
              <Tooltip text="Delete meeting">
                <span 
                  onClick={() => cancelMeeting(row.original.id)}
                  style={{ cursor: 'pointer' }}
                >🗑️</span>
              </Tooltip>
            )}
            <Tooltip text="Add/Edit Notes">
              <span 
                onClick={() => handleNotesClick(row.original)}
                style={{ 
                  cursor: 'pointer',
                  opacity: (!!row.original.notes || !!row.original.seriesNotes) ? 1 : 0.5 
                }}
              >📝</span>
            </Tooltip>
          </div>
        ),
      },
    ],
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <select 
          value={selectedRange.label}
          onChange={(e) => {
            const range = DATE_RANGES.find(r => r.label === e.target.value)
            if (range) setSelectedRange(range)
          }}
        >
          {DATE_RANGES.map(range => (
            <option key={range.label} value={range.label}>
              {range.label}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="checkbox"
            checked={showSingleAttendee}
            onChange={(e) => {
              setShowSingleAttendee(e.target.checked)
              fetchMeetings(selectedRange.getDateRange())
            }}
          />
          Show single-attendee meetings
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="checkbox"
            checked={showDeclined}
            onChange={(e) => {
              setShowDeclined(e.target.checked)
              fetchMeetings(selectedRange.getDateRange())
            }}
          />
          Show declined meetings
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="checkbox"
            checked={showFree}
            onChange={(e) => {
              setShowFree(e.target.checked)
              fetchMeetings(selectedRange.getDateRange())
            }}
          />
          Show free/OOO meetings
        </label>
      </div>

      {loading ? (
        <div>Loading meetings...</div>
      ) : (
        <>
          <h3>Your Meetings</h3>
          {meetings.length === 0 ? (
            <p>No upcoming meetings</p>
          ) : (
            <div style={{ position: 'relative' }}>
              {updating && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1
                }}>
                  Updating...
                </div>
              )}
              <DndProvider backend={HTML5Backend}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    {table.getHeaderGroups().map(headerGroup => (
                      <tr key={headerGroup.id}>
                        <th style={{ padding: '8px', borderBottom: '2px solid #ddd' }}></th>
                        {headerGroup.headers.map(header => (
                          <th key={header.id} style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #ddd' }}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row, index) => (
                      <TableRow
                        key={row.id}
                        row={row}
                        index={index}
                        moveRow={moveRow}
                      />
                    ))}
                  </tbody>
                </table>
              </DndProvider>
            </div>
          )}
        </>
      )}
      <style>
        {`
          tr:hover .drag-handle {
            opacity: 1 !important;
          }

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
            margin-bottom: 10px;
          }
        `}
      </style>
      {selectedMeeting && (
        <NotesModal
          meeting={selectedMeeting}
          isOpen={isNotesModalOpen}
          onClose={() => {
            setIsNotesModalOpen(false);
            setSelectedMeeting(null);
          }}
          onSave={handleNoteSave}
        />
      )}
    </div>
  )
}

export default Meetings