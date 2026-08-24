'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type SessionState = 'open' | 'upcoming' | 'completed';
type Session = { id:string; date:string; time:string; title:string; duration:number; capacity:number; booked:number; state:SessionState };

const sessions: Session[] = [
  { id:'pilates-25', date:'2026-08-25', time:'19:30', title:'Pilates', duration:60, capacity:20, booked:7, state:'open' },
  { id:'functional-27', date:'2026-08-27', time:'18:30', title:'Functional Training', duration:60, capacity:18, booked:0, state:'upcoming' },
  { id:'stretching-23', date:'2026-08-23', time:'10:00', title:'Stretching', duration:60, capacity:20, booked:11, state:'completed' },
  { id:'pilates-18', date:'2026-08-18', time:'19:30', title:'Pilates', duration:60, capacity:20, booked:16, state:'completed' },
  { id:'step-16', date:'2026-08-16', time:'10:00', title:'Step Aerobics', duration:60, capacity:20, booked:14, state:'completed' },
];

const months = ['януари','февруари','март','април','май','юни','юли','август','септември','октомври','ноември','декември'];
const shortMonths = ['ЯН','ФЕВ','МАР','АПР','МАЙ','ЮНИ','ЮЛИ','АВГ','СЕП','ОКТ','НОЕ','ДЕК'];
const weekdays = ['Понеделник','Вторник','Сряда','Четвъртък','Петък','Събота','Неделя'];
const bookingKey = 'fit-body-center-preview-booking';
const baseUrl = import.meta.env.BASE_URL;

function parseLocal(date:string,time='00:00') { const [y,m,d]=date.split('-').map(Number); const [h,min]=time.split(':').map(Number); return new Date(y,m-1,d,h,min); }
function dayName(date:string) { return weekdays[(parseLocal(date).getDay()+6)%7]; }
function prettyDate(date:string,year=false) { const value=parseLocal(date); return `${value.getDate()} ${months[value.getMonth()]}${year?` ${value.getFullYear()}`:''}`; }
function countdown(target:Date,now:number) { const diff=Math.max(0,target.getTime()-now); if(!diff)return 'Записването вече е отворено'; const d=Math.floor(diff/86400000); const h=Math.floor((diff%86400000)/3600000); const m=Math.floor((diff%3600000)/60000); const s=Math.floor((diff%60000)/1000); return [d?`${d} дни`:'',`${h} ч.`,`${m} мин.`,`${s} сек.`].filter(Boolean).join(' '); }
function countdownParts(target:Date,now:number){const diff=Math.max(0,target.getTime()-now);return {days:Math.floor(diff/86400000),hours:Math.floor((diff%86400000)/3600000),minutes:Math.floor((diff%3600000)/60000),seconds:Math.floor((diff%60000)/1000)}}

export default function Home() {
  const [selectedId,setSelectedId]=useState(sessions[0].id);
  const [now,setNow]=useState(Date.now());
  const [modal,setModal]=useState<'booking'|'friend'|null>(null);
  const [booking,setBooking]=useState<{sessionId:string;name:string;multisport:boolean;friends:number}|null>(null);
  const [notice,setNotice]=useState('');
  const selected=sessions.find(item=>item.id===selectedId)??sessions[0];

  useEffect(()=>{ const timer=window.setInterval(()=>setNow(Date.now()),1000); const saved=window.localStorage.getItem(bookingKey); if(saved){try{setBooking(JSON.parse(saved))}catch{window.localStorage.removeItem(bookingKey)}} return()=>window.clearInterval(timer); },[]);
  useEffect(()=>{ document.body.style.overflow=modal?'hidden':''; return()=>{document.body.style.overflow=''}; },[modal]);

  const calendarDays=useMemo(()=>{ const year=2026,month=7; const offset=(new Date(year,month,1).getDay()+6)%7; const total=new Date(year,month+1,0).getDate(); const previousTotal=new Date(year,month,0).getDate(); return Array.from({length:42},(_,index)=>{let day=index-offset+1,dateMonth=month,muted=false;if(day<1){day=previousTotal+day;dateMonth--;muted=true}if(day>total){day-=total;dateMonth++;muted=true}const date=`${year}-${String(dateMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return{day,date,muted,session:sessions.find(item=>item.date===date)}}); },[]);

  function saveBooking(event:FormEvent<HTMLFormElement>,friend=false){ event.preventDefault(); const form=new FormData(event.currentTarget); const name=String(form.get('name')||'').trim(); if(!name)return; if(friend&&booking){const next={...booking,friends:booking.friends+1};setBooking(next);window.localStorage.setItem(bookingKey,JSON.stringify(next));setNotice(`${name} е добавен/а към тренировката.`)}else{const next={sessionId:selected.id,name,multisport:form.get('multisport')==='on',friends:0};setBooking(next);window.localStorage.setItem(bookingKey,JSON.stringify(next));setNotice('Мястото е запазено успешно.')}setModal(null); }
  function unsubscribe(){window.localStorage.removeItem(bookingKey);setBooking(null);setNotice('Записването е отменено.');}

  const ownSession=booking?sessions.find(item=>item.id===booking.sessionId):null;
  const effectiveBooked=(session:Session)=>session.booked+(booking?.sessionId===session.id?1+booking.friends:0);
  const isOwnSelected=booking?.sessionId===selected.id;
  const freePlaces=Math.max(0,selected.capacity-effectiveBooked(selected));
  const statusText=selected.state==='open'?'Записването е отворено':selected.state==='completed'?'Тренировката е проведена':`Ще бъде отворено за записване след: ${countdown(parseLocal(selected.date,selected.time),now)}`;

  return <main className="site-shell fbc-public">
    <section className="hero-card">
      <div className="hero-glow hero-glow-one"/><div className="hero-glow hero-glow-two"/>
      <div className="brand-lockup"><span className="brand-fit">FIT</span><span className="brand-body">BODY CENTER</span></div>
      <div className="hero-copy"><span className="eyebrow">ТВОЕТО МЯСТО ЗА ДВИЖЕНИЕ</span><h1>Сила. Баланс.<br/>Добро настроение.</h1><p>Групови тренировки за всяко ниво в модерна и приятелска среда.</p></div>
      <div className="hero-tags"><span>Pilates</span><span>Step Aerobics</span><span>Functional</span></div>
    </section>

    <FeaturedSession session={selected} booked={effectiveBooked(selected)} selected={isOwnSelected} status={statusText} now={now} onBook={()=>setModal('booking')} onUnsubscribe={unsubscribe} onFriend={()=>setModal('friend')}/>

    {ownSession&&<section className="own-booking"><span className="own-check">✓</span><div><strong>Записали сте се за {ownSession.title}</strong><p>Fit Body Center · {prettyDate(ownSession.date)} ({dayName(ownSession.date)}) · {ownSession.time} ч.</p></div>{(booking?.friends??0)>0&&<b>+{booking?.friends} приятели</b>}</section>}

    <section className="multisport-strip"><img src={`${baseUrl}multisport-card.webp`} alt="MultiSport карта"/><div><strong>Работи с MultiSport</strong><span>Можеш да използваш своята карта за тренировката.</span></div></section>

    <section className="section-block schedule-section exact-section">
      <h2 className="exact-section-title">Календар</h2>
      <div className="calendar-card full-calendar">
        <div className="exact-calendar-head"><button type="button" aria-label="Предишен месец">‹</button><strong>Август 2026 г.</strong><button type="button" aria-label="Следващ месец">›</button></div>
        <div className="weekdays">{['ПН','ВТ','СР','ЧТ','ПТ','СБ','НД'].map(day=><span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{calendarDays.map((item,index)=>{const classes=[item.muted?'muted':'',item.date==='2026-08-24'?'today':'',item.session?item.session.state:'',item.session?.id===selected.id?'selected':''].filter(Boolean).join(' ');return <button type="button" key={`${item.date}-${index}`} className={classes} onClick={()=>item.session&&setSelectedId(item.session.id)} aria-label={item.session?`${item.session.title}, ${prettyDate(item.date)}`:prettyDate(item.date)}><span>{item.day}</span>{item.session?.state==='open'&&<small>{Math.max(0,item.session.capacity-effectiveBooked(item.session))} места</small>}</button>})}</div>
        <div className="calendar-legend"><span><i className="dot open-dot"/>Активна</span><span><i className="dot upcoming-dot"/>До записване</span><span><i className="dot completed-dot"/>Проведена</span></div>
      </div>
    </section>

    <section className="session-list-section exact-section"><h2 className="exact-section-title">Тази и следващата седмица</h2><p className="exact-section-copy">Тук се показват само тренировките от текущата седмица и следващата. Календарът по-горе остава пълен.</p><div className="session-group-title upcoming-title"><strong>Предстоящи</strong><span>{sessions.filter(item=>item.state!=='completed').length} тренировки</span></div><div className="session-list">{sessions.filter(item=>item.state!=='completed').map(session=><SessionCard key={session.id} session={session} booked={effectiveBooked(session)} selected={session.id===selected.id} onSelect={()=>{setSelectedId(session.id);window.scrollTo({top:500,behavior:'smooth'})}} now={now}/>)}</div><div className="session-group-title completed-title"><strong>Проведени</strong><span>август 2026 г.</span></div><div className="session-list">{sessions.filter(item=>item.state==='completed').map(session=><SessionCard key={session.id} session={session} booked={effectiveBooked(session)} selected={session.id===selected.id} onSelect={()=>{setSelectedId(session.id);window.scrollTo({top:500,behavior:'smooth'})}} now={now}/>)}</div></section>

    <section className="location-section exact-section"><h2 className="exact-section-title">Точна локация</h2><p className="exact-section-copy">Fit Body Center · гр. Варна</p><a className="map-card" href="https://www.google.com/maps/search/?api=1&query=Fit+Body+Center+Varna" target="_blank" rel="noreferrer"><img src={`${baseUrl}fit-body-center-map.png`} alt="Карта до Fit Body Center"/><span><b>📍 Fit Body Center</b><small>гр. Варна, ж.к. Възраждане IV, над парка, срещу бл. 78</small></span></a><a className="maps-button" href="https://www.google.com/maps/search/?api=1&query=Fit+Body+Center+Varna" target="_blank" rel="noreferrer">Отвори в Google Maps</a></section>

    <footer className="site-footer"><a href={`${baseUrl}trainings/admin.html`}>Powered by Trainings</a></footer>
    {notice&&<button className="toast" onClick={()=>setNotice('')}>{notice}<span>×</span></button>}
    {selected.state==='open'&&<div className="sticky-booking exact-sticky"><button onClick={()=>isOwnSelected?setModal('friend'):setModal('booking')}><span>ТРЕНИРОВКА НА {selected.date.slice(8)}.{selected.date.slice(5,7)} · {selected.time}</span><strong>{isOwnSelected?'ЗАПИШИ ПРИЯТЕЛ':`ЗАПИШИ СЕ · ${freePlaces} СВОБОДНИ МЕСТА`}</strong></button></div>}
    {modal&&<BookingModal friend={modal==='friend'} session={selected} onClose={()=>setModal(null)} onSubmit={saveBooking}/>} 
  </main>;
}

function FeaturedSession({session,booked,selected,status,now,onBook,onUnsubscribe,onFriend}:{session:Session;booked:number;selected:boolean;status:string;now:number;onBook:()=>void;onUnsubscribe:()=>void;onFriend:()=>void}){const date=parseLocal(session.date);const free=Math.max(0,session.capacity-booked);const units=countdownParts(parseLocal(session.date,session.time),now);return <section className={`featured-session exact-featured ${session.state}`}><div className="exact-featured-head"><div className="exact-date-block"><div><strong>{date.getDate()}</strong><b>.{String(date.getMonth()+1).padStart(2,'0')}</b></div><small>{date.getFullYear()}</small><span>{dayName(session.date)}</span><em>{session.time}</em></div><div className="exact-featured-name"><h2>{session.title}</h2><strong>FIT BODY CENTER</strong><span className={`exact-status ${session.state}`}>{session.state==='open'?'Записването е отворено':session.state==='completed'?'Проведена':'Предстои записване'}</span></div></div>{session.state==='open'&&<CountdownPanel units={units} date={session.date} time={session.time}/>}<div className="exact-essentials"><div><span>МЯСТО</span><strong>FIT BODY CENTER</strong></div><Stopwatch minutes={session.duration}/></div><div className="exact-capacity"><div><span>ЗАЕТИ МЕСТА<strong>{booked}</strong></span><span>СВОБОДНИ<strong>{free}</strong></span></div><i><b style={{width:`${Math.min(100,booked/session.capacity*100)}%`}}/></i></div>{session.state==='open'&&(selected?<div className="exact-own-actions"><button onClick={onUnsubscribe}>ОТПИШИ СЕ</button><button onClick={onFriend}>ЗАПИШИ ПРИЯТЕЛ</button></div>:<button className="exact-book-button" onClick={onBook}>ЗАПИШИ СЕ</button>)}{session.state!=='open'&&<button className="exact-book-button" disabled>{status.toUpperCase()}</button>}</section>}

function SessionCard({session,booked,selected,onSelect,now}:{session:Session;booked:number;selected:boolean;onSelect:()=>void;now:number}){const date=parseLocal(session.date);const free=Math.max(0,session.capacity-booked);const units=countdownParts(parseLocal(session.date,session.time),now);return <article className={`exact-session-card ${session.state} ${selected?'selected':''}`}><button type="button" className="exact-session-top" onClick={onSelect}><div className="exact-session-date"><strong>{date.getDate()}.{String(date.getMonth()+1).padStart(2,'0')}</strong><span>{dayName(session.date)}</span><em>{session.time}</em></div><div className="exact-session-info"><span className={`exact-status ${session.state}`}>{session.state==='open'?'Записването е отворено':session.state==='completed'?'Проведена':'Предстояща'}</span><h3>{session.title}</h3><strong>FIT BODY CENTER</strong></div></button><div className="exact-session-stats"><Stopwatch minutes={session.duration}/><div className="exact-capacity"><div><span>ЗАЕТИ<strong>{booked}</strong></span><span>СВОБОДНИ<strong>{free}</strong></span></div><i><b style={{width:`${Math.min(100,booked/session.capacity*100)}%`}}/></i></div></div>{session.state==='open'&&<CountdownPanel compact units={units} date={session.date} time={session.time}/>} {session.state==='open'&&<button className="exact-session-book" type="button" onClick={onSelect}>ЗАПИШИ СЕ</button>}</article>}

function Stopwatch({minutes}:{minutes:number}){return <div className="exact-stopwatch"><i/><div><strong>{minutes}</strong><span>МИН.</span></div></div>}
function CountdownPanel({units,date,time,compact=false}:{units:{days:number;hours:number;minutes:number;seconds:number};date:string;time:string;compact?:boolean}){return <div className={`exact-countdown ${compact?'compact':''}`}><div><strong>⌛ ЗАПИСВАНЕТО СПИРА СЛЕД</strong><span>{date.slice(8)}.{date.slice(5,7)} · {time}</span></div><section>{[['ДНИ',units.days],['ЧАСА',units.hours],['МИНУТИ',units.minutes],['СЕКУНДИ',units.seconds]].map(([label,value])=><div key={String(label)}><strong>{String(value).padStart(2,'0')}</strong><span>{label}</span></div>)}</section></div>}

function BookingModal({friend,session,onClose,onSubmit}:{friend:boolean;session:Session;onClose:()=>void;onSubmit:(event:FormEvent<HTMLFormElement>,friend?:boolean)=>void}){return <div className="booking-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><form className="booking-modal" onSubmit={event=>onSubmit(event,friend)}><div className="modal-handle"/><div className="modal-title"><div><span>{friend?'ДОБАВЯНЕ':'ЗАПИСВАНЕ'}</span><h2>{friend?'Запиши приятел':'Запази своето място'}</h2></div><button type="button" onClick={onClose}>×</button></div><div className="modal-session"><strong>{session.title}</strong><span>{prettyDate(session.date)} · {dayName(session.date)} · {session.time} ч.</span></div><label>ИМЕ И ФАМИЛИЯ<input name="name" autoFocus required placeholder={friend?'Име на приятеля':'Вашето име'}/></label><label>ТЕЛЕФОН<input name="phone" type="tel" required placeholder="08xx xxx xxx"/></label>{!friend&&<label className="multisport-choice"><input name="multisport" type="checkbox"/><img src={`${baseUrl}multisport-card.webp`} alt="MultiSport"/><span><strong>Имам карта MultiSport</strong><small>Отбележи, ако ще я използваш.</small></span></label>}<button className="modal-submit" type="submit">{friend?'Добави приятел':'Потвърди записването'}</button><p className="demo-note">Демонстрационна версия — данните се пазят само на това устройство.</p></form></div>}
