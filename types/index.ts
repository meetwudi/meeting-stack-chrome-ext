export interface Meeting {
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