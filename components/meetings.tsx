import React, { useEffect, useState } from 'react'
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';

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

  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(meetings);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setMeetings(items);
  };

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
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="meetings">
                {(provided) => (
                  <ul 
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    style={{ listStyle: 'none', padding: 0 }}
                  >
                    {meetings.map((meeting, index) => (
                      <Draggable 
                        key={meeting.id} 
                        draggableId={meeting.id} 
                        index={index}
                      >
                        {(provided) => (
                          <li
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              ...provided.draggableProps.style,
                              marginBottom: '12px',
                              padding: '12px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              backgroundColor: 'white'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <strong>{meeting.summary}</strong>
                                <br />
                                <small>
                                  {new Date(meeting.startTime).toLocaleString()} - 
                                  {new Date(meeting.endTime).toLocaleTimeString()}
                                </small>
                                <br />
                                <small>Organizer: {meeting.organizer.email}</small>
                                <br />
                                <small style={{ 
                                  color: meeting.status === 'accepted' ? 'green' : 
                                         meeting.status === 'declined' ? 'red' : 'orange'
                                }}>
                                  Status: {meeting.status}
                                </small>
                              </div>
                              
                              {!meeting.organizer.self && (
                                <div>
                                  <button
                                    onClick={() => updateMeetingResponse(meeting.id, 'accepted')}
                                    style={{ marginRight: '8px' }}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    onClick={() => updateMeetingResponse(meeting.id, 'declined')}
                                  >
                                    Decline
                                  </button>
                                </div>
                              )}
                              
                              {meeting.organizer.self && (
                                <button 
                                  onClick={() => cancelMeeting(meeting.id)}
                                  style={{ color: 'red' }}
                                >
                                  Cancel Meeting
                                </button>
                              )}
                            </div>
                          </li>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </ul>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </>
      )}
    </div>
  )
}

export default Meetings