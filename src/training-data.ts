import { supabase } from './supabase';

export type TrainingStatus = 'scheduled' | 'open' | 'closed' | 'completed';
export type Tariff = 'none' | 'card8' | 'card12' | 'multisport';

export type TrainingSession = {
  id: string;
  date: string;
  start_time: string;
  title: string;
  location: string;
  duration: number;
  capacity: number;
  status: TrainingStatus;
  registration_count: number;
  created_at: string;
  updated_at: string;
};

export type TrainingRegistration = {
  id: string;
  session_id: string;
  name: string;
  phone: string;
  tariff: Tariff;
  booked_by: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type BookingReceipt = {
  sessionId: string;
  registrationId: string;
  cancellationToken: string;
  name: string;
};

export const months = ['януари','февруари','март','април','май','юни','юли','август','септември','октомври','ноември','декември'];
export const weekdays = ['Понеделник','Вторник','Сряда','Четвъртък','Петък','Събота','Неделя'];
export const tariffLabels: Record<Tariff,string> = {
  none: 'Без карта',
  card8: 'Карта 8 посещения',
  card12: 'Карта 12 посещения',
  multisport: 'MultiSport',
};

export function parseLocal(date:string,time='00:00') {
  const [year,month,day]=date.split('-').map(Number);
  const [hour,minute]=time.slice(0,5).split(':').map(Number);
  return new Date(year,month-1,day,hour||0,minute||0);
}

export function dayName(date:string) { return weekdays[(parseLocal(date).getDay()+6)%7]; }
export function prettyDate(date:string,withYear=false) {
  const value=parseLocal(date);
  return `${value.getDate()} ${months[value.getMonth()]}${withYear?` ${value.getFullYear()}`:''}`;
}
export function shortDate(date:string) { return `${date.slice(8,10)}.${date.slice(5,7)}`; }
export function shortTime(time:string) { return time.slice(0,5); }
export function isCompleted(session:TrainingSession,now=Date.now()) {
  return session.status==='completed' || parseLocal(session.date,session.start_time).getTime()<=now;
}

export async function loadSessions() {
  if(!supabase) return [] as TrainingSession[];
  const {data,error}=await supabase.from('training_sessions').select('*').order('date').order('start_time');
  if(error) throw error;
  return (data||[]) as TrainingSession[];
}

export async function loadAdminData() {
  if(!supabase) return {sessions:[] as TrainingSession[],registrations:[] as TrainingRegistration[]};
  const [sessionResult,registrationResult]=await Promise.all([
    supabase.from('training_sessions').select('*').order('date').order('start_time'),
    supabase.from('training_registrations').select('id,session_id,name,phone,tariff,booked_by,cancelled_at,created_at').order('created_at'),
  ]);
  if(sessionResult.error) throw sessionResult.error;
  if(registrationResult.error) throw registrationResult.error;
  return {sessions:(sessionResult.data||[]) as TrainingSession[],registrations:(registrationResult.data||[]) as TrainingRegistration[]};
}

export function errorMessage(error:unknown) {
  const message=error instanceof Error?error.message:String((error as {message?:string})?.message||error||'Възникна грешка.');
  if(/duplicate|already|unique/i.test(message)) return 'Този телефон вече е записан за тренировката.';
  return message;
}
