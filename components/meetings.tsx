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
  status: 'accepted' | 'declined' | 'needsAction' | 'tentative';
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
    label: 'Next Week',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() + 1); // Start tomorrow
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
  },
  {
    label: 'Next 2 Weeks',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 14);
      return { start, end };
    }
  },
  {
    label: 'Next Month',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() + 1);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      return { start, end };
    }
  }
];

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

function Meetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRange, setSelectedRange] = useState<DateRange>(DATE_RANGES[0])
  const [userEmail, setUserEmail] = useState<string>('')
  
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
          .map((item: any) => ({
            id: item.id,
            summary: item.summary,
            startTime: item.start.dateTime,
            endTime: item.end.dateTime,
            status: item.status,
            organizer: item.organizer
          }))

        setMeetings(meetingsList)
        setLoading(false)
      })
    } catch (error) {
      console.error('Error fetching meetings:', error)
      setLoading(false)
    }
  }

  const updateMeetingResponse = async (meetingId: string, response: 'accepted' | 'declined') => {
    try {
      chrome.identity.getAuthToken({ 'interactive': false }, async (token) => {
        if (!token) return;

        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${meetingId}?sendUpdates=all`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: response
            })
          }
        );

        // Refresh meetings after update
        fetchMeetings(selectedRange.getDateRange());
      });
    } catch (error) {
      console.error('Error updating meeting:', error);
    }
  };

  const cancelMeeting = async (meetingId: string) => {
    try {
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

        // Refresh meetings after cancellation
        fetchMeetings(selectedRange.getDateRange());
      });
    } catch (error) {
      console.error('Error canceling meeting:', error);
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
      },
      {
        header: 'End Time',
        accessorKey: 'endTime',
      },
      {
        header: 'Status',
        accessorKey: 'status',
      },
      {
        header: 'Actions',
        cell: ({ row }) => (
          <div>
            {row.original.organizer.self ? (
              <button onClick={() => cancelMeeting(row.original.id)}>Cancel</button>
            ) : (
              <>
                <button onClick={() => updateMeetingResponse(row.original.id, 'accepted')}>Accept</button>
                <button onClick={() => updateMeetingResponse(row.original.id, 'declined')}>Decline</button>
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
      <div style={{ marginBottom: '16px' }}>
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
      </div>

      {loading ? (
        <div>Loading meetings...</div>
      ) : (
        <>
          <h3>Your Meetings</h3>
          {meetings.length === 0 ? (
            <p>No upcoming meetings</p>
          ) : (
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