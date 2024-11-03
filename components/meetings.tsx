import React, { useEffect, useState } from 'react'

interface Meeting {
  id: string;
  summary: string;
  startTime: string;
  endTime: string;
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
        const meetingsList = data.items.map((item: any) => ({
          id: item.id,
          summary: item.summary,
          startTime: item.start.dateTime,
          endTime: item.end.dateTime
        }))

        setMeetings(meetingsList)
        setLoading(false)
      })
    } catch (error) {
      console.error('Error fetching meetings:', error)
      setLoading(false)
    }
  }

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
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {meetings.map(meeting => (
                <li key={meeting.id} style={{ marginBottom: '12px' }}>
                  <strong>{meeting.summary}</strong>
                  <br />
                  <small>
                    {new Date(meeting.startTime).toLocaleString()} - 
                    {new Date(meeting.endTime).toLocaleTimeString()}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export default Meetings