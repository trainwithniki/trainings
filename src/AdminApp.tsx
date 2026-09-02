"use client";

import {
  CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import {
  Profile,
  ProfileRole,
  supabase,
  supabaseConfigured,
  UserInvite,
} from "./supabase";
import {
  dayName,
  defaultSiteContent,
  errorMessage,
  isBookingOpen,
  isCompleted,
  loadAdminData,
  months,
  shortDate,
  shortTime,
  SiteContent,
  TrainingRegistration,
  TrainingSession,
  TrainingStatus,
} from "./training-data";
import { trainingPages } from "./training-pages";

const baseUrl = import.meta.env.BASE_URL;
const ownerEmail = "svetlichaa@gmail.com";
type QuickTemplate = {
  id?: string;
  title: string;
  weekday: number;
  time: string;
  location: string;
  duration: number;
  capacity: number;
  standard_capacity: number;
  multisport_capacity: number;
  booking_open_hours: number;
  sort_order: number;
};
function registrationMoment(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return { shortDate: "--.--", date: "Няма информация", time: "--:--" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("bg-BG", {
      timeZone: "Europe/Sofia",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    shortDate: `${parts.day}.${parts.month}`,
    date: `${parts.day}.${parts.month}.${parts.year}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
const templateDefaults = {
  location: "Fit Body Center",
  duration: 60,
  capacity: 25,
  standard_capacity: 15,
  multisport_capacity: 10,
  booking_open_hours: 48,
};
const quickTemplates: QuickTemplate[] = [
  { title: "Пилатес", weekday: 1, time: "07:45" },
  { title: "Body Training", weekday: 1, time: "08:45" },
  { title: "Пилатес", weekday: 1, time: "18:30" },
  { title: "Strong Body", weekday: 1, time: "19:30" },
  { title: "Body Balance", weekday: 2, time: "08:00" },
  { title: "Зумба", weekday: 2, time: "18:30" },
  { title: "Body Training", weekday: 3, time: "08:00" },
  { title: "Детска кондиционна", weekday: 3, time: "17:30" },
  { title: "Пилатес", weekday: 3, time: "18:30" },
  { title: "Tae Bo", weekday: 3, time: "19:30" },
  { title: "Body Balance", weekday: 4, time: "08:00" },
  { title: "Зумба", weekday: 4, time: "18:30" },
  { title: "Пилатес", weekday: 5, time: "07:45" },
  { title: "Body Training", weekday: 5, time: "08:45" },
  { title: "Tae Bo", weekday: 5, time: "19:00" },
  { title: "Strong Body", weekday: 6, time: "09:30" },
  { title: "Детска кондиционна", weekday: 6, time: "10:30" },
  { title: "Кондиционен тим", weekday: 7, time: "16:45" },
].map((template, index) => ({
  ...template,
  ...templateDefaults,
  sort_order: index,
}));
const shortWeekdays = ["", "Пон", "Вто", "Сря", "Чет", "Пет", "Съб", "Нед"];

export default function AdminApp() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;
    let live = true;
    const loadUser = async (nextUser: User | null) => {
      if (!live) return;
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const { data } = await client
        .from("profiles")
        .select("*")
        .eq("id", nextUser.id)
        .maybeSingle();
      if (live) {
        setProfile(data as Profile | null);
        setLoading(false);
      }
    };
    client.auth.getUser().then(({ data }) => loadUser(data.user));
    const { data: listener } = client.auth.onAuthStateChange(
      (_event, session) => loadUser(session?.user ?? null),
    );
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!supabaseConfigured) return <MissingConfiguration />;
  if (loading) return <AdminLoading />;
  if (!user) return <LoginPanel />;
  if (
    !profile ||
    !profile.active ||
    !["owner", "admin", "editor"].includes(profile.role)
  )
    return <AccessDenied email={user.email ?? ""} />;
  return <AdminDashboard profile={profile} />;
}

function AdminDashboard({ profile }: { profile: Profile }) {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [registrations, setRegistrations] = useState<TrainingRegistration[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<TrainingSession | null | undefined>(
    undefined,
  );
  const [registrationEditor, setRegistrationEditor] =
    useState<TrainingRegistration | null>(null);
  const [heroEditor, setHeroEditor] = useState(false);
  const [section, setSection] = useState<
    "trainings" | "links" | "profiles" | "backups" | "history"
  >("trainings");
  const [clock, setClock] = useState(Date.now());
  const canManageProfiles =
    profile.role === "owner" &&
    profile.email.toLocaleLowerCase("en") === ownerEmail;
  const canViewHistory = canManageProfiles || Boolean(profile.can_view_history);

  const refresh = useCallback(async () => {
    try {
      const data = await loadAdminData();
      setSessions(data.sessions);
      setRegistrations(data.registrations);
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel("trainings-admin-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_sessions" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_registrations" },
        refresh,
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const now = clock;
  const canAccessTitle = useCallback(
    (title: string) =>
      profile.role === "owner" ||
      profile.training_access == null ||
      profile.training_access.some(
        (allowed) =>
          allowed.trim().toLocaleLowerCase("bg") ===
          title.trim().toLocaleLowerCase("bg"),
      ),
    [profile.role, profile.training_access],
  );
  const accessibleSessions = useMemo(
    () => sessions.filter((item) => canAccessTitle(item.title)),
    [sessions, canAccessTitle],
  );
  const upcoming = useMemo(
    () =>
      accessibleSessions
        .filter((item) => !isCompleted(item, now))
        .sort(sortSessions),
    [accessibleSessions, now],
  );
  const completed = useMemo(
    () =>
      accessibleSessions
        .filter((item) => isCompleted(item, now))
        .sort((a, b) => -sortSessions(a, b)),
    [accessibleSessions, now],
  );
  const active = upcoming.filter((item) => isBookingOpen(item, now));
  const registrationsFor = (id: string) =>
    registrations.filter(
      (item) => item.session_id === id && !item.cancelled_at,
    );

  async function changeStatus(
    session: TrainingSession,
    status: TrainingStatus,
  ) {
    if (!supabase) return;
    const { error: requestError } = await supabase
      .from("training_sessions")
      .update({ status })
      .eq("id", session.id);
    if (requestError) setError(errorMessage(requestError));
    else {
      setNotice(
        status === "open"
          ? "Записването е стартирано."
          : "Записването е спряно.",
      );
      await refresh();
    }
  }
  async function deleteSession(session: TrainingSession) {
    if (
      !supabase ||
      !window.confirm(
        `Да изтрия ли тренировката на ${shortDate(session.date)} в ${shortTime(session.start_time)}?`,
      )
    )
      return;
    const { error: requestError } = await supabase
      .from("training_sessions")
      .delete()
      .eq("id", session.id);
    if (requestError) setError(errorMessage(requestError));
    else {
      setNotice("Тренировката е изтрита.");
      await refresh();
    }
  }
  async function deleteRegistration(registration: TrainingRegistration) {
    if (
      !supabase ||
      !window.confirm(`Да премахна ли ${registration.name} от записаните?`)
    )
      return;
    const { error: requestError } = await supabase
      .from("training_registrations")
      .delete()
      .eq("id", registration.id);
    if (requestError) setError(errorMessage(requestError));
    else await refresh();
  }
  const signOut = async () => {
    await supabase?.auth.signOut();
    window.localStorage.removeItem("trainings-remember-login");
  };

  return (
    <main className="admin-shell live-admin matched-admin">
      <header className="matched-admin-head">
        <div>
          <span>FIT BODY CENTER</span>
          <h1>Админ панел</h1>
        </div>
        <div className="admin-header-actions">
          <a className="site-button" href={`${baseUrl}trainings.html`}>
            ← Към сайта
          </a>
          <button className="logout-button" onClick={signOut}>
            Изход
          </button>
        </div>
      </header>
      <nav
        className={`matched-admin-tabs ${canManageProfiles ? "owner-tabs" : canViewHistory ? "history-tabs" : ""}`}
        aria-label="Раздели"
      >
        <button
          className={section === "trainings" ? "active" : ""}
          type="button"
          onClick={() => setSection("trainings")}
        >
          Тренировки
        </button>
        <button
          className={section === "links" ? "active" : ""}
          type="button"
          onClick={() => setSection("links")}
        >
          Линкове
        </button>
        {canViewHistory && (
          <button
            className={section === "history" ? "active" : ""}
            type="button"
            onClick={() => setSection("history")}
          >
            История
          </button>
        )}
        {canManageProfiles && (
          <>
            <button
              className={section === "backups" ? "active" : ""}
              type="button"
              onClick={() => setSection("backups")}
            >
              Backups
            </button>
            <button
              className={section === "profiles" ? "active" : ""}
              type="button"
              onClick={() => setSection("profiles")}
            >
              Профили
            </button>
          </>
        )}
      </nav>
      {section === "trainings" && (
        <div className="matched-new-training">
          <button
            className="admin-hero-settings"
            type="button"
            onClick={() => setHeroEditor(true)}
          >
            ✎ Текст на началната страница
          </button>
          <button className="admin-add-primary" onClick={() => setEditor(null)}>
            + Нова тренировка
          </button>
        </div>
      )}
      {error && <div className="admin-alert error">{error}</div>}
      {notice && (
        <button className="admin-alert success" onClick={() => setNotice("")}>
          {notice}
          <span>×</span>
        </button>
      )}
      {loading && <div className="admin-data-loading">Зареждане…</div>}

      {section === "trainings" && (
        <>
          <section className="admin-live-section">
            <div className="admin-section-heading">
              <div>
                <span>АКТИВНИ</span>
                <h2>Отворени за записване</h2>
              </div>
              <strong>{active.length}</strong>
            </div>
            {!loading && active.length === 0 && (
              <EmptyAdmin
                title="Няма активна тренировка"
                text="Създайте тренировка и натиснете „Старт“, когато искате да отворите записването."
              />
            )}
            {active.map((session) => (
              <ActiveTraining
                key={session.id}
                session={session}
                registrations={registrationsFor(session.id)}
                onEdit={() => setEditor(session)}
                onStop={() => changeStatus(session, "closed")}
                onEditRegistration={setRegistrationEditor}
                onDeleteRegistration={deleteRegistration}
              />
            ))}
          </section>

          <section className="admin-created-section">
            <div className="admin-section-heading">
              <div>
                <span>СЪЗДАДЕНИ</span>
                <h2>Активни и предстоящи</h2>
              </div>
              <strong>{upcoming.length}</strong>
            </div>
            {!loading && upcoming.length === 0 && (
              <EmptyAdmin
                title="Няма създадени тренировки"
                text="Списъкът е празен и готов за Вашите тренировки."
              />
            )}
            <div className="admin-session-list">
              {upcoming.map((session) => (
                <AdminSessionRow
                  key={session.id}
                  session={session}
                  bookingOpen={isBookingOpen(session, now)}
                  count={registrationsFor(session.id).length}
                  onEdit={() => setEditor(session)}
                  onStart={() => changeStatus(session, "open")}
                  onStop={() => changeStatus(session, "closed")}
                  onDelete={() => deleteSession(session)}
                />
              ))}
            </div>
          </section>

          <section className="admin-completed-section">
            <div className="admin-section-heading">
              <div>
                <span>АРХИВ</span>
                <h2>Проведени тренировки</h2>
              </div>
              <strong>{completed.length}</strong>
            </div>
            {!loading && completed.length === 0 && (
              <EmptyAdmin
                title="Все още няма проведени тренировки"
                text="Миналите тренировки ще се подреждат тук от най-новата към най-старата."
              />
            )}
            <div className="completed-accordion">
              {completed.map((session) => (
                <CompletedTraining
                  key={session.id}
                  session={session}
                  registrations={registrationsFor(session.id)}
                  onEdit={() => setEditor(session)}
                  onEditRegistration={setRegistrationEditor}
                  onDelete={() => deleteSession(session)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {section === "profiles" && canManageProfiles && (
        <ProfileManagement ownerId={profile.id} />
      )}
      {section === "backups" && canManageProfiles && <BackupPanel />}
      {section === "history" && canViewHistory && <AuditHistoryPanel />}
      {section === "links" && <TrainingLinks />}

      {editor !== undefined && (
        <SessionEditor
          session={editor}
          allowedTrainingTitles={profile.training_access}
          onClose={() => setEditor(undefined)}
          onSaved={async () => {
            setEditor(undefined);
            setNotice(
              editor ? "Промените са запазени." : "Тренировката е създадена.",
            );
            await refresh();
          }}
        />
      )}
      {registrationEditor && (
        <RegistrationEditor
          registration={registrationEditor}
          onClose={() => setRegistrationEditor(null)}
          onSaved={async () => {
            setRegistrationEditor(null);
            setNotice("Данните на записания човек са променени.");
            await refresh();
          }}
        />
      )}
      {heroEditor && (
        <HeroContentEditor
          onClose={() => setHeroEditor(false)}
          onSaved={() => {
            setHeroEditor(false);
            setNotice("Текстът на началната страница е запазен.");
          }}
        />
      )}
    </main>
  );
}

function TrainingLinks() {
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  function publicLink(page: (typeof trainingPages)[number]) {
    return (
      page.externalUrl ??
      new URL(
        `${baseUrl}trainings/${page.slug}.html`,
        window.location.origin,
      ).toString()
    );
  }
  async function copyLink(page: (typeof trainingPages)[number]) {
    try {
      await navigator.clipboard.writeText(publicLink(page));
      setCopied(page.slug);
      setCopyError("");
      window.setTimeout(
        () => setCopied((current) => (current === page.slug ? "" : current)),
        2200,
      );
    } catch {
      setCopied("");
      setCopyError(
        "Линкът не можа да се копира. Натиснете върху адреса и го копирайте ръчно.",
      );
    }
  }
  return (
    <section className="training-links-panel">
      <div className="admin-section-heading">
        <div>
          <span>ЗА СПОДЕЛЯНЕ</span>
          <h2>Линкове към тренировките</h2>
        </div>
        <strong>{trainingPages.length}</strong>
      </div>
      <p>
        Натиснете „Копирай“ и изпратете готовия адрес на желаната тренировка.
      </p>
      {copyError && <div className="admin-alert error">{copyError}</div>}
      <div className="training-links-list">
        {trainingPages.map((page) => {
          const link = publicLink(page);
          return (
            <article key={page.slug}>
              <div className="training-link-art">
                <img src={`${baseUrl}training-icons/${page.icon}`} alt="" />
              </div>
              <div className="training-link-details">
                <strong>{page.title}</strong>
                <a href={link} target="_blank" rel="noreferrer">
                  {link}
                </a>
              </div>
              <button
                type="button"
                className={copied === page.slug ? "copied" : ""}
                onClick={() => void copyLink(page)}
              >
                {copied === page.slug ? "✓ Копирано" : "Копирай"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type BackupRun = {
  id: string;
  file_name: string;
  status: "success" | "failed";
  file_size: number | null;
  created_at: string;
};

type AuditLog = {
  id: number;
  actor_email: string;
  actor_name: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  entity_id: string | null;
  details: {
    label?: string;
    date?: string;
    time?: string;
    changes?: Record<string, { from?: unknown; to?: unknown }>;
  } | null;
  created_at: string;
};

const auditEntityLabels: Record<string, string> = {
  training_sessions: "тренировка",
  training_registrations: "записване",
  training_templates: "шаблон",
  site_content: "текст на начална страница",
  profiles: "профил",
  user_invites: "покана",
};
const auditActionLabels: Record<AuditLog["action"], string> = {
  INSERT: "създаде",
  UPDATE: "редактира",
  DELETE: "изтри",
};
const auditFieldLabels: Record<string, string> = {
  display_name: "Име",
  email: "Имейл",
  role: "Роля",
  active: "Активен профил",
  training_access: "Разрешени тренировки",
  can_view_history: "Достъп до историята",
  title: "Име на тренировката",
  date: "Дата",
  start_time: "Час",
  location: "Място",
  duration: "Продължителност",
  capacity: "Общо места",
  standard_capacity: "Места без MultiSport",
  multisport_capacity: "Места за MultiSport",
  booking_open_hours: "Автоматично отваряне",
  status: "Статус",
  weekday: "Ден от седмицата",
  name: "Име на записания",
  phone: "Телефон",
  tariff: "Начин на посещение",
  booked_by: "Записан от",
  cancelled_at: "Отписване",
  accepted_at: "Приета покана",
  hero_eyebrow: "Малък надпис",
  hero_title: "Главно заглавие",
  hero_description: "Описание",
  hero_tags: "Етикети",
};
function auditValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "Няма";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Няма";
  if (typeof value === "boolean") return value ? "Да" : "Не";
  const text = String(value);
  if (field === "role")
    return { owner: "Owner", admin: "Администратор", editor: "Редактор" }[
      text
    ] ?? text;
  if (field === "status")
    return {
      scheduled: "Предстояща",
      open: "Отворена",
      closed: "Затворена",
      completed: "Проведена",
    }[text] ?? text;
  if (field === "tariff")
    return {
      none: "Без карта",
      card8: "Карта 8 посещения",
      card12: "Карта 12 посещения",
      multisport: "MultiSport",
    }[text] ?? text;
  if (field === "start_time") return text.slice(0, 5);
  if (field === "duration") return `${text} минути`;
  if (field === "booking_open_hours") return `${text} часа по-рано`;
  return text;
}

function auditActorHue(identity: string) {
  let hash = 0;
  for (const character of identity.toLocaleLowerCase("en"))
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function AuditHistoryPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadHistory = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: requestError } = await supabase
      .from("audit_logs")
      .select(
        "id,actor_email,actor_name,action,entity_type,entity_id,details,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (requestError) setError(errorMessage(requestError));
    else {
      setLogs((data ?? []) as AuditLog[]);
      setError("");
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);
  return (
    <section className="audit-panel">
      <div className="admin-section-heading">
        <div>
          <span>САМО ЗА OWNER</span>
          <h2>История на действията</h2>
        </div>
        <button type="button" onClick={() => void loadHistory()}>
          Обнови
        </button>
      </div>
      <p>Показани са последните 300 действия в администраторския панел.</p>
      {loading ? (
        <div className="admin-data-loading">Зареждане на историята…</div>
      ) : error ? (
        <div className="admin-alert error">{error}</div>
      ) : logs.length === 0 ? (
        <div className="audit-empty">Все още няма записани действия.</div>
      ) : (
        <div className="audit-list">
          {logs.map((log) => {
            const moment = new Intl.DateTimeFormat("bg-BG", {
              timeZone: "Europe/Sofia",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(log.created_at));
            const label = log.details?.label?.trim();
            const changes = Object.entries(log.details?.changes ?? {});
            return (
              <article
                key={log.id}
                className={`audit-item ${log.action.toLowerCase()}`}
                style={
                  {
                    "--actor-hue": auditActorHue(log.actor_email),
                  } as CSSProperties
                }
              >
                <time dateTime={log.created_at}>{moment}</time>
                <div>
                  <strong>{log.actor_name || log.actor_email}</strong>
                  {log.actor_name && <small>{log.actor_email}</small>}
                </div>
                <div className="audit-description">
                  <p>
                    <b>{auditActionLabels[log.action]}</b>{" "}
                    {auditEntityLabels[log.entity_type] ?? log.entity_type}
                    {label ? <span> „{label}“</span> : null}
                  </p>
                  {changes.length > 0 && (
                    <ul className="audit-change-list">
                      {changes.map(([field, change]) => (
                        <li key={field}>
                          <strong>{auditFieldLabels[field] ?? field}:</strong>{" "}
                          {log.action === "UPDATE" ? (
                            <>
                              <span>{auditValue(field, change.from)}</span>
                              <i>→</i>
                              <b>{auditValue(field, change.to)}</b>
                            </>
                          ) : (
                            <b>
                              {auditValue(
                                field,
                                log.action === "DELETE" ? change.from : change.to,
                              )}
                            </b>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BackupPanel() {
  const [backups, setBackups] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const driveUrl =
    "https://drive.google.com/drive/folders/1gkk0kVR9TNH_fMyS6XaPnHkIudQ0IbvQ";
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("backup_runs")
      .select("id,file_name,status,file_size,created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error: requestError }) => {
        if (requestError) setError(errorMessage(requestError));
        else setBackups((data as BackupRun[] | null) ?? []);
        setLoading(false);
      });
  }, []);
  const formatMoment = (value: string) =>
    new Intl.DateTimeFormat("bg-BG", {
      timeZone: "Europe/Sofia",
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(value));
  const formatSize = (value: number | null) =>
    value ? `${(value / 1024 / 1024).toFixed(2)} MB` : "";
  return (
    <section className="backup-panel">
      <div className="admin-section-heading">
        <div>
          <span>САМО ЗА OWNER</span>
          <h2>Резервни копия</h2>
        </div>
        <strong>☁</strong>
      </div>
      <p>
        Защитените архиви на Trainings се съхраняват в отделната папка в
        Google Drive.
      </p>
      {loading ? (
        <div className="admin-data-loading">Зареждане на backup архивите…</div>
      ) : error ? (
        <div className="admin-alert error">{error}</div>
      ) : backups.length > 0 ? (
        <div className="backup-list">
          {backups.map((backup, index) => {
            const size = formatSize(backup.file_size);
            return (
              <article className={`backup-status-card ${backup.status}`} key={backup.id}>
                <div className="backup-status-icon">✓</div>
                <div>
                  <span>{index === 0 ? "ПОСЛЕДЕН УСПЕШЕН BACKUP" : "УСПЕШЕН BACKUP"}</span>
                  <strong>{formatMoment(backup.created_at)}</strong>
                  <small>{backup.file_name}</small>
                </div>
                {size && <b>{size}</b>}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="backup-empty-state">
          <strong>Все още няма завършен backup</strong>
          <span>Тук ще се появи първият успешно качен архив.</span>
        </div>
      )}
      <a className="backup-drive-link" href={driveUrl} target="_blank" rel="noreferrer">
        Отвори папката в Google Drive ↗
      </a>
    </section>
  );
}

function profileSummary(item: Profile, ownerId: string) {
  if (item.id === ownerId) return "Owner · Всички тренировки · История";
  const role = item.role === "admin" ? "Администратор" : "Редактор";
  const trainings = item.training_access?.length
    ? item.training_access.join(", ")
    : "Всички тренировки";
  return `${role} · ${trainings}${item.can_view_history ? " · История" : ""}`;
}

function ProfileManagement({ ownerId }: { ownerId: string }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const profilesLoaded = useRef(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [trainingTitles, setTrainingTitles] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    if (!profilesLoaded.current) setLoading(true);
    const [profilesResult, invitesResult, templatesResult] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
      supabase
        .from("user_invites")
        .select("*")
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("training_templates").select("title").order("sort_order"),
    ]);
    const requestError =
      profilesResult.error ?? invitesResult.error ?? templatesResult.error;
    if (requestError) setError(errorMessage(requestError));
    else {
      setProfiles((profilesResult.data ?? []) as Profile[]);
      setInvites((invitesResult.data ?? []) as UserInvite[]);
      setTrainingTitles(
        Array.from(
          new Set((templatesResult.data ?? []).map((item) => item.title.trim())),
        ),
      );
      setError("");
    }
    profilesLoaded.current = true;
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget,
      form = new FormData(formElement),
      email = String(form.get("email") ?? "").trim(),
      name = String(form.get("name") ?? "").trim(),
      role = String(form.get("role") ?? "editor") as ProfileRole;
    const canViewHistory = form.get("can_view_history") === "on";
    const trainingAccess = form
      .getAll("training_access")
      .map(String)
      .filter(Boolean);
    if (trainingAccess.length === 0) {
      setError("Изберете поне една тренировка за този профил.");
      return;
    }
    setBusyId("invite");
    setError("");
    setNotice("");
    const { error: requestError } = await supabase.rpc("admin_invite_user", {
      invite_email: email,
      invite_name: name || null,
      invite_role: role,
      invite_training_access: trainingAccess,
      invite_can_view_history: canViewHistory,
    });
    setBusyId("");
    if (requestError) {
      setError(errorMessage(requestError));
      return;
    }
    formElement.reset();
    setNotice(
      `Поканата за ${email} е създадена. Копирайте линка от списъка по-долу.`,
    );
    await refresh();
  }

  async function updateTrainingAccess(item: Profile, nextAccess: string[]) {
    if (!supabase || item.id === ownerId || nextAccess.length === 0) {
      if (nextAccess.length === 0)
        setError("Профилът трябва да има достъп до поне една тренировка.");
      return;
    }
    setBusyId(item.id);
    setError("");
    setNotice("");
    const { error: requestError } = await supabase.rpc(
      "owner_set_training_access",
      { target_user_id: item.id, next_training_access: nextAccess },
    );
    setBusyId("");
    if (requestError) {
      setError(errorMessage(requestError));
      return;
    }
    setNotice(`Тренировките за ${item.email} са обновени.`);
    await refresh();
  }

  async function updateHistoryAccess(item: Profile, canViewHistory: boolean) {
    if (!supabase || item.id === ownerId) return;
    setBusyId(item.id);
    setError("");
    setNotice("");
    const { error: requestError } = await supabase.rpc(
      "owner_set_history_access",
      {
        target_user_id: item.id,
        next_can_view_history: canViewHistory,
      },
    );
    setBusyId("");
    if (requestError) {
      setError(errorMessage(requestError));
      return;
    }
    setNotice(
      canViewHistory
        ? `${item.email} вече вижда историята.`
        : `Достъпът на ${item.email} до историята е премахнат.`,
    );
    await refresh();
  }

  async function editProfileName(item: Profile) {
    if (!supabase) return;
    const nextName = window.prompt(
      "Редактирайте името на профила:",
      item.display_name ?? "",
    );
    if (nextName === null) return;
    const cleanName = nextName.trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      setError("Името трябва да бъде между 2 и 120 символа.");
      return;
    }
    setBusyId(item.id);
    setError("");
    setNotice("");
    const { data: updated, error: requestError } = await supabase.rpc(
      "owner_update_profile_name",
      { target_user_id: item.id, next_display_name: cleanName },
    );
    setBusyId("");
    if (requestError) {
      setError(errorMessage(requestError));
      return;
    }
    if (!updated) {
      setError("Профилът не беше намерен.");
      return;
    }
    setNotice(`Името на ${item.email} е обновено.`);
    await refresh();
  }

  async function updateAccess(
    item: Profile,
    role: ProfileRole,
    active: boolean,
  ) {
    if (!supabase || item.id === ownerId) return;
    setBusyId(item.id);
    setError("");
    setNotice("");
    const { error: requestError } = await supabase.rpc(
      "admin_set_user_access",
      { target_user_id: item.id, next_role: role, next_active: active },
    );
    setBusyId("");
    if (requestError) {
      setError(errorMessage(requestError));
      return;
    }
    setNotice(`Достъпът на ${item.email} е обновен.`);
    await refresh();
  }

  function activationLink(email: string) {
    const url = new URL(
      `${baseUrl}trainings/admin.html`,
      window.location.origin,
    );
    url.searchParams.set("activate", "1");
    url.searchParams.set("email", email);
    return url.toString();
  }
  async function copyInviteLink(invite: UserInvite) {
    try {
      await navigator.clipboard.writeText(activationLink(invite.email));
      setNotice(`Линкът за ${invite.email} е копиран.`);
      setError("");
    } catch {
      setError("Линкът не можа да се копира. Опитайте отново.");
    }
  }
  async function deleteInvite(invite: UserInvite) {
    if (
      !supabase ||
      !window.confirm(`Да изтрия ли поканата за ${invite.email}?`)
    )
      return;
    setBusyId(invite.id);
    setError("");
    setNotice("");
    const { error: requestError } = await supabase.rpc(
      "owner_delete_training_invite",
      { invite_id: invite.id },
    );
    setBusyId("");
    if (requestError) {
      setError(errorMessage(requestError));
      return;
    }
    setNotice(`Поканата за ${invite.email} е изтрита.`);
    await refresh();
  }

  async function deleteProfile(item: Profile) {
    if (
      !supabase ||
      item.id === ownerId ||
      !window.confirm(
        `Да изтрия ли окончателно профила на ${item.email}? Потребителят повече няма да може да влиза.`,
      )
    )
      return;
    setBusyId(item.id);
    setError("");
    setNotice("");
    const { data: deleted, error: requestError } = await supabase.rpc(
      "owner_delete_training_profile",
      { target_user_id: item.id },
    );
    setBusyId("");
    if (requestError) {
      setError(errorMessage(requestError));
      return;
    }
    if (!deleted) {
      setError("Профилът не беше изтрит. Опитайте отново.");
      return;
    }
    setNotice(`Профилът на ${item.email} е изтрит.`);
    await refresh();
  }

  return (
    <section className="users-panel owner-users-panel">
      <div className="admin-section-heading">
        <div>
          <span>САМО ЗА OWNER</span>
          <h2>Управление на профили</h2>
        </div>
        <strong>{profiles.length}</strong>
      </div>
      <p>
        Създайте покана, копирайте нейния линк и го изпратете лично на човека.
        Автоматичен имейл не се изпраща.
      </p>
      <form className="invite-form" onSubmit={inviteUser}>
        <label>
          ИМЕ
          <input name="name" placeholder="Име и фамилия" />
        </label>
        <label>
          ИМЕЙЛ
          <input
            name="email"
            type="email"
            required
            placeholder="name@example.com"
          />
        </label>
        <label>
          РОЛЯ
          <select name="role" defaultValue="editor">
            <option value="editor">Редактор</option>
            <option value="admin">Администратор</option>
          </select>
        </label>
        <details className="training-access-menu invite-training-access">
          <summary>
            <span>Достъп до тренировки</span>
            <small>Изберете една или повече</small>
          </summary>
          <fieldset className="profile-training-access">
            <div>
              {trainingTitles.map((title) => (
                <label key={title}>
                  <input
                    type="checkbox"
                    name="training_access"
                    value={title}
                  />
                  <span>{title}</span>
                </label>
              ))}
            </div>
            <label className="history-permission">
              <input type="checkbox" name="can_view_history" />
              <span>
                <b>История</b>
                <small>Достъп до действията на всички администратори</small>
              </span>
            </label>
          </fieldset>
        </details>
        <button disabled={busyId === "invite"}>
          {busyId === "invite" ? "Създаване…" : "Създай покана"}
        </button>
      </form>
      {error && <div className="admin-alert error">{error}</div>}
      {notice && (
        <button className="admin-alert success" onClick={() => setNotice("")}>
          {notice}
          <span>×</span>
        </button>
      )}
      {loading ? (
        <div className="admin-data-loading">Зареждане на профилите…</div>
      ) : (
        <>
          <div className="users-heading">
            <strong>Съществуващи профили</strong>
            <span>{profiles.length}</span>
          </div>
          <div className="users-list owner-profile-list">
            {profiles.map((item) => (
              <details className="profile-card" key={item.id}>
                <summary>
                  <span className="profile-identity">
                    <strong>{item.display_name || item.email}</strong>
                    <small>{item.email}</small>
                    <small className="profile-access-summary" title={profileSummary(item, ownerId)}>
                      {profileSummary(item, ownerId)}
                    </small>
                  </span>
                  <span className={`profile-status ${item.active ? "active" : "inactive"}`}>
                    {item.id === ownerId
                      ? "OWNER"
                      : item.active
                        ? "АКТИВЕН"
                        : "СПРЯН"}
                  </span>
                </summary>
                <div className="profile-card-content">
                  <label className="profile-role-field">
                    <span>РОЛЯ</span>
                    <select
                      value={item.role}
                      disabled={item.id === ownerId || busyId === item.id}
                      onChange={(event) =>
                        void updateAccess(
                          item,
                          event.target.value as ProfileRole,
                          item.active,
                        )
                      }
                    >
                      <option value="owner" disabled>
                        Owner
                      </option>
                      <option value="admin">Администратор</option>
                      <option value="editor">Редактор</option>
                    </select>
                  </label>
                  <div className="profile-actions">
                    <button
                      className="edit-profile"
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void editProfileName(item)}
                    >
                      ✎ Редактирай име
                    </button>
                    {item.id === ownerId ? (
                      <b className="owner-self-badge">ВАШИЯТ ПРОФИЛ</b>
                    ) : (
                      <>
                        <button
                          className={item.active ? "deactivate" : "activate"}
                          disabled={busyId === item.id}
                          onClick={() =>
                            void updateAccess(item, item.role, !item.active)
                          }
                        >
                          {busyId === item.id
                            ? "…"
                            : item.active
                              ? "Спри достъпа"
                              : "Активирай"}
                        </button>
                        <button
                          className="delete-profile"
                          disabled={busyId === item.id}
                          onClick={() => void deleteProfile(item)}
                        >
                          Изтрий
                        </button>
                      </>
                    )}
                  </div>
                  <details className="training-access-menu existing-training-access">
                    <summary>
                      <span>Достъп и ограничения</span>
                      <small>
                        {item.id === ownerId
                          ? "Всички"
                          : item.training_access == null
                            ? "Всички"
                            : `${item.training_access.length} тренировки`}
                      </small>
                    </summary>
                    <fieldset className="profile-training-access">
                      {item.id === ownerId ? (
                        <small>Пълен достъп до всички тренировки и историята</small>
                      ) : (
                        <div>
                          {trainingTitles.map((title) => {
                            const access = item.training_access;
                            const checked = access == null || access.includes(title);
                            return (
                              <label key={title}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={busyId === item.id}
                                  onChange={() => {
                                    const current = access ?? trainingTitles;
                                    const next = checked
                                      ? current.filter((value) => value !== title)
                                      : [...current, title];
                                    void updateTrainingAccess(item, next);
                                  }}
                                />
                                <span>{title}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {item.id !== ownerId && (
                        <label className="history-permission">
                          <input
                            type="checkbox"
                            checked={Boolean(item.can_view_history)}
                            disabled={busyId === item.id}
                            onChange={(event) =>
                              void updateHistoryAccess(item, event.target.checked)
                            }
                          />
                          <span>
                            <b>История</b>
                            <small>Достъп до действията на всички администратори</small>
                          </span>
                        </label>
                      )}
                    </fieldset>
                  </details>
                </div>
              </details>
            ))}
          </div>
          {invites.length > 0 && (
            <>
              <div className="users-heading">
                <strong>Чакащи покани</strong>
                <span>{invites.length}</span>
              </div>
              <div className="invite-list owner-invite-list">
                {invites.map((invite) => (
                  <div key={invite.id}>
                    <span>
                      <strong>{invite.display_name || invite.email}</strong>
                      <small>
                        {invite.email} ·{" "}
                        {invite.role === "admin" ? "Администратор" : "Редактор"}
                      </small>
                      <small className="invite-training-summary">
                        {(invite.training_access ?? []).join(" · ")}
                      </small>
                      {invite.can_view_history && (
                        <small className="invite-history-access">
                          История
                        </small>
                      )}
                    </span>
                    <div className="invite-actions">
                      <button
                        className="copy-invite"
                        type="button"
                        onClick={() => void copyInviteLink(invite)}
                      >
                        Копирай линк
                      </button>
                      <button
                        className="delete-invite"
                        type="button"
                        disabled={busyId === invite.id}
                        onClick={() => void deleteInvite(invite)}
                      >
                        {busyId === invite.id ? "…" : "Изтрий"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function ActiveTraining({
  session,
  registrations,
  onEdit,
  onStop,
  onEditRegistration,
  onDeleteRegistration,
}: {
  session: TrainingSession;
  registrations: TrainingRegistration[];
  onEdit: () => void;
  onStop: () => void;
  onEditRegistration: (item: TrainingRegistration) => void;
  onDeleteRegistration: (item: TrainingRegistration) => void;
}) {
  const free = Math.max(0, session.capacity - registrations.length);
  return (
    <article className="admin-training-card active-glow-card">
      <div className="session-status">
        <span>● АКТИВНА ТРЕНИРОВКА</span>
      </div>
      <div className="active-training-line">
        <div>
          <strong>{shortDate(session.date)}</strong>
          <span>{dayName(session.date)}</span>
          <i>{shortTime(session.start_time)}</i>
        </div>
        <b>
          {session.title}{" "}
          <small>
            | {session.location} · {session.duration} минути
          </small>
        </b>
      </div>
      <div className="admin-progress">
        <div>
          <span
            style={{
              width: `${Math.min(100, (registrations.length / session.capacity) * 100)}%`,
            }}
          />
        </div>
        <strong>
          {registrations.length} / {session.capacity}
        </strong>
      </div>
      <div className="attendee-head">
        <strong>Записани</strong>
        <span>Остават {free} места</span>
      </div>
      {registrations.length === 0 ? (
        <p className="no-attendees">Все още няма записани.</p>
      ) : (
        <div className="live-attendee-list">
          {registrations.map((person, index) => (
            <AttendeeRow
              key={person.id}
              person={person}
              index={index}
              onEdit={() => onEditRegistration(person)}
              onDelete={() => onDeleteRegistration(person)}
            />
          ))}
        </div>
      )}
      <div className="session-actions compact-actions">
        <button onClick={onEdit}>Редактирай</button>
        <button className="stop" onClick={onStop}>
          Стоп
        </button>
      </div>
    </article>
  );
}

function AttendeeRow({
  person,
  index,
  onEdit,
  onDelete,
}: {
  person: TrainingRegistration;
  index: number;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const created = registrationMoment(person.created_at);
  return (
    <div className="live-attendee-row">
      <span className="attendee-number">{index + 1}.</span>
      <div className="attendee-inline-details">
        <div className="attendee-identity">
          <strong>{person.name}</strong>
          {person.booked_by && <small>Записан от: {person.booked_by}</small>}
        </div>
        <TariffBadge tariff={person.tariff} />
        <span className="attendee-phone">{person.phone}</span>
      </div>
      <span
        className="attendee-booked-at"
        title={`Записан на ${created.date} в ${created.time} ч.`}
      >
        <b>{created.shortDate}</b>
        <small>{created.time}</small>
      </span>
      <div className="attendee-actions">
        {onEdit && (
          <button
            className="attendee-edit"
            onClick={onEdit}
            aria-label={`Редактирай ${person.name}`}
          >
            ✎
          </button>
        )}
        {onDelete && (
          <button
            className="attendee-delete"
            onClick={onDelete}
            aria-label={`Премахни ${person.name}`}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
function TariffBadge({ tariff }: { tariff: TrainingRegistration["tariff"] }) {
  if (tariff === "none")
    return <span className="tariff-badge no-card">БЕЗ КАРТА</span>;
  if (tariff === "multisport")
    return <span className="tariff-badge multisport">MULTISPORT</span>;
  return (
    <span className={`tariff-badge ${tariff}`}>
      {tariff === "card8" ? "8" : "12"}
    </span>
  );
}

function AdminSessionRow({
  session,
  bookingOpen,
  count,
  onEdit,
  onStart,
  onStop,
  onDelete,
}: {
  session: TrainingSession;
  bookingOpen: boolean;
  count: number;
  onEdit: () => void;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`admin-session-row ${bookingOpen ? "is-open" : ""}`}>
      <div className="admin-row-status">
        <span>
          {bookingOpen
            ? "● АКТИВНА"
            : session.status === "closed"
              ? "● СПРЯНА"
              : "● ПРЕДСТОЯЩА"}
        </span>
      </div>
      <div className="admin-row-main">
        <div className="admin-row-date">
          <strong>{shortDate(session.date)}</strong>
          <span>{dayName(session.date)}</span>
          <i>{shortTime(session.start_time)}</i>
        </div>
        <div>
          <h3>{session.title}</h3>
          <p>
            {session.location} · {session.duration} минути · {count}/
            {session.capacity} записани · автоматично{" "}
            {session.booking_open_hours ?? 48} ч. преди
          </p>
        </div>
      </div>
      <div className="admin-row-actions">
        <button onClick={onEdit}>Редактирай</button>
        <button className="start" onClick={onStart} disabled={bookingOpen}>
          Старт
        </button>
        <button className="stop" onClick={onStop} disabled={!bookingOpen}>
          Стоп
        </button>
        <button className="delete" onClick={onDelete}>
          Изтрий
        </button>
      </div>
    </article>
  );
}

function CompletedTraining({
  session,
  registrations,
  onEdit,
  onEditRegistration,
  onDelete,
}: {
  session: TrainingSession;
  registrations: TrainingRegistration[];
  onEdit: () => void;
  onEditRegistration: (item: TrainingRegistration) => void;
  onDelete: () => void;
}) {
  return (
    <details className="completed-training">
      <summary>
        <div>
          <strong>{shortDate(session.date)}</strong>
          <span>
            {dayName(session.date)} · {shortTime(session.start_time)}
          </span>
        </div>
        <h3>{session.title}</h3>
        <b>{registrations.length} записани</b>
        <i>⌄</i>
      </summary>
      <div className="completed-body">
        {registrations.length ? (
          <div className="live-attendee-list">
            {registrations.map((person, index) => (
              <AttendeeRow
                key={person.id}
                person={person}
                index={index}
                onEdit={() => onEditRegistration(person)}
              />
            ))}
          </div>
        ) : (
          <p className="no-attendees">Няма записани участници.</p>
        )}
        <div className="admin-row-actions">
          <button onClick={onEdit}>Редактирай</button>
          <button className="delete" onClick={onDelete}>
            Изтрий
          </button>
        </div>
      </div>
    </details>
  );
}
function EmptyAdmin({ title, text }: { title: string; text: string }) {
  return (
    <div className="admin-empty">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function HeroContentEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedSlug, setSelectedSlug] = useState("main");
  const [content, setContent] = useState<SiteContent>(defaultSiteContent);
  const [contents, setContents] = useState<Record<string, SiteContent>>({});
  const [titleScale, setTitleScale] = useState(1);
  const [bodyScale, setBodyScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    document.body.classList.add("modal-open");
    (async () => {
      if (!supabase) return;
      const { data, error: requestError } = await supabase
        .from("site_content")
        .select("id,hero_eyebrow,hero_title,hero_description,hero_tags")
        .order("id");
      if (requestError) throw requestError;
      const next: Record<string, SiteContent> = {};
      (data ?? []).forEach((item) => (next[item.id] = item as SiteContent));
      setContents(next);
      setContent(next.main ?? defaultSiteContent);
    })()
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
    return () => document.body.classList.remove("modal-open");
  }, []);
  useEffect(() => {
    const value = contents[selectedSlug] ??
      (selectedSlug === "main"
        ? defaultSiteContent
        : {
            id: selectedSlug,
            hero_eyebrow: "FIT BODY CENTER",
            hero_title: trainingPages.find((page) => page.slug === selectedSlug)?.title ?? "",
            hero_description:
              trainingPages.find((page) => page.slug === selectedSlug)?.description ?? "",
            hero_tags: "Избери дата и запази своето място.",
          });
    setContent(value);
    setTitleScale(Number(window.localStorage.getItem(`training-title-scale-${selectedSlug}`) ?? 1));
    setBodyScale(Number(window.localStorage.getItem(`training-body-scale-${selectedSlug}`) ?? 1));
  }, [contents, selectedSlug]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: requestError } = await supabase
      .from("site_content")
      .upsert({ ...content, id: selectedSlug });
    window.localStorage.setItem(`training-title-scale-${selectedSlug}`, String(titleScale));
    window.localStorage.setItem(`training-body-scale-${selectedSlug}`, String(bodyScale));
    setBusy(false);
    if (requestError) setError(errorMessage(requestError));
    else onSaved();
  }
  return (
    <div
      className="editor-backdrop hero-editor-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="training-editor hero-content-editor" onSubmit={save}>
        <div className="editor-handle" />
        <div className="editor-title">
          <div>
            <span>НАЧАЛНА СТРАНИЦА</span>
            <h2>Текст върху снимката</h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {loading ? (
          <div className="admin-data-loading">Зареждане…</div>
        ) : (
          <>
            <label>
              ТРЕНИРОВКА
              <select
                value={selectedSlug}
                onChange={(event) => setSelectedSlug(event.target.value)}
              >
                <option value="main">Начална страница</option>
                {trainingPages.map((page) => (
                  <option key={page.slug} value={page.slug}>{page.title}</option>
                ))}
              </select>
            </label>
            <label>
              МАЛЪК НАДПИС
              <input
                value={content.hero_eyebrow}
                onChange={(event) =>
                  setContent({ ...content, hero_eyebrow: event.target.value })
                }
                required
              />
            </label>
            <label>
              ГЛАВНО ЗАГЛАВИЕ
              <textarea
                value={content.hero_title}
                onChange={(event) =>
                  setContent({ ...content, hero_title: event.target.value })
                }
                rows={3}
                required
              />
              <small>Новият ред се запазва и на страницата.</small>
            </label>
            <label>
              ОПИСАНИЕ
              <textarea
                value={content.hero_description}
                onChange={(event) =>
                  setContent({
                    ...content,
                    hero_description: event.target.value,
                  })
                }
                rows={3}
                required
              />
            </label>
            <label>
              МАЛКИ ЕТИКЕТИ
              <input
                value={content.hero_tags}
                onChange={(event) =>
                  setContent({ ...content, hero_tags: event.target.value })
                }
              />
              <small>Разделяй ги със запетая.</small>
            </label>
            <div className="hero-font-controls">
              <label>
                РАЗМЕР НА ЗАГЛАВИЕТО
                <input type="range" min="0.8" max="1.4" step="0.05" value={titleScale} onChange={(event) => setTitleScale(Number(event.target.value))} />
              </label>
              <label>
                РАЗМЕР НА ОПИСАНИЕТО
                <input type="range" min="0.8" max="1.4" step="0.05" value={bodyScale} onChange={(event) => setBodyScale(Number(event.target.value))} />
              </label>
            </div>
          </>
        )}
        {error && <div className="login-error">{error}</div>}
        <button className="editor-save" disabled={busy || loading}>
          {busy ? "Запазване…" : "Запази текста"}
        </button>
      </form>
    </div>
  );
}

function RegistrationEditor({
  registration,
  onClose,
  onSaved,
}: {
  registration: TrainingRegistration;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(registration.name);
  const [phone, setPhone] = useState(registration.phone);
  const [tariff, setTariff] = useState(registration.tariff);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const created = registrationMoment(registration.created_at);
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: requestError } = await supabase
      .from("training_registrations")
      .update({ name: name.trim(), phone: phone.trim(), tariff })
      .eq("id", registration.id);
    setBusy(false);
    if (requestError) setError(errorMessage(requestError));
    else onSaved();
  }
  return (
    <div
      className="editor-backdrop registration-editor-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="training-editor registration-editor" onSubmit={save}>
        <div className="editor-handle" />
        <div className="editor-title">
          <div>
            <span>ЗАПИСАН УЧАСТНИК</span>
            <h2>Редактирай данните</h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="registration-created-info">
          <span>ЗАПИСВАНЕТО Е НАПРАВЕНО</span>
          <strong>
            {created.date} · {created.time} ч.
          </strong>
        </div>
        <label>
          ИМЕ И ФАМИЛИЯ
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
          />
        </label>
        <label>
          ТЕЛЕФОН
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            required
          />
        </label>
        <label>
          НАЧИН НА ПОСЕЩЕНИЕ
          <select
            value={tariff}
            onChange={(event) =>
              setTariff(event.target.value as TrainingRegistration["tariff"])
            }
          >
            <option value="none">Без карта</option>
            <option value="card8">Карта 8 посещения</option>
            <option value="card12">Карта 12 посещения</option>
            <option value="multisport">MultiSport</option>
          </select>
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="editor-save" disabled={busy}>
          {busy ? "Запазване…" : "Запази промените"}
        </button>
      </form>
    </div>
  );
}

function SessionEditor({
  session,
  allowedTrainingTitles,
  onClose,
  onSaved,
}: {
  session: TrainingSession | null;
  allowedTrainingTitles: string[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialDate = session?.date ?? new Date().toISOString().slice(0, 10),
    initialTime = shortTime(session?.start_time ?? "18:30");
  const [date, setDate] = useState(initialDate);
  const [hour, setHour] = useState(initialTime.slice(0, 2));
  const [minute, setMinute] = useState(initialTime.slice(3, 5));
  const [title, setTitle] = useState(
    session?.title ?? allowedTrainingTitles?.[0] ?? "Пилатес",
  );
  const [location, setLocation] = useState(
    session?.location ?? "Fit Body Center",
  );
  const [duration, setDuration] = useState(session?.duration ?? 60);
  const [standardCapacity, setStandardCapacity] = useState(
    session?.standard_capacity ?? 15,
  );
  const [multisportCapacity, setMultisportCapacity] = useState(
    session?.multisport_capacity ?? 10,
  );
  const capacity = standardCapacity + multisportCapacity;
  const [bookingOpenHours, setBookingOpenHours] = useState(
    session?.booking_open_hours ?? 48,
  );
  const fieldsRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<QuickTemplate[]>(() =>
    allowedTrainingTitles === null
      ? quickTemplates
      : quickTemplates.filter((item) =>
          allowedTrainingTitles.includes(item.title),
        ),
  );
  const [manageTemplates, setManageTemplates] = useState(false);
  const [templateEditor, setTemplateEditor] = useState<QuickTemplate | null>(
    null,
  );
  const loadTemplates = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("training_templates")
      .select("*")
      .order("sort_order")
      .order("weekday")
      .order("start_time");
    if (data?.length)
      setTemplates(
        data
          .filter(
            (item) =>
              allowedTrainingTitles === null ||
              allowedTrainingTitles.includes(item.title),
          )
          .map((item, index) => ({
          id: item.id,
          title: item.title,
          weekday: item.weekday,
          time: shortTime(item.start_time),
          location: item.location,
          duration: item.duration,
          capacity: item.capacity,
          standard_capacity: item.standard_capacity ?? 15,
          multisport_capacity: item.multisport_capacity ?? 10,
          booking_open_hours: item.booking_open_hours,
          sort_order: item.sort_order ?? index,
          })),
      );
  }, [allowedTrainingTitles]);
  useEffect(() => {
    document.body.classList.add("modal-open");
    loadTemplates();
    return () => document.body.classList.remove("modal-open");
  }, [loadTemplates]);
  function applyTemplate(template: QuickTemplate) {
    const next = nextWeekday(template.weekday);
    setDate(next);
    setTitle(template.title);
    setHour(template.time.slice(0, 2));
    setMinute(template.time.slice(3, 5));
    setLocation(template.location);
    setDuration(template.duration);
    setStandardCapacity(template.standard_capacity);
    setMultisportCapacity(template.multisport_capacity);
    setBookingOpenHours(template.booking_open_hours);
    window.setTimeout(
      () => fieldsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const values = {
      date,
      start_time: `${hour}:${minute}:00`,
      title: title.trim(),
      location: location.trim(),
      duration,
      capacity,
      standard_capacity: standardCapacity,
      multisport_capacity: multisportCapacity,
      booking_open_hours: bookingOpenHours,
      status: session?.status ?? "scheduled",
    };
    const result = session
      ? await supabase
          .from("training_sessions")
          .update(values)
          .eq("id", session.id)
      : await supabase.from("training_sessions").insert(values);
    setBusy(false);
    if (result.error) setError(errorMessage(result.error));
    else onSaved();
  }
  return (
    <>
      <div
        className="editor-backdrop"
        onMouseDown={(event) =>
          event.target === event.currentTarget && onClose()
        }
      >
        <form className="training-editor live-editor" onSubmit={save}>
          <div className="editor-handle" />
          <div className="editor-title">
            <div>
              <span>{session ? "РЕДАКЦИЯ" : "НОВА ТРЕНИРОВКА"}</span>
              <h2>
                {session ? "Редактирай тренировката" : "Създай тренировка"}
              </h2>
            </div>
            <button type="button" onClick={onClose}>
              ×
            </button>
          </div>
          {!session && (
            <section
              className={`schedule-templates ${manageTemplates ? "is-managing" : ""}`}
            >
              <div className="template-heading">
                <div>
                  <strong>ГОТОВИ ТРЕНИРОВКИ</strong>
                  <span>
                    {manageTemplates
                      ? "Избери „Редактирай“ под желания шаблон"
                      : "Избери бутон и полетата ще се попълнят автоматично"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setManageTemplates((value) => !value)}
                >
                  {manageTemplates ? "Готово" : "⚙ Настройки"}
                </button>
              </div>
              <div className="schedule-template-grid">
                {templates.map((template, index) => (
                  <div
                    className="schedule-template-item"
                    key={
                      template.id ??
                      `${template.weekday}-${template.time}-${index}`
                    }
                  >
                    <button
                      className="template-apply"
                      type="button"
                      onClick={() => applyTemplate(template)}
                    >
                      <span>
                        {shortWeekdays[template.weekday]} · {template.time}
                      </span>
                      <strong>{template.title}</strong>
                    </button>
                    {manageTemplates && (
                      <button
                        className="template-edit"
                        type="button"
                        onClick={() => setTemplateEditor(template)}
                      >
                        Редактирай
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <div ref={fieldsRef} className="session-field-row date-time-row">
            <label>
              ДАТА
              <ModernDatePicker value={date} onChange={setDate} />
            </label>
            <label>
              ЧАС (24 ЧАСА)
              <div className="split-time">
              <select
                value={hour}
                onChange={(event) => setHour(event.target.value)}
              >
                {Array.from({ length: 24 }, (_, index) => (
                  <option key={index} value={String(index).padStart(2, "0")}>
                    {String(index).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span>:</span>
              <select
                value={minute}
                onChange={(event) => setMinute(event.target.value)}
              >
                {[0, 10, 20, 30, 40, 45, 50].map((value) => (
                  <option key={value} value={String(value).padStart(2, "0")}>
                    {String(value).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <strong>
                {hour}:{minute}
              </strong>
              </div>
            </label>
          </div>
          <div className="session-field-row title-location-row">
            <label>
              ИМЕ НА ТРЕНИРОВКАТА
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                placeholder="Пилатес"
              />
            </label>
            <label>
              МЯСТО
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                required
              />
            </label>
          </div>
          <div className="session-settings-grid">
            <div className="session-general-settings">
              <div className="editor-row">
                <label>
                  ОБЩО МЕСТА
                  <input type="number" readOnly max="500" value={capacity} />
                </label>
                <label>
                  МИНУТИ
                  <input
                    type="number"
                    min="10"
                    max="300"
                    step="5"
                    value={duration}
                    onChange={(event) =>
                      setDuration(Number(event.target.value))
                    }
                  />
                </label>
              </div>
              <label className="session-activation">
                АВТОМАТИЧНО АКТИВИРАНЕ
                <div className="activation-hours">
                  <input
                    type="number"
                    min="0"
                    max="720"
                    step="1"
                    value={bookingOpenHours}
                    onChange={(event) =>
                      setBookingOpenHours(Number(event.target.value))
                    }
                  />
                  <span>часа преди тренировката</span>
                  {[24, 48, 72].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={bookingOpenHours === value ? "selected" : ""}
                      onClick={() => setBookingOpenHours(value)}
                    >
                      {value} ч.
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <div className="capacity-groups">
              <strong>ЛИМИТИ</strong>
              <p>Точните бройки се виждат само в админ панела.</p>
              <div>
              <label>
                Без карта + Карта 8 + Карта 12
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={standardCapacity}
                  onChange={(event) =>
                    setStandardCapacity(Number(event.target.value))
                  }
                />
              </label>
              <label>
                MultiSport
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={multisportCapacity}
                  onChange={(event) =>
                    setMultisportCapacity(Number(event.target.value))
                  }
                />
              </label>
              </div>
            </div>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="editor-save" disabled={busy}>
            {busy
              ? "Запазване…"
              : session
                ? "Запази промените"
                : "Създай тренировката"}
          </button>
        </form>
      </div>
      {templateEditor && (
        <TemplateEditor
          template={templateEditor}
          onClose={() => setTemplateEditor(null)}
          onSaved={async () => {
            setTemplateEditor(null);
            await loadTemplates();
          }}
          onDelete={async () => {
            if (
              !supabase ||
              !templateEditor.id ||
              !window.confirm(`Да изтрия ли шаблона „${templateEditor.title}“?`)
            )
              return;
            const { error: requestError } = await supabase
              .from("training_templates")
              .delete()
              .eq("id", templateEditor.id);
            if (requestError) {
              setError(errorMessage(requestError));
              return;
            }
            setTemplateEditor(null);
            await loadTemplates();
          }}
        />
      )}
    </>
  );
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
  onDelete,
}: {
  template: QuickTemplate;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(template.title);
  const [weekday, setWeekday] = useState(template.weekday);
  const [hour, setHour] = useState(template.time.slice(0, 2));
  const [minute, setMinute] = useState(template.time.slice(3, 5));
  const [location, setLocation] = useState(template.location);
  const [duration, setDuration] = useState(template.duration);
  const [standardCapacity, setStandardCapacity] = useState(
    template.standard_capacity,
  );
  const [multisportCapacity, setMultisportCapacity] = useState(
    template.multisport_capacity,
  );
  const capacity = standardCapacity + multisportCapacity;
  const [bookingOpenHours, setBookingOpenHours] = useState(
    template.booking_open_hours,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !template.id) {
      setError("Шаблоните още не са свързани с базата.");
      return;
    }
    setBusy(true);
    const { error: requestError } = await supabase
      .from("training_templates")
      .update({
        title: title.trim(),
        weekday,
        start_time: `${hour}:${minute}:00`,
        location: location.trim(),
        duration,
        capacity,
        standard_capacity: standardCapacity,
        multisport_capacity: multisportCapacity,
        booking_open_hours: bookingOpenHours,
      })
      .eq("id", template.id);
    setBusy(false);
    if (requestError) setError(errorMessage(requestError));
    else onSaved();
  }
  return (
    <div
      className="editor-backdrop template-editor-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="training-editor template-editor" onSubmit={save}>
        <div className="editor-handle" />
        <div className="editor-title">
          <div>
            <span>ГОТОВА ТРЕНИРОВКА</span>
            <h2>Редактирай шаблона</h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="session-field-row template-day-time-row">
          <label>
            ДЕН
            <select
              value={weekday}
              onChange={(event) => setWeekday(Number(event.target.value))}
            >
              {shortWeekdays.slice(1).map((day, index) => (
                <option key={day} value={index + 1}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label>
            ЧАС
            <div className="split-time template-time">
              <select
                value={hour}
                onChange={(event) => setHour(event.target.value)}
              >
                {Array.from({ length: 24 }, (_, index) => (
                  <option key={index} value={String(index).padStart(2, "0")}>
                    {String(index).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <span>:</span>
              <select
                value={minute}
                onChange={(event) => setMinute(event.target.value)}
              >
                {[0, 10, 20, 30, 40, 45, 50].map((value) => (
                  <option key={value} value={String(value).padStart(2, "0")}>
                    {String(value).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <strong>
                {hour}:{minute}
              </strong>
            </div>
          </label>
        </div>
        <div className="session-field-row title-location-row">
          <label>
            ИМЕ
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label>
            МЯСТО
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              required
            />
          </label>
        </div>
        <div className="session-settings-grid template-settings-grid">
          <div className="session-general-settings">
            <div className="editor-row">
              <label>
                ОБЩО МЕСТА
                <input type="number" readOnly max="500" value={capacity} />
              </label>
              <label>
                МИНУТИ
                <input
                  type="number"
                  min="10"
                  max="300"
                  step="5"
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                />
              </label>
            </div>
            <label className="session-activation">
              АКТИВИРАНЕ ПРЕДИ ТРЕНИРОВКАТА
              <div className="activation-hours">
                <input
                  type="number"
                  min="0"
                  max="720"
                  value={bookingOpenHours}
                  onChange={(event) =>
                    setBookingOpenHours(Number(event.target.value))
                  }
                />
                <span>часа преди тренировката</span>
                {[24, 48, 72].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={bookingOpenHours === value ? "selected" : ""}
                    onClick={() => setBookingOpenHours(value)}
                  >
                    {value} ч.
                  </button>
                ))}
              </div>
            </label>
          </div>
          <div className="capacity-groups">
          <strong>ЛИМИТИ</strong>
          <p>Първата бройка е обща за трите начина на посещение.</p>
          <div>
            <label>
              Без карта + Карта 8 + Карта 12
              <input
                type="number"
                min="0"
                max="500"
                value={standardCapacity}
                onChange={(event) =>
                  setStandardCapacity(Number(event.target.value))
                }
              />
            </label>
            <label>
              MultiSport
              <input
                type="number"
                min="0"
                max="500"
                value={multisportCapacity}
                onChange={(event) =>
                  setMultisportCapacity(Number(event.target.value))
                }
              />
            </label>
          </div>
          </div>
        </div>
        {error && <div className="login-error">{error}</div>}
        <div className="template-editor-actions">
          <button className="template-delete" type="button" onClick={onDelete}>
            Изтрий шаблона
          </button>
          <button className="editor-save" disabled={busy}>
            {busy ? "Запазване…" : "Запази шаблона"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModernDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const selected = useMemo(() => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [value]);
  const [view, setView] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const [open, setOpen] = useState(false);
  const days = useMemo(() => {
    const year = view.getFullYear(),
      month = view.getMonth(),
      offset = (new Date(year, month, 1).getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, month, index - offset + 1);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return { date, iso, muted: date.getMonth() !== month };
    });
  }, [view]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="modern-date-picker">
      <button
        type="button"
        className="modern-date-toggle"
        aria-expanded={open}
        onClick={() => {
          setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
          setOpen(!open);
        }}
      >
        <strong>
          {String(selected.getDate()).padStart(2, "0")}.
          {String(selected.getMonth() + 1).padStart(2, "0")}.
          {selected.getFullYear()}
        </strong>
        <i>{open ? "⌃" : "⌄"}</i>
      </button>
      {open && (
        <div className="modern-date-calendar">
          <div className="modern-date-head">
            <button
              type="button"
              onClick={() =>
                setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))
              }
            >
              ‹
            </button>
            <strong>
              {months[view.getMonth()]} {view.getFullYear()}
            </strong>
            <button
              type="button"
              onClick={() =>
                setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))
              }
            >
              ›
            </button>
          </div>
          <div className="modern-date-week">
            {["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "НД"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="modern-date-grid">
            {days.map((item) => (
              <button
                type="button"
                key={item.iso}
                className={`${item.muted ? "muted " : ""}${item.iso === value ? "selected " : ""}${item.iso === today ? "today" : ""}`}
                onClick={() => {
                  onChange(item.iso);
                  if (item.muted)
                    setView(
                      new Date(
                        item.date.getFullYear(),
                        item.date.getMonth(),
                        1,
                      ),
                    );
                  setOpen(false);
                }}
              >
                {item.date.getDate()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function sortSessions(a: TrainingSession, b: TrainingSession) {
  return `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`);
}
function nextWeekday(target: number) {
  const today = new Date();
  const current = today.getDay() || 7;
  let diff = (target - current + 7) % 7;
  if (diff === 0) diff = 7;
  today.setDate(today.getDate() + diff);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function LoginPanel() {
  const invitationParams = new URLSearchParams(window.location.search),
    invitedEmail = invitationParams.get("email") ?? "";
  const [mode, setMode] = useState<"login" | "activate">(
    invitationParams.get("activate") === "1" ? "activate" : "login",
  );
  const [emailValue, setEmailValue] = useState(invitedEmail);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const remember = form.get("remember") === "on";
    window.localStorage.setItem(
      "trainings-remember-login",
      remember ? "1" : "0",
    );
    if (mode === "login") {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError)
        setError(
          authError.message === "Invalid login credentials"
            ? "Грешен имейл или парола."
            : authError.message,
        );
    } else {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.href.split("#")[0] },
      });
      if (authError) setError(authError.message);
      else
        setMessage(
          "Профилът е създаден. Провери имейла си за потвърждение, след което влез.",
        );
    }
    setBusy(false);
  };
  return (
    <main className="login-shell matched-login-shell">
      <a className="matched-login-back" href={`${baseUrl}trainings.html`}>
        ← Назад към сайта
      </a>
      <section className="login-card matched-login-card">
        <div className="matched-login-mark">F</div>
        <h1>{mode === "login" ? "Admin Panel" : "Активирай покана"}</h1>
        <p className="matched-login-subtitle">FIT BODY CENTER</p>
        <form onSubmit={submit}>
          <label>
            ПОТРЕБИТЕЛСКИ ИМЕЙЛ
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              value={emailValue}
              onChange={(event) => setEmailValue(event.target.value)}
              readOnly={mode === "activate" && Boolean(invitedEmail)}
              placeholder="name@example.com"
            />
          </label>
          <label>
            ПАРОЛА
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                required
                minLength={8}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="Минимум 8 символа"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Скрий паролата" : "Покажи паролата"}
              >
                ◉
              </button>
            </div>
          </label>
          {mode === "login" && (
            <label className="remember-login">
              <input type="checkbox" name="remember" defaultChecked />
              <span>Запомни ме на това устройство</span>
            </label>
          )}
          {error && <div className="login-error">{error}</div>}
          {message && <div className="login-message">{message}</div>}
          <button className="login-submit" disabled={busy}>
            {busy
              ? "Моля, изчакай…"
              : mode === "login"
                ? "ВХОД"
                : "Създай профил"}
          </button>
        </form>
        <button
          className="login-switch"
          onClick={() => {
            setMode(mode === "login" ? "activate" : "login");
            setError("");
            setMessage("");
          }}
        >
          {mode === "login"
            ? "Имаш покана? Активирай профил"
            : "Обратно към вход"}
        </button>
      </section>
    </main>
  );
}
function MissingConfiguration() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <span>FIT</span>
          <strong>BODY CENTER</strong>
        </div>
        <span className="login-kicker">НАСТРОЙКА</span>
        <h1>Login-ът очаква новия Supabase проект</h1>
        <p>
          За защитения админ панел трябва да са добавени Project URL и
          Publishable key.
        </p>
        <a className="back-to-public" href={`${baseUrl}trainings.html`}>
          ← Назад към сайта
        </a>
      </section>
    </main>
  );
}
function AdminLoading() {
  return (
    <main className="login-shell">
      <div className="admin-loading">
        <strong className="fit-loading-mark" aria-label="FIT">
          <i>F</i>
          <i>I</i>
          <i>T</i>
        </strong>
        <span>Зареждане</span>
      </div>
    </main>
  );
}
function AccessDenied({ email }: { email: string }) {
  return (
    <main className="login-shell">
      <section className="login-card">
        <span className="login-kicker">НЯМА ДОСТЪП</span>
        <h1>Този профил няма администраторски достъп.</h1>
        <p>{email}</p>
        <button
          className="login-submit"
          onClick={() => supabase?.auth.signOut()}
        >
          Изход
        </button>
        <a className="back-to-public" href={`${baseUrl}trainings.html`}>
          ← Назад към сайта
        </a>
      </section>
    </main>
  );
}
