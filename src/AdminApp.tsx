'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Profile, supabase, supabaseConfigured } from './supabase';
import {
  dayName, defaultSiteContent, errorMessage, isBookingOpen, isCompleted, loadAdminData, loadSiteContent, months, shortDate, shortTime,
  SiteContent, TrainingRegistration, TrainingSession, TrainingStatus,
} from './training-data';

const baseUrl = import.meta.env.BASE_URL;
type QuickTemplate={id?:string;title:string;weekday:number;time:string;location:string;duration:number;capacity:number;booking_open_hours:number;sort_order:number};
function registrationMoment(value:string){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return{shortDate:'--.--',date:'Няма информация',time:'--:--'};
  const parts=Object.fromEntries(new Intl.DateTimeFormat('bg-BG',{timeZone:'Europe/Sofia',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(part=>[part.type,part.value]));
  return{shortDate:`${parts.day}.${parts.month}`,date:`${parts.day}.${parts.month}.${parts.year}`,time:`${parts.hour}:${parts.minute}`};
}
const templateDefaults={location:'Fit Body Center',duration:60,capacity:20,booking_open_hours:48};
const quickTemplates:QuickTemplate[]=[
  {title:'Пилатес',weekday:1,time:'07:45'},{title:'Body Training',weekday:1,time:'08:45'},{title:'Пилатес',weekday:1,time:'18:30'},{title:'Strong Body',weekday:1,time:'19:30'},
  {title:'Body Balance',weekday:2,time:'08:00'},{title:'Зумба',weekday:2,time:'18:30'},
  {title:'Body Training',weekday:3,time:'08:00'},{title:'Детска кондиционна',weekday:3,time:'17:30'},{title:'Пилатес',weekday:3,time:'18:30'},{title:'Tae Bo',weekday:3,time:'19:30'},
  {title:'Body Balance',weekday:4,time:'08:00'},{title:'Зумба',weekday:4,time:'18:30'},
  {title:'Пилатес',weekday:5,time:'07:45'},{title:'Body Training',weekday:5,time:'08:45'},{title:'Tae Bo',weekday:5,time:'19:00'},
  {title:'Strong Body',weekday:6,time:'09:30'},{title:'Детска кондиционна',weekday:6,time:'10:30'},
  {title:'Кондиционен тим',weekday:7,time:'16:45'},
].map((template,index)=>({...template,...templateDefaults,sort_order:index}));
const shortWeekdays=['','Пон','Вто','Сря','Чет','Пет','Съб','Нед'];

export default function AdminApp() {
  const [loading,setLoading]=useState(true);
  const [user,setUser]=useState<User|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null);

  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    const client=supabase;
    let live=true;
    const loadUser=async(nextUser:User|null)=>{
      if(!live)return;
      setUser(nextUser);
      if(!nextUser){setProfile(null);setLoading(false);return;}
      const {data}=await client.from('profiles').select('*').eq('id',nextUser.id).maybeSingle();
      if(live){setProfile(data as Profile|null);setLoading(false);}
    };
    client.auth.getUser().then(({data})=>loadUser(data.user));
    const {data:listener}=client.auth.onAuthStateChange((_event,session)=>loadUser(session?.user??null));
    return()=>{live=false;listener.subscription.unsubscribe();};
  },[]);

  if(!supabaseConfigured)return <MissingConfiguration/>;
  if(loading)return <AdminLoading/>;
  if(!user)return <LoginPanel/>;
  if(!profile||!profile.active||!['owner','admin','editor'].includes(profile.role))return <AccessDenied email={user.email??''}/>;
  return <AdminDashboard/>;
}

function AdminDashboard(){
  const [sessions,setSessions]=useState<TrainingSession[]>([]);
  const [registrations,setRegistrations]=useState<TrainingRegistration[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [editor,setEditor]=useState<TrainingSession|null|undefined>(undefined);
  const [registrationEditor,setRegistrationEditor]=useState<TrainingRegistration|null>(null);
  const [heroEditor,setHeroEditor]=useState(false);
  const [clock,setClock]=useState(Date.now());

  const refresh=useCallback(async()=>{
    try{const data=await loadAdminData();setSessions(data.sessions);setRegistrations(data.registrations);setError('');}
    catch(reason){setError(errorMessage(reason));}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    refresh();
    if(!supabase)return;
    const client=supabase;
    const channel=client.channel('trainings-admin-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'training_sessions'},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'training_registrations'},refresh)
      .subscribe();
    return()=>{client.removeChannel(channel);};
  },[refresh]);
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),30000);return()=>window.clearInterval(timer);},[]);

  const now=clock;
  const upcoming=useMemo(()=>sessions.filter(item=>!isCompleted(item,now)).sort(sortSessions),[sessions,now]);
  const completed=useMemo(()=>sessions.filter(item=>isCompleted(item,now)).sort((a,b)=>-sortSessions(a,b)),[sessions,now]);
  const active=upcoming.filter(item=>isBookingOpen(item,now));
  const registrationsFor=(id:string)=>registrations.filter(item=>item.session_id===id&&!item.cancelled_at);

  async function changeStatus(session:TrainingSession,status:TrainingStatus){
    if(!supabase)return;
    const {error:requestError}=await supabase.from('training_sessions').update({status}).eq('id',session.id);
    if(requestError)setError(errorMessage(requestError));else{setNotice(status==='open'?'Записването е стартирано.':'Записването е спряно.');await refresh();}
  }
  async function deleteSession(session:TrainingSession){
    if(!supabase||!window.confirm(`Да изтрия ли тренировката на ${shortDate(session.date)} в ${shortTime(session.start_time)}?`))return;
    const {error:requestError}=await supabase.from('training_sessions').delete().eq('id',session.id);
    if(requestError)setError(errorMessage(requestError));else{setNotice('Тренировката е изтрита.');await refresh();}
  }
  async function deleteRegistration(registration:TrainingRegistration){
    if(!supabase||!window.confirm(`Да премахна ли ${registration.name} от записаните?`))return;
    const {error:requestError}=await supabase.from('training_registrations').delete().eq('id',registration.id);
    if(requestError)setError(errorMessage(requestError));else await refresh();
  }
  const signOut=async()=>{await supabase?.auth.signOut();window.localStorage.removeItem('trainings-remember-login');};

  return <main className="admin-shell live-admin matched-admin">
    <header className="matched-admin-head"><div><span>FIT BODY CENTER</span><h1>Админ панел</h1></div><div className="admin-header-actions"><a className="site-button" href={`${baseUrl}trainings.html`}>← Към сайта</a><button className="logout-button" onClick={signOut}>Изход</button></div></header>
    <nav className="matched-admin-tabs" aria-label="Раздели"><button className="active" type="button">Тренировки</button></nav>
    <div className="matched-new-training"><button className="admin-hero-settings" onClick={()=>setHeroEditor(true)}>✎ Текст на началната страница</button><button className="admin-add-primary" onClick={()=>setEditor(null)}>+ Нова тренировка</button></div>
    {error&&<div className="admin-alert error">{error}</div>}
    {notice&&<button className="admin-alert success" onClick={()=>setNotice('')}>{notice}<span>×</span></button>}
    {loading&&<div className="admin-data-loading">Зареждане…</div>}

    <section className="admin-live-section">
      <div className="admin-section-heading"><div><span>АКТИВНИ</span><h2>Отворени за записване</h2></div><strong>{active.length}</strong></div>
      {!loading&&active.length===0&&<EmptyAdmin title="Няма активна тренировка" text="Създайте тренировка и натиснете „Старт“, когато искате да отворите записването."/>}
      {active.map(session=><ActiveTraining key={session.id} session={session} registrations={registrationsFor(session.id)} onEdit={()=>setEditor(session)} onStop={()=>changeStatus(session,'closed')} onEditRegistration={setRegistrationEditor} onDeleteRegistration={deleteRegistration}/>)}
    </section>

    <section className="admin-created-section">
      <div className="admin-section-heading"><div><span>СЪЗДАДЕНИ</span><h2>Активни и предстоящи</h2></div><strong>{upcoming.length}</strong></div>
      {!loading&&upcoming.length===0&&<EmptyAdmin title="Няма създадени тренировки" text="Списъкът е празен и готов за Вашите тренировки."/>}
      <div className="admin-session-list">{upcoming.map(session=><AdminSessionRow key={session.id} session={session} bookingOpen={isBookingOpen(session,now)} count={registrationsFor(session.id).length} onEdit={()=>setEditor(session)} onStart={()=>changeStatus(session,'open')} onStop={()=>changeStatus(session,'closed')} onDelete={()=>deleteSession(session)}/>)}</div>
    </section>

    <section className="admin-completed-section">
      <div className="admin-section-heading"><div><span>АРХИВ</span><h2>Проведени тренировки</h2></div><strong>{completed.length}</strong></div>
      {!loading&&completed.length===0&&<EmptyAdmin title="Все още няма проведени тренировки" text="Миналите тренировки ще се подреждат тук от най-новата към най-старата."/>}
      <div className="completed-accordion">{completed.map(session=><CompletedTraining key={session.id} session={session} registrations={registrationsFor(session.id)} onEdit={()=>setEditor(session)} onEditRegistration={setRegistrationEditor} onDelete={()=>deleteSession(session)}/>)}</div>
    </section>

    {editor!==undefined&&<SessionEditor session={editor} onClose={()=>setEditor(undefined)} onSaved={async()=>{setEditor(undefined);setNotice(editor?'Промените са запазени.':'Тренировката е създадена.');await refresh();}}/>}
    {registrationEditor&&<RegistrationEditor registration={registrationEditor} onClose={()=>setRegistrationEditor(null)} onSaved={async()=>{setRegistrationEditor(null);setNotice('Данните на записания човек са променени.');await refresh();}}/>}
    {heroEditor&&<HeroContentEditor onClose={()=>setHeroEditor(false)} onSaved={()=>{setHeroEditor(false);setNotice('Текстът на началната страница е запазен.');}}/>}
  </main>;
}

function ActiveTraining({session,registrations,onEdit,onStop,onEditRegistration,onDeleteRegistration}:{session:TrainingSession;registrations:TrainingRegistration[];onEdit:()=>void;onStop:()=>void;onEditRegistration:(item:TrainingRegistration)=>void;onDeleteRegistration:(item:TrainingRegistration)=>void}){
  const free=Math.max(0,session.capacity-registrations.length);
  return <article className="admin-training-card active-glow-card">
    <div className="session-status"><span>● ТРЕНИРОВКАТА Е АКТИВНА</span></div>
    <div className="active-training-line"><div><strong>{shortDate(session.date)}</strong><span>{dayName(session.date)}</span><i>{shortTime(session.start_time)}</i></div><b>{session.title} <small>| {session.location} · {session.duration} минути</small></b></div>
    <div className="admin-progress"><div><span style={{width:`${Math.min(100,registrations.length/session.capacity*100)}%`}}/></div><strong>{registrations.length} / {session.capacity}</strong></div>
    <div className="attendee-head"><strong>Записани</strong><span>Остават {free} места</span></div>
    {registrations.length===0?<p className="no-attendees">Все още няма записани.</p>:<div className="live-attendee-list">{registrations.map((person,index)=><AttendeeRow key={person.id} person={person} index={index} onEdit={()=>onEditRegistration(person)} onDelete={()=>onDeleteRegistration(person)}/>)}</div>}
    <div className="session-actions compact-actions"><button onClick={onEdit}>Редактирай</button><button className="stop" onClick={onStop}>Стоп</button></div>
  </article>;
}

function AttendeeRow({person,index,onEdit,onDelete}:{person:TrainingRegistration;index:number;onEdit?:()=>void;onDelete?:()=>void}){
  const created=registrationMoment(person.created_at);
  return <div className="live-attendee-row"><span className="attendee-number">{index+1}.</span><div className="attendee-inline-details"><div className="attendee-identity"><strong>{person.name}</strong>{person.booked_by&&<small>Записан от: {person.booked_by}</small>}</div><TariffBadge tariff={person.tariff}/><a className="attendee-phone" href={`tel:${person.phone}`}>{person.phone}</a></div><span className="attendee-booked-at" title={`Записан на ${created.date} в ${created.time} ч.`}><b>{created.shortDate}</b><small>{created.time}</small></span><div className="attendee-actions">{onEdit&&<button className="attendee-edit" onClick={onEdit} aria-label={`Редактирай ${person.name}`}>✎</button>}{onDelete&&<button className="attendee-delete" onClick={onDelete} aria-label={`Премахни ${person.name}`}>×</button>}</div></div>;
}
function TariffBadge({tariff}:{tariff:TrainingRegistration['tariff']}){if(tariff==='none')return <span className="tariff-text">Без карта</span>;if(tariff==='multisport')return <span className="tariff-badge multisport">MULTISPORT</span>;return <span className={`tariff-badge ${tariff}`}>{tariff==='card8'?'8':'12'}</span>;}

function AdminSessionRow({session,bookingOpen,count,onEdit,onStart,onStop,onDelete}:{session:TrainingSession;bookingOpen:boolean;count:number;onEdit:()=>void;onStart:()=>void;onStop:()=>void;onDelete:()=>void}){
  return <article className={`admin-session-row ${bookingOpen?'is-open':''}`}><div className="admin-row-status"><span>{bookingOpen?'● АКТИВНА':session.status==='closed'?'● СПРЯНА':'● ПРЕДСТОЯЩА'}</span></div><div className="admin-row-main"><div className="admin-row-date"><strong>{shortDate(session.date)}</strong><span>{dayName(session.date)}</span><i>{shortTime(session.start_time)}</i></div><div><h3>{session.title}</h3><p>{session.location} · {session.duration} минути · {count}/{session.capacity} записани · автоматично {session.booking_open_hours??48} ч. преди</p></div></div><div className="admin-row-actions"><button onClick={onEdit}>Редактирай</button><button className="start" onClick={onStart} disabled={bookingOpen}>Старт</button><button className="stop" onClick={onStop} disabled={!bookingOpen}>Стоп</button><button className="delete" onClick={onDelete}>Изтрий</button></div></article>;
}

function CompletedTraining({session,registrations,onEdit,onEditRegistration,onDelete}:{session:TrainingSession;registrations:TrainingRegistration[];onEdit:()=>void;onEditRegistration:(item:TrainingRegistration)=>void;onDelete:()=>void}){
  return <details className="completed-training"><summary><div><strong>{shortDate(session.date)}</strong><span>{dayName(session.date)} · {shortTime(session.start_time)}</span></div><h3>{session.title}</h3><b>{registrations.length} записани</b><i>⌄</i></summary><div className="completed-body">{registrations.length?<div className="live-attendee-list">{registrations.map((person,index)=><AttendeeRow key={person.id} person={person} index={index} onEdit={()=>onEditRegistration(person)}/>)}</div>:<p className="no-attendees">Няма записани участници.</p>}<div className="admin-row-actions"><button onClick={onEdit}>Редактирай</button><button className="delete" onClick={onDelete}>Изтрий</button></div></div></details>;
}
function EmptyAdmin({title,text}:{title:string;text:string}){return <div className="admin-empty"><strong>{title}</strong><p>{text}</p></div>;}

function HeroContentEditor({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
  const [content,setContent]=useState<SiteContent>(defaultSiteContent);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{document.body.classList.add('modal-open');loadSiteContent().then(setContent).catch(reason=>setError(errorMessage(reason))).finally(()=>setLoading(false));return()=>document.body.classList.remove('modal-open');},[]);
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase)return;setBusy(true);setError('');const {error:requestError}=await supabase.from('site_content').upsert({...content,id:'main'});setBusy(false);if(requestError)setError(errorMessage(requestError));else onSaved();}
  return <div className="editor-backdrop hero-editor-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="training-editor hero-content-editor" onSubmit={save}><div className="editor-handle"/><div className="editor-title"><div><span>НАЧАЛНА СТРАНИЦА</span><h2>Текст върху снимката</h2></div><button type="button" onClick={onClose}>×</button></div>{loading?<div className="admin-data-loading">Зареждане…</div>:<><label>МАЛЪК НАДПИС<input value={content.hero_eyebrow} onChange={event=>setContent({...content,hero_eyebrow:event.target.value})} required/></label><label>ГЛАВНО ЗАГЛАВИЕ<textarea value={content.hero_title} onChange={event=>setContent({...content,hero_title:event.target.value})} rows={3} required/><small>Новият ред се запазва и на страницата.</small></label><label>ОПИСАНИЕ<textarea value={content.hero_description} onChange={event=>setContent({...content,hero_description:event.target.value})} rows={3} required/></label><label>МАЛКИ ЕТИКЕТИ<input value={content.hero_tags} onChange={event=>setContent({...content,hero_tags:event.target.value})}/><small>Разделяй ги със запетая.</small></label></>}{error&&<div className="login-error">{error}</div>}<button className="editor-save" disabled={busy||loading}>{busy?'Запазване…':'Запази текста'}</button></form></div>;
}

function RegistrationEditor({registration,onClose,onSaved}:{registration:TrainingRegistration;onClose:()=>void;onSaved:()=>void}){
  const [name,setName]=useState(registration.name);const [phone,setPhone]=useState(registration.phone);const [tariff,setTariff]=useState(registration.tariff);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const created=registrationMoment(registration.created_at);
  useEffect(()=>{document.body.classList.add('modal-open');return()=>document.body.classList.remove('modal-open');},[]);
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase)return;setBusy(true);setError('');const {error:requestError}=await supabase.from('training_registrations').update({name:name.trim(),phone:phone.trim(),tariff}).eq('id',registration.id);setBusy(false);if(requestError)setError(errorMessage(requestError));else onSaved();}
  return <div className="editor-backdrop registration-editor-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="training-editor registration-editor" onSubmit={save}><div className="editor-handle"/><div className="editor-title"><div><span>ЗАПИСАН УЧАСТНИК</span><h2>Редактирай данните</h2></div><button type="button" onClick={onClose}>×</button></div><div className="registration-created-info"><span>ЗАПИСВАНЕТО Е НАПРАВЕНО</span><strong>{created.date} · {created.time} ч.</strong></div><label>ИМЕ И ФАМИЛИЯ<input value={name} onChange={event=>setName(event.target.value)} required minLength={2}/></label><label>ТЕЛЕФОН<input value={phone} onChange={event=>setPhone(event.target.value)} type="tel" inputMode="tel" required/></label><label>НАЧИН НА ПОСЕЩЕНИЕ<select value={tariff} onChange={event=>setTariff(event.target.value as TrainingRegistration['tariff'])}><option value="none">Без карта</option><option value="card8">Карта 8 посещения</option><option value="card12">Карта 12 посещения</option><option value="multisport">MultiSport</option></select></label>{error&&<div className="login-error">{error}</div>}<button className="editor-save" disabled={busy}>{busy?'Запазване…':'Запази промените'}</button></form></div>;
}

function SessionEditor({session,onClose,onSaved}:{session:TrainingSession|null;onClose:()=>void;onSaved:()=>void}){
  const initialDate=session?.date??new Date().toISOString().slice(0,10),initialTime=shortTime(session?.start_time??'18:30');
  const [date,setDate]=useState(initialDate);const [hour,setHour]=useState(initialTime.slice(0,2));const [minute,setMinute]=useState(initialTime.slice(3,5));
  const [title,setTitle]=useState(session?.title??'Пилатес');const [location,setLocation]=useState(session?.location??'Fit Body Center');const [duration,setDuration]=useState(session?.duration??60);const [capacity,setCapacity]=useState(session?.capacity??20);const [bookingOpenHours,setBookingOpenHours]=useState(session?.booking_open_hours??48);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [templates,setTemplates]=useState<QuickTemplate[]>(quickTemplates);const [manageTemplates,setManageTemplates]=useState(false);const [templateEditor,setTemplateEditor]=useState<QuickTemplate|null>(null);
  const loadTemplates=useCallback(async()=>{if(!supabase)return;const {data}=await supabase.from('training_templates').select('*').order('sort_order').order('weekday').order('start_time');if(data?.length)setTemplates(data.map((item,index)=>({id:item.id,title:item.title,weekday:item.weekday,time:shortTime(item.start_time),location:item.location,duration:item.duration,capacity:item.capacity,booking_open_hours:item.booking_open_hours,sort_order:item.sort_order??index})));},[]);
  useEffect(()=>{document.body.classList.add('modal-open');loadTemplates();return()=>document.body.classList.remove('modal-open');},[loadTemplates]);
  function applyTemplate(template:QuickTemplate){const next=nextWeekday(template.weekday);setDate(next);setTitle(template.title);setHour(template.time.slice(0,2));setMinute(template.time.slice(3,5));setLocation(template.location);setDuration(template.duration);setCapacity(template.capacity);setBookingOpenHours(template.booking_open_hours);}
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase)return;setBusy(true);setError('');const values={date,start_time:`${hour}:${minute}:00`,title:title.trim(),location:location.trim(),duration,capacity,booking_open_hours:bookingOpenHours,status:session?.status??'scheduled'};const result=session?await supabase.from('training_sessions').update(values).eq('id',session.id):await supabase.from('training_sessions').insert(values);setBusy(false);if(result.error)setError(errorMessage(result.error));else onSaved();}
  return <><div className="editor-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="training-editor live-editor" onSubmit={save}><div className="editor-handle"/><div className="editor-title"><div><span>{session?'РЕДАКЦИЯ':'НОВА ТРЕНИРОВКА'}</span><h2>{session?'Редактирай тренировката':'Създай тренировка'}</h2></div><button type="button" onClick={onClose}>×</button></div>{!session&&<section className={`schedule-templates ${manageTemplates?'is-managing':''}`}><div className="template-heading"><div><strong>ГОТОВИ ТРЕНИРОВКИ</strong><span>{manageTemplates?'Избери „Редактирай“ под желания шаблон':'Избери бутон и полетата ще се попълнят автоматично'}</span></div><button type="button" onClick={()=>setManageTemplates(value=>!value)}>{manageTemplates?'Готово':'⚙ Настройки'}</button></div><div className="schedule-template-grid">{templates.map((template,index)=><div className="schedule-template-item" key={template.id??`${template.weekday}-${template.time}-${index}`}><button className="template-apply" type="button" onClick={()=>applyTemplate(template)}><span>{shortWeekdays[template.weekday]} · {template.time}</span><strong>{template.title}</strong></button>{manageTemplates&&<button className="template-edit" type="button" onClick={()=>setTemplateEditor(template)}>Редактирай</button>}</div>)}</div></section>}<label>ДАТА<ModernDatePicker value={date} onChange={setDate}/></label><label>ЧАС (24 ЧАСА)<div className="split-time"><select value={hour} onChange={event=>setHour(event.target.value)}>{Array.from({length:24},(_,index)=><option key={index} value={String(index).padStart(2,'0')}>{String(index).padStart(2,'0')}</option>)}</select><span>:</span><select value={minute} onChange={event=>setMinute(event.target.value)}>{[0,10,20,30,40,45,50].map(value=><option key={value} value={String(value).padStart(2,'0')}>{String(value).padStart(2,'0')}</option>)}</select><strong>{hour}:{minute}</strong></div></label><label>ИМЕ НА ТРЕНИРОВКАТА<input value={title} onChange={event=>setTitle(event.target.value)} required placeholder="Пилатес"/></label><label>МЯСТО<input value={location} onChange={event=>setLocation(event.target.value)} required/></label><div className="editor-row"><label>МЕСТА<input type="number" min="1" max="500" value={capacity} onChange={event=>setCapacity(Number(event.target.value))}/></label><label>МИНУТИ<input type="number" min="10" max="300" step="5" value={duration} onChange={event=>setDuration(Number(event.target.value))}/></label></div><label>АВТОМАТИЧНО АКТИВИРАНЕ<div className="activation-hours"><input type="number" min="0" max="720" step="1" value={bookingOpenHours} onChange={event=>setBookingOpenHours(Number(event.target.value))}/><span>часа преди тренировката</span>{[24,48,72].map(value=><button type="button" key={value} className={bookingOpenHours===value?'selected':''} onClick={()=>setBookingOpenHours(value)}>{value} ч.</button>)}</div></label>{error&&<div className="login-error">{error}</div>}<button className="editor-save" disabled={busy}>{busy?'Запазване…':session?'Запази промените':'Създай тренировката'}</button></form></div>{templateEditor&&<TemplateEditor template={templateEditor} onClose={()=>setTemplateEditor(null)} onSaved={async()=>{setTemplateEditor(null);await loadTemplates();}} onDelete={async()=>{if(!supabase||!templateEditor.id||!window.confirm(`Да изтрия ли шаблона „${templateEditor.title}“?`))return;const {error:requestError}=await supabase.from('training_templates').delete().eq('id',templateEditor.id);if(requestError){setError(errorMessage(requestError));return;}setTemplateEditor(null);await loadTemplates();}}/>}</>;
}

function TemplateEditor({template,onClose,onSaved,onDelete}:{template:QuickTemplate;onClose:()=>void;onSaved:()=>void;onDelete:()=>void}){
  const [title,setTitle]=useState(template.title);const [weekday,setWeekday]=useState(template.weekday);const [hour,setHour]=useState(template.time.slice(0,2));const [minute,setMinute]=useState(template.time.slice(3,5));const [location,setLocation]=useState(template.location);const [duration,setDuration]=useState(template.duration);const [capacity,setCapacity]=useState(template.capacity);const [bookingOpenHours,setBookingOpenHours]=useState(template.booking_open_hours);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase||!template.id){setError('Шаблоните още не са свързани с базата.');return;}setBusy(true);const {error:requestError}=await supabase.from('training_templates').update({title:title.trim(),weekday,start_time:`${hour}:${minute}:00`,location:location.trim(),duration,capacity,booking_open_hours:bookingOpenHours}).eq('id',template.id);setBusy(false);if(requestError)setError(errorMessage(requestError));else onSaved();}
  return <div className="editor-backdrop template-editor-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="training-editor template-editor" onSubmit={save}><div className="editor-handle"/><div className="editor-title"><div><span>ГОТОВА ТРЕНИРОВКА</span><h2>Редактирай шаблона</h2></div><button type="button" onClick={onClose}>×</button></div><label>ИМЕ<input value={title} onChange={event=>setTitle(event.target.value)} required/></label><label>ДЕН<select value={weekday} onChange={event=>setWeekday(Number(event.target.value))}>{shortWeekdays.slice(1).map((day,index)=><option key={day} value={index+1}>{day}</option>)}</select></label><label>ЧАС<div className="split-time template-time"><select value={hour} onChange={event=>setHour(event.target.value)}>{Array.from({length:24},(_,index)=><option key={index} value={String(index).padStart(2,'0')}>{String(index).padStart(2,'0')}</option>)}</select><span>:</span><select value={minute} onChange={event=>setMinute(event.target.value)}>{[0,10,20,30,40,45,50].map(value=><option key={value} value={String(value).padStart(2,'0')}>{String(value).padStart(2,'0')}</option>)}</select><strong>{hour}:{minute}</strong></div></label><label>МЯСТО<input value={location} onChange={event=>setLocation(event.target.value)} required/></label><div className="editor-row"><label>МЕСТА<input type="number" min="1" max="500" value={capacity} onChange={event=>setCapacity(Number(event.target.value))}/></label><label>МИНУТИ<input type="number" min="10" max="300" step="5" value={duration} onChange={event=>setDuration(Number(event.target.value))}/></label></div><label>АКТИВИРАНЕ ПРЕДИ ТРЕНИРОВКАТА<input type="number" min="0" max="720" value={bookingOpenHours} onChange={event=>setBookingOpenHours(Number(event.target.value))}/></label>{error&&<div className="login-error">{error}</div>}<div className="template-editor-actions"><button className="template-delete" type="button" onClick={onDelete}>Изтрий шаблона</button><button className="editor-save" disabled={busy}>{busy?'Запазване…':'Запази шаблона'}</button></div></form></div>;
}

function ModernDatePicker({value,onChange}:{value:string;onChange:(date:string)=>void}){
  const selected=useMemo(()=>{const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d);},[value]);
  const [view,setView]=useState(()=>new Date(selected.getFullYear(),selected.getMonth(),1));
  const [open,setOpen]=useState(false);
  const days=useMemo(()=>{const year=view.getFullYear(),month=view.getMonth(),offset=(new Date(year,month,1).getDay()+6)%7;return Array.from({length:42},(_,index)=>{const date=new Date(year,month,index-offset+1);const iso=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;return{date,iso,muted:date.getMonth()!==month};});},[view]);
  const today=new Date().toISOString().slice(0,10);
  return <div className="modern-date-picker"><button type="button" className="modern-date-toggle" aria-expanded={open} onClick={()=>{setView(new Date(selected.getFullYear(),selected.getMonth(),1));setOpen(!open);}}><span>Избрана дата</span><strong>{String(selected.getDate()).padStart(2,'0')}.{String(selected.getMonth()+1).padStart(2,'0')}.{selected.getFullYear()}</strong><i>{open?'⌃':'⌄'}</i></button>{open&&<div className="modern-date-calendar"><div className="modern-date-head"><button type="button" onClick={()=>setView(new Date(view.getFullYear(),view.getMonth()-1,1))}>‹</button><strong>{months[view.getMonth()]} {view.getFullYear()}</strong><button type="button" onClick={()=>setView(new Date(view.getFullYear(),view.getMonth()+1,1))}>›</button></div><div className="modern-date-week">{['ПН','ВТ','СР','ЧТ','ПТ','СБ','НД'].map(day=><span key={day}>{day}</span>)}</div><div className="modern-date-grid">{days.map(item=><button type="button" key={item.iso} className={`${item.muted?'muted ':''}${item.iso===value?'selected ':''}${item.iso===today?'today':''}`} onClick={()=>{onChange(item.iso);if(item.muted)setView(new Date(item.date.getFullYear(),item.date.getMonth(),1));setOpen(false);}}>{item.date.getDate()}</button>)}</div></div>}</div>;
}

function sortSessions(a:TrainingSession,b:TrainingSession){return `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`);}
function nextWeekday(target:number){const today=new Date();const current=today.getDay()||7;let diff=(target-current+7)%7;if(diff===0)diff=7;today.setDate(today.getDate()+diff);return `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;}

function LoginPanel(){
  const [mode,setMode]=useState<'login'|'activate'>('login');const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [showPassword,setShowPassword]=useState(false);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!supabase)return;setBusy(true);setError('');setMessage('');const form=new FormData(event.currentTarget);const email=String(form.get('email')||'').trim();const password=String(form.get('password')||'');const remember=form.get('remember')==='on';window.localStorage.setItem('trainings-remember-login',remember?'1':'0');if(mode==='login'){const {error:authError}=await supabase.auth.signInWithPassword({email,password});if(authError)setError(authError.message==='Invalid login credentials'?'Грешен имейл или парола.':authError.message);}else{const {error:authError}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.href.split('#')[0]}});if(authError)setError(authError.message);else setMessage('Профилът е създаден. Провери имейла си за потвърждение, след което влез.');}setBusy(false);};
  return <main className="login-shell matched-login-shell"><a className="matched-login-back" href={`${baseUrl}trainings.html`}>← Назад към сайта</a><section className="login-card matched-login-card"><div className="matched-login-mark">F</div><h1>{mode==='login'?'Admin Panel':'Активирай покана'}</h1><p className="matched-login-subtitle">FIT BODY CENTER</p><form onSubmit={submit}><label>ПОТРЕБИТЕЛСКИ ИМЕЙЛ<input type="email" name="email" required autoComplete="email" placeholder="name@example.com"/></label><label>ПАРОЛА<div className="password-field"><input type={showPassword?'text':'password'} name="password" required minLength={8} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="Минимум 8 символа"/><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Скрий паролата':'Покажи паролата'}>◉</button></div></label>{mode==='login'&&<label className="remember-login"><input type="checkbox" name="remember" defaultChecked/><span>Запомни ме на това устройство</span></label>}{error&&<div className="login-error">{error}</div>}{message&&<div className="login-message">{message}</div>}<button className="login-submit" disabled={busy}>{busy?'Моля, изчакай…':mode==='login'?'ВХОД':'Създай профил'}</button></form><button className="login-switch" onClick={()=>{setMode(mode==='login'?'activate':'login');setError('');setMessage('');}}>{mode==='login'?'Имаш покана? Активирай профил':'Обратно към вход'}</button></section></main>;
}
function MissingConfiguration(){return <main className="login-shell"><section className="login-card"><div className="login-brand"><span>FIT</span><strong>BODY CENTER</strong></div><span className="login-kicker">НАСТРОЙКА</span><h1>Login-ът очаква новия Supabase проект</h1><p>За защитения админ панел трябва да са добавени Project URL и Publishable key.</p><a className="back-to-public" href={`${baseUrl}trainings.html`}>← Назад към сайта</a></section></main>;}
function AdminLoading(){return <main className="login-shell"><div className="admin-loading"><strong>F</strong><span>Зареждане</span></div></main>;}
function AccessDenied({email}:{email:string}){return <main className="login-shell"><section className="login-card"><span className="login-kicker">НЯМА ДОСТЪП</span><h1>Този профил няма администраторски достъп.</h1><p>{email}</p><button className="login-submit" onClick={()=>supabase?.auth.signOut()}>Изход</button><a className="back-to-public" href={`${baseUrl}trainings.html`}>← Назад към сайта</a></section></main>;}
