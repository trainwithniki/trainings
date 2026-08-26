'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from './supabase';
import {
  BookingReceipt, dayName, defaultSiteContent, errorMessage, isBookingOpen, isCompleted, loadSessions, loadSiteContent, months, parseLocal,
  prettyDate, shortTime, SiteContent, Tariff, TrainingSession,
} from './training-data';
import { trainingIconForTitle, trainingPageForTitle, trainingPageFromPath, trainingPages, type TrainingPage } from './training-pages';

type SessionState='open'|'upcoming'|'completed';
type PendingBooking={sessionId:string;sessionTitle:string;location:string;date:string;startTime:string;friend:boolean;name:string;phone:string;tariff:Tariff;bookedBy:string|null};
const bookingKey='fit-body-center-live-bookings';
const baseUrl=import.meta.env.BASE_URL;
const activeTrainingPage=trainingPageFromPath(window.location.pathname);

function stateOf(session:TrainingSession,now=Date.now()):SessionState{return isCompleted(session,now)?'completed':isBookingOpen(session,now)?'open':'upcoming';}
function bookingOpenAt(session:TrainingSession){return parseLocal(session.date,session.start_time).getTime()-session.booking_open_hours*60*60*1000;}
function formatDateTime(time:number){const value=new Date(time);return `${String(value.getDate()).padStart(2,'0')}.${String(value.getMonth()+1).padStart(2,'0')} в ${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')}`;}
function openingText(session:TrainingSession,now:number){const remaining=Math.max(0,bookingOpenAt(session)-now),minutes=Math.ceil(remaining/60000),days=Math.floor(minutes/1440),hours=Math.floor((minutes%1440)/60),mins=minutes%60;const parts:string[]=[];if(days)parts.push(`${days} ${days===1?'ден':'дни'}`);if(days||hours)parts.push(`${hours} ${hours===1?'час':'часа'}`);parts.push(`${mins} ${mins===1?'минута':'минути'}`);return parts.join(', ');}
function mondayOf(time:number){const value=new Date(time);value.setHours(0,0,0,0);value.setDate(value.getDate()-((value.getDay()+6)%7));return value;}

export default function PublicApp(){
  const [allSessions,setAllSessions]=useState<TrainingSession[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [modal,setModal]=useState<'booking'|'friend'|null>(null);
  const [pendingBooking,setPendingBooking]=useState<PendingBooking|null>(null);
  const [bookingCountdown,setBookingCountdown]=useState<number|null>(null);
  const [bookingBusy,setBookingBusy]=useState(false);
  const [receipts,setReceipts]=useState<Record<string,BookingReceipt>>({});
  const [notice,setNotice]=useState('');
  const [calendarView,setCalendarView]=useState(()=>{const now=new Date();return new Date(now.getFullYear(),now.getMonth(),1);});
  const [clock,setClock]=useState(Date.now());
  const [siteContent,setSiteContent]=useState<SiteContent>(defaultSiteContent);

  const refresh=useCallback(async()=>{
    try{
      const [data,content]=await Promise.all([loadSessions(),loadSiteContent()]);
      const ordered=[...data].sort(sortSessions);
      const visible=activeTrainingPage?ordered.filter(item=>trainingPageForTitle(item.title)?.slug===activeTrainingPage.slug):ordered;
      const requested=new URLSearchParams(window.location.search).get('session');
      setAllSessions(ordered);setSiteContent(content);setLoadError('');
      setSelectedId(current=>visible.some(item=>item.id===current)?current:(visible.find(item=>item.id===requested)??visible.find(item=>stateOf(item)!=='completed')??visible.at(-1))?.id??'');
    }catch(reason){setLoadError(errorMessage(reason));}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    const saved=window.localStorage.getItem(bookingKey);if(saved){try{setReceipts(JSON.parse(saved));}catch{window.localStorage.removeItem(bookingKey);}}
    refresh();
    if(!supabase)return;
    const client=supabase;
    const channel=client.channel('trainings-public-live').on('postgres_changes',{event:'*',schema:'public',table:'training_sessions'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'site_content'},refresh).subscribe();
    return()=>{client.removeChannel(channel);};
  },[refresh]);
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{document.body.classList.toggle('modal-open',Boolean(modal||pendingBooking));return()=>document.body.classList.remove('modal-open');},[modal,pendingBooking]);
  useEffect(()=>{if(!pendingBooking||bookingBusy||bookingCountdown===null)return;const timer=window.setTimeout(()=>{if(bookingCountdown===0)void completeBooking(pendingBooking);else setBookingCountdown(bookingCountdown-1);},bookingCountdown===0?2000:1000);return()=>window.clearTimeout(timer);},[pendingBooking?.sessionId,bookingCountdown,bookingBusy]);

  const sessions=activeTrainingPage?allSessions.filter(item=>trainingPageForTitle(item.title)?.slug===activeTrainingPage.slug):allSessions;
  const selected=sessions.find(item=>item.id===selectedId)??null;
  const ownReceipt=selected?receipts[selected.id]:undefined;
  const bookedSessions=allSessions.filter(item=>Boolean(receipts[item.id])).sort(sortSessions);
  const weekStart=mondayOf(clock),afterNextWeek=new Date(weekStart);afterNextWeek.setDate(afterNextWeek.getDate()+14);
  const monthStart=new Date(new Date(clock).getFullYear(),new Date(clock).getMonth(),1),monthEnd=new Date(new Date(clock).getFullYear(),new Date(clock).getMonth()+1,1);
  const upcoming=sessions.filter(item=>{const date=parseLocal(item.date);return stateOf(item,clock)!=='completed'&&date>=weekStart&&date<afterNextWeek;}).sort(sortSessions);
  const completed=sessions.filter(item=>{const date=parseLocal(item.date);return stateOf(item,clock)==='completed'&&date>=monthStart&&date<monthEnd;}).sort((a,b)=>-sortSessions(a,b));
  const nextInactive=sessions.filter(item=>item.status!=='closed'&&stateOf(item,clock)==='upcoming'&&bookingOpenAt(item)>clock).sort((a,b)=>bookingOpenAt(a)-bookingOpenAt(b))[0];

  const calendarDays=useMemo(()=>{
    const year=calendarView.getFullYear(),month=calendarView.getMonth(),offset=(new Date(year,month,1).getDay()+6)%7;
    return Array.from({length:42},(_,index)=>{const date=new Date(year,month,index-offset+1);const iso=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;return{day:date.getDate(),date:iso,muted:date.getMonth()!==month,session:sessions.find(item=>item.date===iso)};});
  },[calendarView,sessions]);

  function storeReceipts(next:Record<string,BookingReceipt>){setReceipts(next);window.localStorage.setItem(bookingKey,JSON.stringify(next));}
  function submitBooking(event:FormEvent<HTMLFormElement>,friend=false){
    event.preventDefault();if(!supabase||!selected)return;
    const form=new FormData(event.currentTarget);const name=String(form.get('name')||'').trim();const phone=String(form.get('phone')||'').trim();const tariff=String(form.get('tariff')||'none') as Tariff;
    const startedAt=Date.now();setClock(startedAt);setPendingBooking({sessionId:selected.id,sessionTitle:selected.title,location:selected.location,date:selected.date,startTime:selected.start_time,friend,name,phone,tariff,bookedBy:friend&&ownReceipt?ownReceipt.name:null});setBookingCountdown(5);setModal(null);
  }
  async function completeBooking(pending:PendingBooking){
    if(!supabase)return;setBookingBusy(true);setBookingCountdown(null);
    const {data,error}=await supabase.rpc('book_training',{p_session_id:pending.sessionId,p_name:pending.name,p_phone:pending.phone,p_tariff:pending.tariff,p_booked_by:pending.bookedBy});
    setBookingBusy(false);setPendingBooking(null);
    if(error){setNotice(errorMessage(error));return;}
    const row=(data as {registration_id:string;cancellation_token:string}[]|null)?.[0];
    if(!pending.friend&&row)storeReceipts({...receipts,[pending.sessionId]:{sessionId:pending.sessionId,registrationId:row.registration_id,cancellationToken:row.cancellation_token,name:pending.name}});
    setNotice(pending.friend?`${pending.name} е добавен/а към тренировката.`:'Записването е потвърдено.');await refresh();
  }
  async function unsubscribeSession(session:TrainingSession){
    const receipt=receipts[session.id];if(!supabase||!receipt||!window.confirm(`Сигурни ли сте, че искате да се отпишете от „${session.title}“ на ${prettyDate(session.date)} в ${shortTime(session.start_time)} ч.?`))return;
    const {data,error}=await supabase.rpc('cancel_training_registration',{p_registration_id:receipt.registrationId,p_cancellation_token:receipt.cancellationToken});
    if(error||!data){setNotice(error?errorMessage(error):'Записването не беше намерено.');return;}
    const next={...receipts};delete next[session.id];storeReceipts(next);setNotice(`Успешно се отписахте от ${session.title}.`);await refresh();
  }
  async function unsubscribe(){if(selected)await unsubscribeSession(selected);}
  function selectBookedSession(session:TrainingSession){
    if(sessions.some(item=>item.id===session.id)){setSelectedId(session.id);setCalendarView(new Date(parseLocal(session.date).getFullYear(),parseLocal(session.date).getMonth(),1));return;}
    const page=trainingPageForTitle(session.title);
    window.location.href=page?`${baseUrl}trainings/${page.slug}.html?session=${encodeURIComponent(session.id)}`:`${baseUrl}trainings.html?session=${encodeURIComponent(session.id)}`;
  }

  return <main className="site-shell fbc-public live-public">
    {activeTrainingPage?<TrainingPageHero page={activeTrainingPage}/>:<section className="hero-card hero-artwork"><img src={`${baseUrl}fit-body-center-hero.webp`} alt="Fit Body Center — постигни своите цели със сила, мотивация и енергия" fetchPriority="high"/><div className="hero-accessible-copy"><span>{siteContent.hero_eyebrow}</span><h1>{siteContent.hero_title}</h1><p>{siteContent.hero_description}</p><span>{siteContent.hero_tags}</span></div></section>}

    {!supabaseConfigured&&<section className="public-empty"><strong>Сайтът очаква връзка с базата.</strong><p>Supabase настройките не са заредени.</p></section>}
    {loadError&&<section className="public-empty error"><strong>Тренировките не могат да се заредят.</strong><p>{loadError}</p></section>}
    {loading&&<section className="public-empty"><strong>Зареждане…</strong></section>}
    {!loading&&!selected&&<section className="public-empty ready"><strong>{activeTrainingPage?`Очаквайте следващата тренировка „${activeTrainingPage.title}“`:'Очаквайте новите тренировки'}</strong><p>Календарът е готов. Скоро тук ще се появят тренировки за записване.</p></section>}
    {selected&&<FeaturedSession session={selected} now={clock} own={Boolean(ownReceipt)} onBook={()=>setModal('booking')} onUnsubscribe={unsubscribe} onFriend={()=>setModal('friend')}/>}

    {bookedSessions.length>0&&<section className="own-bookings"><div className="own-bookings-heading"><span className="own-check">✓</span><div><strong>Вашите записвания</strong><small>{bookedSessions.length} {bookedSessions.length===1?'тренировка':'тренировки'}</small></div></div><div className="own-bookings-list">{bookedSessions.map(session=><div key={session.id} className={`own-booking-row ${session.id===selectedId?'selected':''}`}><button type="button" className="own-booking-select" onClick={()=>selectBookedSession(session)}><strong>{session.title}</strong><span>{prettyDate(session.date)} · {dayName(session.date)} · <b>{shortTime(session.start_time)} ч.</b></span><small>{session.location}</small></button><button type="button" className="own-booking-cancel" onClick={()=>void unsubscribeSession(session)}>Отпиши се</button></div>)}</div></section>}

    <section className="multisport-strip"><img src={`${baseUrl}multisport-card.webp`} alt="MultiSport карта"/><div><strong>Работи с MultiSport</strong><span>Можеш да използваш своята карта за тренировката.</span></div></section>

    <TrainingDirectory current={activeTrainingPage}/>

    <section className="section-block schedule-section exact-section"><h2 className="exact-section-title">Календар</h2><div className="calendar-card full-calendar live-calendar"><div className="exact-calendar-head"><button type="button" onClick={()=>setCalendarView(new Date(calendarView.getFullYear(),calendarView.getMonth()-1,1))} aria-label="Предишен месец">‹</button><strong>{months[calendarView.getMonth()]} {calendarView.getFullYear()} г.</strong><button type="button" onClick={()=>setCalendarView(new Date(calendarView.getFullYear(),calendarView.getMonth()+1,1))} aria-label="Следващ месец">›</button></div><div className="weekdays">{['ПН','ВТ','СР','ЧТ','ПТ','СБ','НД'].map(day=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendarDays.map(item=>{const sessionState=item.session?stateOf(item.session):'';const classes=[item.muted?'muted':'',item.date===new Date().toISOString().slice(0,10)?'today':'',sessionState,item.session?.id===selectedId?'selected':''].filter(Boolean).join(' ');return <button type="button" key={item.date} className={classes} onClick={()=>{if(item.session){setSelectedId(item.session.id);setCalendarView(new Date(parseLocal(item.date).getFullYear(),parseLocal(item.date).getMonth(),1));if(sessionState==='open'&&item.session.registration_count<item.session.capacity)setModal(receipts[item.session.id]?'friend':'booking');}}} aria-label={item.session?`${item.session.title}, ${prettyDate(item.date)}`:prettyDate(item.date)}><span>{item.day}</span>{item.session&&sessionState==='open'&&<small>{Math.max(0,item.session.capacity-item.session.registration_count)}</small>}</button>;})}</div>{nextInactive&&<div className="calendar-open-note">Ще бъде отворено за записване след: <strong>{openingText(nextInactive,clock)}</strong><span>({formatDateTime(bookingOpenAt(nextInactive))} ч.)</span><small>За тренировката на {nextInactive.date.slice(8)}.{nextInactive.date.slice(5,7)} · {shortTime(nextInactive.start_time)}</small></div>}<div className="calendar-legend"><span><i className="dot open-dot"/>Активна</span><span><i className="dot upcoming-dot"/>До записване</span><span><i className="dot completed-dot"/>Проведена</span></div></div></section>

    <section className="session-list-section exact-section"><h2 className="exact-section-title">Тази и следващата седмица</h2><p className="exact-section-copy">Тук се показват само тренировките от текущата седмица и следващата. Календарът по-горе остава пълен.</p><div className="session-group-title upcoming-title"><strong>Предстоящи</strong><span>{upcoming.length} тренировки</span></div>{upcoming.length?<div className="session-list">{upcoming.map(session=><SessionCard key={session.id} session={session} now={clock} selected={session.id===selectedId} onSelect={()=>setSelectedId(session.id)} onBook={()=>{setSelectedId(session.id);setModal('booking');}}/>)}</div>:<div className="public-list-empty">Няма предстоящи тренировки за текущата и следващата седмица.</div>}<div className="session-group-title completed-title"><strong>Проведени</strong><span>{months[new Date(clock).getMonth()]} {new Date(clock).getFullYear()} г.</span></div>{completed.length?<div className="session-list">{completed.map(session=><SessionCard key={session.id} session={session} now={clock} selected={session.id===selectedId} onSelect={()=>setSelectedId(session.id)}/>)}</div>:<div className="public-list-empty">Няма проведени тренировки през текущия месец.</div>}</section>

    <section className="location-section exact-section"><h2 className="exact-section-title">Точна локация</h2><p className="exact-section-copy">Fit Body Center · гр. Варна</p><a className="map-card" href="https://www.google.com/maps/search/?api=1&query=Fit+Body+Center+Varna" target="_blank" rel="noreferrer"><img src={`${baseUrl}fit-body-center-map.png`} alt="Карта до Fit Body Center"/><span><b>📍 Fit Body Center</b><small>гр. Варна, ж.к. Възраждане IV, над парка, срещу бл. 78</small></span></a><a className="maps-button" href="https://www.google.com/maps/search/?api=1&query=Fit+Body+Center+Varna" target="_blank" rel="noreferrer">Отвори в Google Maps</a></section>
    <footer className="site-footer"><a href={`${baseUrl}trainings/admin.html`}>Powered by Trainings</a></footer>
    {notice&&<button className="toast" onClick={()=>setNotice('')}>{notice}<span>×</span></button>}
    {selected&&selected.status!=='closed'&&stateOf(selected,clock)!=='completed'&&<div className="sticky-booking exact-sticky"><button className={stateOf(selected,clock)==='upcoming'?'waiting':''} disabled={stateOf(selected,clock)==='upcoming'} onClick={()=>ownReceipt?setModal('friend'):setModal('booking')}><span>ТРЕНИРОВКА НА {selected.date.slice(8)}.{selected.date.slice(5,7)} · {shortTime(selected.start_time)}</span><strong>{stateOf(selected,clock)==='upcoming'?`ЗАПИСВАНЕ ОТ ${formatDateTime(bookingOpenAt(selected))}`:ownReceipt?'ЗАПИШИ ПРИЯТЕЛ':`ЗАПИШИ СЕ · ${Math.max(0,selected.capacity-selected.registration_count)} СВОБОДНИ МЕСТА`}</strong></button></div>}
    {modal&&selected&&<BookingModal friend={modal==='friend'} session={selected} onClose={()=>setModal(null)} onSubmit={submitBooking}/>}
    {pendingBooking&&<BookingConfirmation pending={pendingBooking} seconds={bookingCountdown??0} busy={bookingBusy} onConfirm={()=>{if(!bookingBusy)void completeBooking(pendingBooking);}} onCancel={()=>{if(!bookingBusy){setBookingCountdown(null);setPendingBooking(null);setNotice('Записването беше отказано.');}}}/>}
  </main>;
}

function FeaturedSession({session,now,own,onBook,onUnsubscribe,onFriend}:{session:TrainingSession;now:number;own:boolean;onBook:()=>void;onUnsubscribe:()=>void;onFriend:()=>void}){
  const state=stateOf(session,now),date=parseLocal(session.date),free=Math.max(0,session.capacity-session.registration_count);
  const status=state==='open'?'Записването е отворено':state==='completed'?'Проведена':'Записването е затворено';
  return <section className={`featured-session exact-featured ${state} ${session.title.length>16?'long-title-session':''}`}><div className={`exact-featured-head ${state==='open'?'has-training-icon':''}`}><div className="exact-date-block"><div><strong>{date.getDate()}</strong><b>.{String(date.getMonth()+1).padStart(2,'0')}</b></div><small>{date.getFullYear()}</small><span>{dayName(session.date)}</span><em>{shortTime(session.start_time)}</em></div><div className="exact-featured-name"><div className="fbc-training-title"><h2 className={`training-title-words ${session.title.length>16?'long-training-title':''}`}>{session.title.trim().split(/\s+/).map((word,index)=><span key={`${word}-${index}`}>{word}</span>)}</h2></div><span className={`exact-status ${state}`}>{status}</span>{state==='upcoming'&&session.status!=='closed'&&<small className="status-opening-detail">Отваря след {openingText(session,now)}<b>{formatDateTime(bookingOpenAt(session))} ч.</b></small>}</div>{state==='open'&&<TrainingIcon title={session.title}/>}</div>{state==='open'&&<BookingCountdown session={session} now={now}/>}<div className="exact-essentials"><div><span>МЯСТО</span><strong>{session.location.toUpperCase()}</strong></div><Stopwatch minutes={session.duration}/></div><div className="exact-capacity"><div><span>ЗАЕТИ МЕСТА<strong>{session.registration_count}</strong></span><span>СВОБОДНИ<strong>{free}</strong></span></div><i><b style={{width:`${Math.min(100,session.registration_count/session.capacity*100)}%`}}/></i></div>{state==='open'&&(own?<div className="exact-own-actions"><button onClick={onUnsubscribe}>ОТПИШИ СЕ</button><button onClick={onFriend}>ЗАПИШИ ПРИЯТЕЛ</button></div>:<button className="exact-book-button" onClick={onBook} disabled={free===0}>{free===0?'НЯМА СВОБОДНИ МЕСТА':'ЗАПИШИ СЕ'}</button>)}{state!=='open'&&<button className="exact-book-button" disabled>{state==='completed'?'ТРЕНИРОВКАТА Е ПРОВЕДЕНА':session.status==='closed'?'ЗАПИСВАНЕТО Е ЗАТВОРЕНО':`ЗАПИСВАНЕ ОТ ${formatDateTime(bookingOpenAt(session))}`}</button>}</section>;
}

function TrainingIcon({title,compact=false}:{title:string;compact?:boolean}){
  const icon=trainingIconForTitle(title);
  return <div className={`training-icon ${compact?'compact':''}`} aria-hidden="true"><img src={`${baseUrl}training-icons/${icon}`} alt="" loading={compact?'lazy':'eager'}/></div>;
}

function TrainingPageHero({page}:{page:TrainingPage}){
  return <section className="training-page-hero"><a href={`${baseUrl}trainings.html`}>← Всички тренировки</a><div className="training-page-copy"><span>FIT BODY CENTER</span><h1>{page.title}</h1><p>{page.description}</p><small>Избери дата и запази своето място.</small></div><div className="training-page-art"><img src={`${baseUrl}training-icons/${page.icon}`} alt={page.title} fetchPriority="high"/></div></section>;
}

function TrainingDirectory({current}:{current?:TrainingPage}){
  const pages=current?trainingPages.filter(page=>page.slug!==current.slug):trainingPages;
  return <section className="training-directory exact-section"><div className="training-directory-heading"><div><span>{current?'РАЗГЛЕДАЙ ОЩЕ':'FIT BODY CENTER'}</span><h2>{current?'Други тренировки':'Избери тренировка'}</h2></div>{current&&<a href={`${baseUrl}trainings.html`}>Виж целия график →</a>}</div><div className="training-directory-grid">{pages.map(page=><a href={`${baseUrl}trainings/${page.slug}.html`} key={page.slug}><div><img src={`${baseUrl}training-icons/${page.icon}`} alt="" loading="lazy"/></div><span><strong>{page.title}</strong><small>Виж графика <b>→</b></small></span></a>)}</div></section>;
}

function SessionCard({session,now,selected,onSelect,onBook}:{session:TrainingSession;now:number;selected:boolean;onSelect:()=>void;onBook?:()=>void}){
  const state=stateOf(session,now),date=parseLocal(session.date),free=Math.max(0,session.capacity-session.registration_count);
  const status=state==='open'?'Записването е отворено':state==='completed'?'Проведена':'Записването е затворено';
  return <article className={`exact-session-card ${state} ${selected?'selected':''} ${session.title.length>16?'long-title-card':''}`}><button type="button" className="exact-session-top has-list-icon" onClick={onSelect}><div className="exact-session-date"><strong>{date.getDate()}.{String(date.getMonth()+1).padStart(2,'0')}</strong><span>{dayName(session.date)}</span><em>{shortTime(session.start_time)}</em></div><div className="exact-session-info"><h3 className={session.title.length>16?'long-training-title':''}>{session.title}</h3><span className={`exact-status ${state}`}>{status}</span>{state==='upcoming'&&session.status!=='closed'&&<small className="status-opening-detail compact">Отваря след {openingText(session,now)}</small>}</div><TrainingIcon title={session.title} compact/></button><div className="exact-session-stats"><Stopwatch minutes={session.duration}/><div className="exact-capacity"><div><span>ЗАЕТИ<strong>{session.registration_count}</strong></span><span>СВОБОДНИ<strong>{free}</strong></span></div><i><b style={{width:`${Math.min(100,session.registration_count/session.capacity*100)}%`}}/></i></div></div>{state==='open'&&<BookingCountdown session={session} now={now} compact/>}{state==='open'&&<button className="exact-session-book" type="button" onClick={onBook} disabled={!onBook||free===0}>{free===0?'НЯМА МЕСТА':'ЗАПИШИ СЕ'}</button>}</article>;
}
function Stopwatch({minutes}:{minutes:number}){return <div className="exact-stopwatch"><i/><div><strong>{minutes}</strong><span>МИН.</span></div></div>;}
function BookingCountdown({session,now,compact=false}:{session:TrainingSession;now:number;compact?:boolean}){const remaining=Math.max(0,parseLocal(session.date,session.start_time).getTime()-now),seconds=Math.floor(remaining/1000),values=[Math.floor(seconds/86400),Math.floor(seconds%86400/3600),Math.floor(seconds%3600/60),seconds%60],labels=['дни','часа','минути','секунди'];return <div className={`exact-countdown ${compact?'compact':''}`}><div><strong>⏳ ЗАПИСВАНЕТО СПИРА СЛЕД</strong><span>Краен час: {session.date.slice(8)}.{session.date.slice(5,7)} · {shortTime(session.start_time)}</span></div><section>{values.map((value,index)=><div key={labels[index]}><strong>{String(value).padStart(2,'0')}</strong><span>{labels[index]}</span></div>)}</section></div>;}

function BookingModal({friend,session,onClose,onSubmit}:{friend:boolean;session:TrainingSession;onClose:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>,friend?:boolean)=>void}){
  return <div className="booking-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="booking-modal live-booking-modal" onSubmit={event=>onSubmit(event,friend)}><div className="modal-handle"/><div className="modal-title"><div><span>{friend?'ДОБАВЯНЕ':'ЗАПИСВАНЕ'}</span><h2>Запази своето място</h2></div><button type="button" onClick={onClose}>×</button></div><div className="modal-session booking-session-summary"><strong>{session.title}</strong><div><b>{session.date.slice(8)}.{session.date.slice(5,7)}.{session.date.slice(0,4)}</b><em>{shortTime(session.start_time)}</em></div><span>{dayName(session.date)} · {session.location}</span></div><label>ИМЕ И ФАМИЛИЯ<input name="name" required minLength={2} placeholder={friend?'Име на приятеля':'Вашето име'}/></label><label>ТЕЛЕФОН ЗА КОНТАКТ<input name="phone" type="tel" required inputMode="tel" placeholder="08xx xxx xxx"/></label><fieldset className="tariff-choices"><legend>НАЧИН НА ПОСЕЩЕНИЕ</legend><label><input type="radio" name="tariff" value="card8"/><span><i className="mini-visit-card">8</i><strong>Карта 8 посещения</strong></span></label><label><input type="radio" name="tariff" value="card12"/><span><i className="mini-visit-card">12</i><strong>Карта 12 посещения</strong></span></label><label><input type="radio" name="tariff" value="none" defaultChecked/><span><i>✓</i><strong>Без карта</strong></span></label><label><input type="radio" name="tariff" value="multisport"/><span><img src={`${baseUrl}multisport-card.webp`} alt="MultiSport"/><strong>Имам карта MultiSport</strong></span></label></fieldset><button className="modal-submit" type="submit">{friend?'Добави приятел':'Потвърди записването'}</button></form></div>;
}

function BookingConfirmation({pending,seconds,busy,onConfirm,onCancel}:{pending:PendingBooking;seconds:number;busy:boolean;onConfirm:()=>void;onCancel:()=>void}){return <div className="booking-backdrop pending-booking-backdrop"><section className="booking-confirmation" role="dialog" aria-modal="true" aria-labelledby="booking-confirmation-title"><span>ПОТВЪРЖДЕНИЕ</span><h2 id="booking-confirmation-title">Записвате се за</h2><strong>{pending.sessionTitle}</strong><div className="confirmation-session"><b>{pending.date.slice(8)}.{pending.date.slice(5,7)}.{pending.date.slice(0,4)}</b><em>{shortTime(pending.startTime)}</em><small>{dayName(pending.date)} · {pending.location}</small></div><p>{busy?'Потвърждаваме записването…':'Записването ще бъде потвърдено след'}</p><div className="confirmation-countdown">{busy?'…':seconds}</div><div className="confirmation-actions"><button className="confirmation-ok" type="button" onClick={onConfirm} disabled={busy}>ОК</button><button className="confirmation-cancel" type="button" onClick={onCancel} disabled={busy}>Откажи записването</button></div></section></div>;}

function sortSessions(a:TrainingSession,b:TrainingSession){return `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`);}
