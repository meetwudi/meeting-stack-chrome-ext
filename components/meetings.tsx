import React, { useEffect, useState, useCallback, useRef } from 'react'
import { DndProvider, useDrag, useDrop } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import update from 'immutability-helper'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'

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
    setLoading(true)
    try {
      chrome.identity.getAuthToken({ 'interactive': false }, async (token) => {
        if (!token) return

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
        const meetingsList = data.items
          .filter((item: any) => item.eventType === 'default')
          .filter((item: any) => showSingleAttendee || (item.attendees && item.attendees.length > 1))
          .map((item: any) => ({
            id: item.id,
            summary: item.summary,
            startTime: item.start.dateTime,
            endTime: item.end.dateTime,
            responseStatus: item.attendees?.find((a: any) => a.self)?.responseStatus || 'needsAction',
            organizer: item.organizer
          }))
          .filter(meeting => showDeclined || meeting.responseStatus !== 'declined')

        setMeetings(meetingsList)
        setLoading(false)
      })
    } catch (error) {
      console.error('Error fetching meetings:', error)
      setLoading(false)
    }
  }

  const fetchMeetingsQuietly = async (start: Date, end: Date): Promise<Meeting[]> => {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ 'interactive': false }, async (token) => {
        if (!token) return resolve([]);

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
        const meetingsList = data.items
          .filter((item: any) => item.eventType === 'default')
          .filter((item: any) => showSingleAttendee || (item.attendees && item.attendees.length > 1))
          .map((item: any) => ({
            id: item.id,
            summary: item.summary,
            startTime: item.start.dateTime,
            endTime: item.end.dateTime,
            responseStatus: item.attendees?.find((a: any) => a.self)?.responseStatus || 'needsAction',
            organizer: item.organizer
          }))
          .filter(meeting => showDeclined || meeting.responseStatus !== 'declined');

        resolve(meetingsList);
      });
    });
  };

  const updateMeetingResponse = async (meetingId: string, response: 'accepted' | 'declined') => {
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
    setMeetings((prevMeetings) =>
      update(prevMeetings, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, prevMeetings[dragIndex]],
        ],
      })
    )
  }, [])

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
      const newMeetings = prevMeetings.filter((_, i) => i !== index);
      return [meeting, ...newMeetings];
    });
  }, []);

  const moveToBottom = useCallback((index: number) => {
    setMeetings(prevMeetings => {
      const meeting = prevMeetings[index];
      const newMeetings = prevMeetings.filter((_, i) => i !== index);
      return [...newMeetings, meeting];
    });
  }, []);

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
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => moveToTop(row.index)} title="Move to top">↑↑</button>
            <button onClick={() => moveToBottom(row.index)} title="Move to bottom">↓↓</button>
            {row.original.organizer.self ? (
              <ResponseButton 
                onClick={() => cancelMeeting(row.original.id)}
                icon="🗑️"
                title="Delete meeting"
              />
            ) : (
              <>
                <ResponseButton 
                  onClick={() => updateMeetingResponse(row.original.id, 'accepted')}
                  icon="✓"
                  title="Accept"
                  active={row.original.responseStatus === 'accepted'}
                />
                <ResponseButton 
                  onClick={() => updateMeetingResponse(row.original.id, 'tentative')}
                  icon="❓"
                  title="Maybe"
                  active={row.original.responseStatus === 'tentative'}
                />
                <ResponseButton 
                  onClick={() => updateMeetingResponse(row.original.id, 'declined')}
                  icon="✗"
                  title="Decline"
                  active={row.original.responseStatus === 'declined'}
                />
              </>
            )}
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
                        <th></th> {/* Column for drag handle */}
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
        `}
      </style>
    </div>
  )
}

export default Meetings