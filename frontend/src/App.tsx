import { FormEvent, useEffect, useMemo, useState } from 'react';
import { pb } from './api';
import { weekdays, weekdayForDate as dayName, weekDates, monthWeekdays as monthDates, menuItems, menuMonthOptions, suggestedMenuForDate } from './operations';

type Row = Record<string, any>;
type Daycare = Row & { id: string; name: string; public_slug: string; allow_substitutions: boolean; sizes_enabled: boolean; operations_enabled: boolean; baseline_counts?: Partial<Record<(typeof weekdays)[number], number>> };
type Student = Row & { id: string; name: string; classroom: string; daycare: string; size: string; service_days: string[]; active: boolean };
type User = Row & { id: string; role: 'clc_admin' | 'daycare_admin'; daycare: string; display_name: string };
type MenuDay = Row & { id: string; daycare: string; public_slug: string; service_date: string; menu: string; note: string; closed: boolean; published: boolean; pizza_count: number };
type Tab = 'week' | 'students' | 'menu' | 'locations';

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dateOnly = (value: string) => String(value || '').slice(0, 10);
const localMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const schoolSlugBySubdomain: Record<string, string> = {
  bergenfield: 'lightbridge-bergenfield', 'lightbridge-bergenfield': 'lightbridge-bergenfield',
  fortlee: 'lightbridge-fort-lee', 'fort-lee': 'lightbridge-fort-lee', 'lightbridge-fort-lee': 'lightbridge-fort-lee',
  tle: 'tle-englewood-cliffs', 'tle-englewood-cliffs': 'tle-englewood-cliffs',
};
const schoolNameBySlug: Record<string, string> = {
  'lightbridge-bergenfield': 'Lightbridge Bergenfield',
  'lightbridge-fort-lee': 'Lightbridge Fort Lee',
  'tle-englewood-cliffs': 'TLE Englewood Cliffs',
};
const schoolSubdomainBySlug: Record<string, string> = {
  'lightbridge-bergenfield': 'bergenfield',
  'lightbridge-fort-lee': 'fortlee',
  'tle-englewood-cliffs': 'tle',
};
const isLocalHost = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);
function schoolMenuUrl(slug: string) {
  const query = `/?menu=${encodeURIComponent(slug)}`;
  return isLocalHost() ? query : `https://${schoolSubdomainBySlug[slug] || 'www'}.cliffslunchclub.com${query}`;
}

function schoolSlugForPage(params: URLSearchParams) {
  const requested = params.get('school');
  if (requested && schoolNameBySlug[requested]) return requested;
  return schoolSlugBySubdomain[window.location.hostname.toLowerCase().split('.')[0]] || '';
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const schoolSlug = schoolSlugForPage(params);
  const isSuperAdminDomain = window.location.hostname.toLowerCase().split('.')[0] === 'admin';
  const publicSlug = params.get('menu');
  if (publicSlug) return <PublicMenu slug={publicSlug} />;
  if (params.get('parents') === '1') return schoolSlug ? <PublicMenu slug={schoolSlug} /> : <SchoolSelection />;
  if (params.get('admin') === '1' || isSuperAdminDomain) return <AdminApp superAdminOnly={isSuperAdminDomain} />;
  return <LandingPage schoolSlug={schoolSlug} />;
}

function LandingPage({ schoolSlug }: { schoolSlug: string }) {
  const schoolName = schoolNameBySlug[schoolSlug];
  const superAdminUrl = isLocalHost() ? '/?admin=1' : 'https://admin.cliffslunchclub.com/';
  return <main className="landing-page">
    <header className="landing-brand"><div><b>Cliffs Lunch Club</b><span>{schoolName || 'School meals, made simple.'}</span></div><a className="super-admin-link" href={superAdminUrl}>CLC Super Admin Login</a></header>
    <section className="landing-content">
      <div className="eyebrow">WELCOME</div>
      <h1>{schoolName ? `${schoolName} lunch information.` : 'Lunch information for your school.'}</h1>
      <p>Choose how you’d like to continue.</p>
      <div className="landing-choices">
        <a className="landing-choice" href={schoolSlug ? `/?menu=${encodeURIComponent(schoolSlug)}` : '/?parents=1'}><span className="choice-kicker">FOR PARENTS</span><h2>View the lunch menu</h2><p>{schoolName ? `Open the latest menu for ${schoolName}.` : 'Choose your school to see its latest lunch menu.'}</p><b>{schoolName ? 'View menu' : 'Find your school'} <span aria-hidden="true">→</span></b></a>
        <a className="landing-choice admin-choice" href="/?admin=1"><span className="choice-kicker">FOR SCHOOL STAFF</span><h2>School admin sign in</h2><p>Sign in to manage your school’s lunch operations.</p><b>Admin sign in <span aria-hidden="true">→</span></b></a>
      </div>
    </section>
    <footer>Cliffs Lunch Club</footer>
  </main>;
}

function SchoolSelection() {
  const [schools, setSchools] = useState<{ name: string; public_slug: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    pb.send<{ name: string; public_slug: string }[]>('/api/public-schools', { method: 'GET' })
      .then(setSchools).catch(() => setError('School menus are unavailable right now. Please try again.'))
      .finally(() => setLoading(false));
  }, []);
  return <main className="school-select-page">
    <a className="back-link" href="/">← Back to home</a>
    <div className="eyebrow">FOR PARENTS</div><h1>Choose your school</h1><p className="muted">Select a school to view its lunch menu.</p>
    {error && <div className="notice error">{error}</div>}
    {loading && <p className="muted">Loading schools…</p>}
    {!loading && !error && <div className="school-list">{schools.map((school) => <a className="school-option" key={school.public_slug} href={schoolMenuUrl(school.public_slug)}><span>{school.name}</span><b aria-hidden="true">→</b></a>)}{!schools.length && <div className="panel empty-state"><p>No school menus are available yet.</p></div>}</div>}
  </main>;
}

function AdminApp({ superAdminOnly = false }: { superAdminOnly?: boolean }) {
  const [user, setUser] = useState<User | null>((pb.authStore.model as User | null) || null);
  const [authReady, setAuthReady] = useState(!pb.authStore.isValid);
  const [email, setEmail] = useState('admin@example.test');
  const [password, setPassword] = useState('LocalLunch2026!');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>(superAdminOnly || (window.location.hostname === 'localhost' && new URLSearchParams(window.location.search).has('admin')) ? 'menu' : 'week');
  const [daycares, setDaycares] = useState<Daycare[]>([]);
  const [selected, setSelected] = useState('');
  const [classrooms, setClassrooms] = useState<Row[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subs, setSubs] = useState<Row[]>([]);
  const [menuDays, setMenuDays] = useState<MenuDay[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [month, setMonth] = useState(localMonth());
  const [busy, setBusy] = useState(false);
  const [subStudent, setSubStudent] = useState('');
  const [subDate, setSubDate] = useState('');
  const [subCode, setSubCode] = useState('A');

  useEffect(() => {
    let active = true;
    const unsubscribe = pb.authStore.onChange((_token, model) => setUser((model as User | null) || null));
    if (pb.authStore.isValid) {
      void pb.collection('users').authRefresh<User>()
        .then((result) => { if (active) setUser(result.record); })
        .catch(() => { if (active) { pb.authStore.clear(); setUser(null); } })
        .finally(() => { if (active) setAuthReady(true); });
    } else {
      setUser(null);
      setAuthReady(true);
    }
    return () => { active = false; unsubscribe(); };
  }, []);
  const isClc = user?.role === 'clc_admin';
  const current = daycares.find((d) => d.id === selected) || null;
  const dates = useMemo(() => weekDates(weekAnchor), [weekAnchor]);

  async function load() {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const [locations, rooms, kids, replacements, menus] = await Promise.all([
        pb.collection('daycares').getFullList<Daycare>({ sort: 'name' }),
        pb.collection('classrooms').getFullList({ sort: 'name' }),
        pb.collection('students').getFullList<Student>({ sort: 'name' }),
        pb.collection('substitutions').getFullList({ sort: 'service_date' }),
        pb.collection('menu_days').getFullList<MenuDay>({ sort: 'service_date' }),
      ]);
      setDaycares(locations);
      setClassrooms(rooms);
      setStudents(kids.map((k) => ({ ...k, service_days: Array.isArray(k.service_days) ? k.service_days : [] })));
      setSubs(replacements); setMenuDays(menus);
      const allowed = user.daycare || selected;
      if (selected !== 'all' && !locations.some((d) => d.id === selected)) setSelected(allowed && locations.some((d) => d.id === allowed) ? allowed : locations[0]?.id || '');
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (authReady && user && (!superAdminOnly || user.role === 'clc_admin')) void load(); }, [authReady, user?.id]);

  async function signIn(e: FormEvent) {
    e.preventDefault(); setError('');
    try {
      const result = await pb.collection('users').authWithPassword<User>(email, password);
      if (superAdminOnly && result.record.role !== 'clc_admin') {
        pb.authStore.clear();
        setError('This sign-in is for CLC super admins. Use your school admin sign-in on your school’s subdomain.');
      }
    }
    catch (e) { setError(message(e)); }
  }
  function signOut() { pb.authStore.clear(); setDaycares([]); setStudents([]); }

  if (superAdminOnly && user && !isClc) return <main className="login-page"><div className="login-card"><div className="eyebrow">CLC SUPER ADMIN</div><h1>CLC admin access only</h1><p>This domain is reserved for CLC super admins.</p><button className="outline" onClick={signOut}>Sign out</button></div></main>;
  if (!authReady) return <main className="login-page"><div className="loading">Checking sign-in…</div></main>;

  async function createDaycare() {
    const name = window.prompt('School name');
    if (!name?.trim()) return;
    const base = slugify(name);
    try {
      const existing = new Set(daycares.map((d) => d.public_slug));
      let slug = base || 'daycare'; let n = 2;
      while (existing.has(slug)) slug = `${base}-${n++}`;
      const record = await pb.collection('daycares').create({ name: name.trim(), public_slug: slug, active: true, operations_enabled: true, baseline_counts: {}, allow_substitutions: false, sizes_enabled: false, sub_a_label: 'Option A', sub_b_label: 'Option B', sub_c_label: 'Option C', sub_v_label: 'Vegetarian' });
      setSelected(record.id); await load();
    } catch (e) { setError(message(e)); }
  }
  async function addAdmin(daycare: Daycare) {
    if (!daycare.operations_enabled) { setError('Enable daycare operations before creating a daycare admin.'); return; }
    const name = window.prompt(`School admin name for ${daycare.name}`); if (!name?.trim()) return;
    const accountEmail = window.prompt('Admin email'); if (!accountEmail?.trim()) return;
    const accountPassword = window.prompt('Temporary password (at least 12 characters)'); if (!accountPassword) return;
    try { await pb.send('/api/daycare-admins', { method: 'POST', body: { display_name: name.trim(), email: accountEmail.trim(), password: accountPassword, daycare: daycare.id } }); window.alert(`School admin account created for ${daycare.name}.`); }
    catch (e) { setError(message(e)); }
  }
  async function saveDaycare(values: Partial<Daycare>) {
    if (!current || !isClc) return;
    try {
      await pb.collection('daycares').update(current.id, values);
      if (values.operations_enabled === false) {
        const admins = await pb.collection('users').getFullList<User>({ filter: pb.filter('daycare = {:daycare} && role = {:role}', { daycare: current.id, role: 'daycare_admin' }) });
        await Promise.all(admins.map((admin) => pb.collection('users').update(admin.id, { active: false })));
      }
      await load();
    }
    catch (e) { setError(message(e)); }
  }

  const locStudents = students.filter((s) => selected === 'all' ? true : s.daycare === selected);
  const locClassrooms = classrooms.filter((c) => selected === 'all' ? true : c.daycare === selected);
  const selectableDaycare = selected === 'all' ? null : current;
  const operationsAvailable = isClc || Boolean(current?.operations_enabled);
  const nav: [Tab, string][] = operationsAvailable ? [['week', 'Weekly counts'], ['students', 'Students & classrooms']] : [];
  if (isClc) nav.push(['menu', 'Menus'], ['locations', 'Daycares']);

  if (!user) return <main className="login-page"><form className="login-card" onSubmit={signIn}>
    <a className="back-link" href="/">← Back to home</a><div className="eyebrow">{superAdminOnly ? 'CLC SUPER ADMIN' : 'SCHOOL STAFF'}</div><h1>{superAdminOnly ? 'CLC super admin sign in' : 'Admin sign in'}</h1><p>{superAdminOnly ? 'Sign in to manage menus and school settings across all locations.' : 'Sign in to manage schedules, substitutions, and counts.'}</p>
    {error && <div className="notice error">{error}</div>}
    <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
    <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
    <button className="primary full">Sign in</button><p className="muted small">Local demo: admin@example.test · LocalLunch2026!</p>
  </form></main>;

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div><b>Cliffs Lunch Club</b><small>School workspace</small></div></div>
      <div className="top-actions">{isClc && <select aria-label="Choose daycare" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="all">All daycares</option>{daycares.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
        {!isClc && <span className="location-chip">{current?.name || 'Your daycare'}</span>}<span className="user-chip">{user.display_name || user.email}</span><button className="quiet" onClick={signOut}>Sign out</button></div>
    </header>
    <nav className="tabs">{nav.map(([id, label]) => <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <main className="content">
      {error && <div className="notice error">{error}<button className="quiet" onClick={() => setError('')}>Dismiss</button></div>}
      {busy && <div className="loading">Refreshing…</div>}
      {!isClc && !operationsAvailable && <section><PageTitle title="Menu access" subtitle="Your school's published menu is available without signing in." /><div className="panel empty-state"><p>School operations are turned off for this location. Ask a CLC super admin to enable staff access if your team needs roster or weekly count tools.</p></div></section>}
      {tab === 'week' && operationsAvailable && <section>
        <PageTitle title="Weekly kitchen counts" subtitle="Counts follow each student's recurring service days. Changes to the roster update the totals automatically." />
        <div className="toolbar"><div className="week-control"><button className="outline" onClick={() => setWeekAnchor(new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate() - 7))}>‹</button><b>{formatRange(dates)}</b><button className="outline" onClick={() => setWeekAnchor(new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate() + 7))}>›</button><button className="quiet" onClick={() => setWeekAnchor(new Date())}>This week</button></div><button className="primary" onClick={() => window.print()}>Print US Letter sheet</button></div>
        <WeeklyTable dates={dates} locations={daycares} students={students} subs={subs} menus={menuDays} selected={selected} />
        {current && <div className="panel sub-panel"><div><h3>Record a substitution</h3><p className="muted">{current.allow_substitutions ? 'Choose a student, day, and option.' : 'Substitutions are turned off for this daycare.'}</p></div>
          {current.allow_substitutions && <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); try { await pb.send('/api/substitutions', { method: 'POST', body: { student: subStudent, daycare: current.id, service_date: subDate, code: subCode } }); setSubStudent(''); await load(); } catch (err) { setError(message(err)); } }}>
            <select value={subStudent} required onChange={(e) => setSubStudent(e.target.value)}><option value="">Student</option>{locStudents.filter((s) => s.active && s.daycare === current.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select value={subDate} required onChange={(e) => setSubDate(e.target.value)}><option value="">Weekday</option>{dates.map((d) => <option key={d} value={d}>{dayName(d)} {shortDate(d)}</option>)}</select>
            <select value={subCode} onChange={(e) => setSubCode(e.target.value)}>{['A', 'B', 'C', 'V'].map((code) => <option key={code} value={code}>{code} — {current[`sub_${code.toLowerCase()}_label`] || `Option ${code}`}</option>)}</select>
            <button className="primary">Add</button>
          </form>}
          <div className="saved-subs">{subs.filter((s) => s.daycare === current.id && dates.includes(dateOnly(s.service_date))).map((s) => <div className="list-row" key={s.id}><span>{dayName(dateOnly(s.service_date))} {shortDate(dateOnly(s.service_date))} · {locStudents.find((kid) => kid.id === s.student)?.name || 'Student'} · <b>{s.code}</b></span><button className="quiet danger-text" onClick={async () => { if (window.confirm('Remove this substitution?')) { try { await pb.collection('substitutions').delete(s.id); await load(); } catch (err) { setError(message(err)); } } }}>Remove</button></div>)}</div>
        </div>}
        <div className="legend">Substitution codes: {['A', 'B', 'C', 'V'].map((c) => <span key={c}><b>{c}</b> {current?.[`sub_${c.toLowerCase()}_label`] || `Option ${c}`}</span>)}</div>
      </section>}
      {tab === 'students' && operationsAvailable && <StudentsPage current={selectableDaycare} students={locStudents} classrooms={locClassrooms} onRefresh={load} error={setError} />}
      {tab === 'menu' && isClc && <MenuPage current={selectableDaycare} daycares={daycares} month={month} setMonth={setMonth} menuDays={menuDays} onRefresh={load} error={setError} />}
      {tab === 'locations' && isClc && <LocationsPage daycares={daycares} onCreate={createDaycare} onAddAdmin={addAdmin} onSave={saveDaycare} onRefresh={load} />}
    </main>
    <footer>Cliffs Lunch Club <span>·</span> Local working copy</footer>
  </div>;
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="page-title"><div className="eyebrow">DAYCARE LUNCH OPERATIONS</div><h1>{title}</h1><p>{subtitle}</p></div>; }

function WeeklyTable({ dates, locations, students, subs, menus, selected }: { dates: string[]; locations: Daycare[]; students: Student[]; subs: Row[]; menus: MenuDay[]; selected: string }) {
  const shown = locations.filter((d) => selected === 'all' || d.id === selected);
  const rows = shown.flatMap((location) => dates.map((date) => {
    const serviceStudents = students.filter((s) => s.active && s.daycare === location.id && s.service_days.includes(dayName(date)));
    const aggregateCount = Number(location.baseline_counts?.[dayName(date)] || 0);
    const daySubs = subs.filter((s) => s.daycare === location.id && dateOnly(s.service_date) === date);
    const closed = menus.some((m) => m.daycare === location.id && dateOnly(m.service_date) === date && m.closed);
    const served = closed ? [] : serviceStudents;
    const replacements = daySubs.filter((s) => served.some((kid) => kid.id === s.student));
    const totalMeals = served.length + (closed ? 0 : aggregateCount);
    return { location, date, total: totalMeals, subs: replacements.length, regular: totalMeals - replacements.length,
      small: served.filter((s) => s.size === 'small').length, large: served.filter((s) => s.size === 'large').length,
      pizza: Number(menus.find((m) => m.daycare === location.id && dateOnly(m.service_date) === date)?.pizza_count || 0),
      closed, replacementRows: replacements.map((s): Row => ({ ...s, studentName: students.find((kid) => kid.id === s.student)?.name || 'Student' })) };
  }));
  const total = rows.reduce((a, r) => ({ meals: a.meals + r.total, subs: a.subs + r.subs, pizza: a.pizza + r.pizza }), { meals: 0, subs: 0, pizza: 0 });
  return <div className="panel report-panel">
    <div className="report-heading"><div><div className="eyebrow">KITCHEN PRODUCTION SHEET</div><h2>Week of {shortDate(dates[0])}</h2></div><div className="totals"><span><b>{total.meals}</b> meals</span><span><b>{total.subs}</b> subs</span><span><b>{total.pizza}</b> pizza</span></div></div>
    <div className="table-scroll"><table className="report-table"><thead><tr><th>Weekday</th><th>Daycare</th><th>Meals</th><th>Regular</th><th>Subs</th><th>Small</th><th>Large</th><th>Pizza</th><th>Substitutions</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={`${r.location.id}-${r.date}`} className={r.closed ? 'closed-row' : ''}><td><b>{dayName(r.date)}</b><small>{shortDate(r.date)}</small></td><td>{r.location.name}</td><td className="num"><b>{r.closed ? '—' : r.total}</b>{r.closed && <small>Closed</small>}</td><td className="num">{r.closed ? '—' : r.regular}</td><td className="num">{r.closed ? '—' : r.subs}</td><td className="num">{r.closed || !r.location.sizes_enabled ? '—' : r.small}</td><td className="num">{r.closed || !r.location.sizes_enabled ? '—' : r.large}</td><td className="num">{r.closed ? '—' : r.pizza}</td><td>{r.replacementRows.length ? r.replacementRows.map((s) => <span className="sub-name" key={s.id}>{s.studentName} <b>{s.code}</b></span>) : <span className="muted">—</span>}</td></tr>)}</tbody>
      <tfoot><tr><th colSpan={2}>Week total</th><th>{total.meals}</th><th colSpan={2}>{total.subs} substitutions</th><th colSpan={2}></th><th>{total.pizza}</th><th></th></tr></tfoot></table></div>
    <p className="report-note">Meal totals combine roster schedules with any school-level headcount provided. Closed days are excluded. Substitutions are included in meal totals and shown separately.</p>
  </div>;
}

function StudentsPage({ current, students, classrooms, onRefresh, error }: { current: Daycare | null; students: Student[]; classrooms: Row[]; onRefresh: () => Promise<void>; error: (s: string) => void }) {
  const [roomName, setRoomName] = useState(''); const [editing, setEditing] = useState<Student | null>(null);
  const [name, setName] = useState(''); const [room, setRoom] = useState(''); const [size, setSize] = useState('standard'); const [days, setDays] = useState<string[]>([]); const [active, setActive] = useState(true);
  if (!current) return <Empty title="Choose one daycare" text="Select a single daycare in the top bar to manage its roster." />;
  async function saveRoom(e: FormEvent) { e.preventDefault(); try { await pb.collection('classrooms').create({ name: roomName.trim(), daycare: current!.id, active: true }); setRoomName(''); await onRefresh(); } catch (e) { error(message(e)); } }
  function edit(s: Student) { setEditing(s); setName(s.name); setRoom(s.classroom); setSize(s.size || 'standard'); setDays(s.service_days || []); setActive(s.active); }
  function reset() { setEditing(null); setName(''); setRoom(classrooms[0]?.id || ''); setSize('standard'); setDays([]); setActive(true); }
  async function saveStudent(e: FormEvent) { e.preventDefault(); try { const data = { name: name.trim(), classroom: room, daycare: current!.id, size, service_days: days, active }; if (editing) await pb.collection('students').update(editing.id, data); else await pb.collection('students').create(data); reset(); await onRefresh(); } catch (e) { error(message(e)); } }
  return <section><PageTitle title="Students & classrooms" subtitle={`Manage ${current.name}’s roster and recurring weekly service days.`} />
    <div className="split-grid">
      <div className="panel"><h2>Classrooms</h2><form className="inline-form" onSubmit={saveRoom}><input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="New classroom" required /><button className="primary">Add</button></form>
        <div className="simple-list">{classrooms.filter((c) => c.daycare === current!.id).map((c) => <div className="list-row" key={c.id}><span>{c.name}</span><span className="muted">{students.filter((s) => s.classroom === c.id).length} students</span><div className="row-actions"><button className="quiet" onClick={async () => { const name = window.prompt('Classroom name', c.name); if (name?.trim() && name.trim() !== c.name) { try { await pb.collection('classrooms').update(c.id, { name: name.trim(), daycare: current!.id }); await onRefresh(); } catch (e) { error(message(e)); } } }}>Edit</button><button className="quiet danger-text" onClick={async () => { if (window.confirm(`Delete ${c.name}? It must have no students.`)) { try { await pb.collection('classrooms').delete(c.id); await onRefresh(); } catch (e) { error(message(e)); } } }}>Delete</button></div></div>)}</div>
      </div>
      <div className="panel"><h2>{editing ? 'Edit student' : 'Add a student'}</h2><form onSubmit={saveStudent} className="stack-form">
        <label>Student name<input value={name} onChange={(e) => setName(e.target.value)} required /></label><label>Classroom<select value={room} onChange={(e) => setRoom(e.target.value)} required><option value="">Choose classroom</option>{classrooms.filter((c) => c.daycare === current!.id && c.active).map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        {current.sizes_enabled && <label>Meal size<select value={size} onChange={(e) => setSize(e.target.value)}><option value="small">Small</option><option value="large">Large</option><option value="standard">Standard</option></select></label>}
        <fieldset><legend>Recurring service days</legend><div className="day-picks">{weekdays.map((d) => <label key={d}><input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} />{d.slice(0, 3)}</label>)}</div></fieldset>
        <label className="checkline"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active for counts</label><div className="form-actions"><button className="primary">{editing ? 'Save changes' : 'Add student'}</button>{editing && <button type="button" className="outline" onClick={reset}>Cancel</button>}</div>
      </form></div>
    </div>
    <div className="panel roster-panel"><div className="section-heading"><h2>Roster</h2><span className="muted">{students.filter((s) => s.daycare === current!.id).length} students</span></div><div className="table-scroll"><table><thead><tr><th>Name</th><th>Classroom</th><th>Size</th><th>Weekly days</th><th>Status</th><th></th></tr></thead><tbody>
      {students.filter((s) => s.daycare === current!.id).map((s) => <tr key={s.id}><td><b>{s.name}</b></td><td>{classrooms.find((c) => c.id === s.classroom)?.name || '—'}</td><td>{current.sizes_enabled ? titleCase(s.size || 'standard') : '—'}</td><td>{s.service_days.join(', ') || 'None'}</td><td><span className={s.active ? 'status active-status' : 'status'}>{s.active ? 'Active' : 'Inactive'}</span></td><td className="row-actions"><button className="quiet" onClick={() => edit(s)}>Edit</button><button className="quiet danger-text" onClick={async () => { if (window.confirm(`Delete ${s.name}?`)) { try { await pb.collection('students').delete(s.id); await onRefresh(); } catch (e) { error(message(e)); } } }}>Delete</button></td></tr>)}
      {!students.some((s) => s.daycare === current!.id) && <tr><td colSpan={6} className="empty-cell">No students yet. Add a student above.</td></tr>}
    </tbody></table></div></div>
  </section>;
}

function MenuPage({ current, daycares, month, setMonth, menuDays, onRefresh, error }: { current: Daycare | null; daycares: Daycare[]; month: string; setMonth: (m: string) => void; menuDays: MenuDay[]; onRefresh: () => Promise<void>; error: (s: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, Partial<MenuDay>>>({});
  const selectedLocations = current ? [current] : daycares;
  const [locationId, setLocationId] = useState(current?.id || '');
  const months = menuMonthOptions();
  const futureMonth = months[1];
  useEffect(() => { if (current) setLocationId(current.id); else if (!selectedLocations.some((d) => d.id === locationId)) setLocationId(selectedLocations[0]?.id || ''); }, [current?.id, daycares.length]);
  useEffect(() => { if (!months.includes(month)) setMonth(months[0]); }, [month, months.join('|')]);
  const location = selectedLocations.find((d) => d.id === locationId);
  const dates = monthDates(month);
  const customValue = '__custom_menu__';
  function keyFor(date: string) { return `${location?.id || 'none'}:${date}`; }
  function valueFor(date: string): Partial<MenuDay> {
    const saved = menuDays.find((d) => d.daycare === location?.id && dateOnly(d.service_date) === date);
    const weekday = dayName(date);
    const defaultClosed = weekday === 'Friday' && location?.public_slug === 'tle-englewood-cliffs';
    return { menu: saved?.menu ?? suggestedMenuForDate(date), note: saved?.note ?? '', closed: saved?.closed ?? defaultClosed, published: saved?.published ?? false, pizza_count: saved?.pizza_count ?? 0, ...saved, ...(drafts[keyFor(date)] || {}) };
  }
  function updateDraft(date: string, patch: Partial<MenuDay>) {
    const key = keyFor(date);
    setDrafts((previous) => ({ ...previous, [key]: { ...valueFor(date), ...(previous[key] || {}), ...patch } }));
  }
  async function saveDay(date: string) {
    if (!location) return;
    const value = valueFor(date); const saved = menuDays.find((d) => d.daycare === location.id && dateOnly(d.service_date) === date);
    const data = { daycare: location.id, daycare_name: location.name, public_slug: location.public_slug, service_date: `${date} 00:00:00.000Z`, menu: value.menu || '', note: value.note || '', closed: Boolean(value.closed), published: Boolean(value.published), pizza_count: Number(value.pizza_count || 0) };
    try { if (saved) await pb.collection('menu_days').update(saved.id, data); else await pb.collection('menu_days').create(data); setDrafts((previous) => { const next = { ...previous }; delete next[keyFor(date)]; return next; }); await onRefresh(); }
    catch (e) { error(message(e)); }
  }
  function exportWord() {
    if (!location) return;
    const body = dates.map((date) => { const v = valueFor(date); return `<tr><td>${dayName(date)} ${shortDate(date)}</td><td>${v.closed ? 'No lunch — closed' : esc(v.menu || '')}</td><td>${esc(v.note || '')}</td></tr>`; }).join('');
    const html = `<html><meta charset="utf-8"><h1>${esc(location.name)} — Menu ${esc(month)}</h1><table border="1" cellspacing="0" cellpadding="6"><tr><th>Date</th><th>Menu</th><th>Notes</th></tr>${body}</table></html>`;
    download(new Blob([html], { type: 'application/msword' }), `${location.public_slug}-${month}-menu.doc`);
  }
  return <section><PageTitle title="Monthly menus" subtitle="Choose a school, review the suggested menu, make changes, and publish days for parents." />
    <div className="toolbar"><div className="week-control"><label className="month-picker">Month<select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label>{!current && <label>School<select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{selectedLocations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}</div><div className="button-row"><button className="outline" onClick={exportWord} disabled={!location}>Download Word</button><button className="primary" onClick={() => window.print()}>Print / Save PDF</button></div></div>
    {location && <div className="panel calendar-panel"><div className="calendar-title"><div><div className="eyebrow">{location.name.toUpperCase()}</div><h2>{monthLabel(month)}</h2></div><a href={`${schoolMenuUrl(location.public_slug)}&month=${encodeURIComponent(month)}`} target="_blank" rel="noreferrer">Open public menu ↗</a></div>
      <p className="rotation-note">Next month is prefilled from the weekday rotation as unpublished suggestions. Review and save each day; staffing changes and holidays can be edited before publishing.</p>
      <div className="calendar-grid"><div className="calendar-head">Monday</div><div className="calendar-head">Tuesday</div><div className="calendar-head">Wednesday</div><div className="calendar-head">Thursday</div><div className="calendar-head">Friday</div>
        {dates.map((date) => { const v = valueFor(date); const saved = menuDays.some((d) => d.daycare === location.id && dateOnly(d.service_date) === date); const isStandard = menuItems.includes(v.menu as typeof menuItems[number]); const selectedMenu = isStandard ? v.menu as string : customValue; return <div className={`calendar-day ${v.closed ? 'day-closed' : ''}`} key={date}><div className="date-label">{shortDate(date)} <span>{dayName(date).slice(0, 3)}</span></div>
          {!saved && month === futureMonth && <span className="draft-label">Suggested · not published</span>}
          <select aria-label={`Menu for ${date}`} value={selectedMenu} disabled={Boolean(v.closed)} onChange={(e) => { const nextValue = e.target.value; updateDraft(date, { menu: nextValue === customValue ? (isStandard ? '' : v.menu || '') : nextValue }); }}>
            {menuItems.map((item) => <option key={item} value={item}>{item.replace('\n', ' — ')}</option>)}<option value={customValue}>Custom menu…</option>
          </select>
          {!isStandard && <textarea aria-label={`Custom menu for ${date}`} value={v.menu || ''} placeholder="Enter a custom menu" disabled={Boolean(v.closed)} onChange={(e) => updateDraft(date, { menu: e.target.value })} />}
          <input className="day-note" aria-label={`Note for ${date}`} value={v.note || ''} placeholder="Optional note" onChange={(e) => updateDraft(date, { note: e.target.value })} />
          <label className="compact-check"><input type="checkbox" checked={Boolean(v.closed)} onChange={(e) => updateDraft(date, { closed: e.target.checked, published: e.target.checked ? true : Boolean(v.published) })} /> Day off</label>
          <div className="day-controls"><label className="compact-check"><input type="checkbox" checked={Boolean(v.published)} disabled={!saved && month === futureMonth} onChange={(e) => updateDraft(date, { published: e.target.checked })} /> Public</label><label className="pizza-input">Pizza <input type="number" min="0" value={v.pizza_count || 0} onChange={(e) => updateDraft(date, { pizza_count: Number(e.target.value) })} /></label></div><button className="save-day" onClick={() => saveDay(date)}>{saved ? 'Save day' : 'Save draft'}</button></div>; })}
      </div><p className="muted small">Public menu: <code>{schoolMenuUrl(location.public_slug)}</code></p>
    </div>}
  </section>;
}

function LocationsPage({ daycares, onCreate, onAddAdmin, onSave, onRefresh }: { daycares: Daycare[]; onCreate: () => void; onAddAdmin: (d: Daycare) => void; onSave: (v: Partial<Daycare>) => Promise<void>; onRefresh: () => Promise<void> }) {
  const [selected, setSelected] = useState(daycares[0]?.id || ''); useEffect(() => { if (!daycares.some((d) => d.id === selected)) setSelected(daycares[0]?.id || ''); }, [daycares]);
  const daycare = daycares.find((d) => d.id === selected);
  return <section><PageTitle title="School settings" subtitle="CLC-wide settings and account setup for each school." /><div className="toolbar"><select value={selected} onChange={(e) => setSelected(e.target.value)}>{daycares.map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select><button className="primary" onClick={onCreate}>Add school</button></div>
    {daycare && <div className="panel settings-panel"><div className="section-heading"><div><h2>{daycare.name}</h2><span className="muted">Public menu: {schoolSubdomainBySlug[daycare.public_slug] || daycare.public_slug}.cliffslunchclub.com</span></div><button className="outline" disabled={!daycare.operations_enabled} title={!daycare.operations_enabled ? 'Enable school operations first' : ''} onClick={() => onAddAdmin(daycare)}>Create school admin</button></div>
      <label className="checkline"><input type="checkbox" checked={Boolean(daycare.operations_enabled)} onChange={(e) => void onSave({ operations_enabled: e.target.checked })} /> Allow school staff to use roster and weekly counts</label>
      <label className="checkline"><input type="checkbox" checked={daycare.allow_substitutions} onChange={(e) => void onSave({ allow_substitutions: e.target.checked })} /> Allow substitutions for this daycare</label>
      <label className="checkline"><input type="checkbox" checked={daycare.sizes_enabled} onChange={(e) => void onSave({ sizes_enabled: e.target.checked })} /> Track Small and Large meal counts</label>
      <h3>Substitution legend</h3><div className="legend-edit">{['a', 'b', 'c', 'v'].map((key) => <label key={key}>{key.toUpperCase()}<input defaultValue={daycare[`sub_${key}_label`] || ''} onBlur={(e) => { if (e.target.value !== daycare[`sub_${key}_label`]) void onSave({ [`sub_${key}_label`]: e.target.value } as Partial<Daycare>); }} /></label>)}</div>
      <button className="quiet" onClick={() => void onRefresh()}>Refresh location data</button>
    </div>}
  </section>;
}

function PublicMenu({ slug }: { slug: string }) {
  const params = new URLSearchParams(window.location.search); const months = menuMonthOptions(); const requestedMonth = params.get('month'); const month = requestedMonth && months.includes(requestedMonth) ? requestedMonth : months[0];
  const [rows, setRows] = useState<MenuDay[]>([]); const [title, setTitle] = useState('Cliffs Lunch Club'); const [error, setError] = useState('');
  useEffect(() => { (async () => { try { const records = await pb.collection('menu_days').getFullList<MenuDay>({ filter: pb.filter('public_slug = {:slug} && published = true', { slug }), sort: 'service_date' }); setRows(records.filter((r) => dateOnly(r.service_date).startsWith(month))); setTitle(records.find((r) => r.public_slug === slug)?.daycare_name || 'Cliffs Lunch Club'); } catch (e) { setError(message(e)); } })(); }, [slug, month]);
  const dates = monthDates(month);
  return <main className="public-page"><a className="back-link" href="/">← Back to home</a><header className="public-header"><div><div className="eyebrow">CLIFFS LUNCH CLUB</div><h1>{title}</h1><p>{monthLabel(month)} lunch menu</p></div></header><div className="public-toolbar"><label>Month<select value={month} onChange={(e) => { const url = new URL(window.location.href); url.searchParams.set('month', e.target.value); window.location.href = url.toString(); }}>{months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label><button className="outline" onClick={() => window.print()}>Print / Save PDF</button><button className="primary" onClick={() => exportPublicWord(title, month, dates, rows)}>Download Word</button></div>{error && <div className="notice error">Menu not available.</div>}
    <div className="public-menu-grid">{dates.map((d) => { const row = rows.find((r) => dateOnly(r.service_date) === d); return <article key={d} className={row?.closed ? 'public-day closed' : 'public-day'}><small>{dayName(d)} · {shortDate(d)}</small><p>{row?.closed ? 'No lunch service' : row?.menu || 'Menu will be posted soon'}</p>{row?.note && <span>{row.note}</span>}</article>; })}</div><footer>Questions? Contact your daycare administrator.</footer></main>;
}

function exportPublicWord(title: string, month: string, dates: string[], rows: MenuDay[]) {
  const body = dates.map((d) => { const row = rows.find((r) => dateOnly(r.service_date) === d); return `<tr><td>${dayName(d)} ${shortDate(d)}</td><td>${row?.closed ? 'No lunch service' : esc(row?.menu || 'Menu will be posted soon')}</td><td>${esc(row?.note || '')}</td></tr>`; }).join('');
  const html = `<html><meta charset="utf-8"><h1>${esc(title)} — ${esc(monthLabel(month))}</h1><table border="1" cellspacing="0" cellpadding="6"><tr><th>Date</th><th>Menu</th><th>Notes</th></tr>${body}</table></html>`;
  download(new Blob([html], { type: 'application/msword' }), `${slugify(title)}-${month}-menu.doc`);
}

function formatRange(dates: string[]) { return `${shortDate(dates[0])} – ${shortDate(dates[4])}`; }
function shortDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function monthLabel(value: string) { const [y, m] = value.split('-').map(Number); return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)); }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function message(e: unknown) { return e instanceof Error ? e.message : 'Something went wrong. Please try again.'; }
function download(blob: Blob, filename: string) { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }
function Empty({ title, text }: { title: string; text: string }) { return <div className="panel empty-state"><h2>{title}</h2><p>{text}</p></div>; }

export default App;
