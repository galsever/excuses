// Raw WebUntis shapes, only the fields the app reads. Dates are YYYYMMDD and times HHMM integers.

export type RawSchoolyear = { id: number; name: string; startDate: number; endDate: number };

export type RawHoliday = { id: number; name: string; longName: string; startDate: number; endDate: number };

export type RawTimegridDay = { day: number; timeUnits: { name: string; startTime: number; endTime: number }[] };

export type RawElement = { id: number; name: string; longname?: string };

export type RawLesson = {
  id: number;
  date: number;
  startTime: number;
  endTime: number;
  kl?: RawElement[];
  su?: RawElement[];
  code?: string;
  activityType?: string;
};

export type RawAbsence = {
  id: number;
  startDate: number;
  endDate: number;
  startTime: number;
  endTime: number;
  isExcused: boolean;
  excuseStatus?: string | null;
  /** WebUntis absence reason, e.g. "Krankheit", "Verspätung". */
  reason?: string;
  text?: string;
  studentName?: string;
  excuse?: { id: number; excuseStatus?: string; isExcused?: boolean } | null;
};

/** One lesson-sized slice of an absence (from /api/classreg/absencetimes/student). */
export type RawAbsenceTime = {
  absenceId: number;
  klasseName?: string;
  subjectName?: string;
  absenceReasonName?: string | null;
  date: number;
  startTime: number;
  endTime: number;
  excused?: boolean;
  missedMins?: number;
};

export type RawSnapshot = {
  fetchedAt: string;
  personId: number;
  klasseId: number;
  displayName: string | null;
  schoolyear: RawSchoolyear;
  holidays: RawHoliday[];
  timegrid: RawTimegridDay[];
  lessons: RawLesson[];
  absences: RawAbsence[];
  absenceTimes: RawAbsenceTime[] | null;
  latenessTimes: RawAbsenceTime[] | null;
};
