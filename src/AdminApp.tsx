'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Profile, ProfileRole, supabase, supabaseConfigured, UserInvite } from './supabase';

const attendees = ['Мария Петрова', 'Елена Иванова', 'Силвия Георгиева', 'Ралица Николова'];
const baseUrl = import.meta.env.BASE_URL;

export default function AdminApp() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const client = supabase;
    let live = true;
    const loadUser = async (nextUser: User | null) => {
      if (!live) return;
      setUser(nextUser);
      if (!nextUser) { setProfile(null); setLoading(false); return; }
      const { data } = await client.from('profiles').select('*').eq('id', nextUser.id).maybeSingle();
      if (live) { setProfile(data as Profile | null); setLoading(false); }
    };
    client.auth.getUser().then(({data}) => loadUser(data.user));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => loadUser(session?.user ?? null));
    return () => { live = false; listener.subscription.unsubscribe(); };
  }, []);

  if (!supabaseConfigured) return <MissingConfiguration />;
  if (loading) return <AdminLoading />;
  if (!user) return <LoginPanel />;
  if (!profile || !profile.active || !['owner','admin','editor'].includes(profile.role)) return <AccessDenied email={user.email ?? ''} />;
  return <AdminDashboard profile={profile} />;
}

function AdminDashboard({profile}:{profile:Profile}) {
  const [tab, setTab] = useState<'trainings'|'templates'|'settings'|'users'>('trainings');
  const [showEditor, setShowEditor] = useState(false);
  const canManageUsers = profile.role === 'owner' || profile.role === 'admin';
  const signOut = async () => { await supabase?.auth.signOut(); window.localStorage.removeItem('trainings-remember-login'); };
  return <main className="admin-shell">
    <header className="admin-header">
      <a className="admin-brand" href={`${baseUrl}trainings.html`}><span>FIT</span><strong>BODY CENTER</strong></a>
      <div className="admin-title"><span>УПРАВЛЕНИЕ</span><strong>Админ панел</strong></div>
      <div className="admin-header-actions"><a className="site-button" href={`${baseUrl}trainings.html`}>Към сайта ↗</a><button className="logout-button" onClick={signOut}>Изход</button></div>
    </header>

    <nav className={`admin-tabs ${canManageUsers?'with-users':''}`} aria-label="Админ раздели">
      <button className={tab==='trainings'?'active':''} onClick={()=>setTab('trainings')}>Тренировки</button>
      <button className={tab==='templates'?'active':''} onClick={()=>setTab('templates')}>Шаблони</button>
      <button className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}>Настройки</button>
      {canManageUsers&&<button className={tab==='users'?'active':''} onClick={()=>setTab('users')}>Потребители</button>}
    </nav>

    {tab==='trainings'&&<>
      <section className="admin-overview"><div><span>СЛЕДВАЩА ТРЕНИРОВКА</span><strong>Утре · 18:30</strong><p>Pilates · 13 записани</p></div><div className="overview-number"><strong>2</strong><span>активни</span></div></section>
      <button className="new-training" onClick={()=>setShowEditor(true)}><span>＋</span><div><strong>Нова тренировка</strong><small>Добави дата, час и места</small></div><b>›</b></button>
      <div className="admin-section-heading"><div><span>АКТИВНИ</span><h1>Предстоящи тренировки</h1></div><strong>2</strong></div>
      <section className="admin-training-card featured">
        <div className="session-status"><span>● ТРЕНИРОВКАТА Е АКТИВНА</span><button>•••</button></div><div className="session-date"><strong>25.08</strong><span>Вторник</span><i>18:30</i></div><h2>Pilates <span>| Fit Body Center · 60 минути</span></h2><div className="admin-progress"><div><span style={{width:'65%'}}/></div><strong>13 / 20</strong></div><div className="attendee-head"><strong>Записани</strong><span>Остават 7 места</span></div><div className="attendee-list">{attendees.map((name,index)=><div key={name}><span>{index+1}</span><strong>{name}</strong>{index===0&&<i>MultiSport</i>}<button>×</button></div>)}<div className="more-attendees"><span>＋9</span><strong>Още записани участници</strong><button>Покажи</button></div></div><div className="session-actions"><button>Редактирай</button><button className="stop">Спри записването</button></div>
      </section>
      <section className="admin-training-card"><div className="session-status pending"><span>● ОТВАРЯ СЛЕД 2 ДНИ</span><button>•••</button></div><div className="session-date"><strong>27.08</strong><span>Четвъртък</span><i>19:00</i></div><h2>Functional Training <span>| Fit Body Center · 50 минути</span></h2><div className="session-actions"><button>Редактирай</button><button className="activate">Отвори сега</button></div></section>
    </>}

    {tab==='templates'&&<section className="admin-panel"><span className="panel-kicker">БЪРЗО СЪЗДАВАНЕ</span><h1>Шаблони за тренировки</h1><p>Примерни имена — ще ги сменим, когато уточним точните тренировки.</p><div className="template-grid">{['Pilates','Step Aerobics','Functional','Stretching'].map((name,index)=><button key={name}><i>{['◒','▲','◆','≈'][index]}</i><strong>{name}</strong><span>60 мин · 20 места</span></button>)}</div><button className="add-template">＋ Добави нов шаблон</button></section>}
    {tab==='settings'&&<section className="admin-panel"><span className="panel-kicker">НАСТРОЙКИ</span><h1>Fit Body Center</h1><p>Текстове, адрес, MultiSport, брой места и правила за записване.</p><div className="settings-list"><button><span>▣</span><div><strong>Текстове на сайта</strong><small>Заглавие и описание</small></div><b>›</b></button><button><span>⌖</span><div><strong>Локация</strong><small>Адрес и карта</small></div><b>›</b></button><button><span>◉</span><div><strong>Записвания</strong><small>Правила и известия</small></div><b>›</b></button></div></section>}
    {tab==='users'&&canManageUsers&&<UsersPanel currentProfile={profile}/>} 

    {showEditor&&<div className="editor-backdrop" onClick={()=>setShowEditor(false)}><section className="training-editor" onClick={event=>event.stopPropagation()}><div className="editor-handle"/><div className="editor-title"><div><span>НОВА ТРЕНИРОВКА</span><h2>Създай тренировка</h2></div><button onClick={()=>setShowEditor(false)}>×</button></div><label>ВИД ТРЕНИРОВКА<select defaultValue="Pilates"><option>Pilates</option><option>Functional Training</option><option>Step Aerobics</option></select></label><div className="editor-row"><label>ДАТА<input type="date"/></label><label>ЧАС<input type="time" defaultValue="18:30"/></label></div><div className="editor-row"><label>МЕСТА<input type="number" defaultValue="20"/></label><label>МИНУТИ<input type="number" defaultValue="60"/></label></div><button className="editor-save" onClick={()=>setShowEditor(false)}>Създай тренировката</button></section></div>}
  </main>;
}

function LoginPanel() {
  const [mode,setMode]=useState<'login'|'activate'>('login');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!supabase)return;setBusy(true);setError('');setMessage('');const form=new FormData(event.currentTarget);const email=String(form.get('email')||'').trim();const password=String(form.get('password')||'');const remember=form.get('remember')==='on';window.localStorage.setItem('trainings-remember-login',remember?'1':'0');if(mode==='login'){const {error:authError}=await supabase.auth.signInWithPassword({email,password});if(authError)setError(authError.message==='Invalid login credentials'?'Грешен имейл или парола.':authError.message)}else{const {error:authError}=await supabase.auth.signUp({email,password});if(authError)setError(authError.message);else setMessage('Профилът е създаден. Провери имейла си за потвърждение, след което влез.') }setBusy(false);};
  return <main className="login-shell"><section className="login-card"><div className="login-brand"><span>FIT</span><strong>BODY CENTER</strong></div><span className="login-kicker">ЗАЩИТЕН ДОСТЪП</span><h1>{mode==='login'?'Вход в админ панела':'Активирай покана'}</h1><p>{mode==='login'?'Влезте с профил, добавен от главния администратор.':'Използвай имейла, на който е създадена поканата.'}</p><form onSubmit={submit}><label>ИМЕЙЛ<input type="email" name="email" required autoComplete="email" placeholder="name@example.com"/></label><label>ПАРОЛА<input type="password" name="password" required minLength={8} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="Минимум 8 символа"/></label>{mode==='login'&&<label className="remember-login"><input type="checkbox" name="remember" defaultChecked/><span>Запомни ме на това устройство</span></label>}{error&&<div className="login-error">{error}</div>}{message&&<div className="login-message">{message}</div>}<button className="login-submit" disabled={busy}>{busy?'Моля, изчакай…':mode==='login'?'Вход':'Създай профил'}</button></form><button className="login-switch" onClick={()=>{setMode(mode==='login'?'activate':'login');setError('');setMessage('')}}>{mode==='login'?'Имаш покана? Активирай профил':'Обратно към вход'}</button><a className="back-to-public" href={`${baseUrl}trainings.html`}>← Назад към сайта</a></section></main>;
}

function UsersPanel({currentProfile}:{currentProfile:Profile}) {
  const [profiles,setProfiles]=useState<Profile[]>([]);const [invites,setInvites]=useState<UserInvite[]>([]);const [error,setError]=useState('');const [message,setMessage]=useState('');const [loading,setLoading]=useState(true);
  const load=async()=>{if(!supabase)return;setLoading(true);const [profileResult,inviteResult]=await Promise.all([supabase.from('profiles').select('*').order('created_at'),supabase.from('user_invites').select('*').order('created_at',{ascending:false})]);if(profileResult.error||inviteResult.error)setError(profileResult.error?.message||inviteResult.error?.message||'Грешка при зареждане.');else{setProfiles((profileResult.data||[]) as Profile[]);setInvites((inviteResult.data||[]) as UserInvite[])}setLoading(false)};
  useEffect(()=>{load()},[]);
  const invite=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!supabase)return;setError('');setMessage('');const form=new FormData(event.currentTarget);const {error:rpcError}=await supabase.rpc('admin_invite_user',{invite_email:String(form.get('email')||'').trim(),invite_name:String(form.get('name')||'').trim(),invite_role:String(form.get('role')||'editor')});if(rpcError)setError(rpcError.message);else{setMessage('Потребителят е добавен. Може да активира профила си от Login панела.');event.currentTarget.reset();await load()}};
  const updateAccess=async(id:string,role:ProfileRole,active:boolean)=>{if(!supabase)return;const {error:rpcError}=await supabase.rpc('admin_set_user_access',{target_user_id:id,next_role:role,next_active:active});if(rpcError)setError(rpcError.message);else await load()};
  return <section className="admin-panel users-panel"><span className="panel-kicker">ДОСТЪП</span><h1>Потребители</h1><p>Добавяй хора чрез имейл и избирай какво могат да управляват. Паролата се създава лично от потребителя.</p><form className="invite-form" onSubmit={invite}><label>ИМЕ<input name="name" placeholder="Име и фамилия"/></label><label>ИМЕЙЛ<input name="email" type="email" required placeholder="name@example.com"/></label><label>РОЛЯ<select name="role" defaultValue="editor"><option value="editor">Редактор</option><option value="admin">Администратор</option></select></label><button>＋ Добави потребител</button></form>{error&&<div className="login-error">{error}</div>}{message&&<div className="login-message">{message}</div>}<div className="users-heading"><strong>Активни профили</strong><span>{profiles.length}</span></div>{loading?<p>Зареждане…</p>:<div className="users-list">{profiles.map(item=><div key={item.id}><div><strong>{item.display_name||item.email}</strong><small>{item.email}</small></div><select value={item.role} disabled={item.id===currentProfile.id||currentProfile.role!=='owner'} onChange={event=>updateAccess(item.id,event.target.value as ProfileRole,item.active)}><option value="owner">Главен администратор</option><option value="admin">Администратор</option><option value="editor">Редактор</option></select><button disabled={item.id===currentProfile.id} className={item.active?'deactivate':'activate'} onClick={()=>updateAccess(item.id,item.role,!item.active)}>{item.active?'Спри':'Активирай'}</button></div>)}</div>}<div className="users-heading"><strong>Чакащи покани</strong><span>{invites.filter(item=>!item.accepted_at).length}</span></div><div className="invite-list">{invites.filter(item=>!item.accepted_at).map(item=><div key={item.id}><strong>{item.display_name||item.email}</strong><span>{item.role==='owner'?'Главен администратор':item.role==='admin'?'Администратор':'Редактор'}</span></div>)}</div></section>;
}

function MissingConfiguration(){return <main className="login-shell"><section className="login-card"><div className="login-brand"><span>FIT</span><strong>BODY CENTER</strong></div><span className="login-kicker">НАСТРОЙКА</span><h1>Login-ът очаква новия Supabase проект</h1><p>Публичният сайт е готов. За защитения админ панел трябва да се добавят Project URL и Publishable key на отделната база.</p><a className="back-to-public" href={`${baseUrl}trainings.html`}>← Назад към сайта</a></section></main>}
function AdminLoading(){return <main className="login-shell"><div className="admin-loading"><strong>F</strong><span>Зареждане</span></div></main>}
function AccessDenied({email}:{email:string}){return <main className="login-shell"><section className="login-card"><span className="login-kicker">НЯМА ДОСТЪП</span><h1>Този профил няма администраторски достъп.</h1><p>{email}</p><button className="login-submit" onClick={()=>supabase?.auth.signOut()}>Изход</button><a className="back-to-public" href={`${baseUrl}trainings.html`}>← Назад към сайта</a></section></main>}
