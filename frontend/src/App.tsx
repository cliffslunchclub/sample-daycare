import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { pb } from './api';
import { menuPdf } from './menuPdf';
import { menuExportHtml, menuExportDocx, menuFilename, printMenuHtml } from './menuExport';
import { weekdays, weekdayForDate as dayName, weekDates, monthCalendarWeekdays as monthDates, menuMonthOptions, suggestedMenuForDate, shortStudentName, publishedMenuMonths } from './operations';

type Row = Record<string, any>;
type Daycare = Row & { id: string; name: string; public_slug: string; allow_substitutions: boolean; sizes_enabled: boolean; operations_enabled: boolean; count_mode: 'roster' | 'manual'; clc_managed_counts?: Partial<Record<(typeof weekdays)[number], number>>; baseline_pizza_counts?: Partial<Record<(typeof weekdays)[number], number>>; baseline_counts?: Partial<Record<(typeof weekdays)[number], number>> };
type Student = Row & { id: string; name: string; classroom: string; daycare: string; size: string; service_days: string[]; active: boolean };
type User = Row & { id: string; role: 'clc_admin' | 'daycare_admin'; daycare: string; display_name: string };
type MenuDay = Row & { id: string; daycare: string; public_slug: string; service_date: string; menu: string; note: string; closed: boolean; published: boolean; pizza_count: number };
type MenuItem = Row & { id: string; name: string; active: boolean };
type Tab = 'summary' | 'students' | 'menu' | 'items' | 'users' | 'locations';

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  if (publicSlug) return <SchoolSelection />;
  if (params.get('parents') === '1') return <SchoolSelection />;
  if (params.get('admin') === '1' || isSuperAdminDomain) return <AdminApp superAdminOnly={isSuperAdminDomain} />;
  return <LandingPage schoolSlug={schoolSlug} />;
}

function LandingPage({ schoolSlug }: { schoolSlug: string }) {
  const schoolName = schoolNameBySlug[schoolSlug];
  const superAdminUrl = isLocalHost() ? '/?admin=1' : 'https://admin.cliffslunchclub.com/';
  return <main className="landing-page">
    <header className="landing-brand"><div><b>Cliffs Lunch Club</b><span>{schoolName || 'School meals, made simple.'}</span></div><a className="super-admin-link" href={superAdminUrl}>CLC LOGIN</a></header>
    <section className="landing-content">
      <h1><strong>Welcome to Cliffs Lunch Club</strong></h1>
      <p>Choose how you’d like to continue.</p>
      <div className="landing-choices">
        <a className="landing-choice" href="/?parents=1"><span className="choice-kicker">FOR PARENTS</span><h2>View the Lunch Menu</h2><p>{schoolName ? `Open the latest menu for ${schoolName}.` : 'Choose your school to see its latest lunch menu.'}</p><b>Find your school <span aria-hidden="true">→</span></b></a>
        <a className="landing-choice admin-choice" href="/?admin=1"><span className="choice-kicker">FOR SCHOOL STAFF</span><h2>School Admin Sign In</h2><p>Sign in to manage your school’s lunch operations.</p><b>Admin sign in <span aria-hidden="true">→</span></b></a>
      </div>
    </section>
    <footer>Cliffs Lunch Club</footer>
  </main>;
}

function SchoolSelection() {
  const [selectedSchool, setSelectedSchool] = useState('');
  const [schools, setSchools] = useState<{ name: string; public_slug: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    pb.send<{ name: string; public_slug: string }[]>('/api/public-schools', { method: 'GET', requestKey: null })
      .then((records) => { if (mounted) { setSchools(records); setError(''); } })
      .catch(() => { if (mounted) setError('School menus are unavailable right now. Please try again.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);
  return <main className="school-select-page parent-school-selection">
    <a className="back-link" href="/">← Back to home</a>
    <div className="eyebrow">FOR PARENTS</div><h1>Choose your school</h1><p className="muted">Select a school to view its lunch menu.</p>
    {error && <div className="notice error">{error}</div>}
    {loading && <p className="muted">Loading schools…</p>}
    {!loading && !error && <><label>School<select value={selectedSchool} onChange={(event) => setSelectedSchool(event.target.value)}><option value="">Select your school</option>{schools.map((school) => <option key={school.public_slug} value={school.public_slug}>{school.name}</option>)}</select></label>{!schools.length && <div className="panel empty-state"><p>No school menus are available yet.</p></div>}{selectedSchool && <div className="parent-selected-menu"><PublicMenu key={selectedSchool} slug={selectedSchool} embedded /></div>}</>}

  </main>;
}

function AdminApp({ superAdminOnly = false }: { superAdminOnly?: boolean }) {
  const [user, setUser] = useState<User | null>((pb.authStore.model as User | null) || null);
  const [authReady, setAuthReady] = useState(!pb.authStore.isValid);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>((pb.authStore.model as User | null)?.role === 'daycare_admin' && !superAdminOnly ? 'students' : 'summary');
  const [daycares, setDaycares] = useState<Daycare[]>([]);
  const [selected, setSelected] = useState((pb.authStore.model as User | null)?.role === 'clc_admin' ? 'all' : '');
  const [classrooms, setClassrooms] = useState<Row[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subs, setSubs] = useState<Row[]>([]);
  const [menuDays, setMenuDays] = useState<MenuDay[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [weekAnchor] = useState(new Date());
  const [month, setMonth] = useState(localMonth());
  const [busy, setBusy] = useState(false);
  const loadVersion = useRef(0);
  const [subStudent, setSubStudent] = useState('');
  const [subDate, setSubDate] = useState('');
  const [subCode, setSubCode] = useState('A');

  useEffect(() => {
    let active = true;
    const unsubscribe = pb.authStore.onChange((_token, model) => setUser((model as User | null) || null));
    if (pb.authStore.isValid) {
      void pb.collection('users').authRefresh<User>({ requestKey: null })
        .then((result) => { if (active) { setUser(result.record); setTab(result.record.role === 'clc_admin' ? 'summary' : 'students'); } })
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
    const version = ++loadVersion.current;
    const accountId = user.id;
    setBusy(true); setError('');
    try {
      const [locations, rooms, kids, replacements, menus, items] = await Promise.all([
        pb.collection('daycares').getFullList<Daycare>({ sort: 'name', requestKey: null }),
        pb.collection('classrooms').getFullList({ sort: 'name', requestKey: null }),
        pb.collection('students').getFullList<Student>({ sort: 'name', requestKey: null }),
        pb.collection('substitutions').getFullList({ sort: 'service_date', requestKey: null }),
        pb.collection('menu_days').getFullList<MenuDay>({ sort: 'service_date', requestKey: null }),
        ...(isClc ? [pb.collection('menu_items').getFullList<MenuItem>({ sort: 'name', requestKey: null })] : [Promise.resolve([])]),
      ]);
      if (version !== loadVersion.current || pb.authStore.model?.id !== accountId) return;
      setDaycares(locations);
      setClassrooms(rooms);
      setStudents(kids.map((k) => ({ ...k, service_days: Array.isArray(k.service_days) ? k.service_days : [] })));
      setSubs(replacements); setMenuDays(menus); setMenuItems(items);
      setSelected((previous) => {
        if (user.role !== 'clc_admin') return locations.some((school) => school.id === user.daycare) ? user.daycare : '';
        return previous === 'all' || locations.some((school) => school.id === previous) ? previous : 'all';
      });
    } catch (e) { if (version === loadVersion.current && pb.authStore.model?.id === accountId) setError(message(e)); }
    finally { if (version === loadVersion.current) setBusy(false); }
  }
  useEffect(() => { if (authReady && user && (!superAdminOnly || user.role === 'clc_admin')) void load(); }, [authReady, user?.id, user?.role, user?.daycare]);
  useEffect(() => () => { loadVersion.current++; }, []);

  async function signIn(e: FormEvent) {
    e.preventDefault(); setError('');
    try {
      const result = await pb.collection('users').authWithPassword<User>(email, password);
      setSelected(result.record.role === 'clc_admin' ? 'all' : result.record.daycare);
      setTab(result.record.role === 'clc_admin' ? 'summary' : 'students');
      if (superAdminOnly && result.record.role !== 'clc_admin') {
        pb.authStore.clear();
        setError('This sign-in is for CLC super admins. Use your school admin sign-in on your school’s subdomain.');
      }
    }
    catch (e) { setError(message(e)); }
  }
  function signOut() { loadVersion.current++; pb.authStore.clear(); setSelected(''); setDaycares([]); setClassrooms([]); setStudents([]); setSubs([]); setMenuDays([]); setMenuItems([]); setBusy(false); setError(''); }

  const operationsAvailable = isClc || Boolean(current?.operations_enabled);
  const substitutionsAvailable = Boolean(current?.allow_substitutions);
  const showStudentTab = operationsAvailable || substitutionsAvailable;
  useEffect(() => { if (!isClc && current && tab === 'students' && !showStudentTab) setTab('menu'); }, [isClc, current?.id, showStudentTab, tab]);

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
      const record = await pb.collection('daycares').create({ name: name.trim(), public_slug: slug, active: true, operations_enabled: true, baseline_counts: {}, baseline_pizza_counts: {}, count_mode: 'roster', allow_substitutions: false, sizes_enabled: false, sub_a_label: 'Option A', sub_b_label: 'Option B', sub_c_label: 'Option C', sub_v_label: 'Vegetarian' });
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
    const target = daycares.find((d) => d.id === (values.id || current?.id));
    if (!target || !isClc) return;
    const { id: _id, ...patch } = values;
    try {
      await pb.collection('daycares').update(target.id, patch);
      await load();
    }
    catch (e) { setError(message(e)); }
  }

  const locStudents = students.filter((s) => selected === 'all' ? true : s.daycare === selected);
  const selectableDaycare = selected === 'all' ? null : current;
  const nav: [Tab, string][] = showStudentTab ? [['students', 'Students & Classrooms']] : [];
  if (!isClc) nav.push(['menu', 'Menu']);
  if (isClc) { nav.unshift(['summary', 'Weekly Summary']); nav.push(['menu', 'Monthly Menus'], ['items', 'Menu Items'], ['users', 'School Admins'], ['locations', 'Daycares']); }

  if (!user) return <main className="login-page"><form className="login-card" onSubmit={signIn}>
    <a className="back-link" href="/">← Back to home</a><div className="eyebrow">{superAdminOnly ? 'CLC SUPER ADMIN' : 'SCHOOL STAFF'}</div><h1>{superAdminOnly ? 'CLC super admin sign in' : 'Admin sign in'}</h1><p>{superAdminOnly ? 'Sign in to manage menus and school settings across all locations.' : 'Sign in to manage schedules, substitutions, and counts.'}</p>
    {error && <div className="notice error">{error}</div>}
    <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
    <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
    <button className="primary full">Sign in</button>
  </form></main>;

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div><b>Cliffs Lunch Club</b><small>School workspace</small></div></div>
      <div className="top-actions">{isClc && <select aria-label="Choose daycare" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="all">All daycares</option>{daycares.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
        {!isClc && <span className="location-chip">{current?.name || 'Your daycare'}</span>}<span className="user-chip">{user.display_name || user.email}</span><button className="signout-button" onClick={signOut}>Sign out</button></div>
    </header>
    <nav className="tabs">{nav.map(([id, label]) => <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <main className="content">
      {error && <div className="notice error">{error}<button className="quiet" onClick={() => setError('')}>Dismiss</button></div>}
      {busy && <div className="loading">Refreshing…</div>}
      {tab === 'students' && showStudentTab && <section>{operationsAvailable && <SchoolStudentsPage current={selectableDaycare} daycares={daycares} isClc={isClc} students={students} classrooms={classrooms} onRefresh={load} error={setError} />}{current?.allow_substitutions && <div className="panel sub-panel"><div><h3>Record a substitution</h3><p className="muted">{current.allow_substitutions ? 'Choose a student, day, and option.' : 'Substitutions are turned off for this daycare.'}</p></div>
          {current.allow_substitutions && <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); try { await pb.send('/api/substitutions', { method: 'POST', body: { student: subStudent, daycare: current.id, service_date: subDate, code: subCode, pizza_substitution: false } }); setSubStudent(''); await load(); } catch (err) { setError(message(err)); } }}>
            <select value={subStudent} required onChange={(e) => setSubStudent(e.target.value)}><option value="">Student</option>{locStudents.filter((s) => s.active && s.daycare === current.id).map((s) => <option key={s.id} value={s.id}>{shortStudentName(s.name)}</option>)}</select>
            <select value={subDate} required onChange={(e) => setSubDate(e.target.value)}><option value="">Weekday</option>{dates.map((d) => <option key={d} value={d}>{dayName(d)}</option>)}</select>
            <select value={subCode} onChange={(e) => setSubCode(e.target.value)}>{['A', 'B', 'C', 'V'].map((code) => <option key={code} value={code}>{code} — {current[`sub_${code.toLowerCase()}_label`] || `Option ${code}`}</option>)}</select>
            <button className="primary">Add recurring</button>
          </form>}
          <div className="saved-subs">{subs.filter((s) => s.daycare === current.id && s.recurring).map((s) => <div className="list-row" key={s.id}><span>{s.weekday} · {shortStudentName(locStudents.find((kid) => kid.id === s.student)?.name || 'Student')}: <strong className="substitution-code">{s.code}</strong></span><button className="quiet danger-text" onClick={async () => { if (window.confirm('Remove this substitution?')) { try { await pb.collection('substitutions').delete(s.id); await load(); } catch (err) { setError(message(err)); } } }}>Remove</button></div>)}</div>
        </div>}
</section>}
      {tab === 'summary' && isClc && <section><PageTitle title="Weekly Summary" subtitle="Recurring weekday counts in a kitchen sheet. Use the monthly menu printout alongside it." /><div className="toolbar"><button className="primary" onClick={() => window.print()}>Print landscape summary</button></div><WeeklySummary locations={daycares.filter((d) => selected === 'all' || d.id === selected)} students={students} subs={subs} /></section>}
      {tab === 'menu' && !isClc && current && <PublicMenu slug={current.public_slug} embedded />}
      {tab === 'menu' && isClc && <MenuPage menuItems={menuItems} current={selectableDaycare} daycares={daycares} month={month} setMonth={setMonth} menuDays={menuDays} onRefresh={load} error={setError} />}
      {tab === 'items' && isClc && <MenuItemsPage items={menuItems} onRefresh={load} error={setError} />}
      {tab === 'users' && isClc && <SchoolAdminsPage daycares={daycares} error={setError} />}
      {tab === 'locations' && isClc && <LocationsPage daycares={daycares} onCreate={createDaycare} onAddAdmin={addAdmin} onSave={saveDaycare} onRefresh={load} />}
    </main>
    <footer>Cliffs Lunch Club <span>·</span> Local working copy</footer>
  </div>;
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="page-title"><div className="eyebrow">DAYCARE LUNCH OPERATIONS</div><h1>{title}</h1><p>{subtitle}</p></div>; }

function SchoolStudentsPage({ current, daycares, isClc, students, classrooms, onRefresh, error }: { current: Daycare | null; daycares: Daycare[]; isClc: boolean; students: Student[]; classrooms: Row[]; onRefresh: () => Promise<void>; error: (s: string) => void }) {
  const [schoolId, setSchoolId] = useState(daycares[0]?.id || '');
  const school = current || daycares.find((d) => d.id === schoolId) || daycares[0];
  return <section>{!current && <div className="toolbar"><label>School<select value={school?.id || ''} onChange={(e) => setSchoolId(e.target.value)}>{daycares.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>}
    {school && isClc && <CountSettings key={`${school.id}:${school.count_mode}:${JSON.stringify(school.baseline_counts)}:${JSON.stringify(school.baseline_pizza_counts)}:${JSON.stringify(school.clc_managed_counts)}`} school={school} onRefresh={onRefresh} error={error} />}
    {school?.count_mode === 'manual' ? <div className="panel empty-state"><h2>{school.name}</h2><p>Counts use the saved weekday totals. CLC can switch this school to students and classrooms above.</p></div> : <StudentsPage current={school || null} students={students.filter((s) => s.daycare === school?.id)} classrooms={classrooms.filter((c) => c.daycare === school?.id)} onRefresh={onRefresh} error={error} />}
  </section>;
}

function CountSettings({ school, onRefresh, error }: { school: Daycare; onRefresh: () => Promise<void>; error: (s: string) => void }) {
  const [mode, setMode] = useState(school.count_mode || 'roster');
  const [counts, setCounts] = useState(school.baseline_counts || {});
  const [managed, setManaged] = useState(school.clc_managed_counts || {});
  const [saving, setSaving] = useState(false);
  return <form className="panel count-settings" onSubmit={async (e) => { e.preventDefault(); setSaving(true); try { await pb.collection('daycares').update(school.id, { count_mode: mode, baseline_counts: counts, clc_managed_counts: managed }); await onRefresh(); } catch (err) { error(message(err)); } finally { setSaving(false); } }}>
    <h2>{school.name} count settings</h2><label>Count method<select value={mode} onChange={(e) => setMode(e.target.value as 'roster' | 'manual')}><option value="roster">Students and Classrooms</option><option value="manual">Manual weekday totals</option></select></label>
    <p className="muted small">Weekday totals repeat each week. Allergy students are handled directly by CLC and shown separately from school-managed students; both are included in lunch totals. Switching methods keeps the existing roster and manual totals.</p>
    <div className="weekday-counts">{weekdays.map((day) => <div key={day}><b>{day}</b>{mode === 'manual' && <label>School students<input type="number" required min="0" max="10000" step="1" value={counts[day] || 0} onChange={(e) => setCounts({ ...counts, [day]: Number(e.target.value) })} /></label>}{mode === 'manual' && <label>Allergies<input type="number" required min="0" max="10000" step="1" value={managed[day] || 0} onChange={(e) => setManaged({ ...managed, [day]: Number(e.target.value) })} /></label>}</div>)}</div><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save count settings'}</button>
  </form>;
}

function SubstitutionNames({ rows, students }: { rows: Row[]; students: Student[] }) {
  return <>{rows.map((r, i) => <span className="summary-substitution" key={r.id}>{i > 0 && '  -  '}{shortStudentName(students.find((student) => student.id === r.student)?.name || 'Student')}: <strong className="substitution-code">{r.code}</strong></span>)}</>;
}

function WeeklySummary({ locations, students, subs }: { locations: Daycare[]; students: Student[]; subs: Row[] }) {
  const data = locations.map((school) => ({ school, days: weekdays.map((day) => {
    const roster = school.count_mode === 'manual' ? [] : students.filter((s) => s.active && s.daycare === school.id && s.service_days.includes(day));
    const replacements = subs.filter((sub) => sub.daycare === school.id && sub.recurring && sub.weekday === day && roster.some((s) => s.id === sub.student));
    const managed = school.count_mode === 'manual' ? Number(school.clc_managed_counts?.[day] || 0) : 0;
    const total = school.count_mode === 'manual' ? Number(school.baseline_counts?.[day] || 0) + managed : roster.length;
    return { day, roster, replacements, total, managed, pizza: day === 'Friday' ? Math.ceil(Math.max(0, total - replacements.length) / 3) : 0 };
  }) }));
  return <div className="weekly-summary"><h2>Cliffs Lunch Club — Weekly Kitchen Summary</h2>
    <table className="summary-overview"><thead><tr>{weekdays.map((day) => <th key={day}>{day}</th>)}</tr></thead><tbody><tr>{weekdays.map((day, i) => <td key={day}><strong>{day === 'Friday' ? `${data.reduce((n, s) => n + s.days[i].pizza, 0)} Pizzas` : data.reduce((n, s) => n + s.days[i].total, 0)}</strong></td>)}</tr>{data.map(({ school, days }) => <tr key={school.id}>{days.map((d) => <td key={d.day}><b>{school.name.replace('Lightbridge ', '').replace('Englewood Cliffs', 'EC')}</b>{d.day !== 'Friday' && school.sizes_enabled && school.count_mode === 'roster' && <div>{d.total}</div>}<div>{d.day === 'Friday' ? `${d.pizza} Pizzas` : school.sizes_enabled && school.count_mode === 'roster' ? `${d.roster.filter((s) => s.size === 'large' && !d.replacements.some((r) => r.student === s.id)).length} Large + ${d.roster.filter((s) => s.size === 'small' && !d.replacements.some((r) => r.student === s.id)).length} Small + ${d.replacements.length} Subs` : <>{d.managed ? `${d.total - d.managed} + ${d.managed} Allergies` : `${d.total - d.replacements.length}`}{d.replacements.length > 0 && ` + ${d.replacements.length} subs`}</>}</div></td>)}</tr>)}</tbody></table>
    <div className="summary-school-grid">{data.map(({ school, days }) => <div className="summary-school" key={school.id}><h3>{school.name.toUpperCase()} TOTALS</h3><table className={school.public_slug === 'lightbridge-bergenfield' ? 'bergenfield-totals' : ''}>{school.public_slug === 'lightbridge-bergenfield' && <colgroup><col style={{ width: '8%' }} /><col style={{ width: '14%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '58%' }} /></colgroup>}<thead><tr>{school.public_slug === 'lightbridge-bergenfield' ? <><th>Total</th><th>Day / Size</th></> : <><th>Day / Size</th><th>Total</th></>}<th>Breakdown</th><th>Subs</th><th>Substitutions / Allergies</th></tr></thead><tbody>{days.flatMap((d) => {
      const sizes = school.count_mode !== 'manual' && school.sizes_enabled && d.day !== 'Friday' ? ['small', 'large'] : ['all'];
      return sizes.map((size, index) => { const kids = size === 'all' ? d.roster : d.roster.filter((s) => s.size === size); const replacements = size === 'all' ? d.replacements.filter((r) => d.day !== 'Friday' || !r.pizza_substitution) : d.replacements.filter((r) => kids.some((s) => s.id === r.student)); const total = size === 'all' ? d.total : kids.length;
        return <tr key={`${d.day}:${size}`}>{school.public_slug === 'lightbridge-bergenfield' && index === 0 && <td rowSpan={sizes.length}>{d.total}</td>}<th>{d.day.slice(0, 3)}{size !== 'all' ? ` ${titleCase(size)}` : ''}</th>{school.public_slug !== 'lightbridge-bergenfield' && index === 0 && <td rowSpan={sizes.length}>{d.total}</td>}<td>{total - (d.day === 'Friday' ? d.replacements.length : replacements.length)}</td><td>{replacements.length}</td><td>{replacements.length ? <SubstitutionNames rows={replacements} students={students} /> : d.managed ? `${d.managed} Allergies` : '—'}</td></tr>;
      });
    })}<tr>{school.public_slug === 'lightbridge-bergenfield' ? <><td>{days[4].pizza}</td><th>Friday pizza</th></> : <><th>Friday pizza</th><td>{days[4].pizza}</td></>}<td>{days[4].pizza}</td><td>{days[4].replacements.filter((r) => r.pizza_substitution).length}</td><td>{days[4].replacements.some((r) => r.pizza_substitution) ? <SubstitutionNames rows={days[4].replacements.filter((r) => r.pizza_substitution)} students={students} /> : '—'}</td></tr></tbody></table>{school.allow_substitutions && <div className="summary-legend">{['A','B','C','V'].map((code) => <div key={code}><b>{code}</b> — {school[`sub_${code.toLowerCase()}_label`] || `Option ${code}`}</div>)}</div>}</div>)}</div>
    <p className="summary-footnote">Substitutions and Allergies are included in lunch totals. Friday pizza = lunches excluding substitutions ÷ 3, rounded up. Recurring weekday counts; see monthly calendar for menus and closures.</p>
  </div>;
}

function StudentEditor({ editing, onClose, children }: { editing: boolean; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (editing) dialog.current?.showModal(); }, [editing]);
  if (!editing) return <div className="panel">{children}</div>;
  return <dialog ref={dialog} className="student-modal" aria-labelledby="student-editor-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}><button type="button" className="quiet modal-close" aria-label="Close student editor" onClick={onClose}>×</button>{children}</dialog>;
}

function StudentsPage({ current, students, classrooms, onRefresh, error }: { current: Daycare | null; students: Student[]; classrooms: Row[]; onRefresh: () => Promise<void>; error: (s: string) => void }) {
  const [sortKey, setSortKey] = useState('classroom');
  const [sortDirection, setSortDirection] = useState(1);
  const [classroomFilter, setClassroomFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [destination, setDestination] = useState(''); const [moving, setMoving] = useState(false); const [moveNotice, setMoveNotice] = useState('');

  const orderedRooms = [...classrooms].sort((a, b) => Number(a.age_order || 0) - Number(b.age_order || 0) || a.name.localeCompare(b.name));
  function sortBy(key: string) { if (key === sortKey) setSortDirection(-sortDirection); else { setSortKey(key); setSortDirection(1); } }
  function studentSortValue(student: Student): string | number {
    if (sortKey === 'classroom') return orderedRooms.findIndex((c) => c.id === student.classroom);
    if (sortKey === 'days') return weekdays.filter((day) => student.service_days.includes(day)).join(', ');
    if (sortKey === 'active') return student.active ? 1 : 0;
    return String(student[sortKey] || '');
  }
  const sortedStudents = [...students].sort((a, b) => { const av = studentSortValue(a), bv = studentSortValue(b); return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * sortDirection || a.name.localeCompare(b.name); });
  const [roomName, setRoomName] = useState(''); const [editing, setEditing] = useState<Student | null>(null);
  const [name, setName] = useState(''); const [room, setRoom] = useState(''); const [size, setSize] = useState(current?.sizes_enabled ? 'small' : 'standard'); const [days, setDays] = useState<string[]>([]); const [active, setActive] = useState(true);
  const visibleStudents = sortedStudents.filter((student) => student.daycare === current?.id && (!classroomFilter || student.classroom === classroomFilter));
  const chosenStudents = visibleStudents.filter((student) => selectedIds.includes(student.id));
  if (!current) return <Empty title="Choose one daycare" text="Select a single daycare in the top bar to manage its roster." />;
  async function saveRoom(e: FormEvent) { e.preventDefault(); try { await pb.collection('classrooms').create({ name: roomName.trim(), daycare: current!.id, active: true, age_order: Math.max(0, ...classrooms.map((c) => Number(c.age_order || 0))) + 1 }); setRoomName(''); await onRefresh(); } catch (e) { error(message(e)); } }
  function edit(s: Student) { setEditing(s); setName(s.name); setRoom(s.classroom); setSize(current?.sizes_enabled ? (s.size === 'large' ? 'large' : 'small') : 'standard'); setDays(s.service_days || []); setActive(s.active); }
  function reset() { setEditing(null); setName(''); setRoom(orderedRooms[0]?.id || ''); setSize(current?.sizes_enabled ? 'small' : 'standard'); setDays([]); setActive(true); }
  async function saveStudent(e: FormEvent) { e.preventDefault(); try { const data = { name: name.trim(), classroom: room, daycare: current!.id, size: current!.sizes_enabled ? (size === 'large' ? 'large' : 'small') : 'standard', service_days: days, active }; if (editing) await pb.collection('students').update(editing.id, data); else await pb.collection('students').create(data); reset(); await onRefresh(); } catch (e) { error(message(e)); } }
  async function moveStudents() {
    const target = classrooms.find((classroom) => classroom.id === destination && classroom.daycare === current!.id && classroom.active);
    const moves = chosenStudents.filter((student) => student.classroom !== destination);
    if (!target || !moves.length || moving) return;
    if (!window.confirm(`Move ${moves.length} selected student${moves.length === 1 ? '' : 's'} to ${target.name}?\n\n${moves.map((student) => shortStudentName(student.name)).join(', ')}\n\nConfirm only after reviewing the selected students. Their meal schedules and substitutions will stay the same.`)) return;
    setMoving(true); setMoveNotice('');
    try { await pb.send('/api/move-students', { method: 'POST', body: { daycare: current!.id, classroom: destination, students: moves.map((student) => student.id) } }); setSelectedIds([]); setDestination(''); await onRefresh(); setMoveNotice(`${moves.length} students moved to ${target.name}.`); }
    catch (err) { error(message(err)); } finally { setMoving(false); }
  }
  async function deleteSelectedStudents() {
    if (!chosenStudents.length || moving) return;
    if (!window.confirm(`Permanently delete ${chosenStudents.length} selected student${chosenStudents.length === 1 ? '' : 's'}?\n\n${chosenStudents.map((student) => shortStudentName(student.name)).join(', ')}\n\nTheir recurring substitutions will also be deleted. This cannot be undone.`)) return;
    setMoving(true); setMoveNotice('');
    try { await pb.send('/api/delete-students', { method: 'POST', body: { daycare: current!.id, students: chosenStudents.map((student) => student.id) } }); setSelectedIds([]); await onRefresh(); setMoveNotice(`${chosenStudents.length} students deleted.`); }
    catch (err) { error(message(err)); } finally { setMoving(false); }
  }
  return <section><PageTitle title="Students & Classrooms" subtitle={`Manage ${current.name}’s roster and recurring weekly service days.`} />
    <div className="split-grid">
      <div className="panel"><h2>Classrooms</h2><form className="inline-form" onSubmit={saveRoom}><input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="New classroom" required /><button className="primary">Add</button></form>
        <div className="simple-list">{orderedRooms.filter((c) => c.daycare === current!.id).map((c) => <div className="list-row classroom-row" key={c.id}><span>{c.name}</span><span className="muted classroom-total">{students.filter((s) => s.classroom === c.id).length} students</span><div className="row-actions"><button className="quiet" onClick={async () => { const name = window.prompt('Classroom name', c.name); if (name?.trim() && name.trim() !== c.name) { try { await pb.collection('classrooms').update(c.id, { name: name.trim(), daycare: current!.id }); await onRefresh(); } catch (e) { error(message(e)); } } }}>Edit</button><button className="quiet danger-text" onClick={async () => { if (window.confirm(`Delete ${c.name}? It must have no students.`)) { try { await pb.collection('classrooms').delete(c.id); await onRefresh(); } catch (e) { error(message(e)); } } }}>Delete</button></div></div>)}</div>
      </div>
      <StudentEditor editing={Boolean(editing)} onClose={reset}><h2 id="student-editor-title">{editing ? 'Edit student' : 'Add a student'}</h2><form onSubmit={saveStudent} className="stack-form">
        <label>Student name<input value={name} onChange={(e) => setName(e.target.value)} required /></label><label>Classroom<select value={room} onChange={(e) => setRoom(e.target.value)} required><option value="">Choose classroom</option>{orderedRooms.filter((c) => c.daycare === current!.id && c.active).map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        {current.sizes_enabled && <label>Meal size<select value={size === 'large' ? 'large' : 'small'} onChange={(e) => setSize(e.target.value)}><option value="small">Small</option><option value="large">Large</option></select></label>}
        <fieldset><legend>Recurring service days</legend><div className="day-picks">{weekdays.map((d) => <label key={d}><input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} />{d.slice(0, 3)}</label>)}</div></fieldset>
        <label className="checkline"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active for counts</label><div className="form-actions"><button className="primary">{editing ? 'Save changes' : 'Add student'}</button>{editing && <button type="button" className="outline" onClick={reset}>Cancel</button>}</div>
      </form></StudentEditor>
    </div>
    <div className="panel roster-panel"><div className="section-heading"><h2>Roster</h2><span className="muted">{students.filter((s) => s.daycare === current!.id).length} students</span></div><div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible students" disabled={moving || !visibleStudents.length} checked={Boolean(visibleStudents.length) && chosenStudents.length === visibleStudents.length} onChange={(event) => setSelectedIds(event.target.checked ? visibleStudents.map((student) => student.id) : [])} /></th>{[['classroom','Classroom'],['name','Name'],['size','Size'],['days','Weekly days']].map(([key,label]) => <th key={key} aria-sort={sortKey === key ? (sortDirection === 1 ? 'ascending' : 'descending') : 'none'}><button className="column-sort" onClick={() => sortBy(key)}>{label}{sortKey === key ? (sortDirection === 1 ? ' ↑' : ' ↓') : ''}</button>{key === 'classroom' && <select className="roster-filter" aria-label="Filter by classroom" value={classroomFilter} disabled={moving} onChange={(event) => { setClassroomFilter(event.target.value); setSelectedIds([]); setMoveNotice(''); }}><option value="">All Classrooms</option>{orderedRooms.filter((classroom) => classroom.daycare === current.id).map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select>}</th>)}<th></th></tr></thead><tbody>
      {visibleStudents.map((s) => <tr key={s.id}><td><input type="checkbox" aria-label={`Select ${shortStudentName(s.name)}`} disabled={moving} checked={selectedIds.includes(s.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, s.id] : selectedIds.filter((id) => id !== s.id))} /></td><td>{classrooms.find((c) => c.id === s.classroom)?.name || '—'}</td><td><b>{shortStudentName(s.name)}</b></td><td>{current.sizes_enabled ? titleCase(s.size || 'standard') : '—'}</td><td>{s.service_days.join(', ') || 'None'}</td><td className="row-actions"><button className="quiet" onClick={() => edit(s)}>Edit</button><button className="quiet danger-text" onClick={async () => { if (window.confirm(`Delete ${shortStudentName(s.name)}?`)) { try { await pb.collection('students').delete(s.id); await onRefresh(); } catch (e) { error(message(e)); } } }}>Delete</button></td></tr>)}
      {!visibleStudents.length && <tr><td colSpan={6} className="empty-cell">No students match this classroom.</td></tr>}
    </tbody></table></div><div className="bulk-classroom-move"><span>{chosenStudents.length} selected</span><label>Move to Classroom<select value={destination} disabled={moving} onChange={(event) => setDestination(event.target.value)}><option value="">Choose destination</option>{orderedRooms.filter((classroom) => classroom.daycare === current.id && classroom.active).map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select></label><button className="primary" disabled={moving || !destination || !chosenStudents.some((student) => student.classroom !== destination)} onClick={() => void moveStudents()}>{moving ? 'Saving…' : 'Change Classroom for Selected Students'}</button><button className="danger-button" disabled={moving || !chosenStudents.length} onClick={() => void deleteSelectedStudents()}>{moving ? 'Saving…' : 'Delete Selected Students'}</button></div>{moveNotice && <p role="status">{moveNotice}</p>}</div>
  </section>;
}

function MenuPage({ menuItems: catalog, current, daycares, month, setMonth, menuDays, onRefresh, error }: { menuItems: MenuItem[]; current: Daycare | null; daycares: Daycare[]; month: string; setMonth: (m: string) => void; menuDays: MenuDay[]; onRefresh: () => Promise<void>; error: (s: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, Partial<MenuDay>>>({});
  const [copyTarget, setCopyTarget] = useState('');
  const [copying, setCopying] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveNotice, setSaveNotice] = useState('');
  const menuItems = catalog.filter((item) => item.active).map((item) => item.name);
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
    return { menu: saved?.menu ?? (weekday === 'Friday' && location?.public_slug !== 'lightbridge-fort-lee' ? 'Pizza' : suggestedMenuForDate(date)), note: saved?.note ?? '', closed: saved?.closed ?? defaultClosed, published: saved?.published ?? false, pizza_count: saved?.pizza_count ?? 0, ...saved, ...(drafts[keyFor(date)] || {}) };
  }
  function updateDraft(date: string, patch: Partial<MenuDay>) {
    const key = keyFor(date);
    setDrafts((previous) => ({ ...previous, [key]: { ...valueFor(date), ...(previous[key] || {}), ...patch } }));
  }
  async function persistDay(date: string) {
    if (!location || !date.startsWith(month)) return;
    const value = valueFor(date); const saved = menuDays.find((d) => d.daycare === location.id && dateOnly(d.service_date) === date);
    const data = { menu_item: catalog.find((item) => item.name === value.menu)?.id || '', daycare: location.id, daycare_name: location.name, public_slug: location.public_slug, service_date: `${date} 00:00:00.000Z`, menu: value.menu || '', note: value.note || '', closed: Boolean(value.closed), published: Boolean(value.published) };
    if (saved) await pb.collection('menu_days').update(saved.id, data); else await pb.collection('menu_days').create(data);
    setDrafts((previous) => { const next = { ...previous }; delete next[keyFor(date)]; return next; });
  }
  async function saveDays(days: string[]) {
    if (!location || savingRef.current) return;
    savingRef.current = true; setSaving(true); setSaveNotice('');
    let completed = 0;
    try {
      for (const date of days) { await persistDay(date); completed++; }
      setSaveNotice(`Saved ${completed} ${completed === 1 ? 'day' : 'days'} for ${location.name}, ${monthLabel(month)}.`);
    } catch (err) {
      error(`Saved ${completed} of ${days.length} days. Remaining edits are kept; try again. ${message(err)}`);
    } finally {
      try { await onRefresh(); } finally { savingRef.current = false; setSaving(false); }
    }
  }
  async function saveDay(date: string) { await saveDays([date]); }
  async function copyMonth() {
    const target = daycares.find((school) => school.id === copyTarget);
    if (!location || !target || target.id === location.id || copying) return;
    const source = menuDays.filter((day) => day.daycare === location.id && dateOnly(day.service_date).startsWith(month));
    const replaced = menuDays.filter((day) => day.daycare === target.id && source.some((row) => dateOnly(row.service_date) === dateOnly(day.service_date))).length;
    if (!window.confirm(`Copy ${source.length} saved days from ${location.name} to ${target.name} for ${monthLabel(month)}? This replaces ${replaced} existing days and saves all copied days as unpublished drafts. Unsaved edits are excluded. TLE Fridays remain no service.`)) return;
    setCopying(true); setCopyNotice('');
    try {
      const result = await pb.send('/api/clone-menu', { method: 'POST', body: { source: location.id, target: target.id, month } });
      setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${target.id}:${month}`))));
      await onRefresh(); setCopyNotice(`Copied ${result.copied} days to ${target.name} as unpublished drafts.`);
    } catch (err) { error(message(err)); } finally { setCopying(false); }
  }
  function exportHtml() {
    return menuExportHtml(location?.name || '', month, (date) => valueFor(date));
  }
  function exportWord() {
    if (location) download(menuExportDocx(location.name, month, (date) => valueFor(date)), menuFilename(location.name, month));
  }
  return <section><PageTitle title="Monthly Menus" subtitle="Choose a school, review the suggested menu, make changes, and publish days for parents." />
    <fieldset disabled={saving || copying} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <div className="toolbar"><div className="week-control"><label className="month-picker">Month<select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label>{!current && <label>School<select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{selectedLocations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}</div><div className="button-row"><button className="primary" disabled={!location || saving} onClick={() => void saveDays(dates.filter((date) => date.startsWith(month)))}>{saving ? 'Saving…' : 'Save All'}</button><button className="outline" onClick={exportWord} disabled={!location}>Download Word</button><button className="primary" disabled={!location} onClick={() => printMenuHtml(exportHtml())}>Print / Save PDF</button></div></div>
    {saveNotice && <p role="status">{saveNotice}</p>}
    <div className="panel toolbar"><label>Copy saved month to<select value={copyTarget} disabled={copying} onChange={(event) => setCopyTarget(event.target.value)}><option value="">Choose another school</option>{daycares.filter((school) => school.id !== location?.id).map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><button className="outline" disabled={copying || !location || !copyTarget || copyTarget === location.id || !menuDays.some((day) => day.daycare === location.id && dateOnly(day.service_date).startsWith(month))} onClick={() => void copyMonth()}>{copying ? 'Copying…' : 'Copy Month'}</button><p className="muted small">Saved selections and notes only. Copies are unpublished drafts; existing matching dates are replaced after confirmation.</p>{copyNotice && <p role="status">{copyNotice}</p>}</div>
    {location && <div className="panel calendar-panel"><div className="calendar-title"><div><div className="eyebrow">{location.name.toUpperCase()}</div><h2>{monthLabel(month)}</h2></div><a href={`${schoolMenuUrl(location.public_slug)}&month=${encodeURIComponent(month)}`} target="_blank" rel="noreferrer">Open public menu ↗</a></div>
      <p className="rotation-note">Next month is prefilled from the weekday rotation as unpublished suggestions. Review and use Save All or save individual days; staffing changes and holidays can be edited before publishing.</p>
      <div className="calendar-grid"><div className="calendar-head">Monday</div><div className="calendar-head">Tuesday</div><div className="calendar-head">Wednesday</div><div className="calendar-head">Thursday</div><div className="calendar-head">Friday</div>
        {dates.map((date) => { if (!date.startsWith(month)) return <div className="calendar-day outside-month" key={date}><div className="date-label">{shortDate(date)} <span>{dayName(date).slice(0, 3)}</span></div><span className="muted small">Outside this month</span></div>; const v = valueFor(date); const saved = menuDays.some((d) => d.daycare === location.id && dateOnly(d.service_date) === date); const isStandard = menuItems.includes(v.menu || ''); const selectedMenu = isStandard ? v.menu as string : customValue; return <div className={`calendar-day ${v.closed ? 'day-closed' : ''}`} key={date}><div className="date-label">{shortDate(date)} <span>{dayName(date).slice(0, 3)}</span></div>
          {!saved && month === futureMonth && <span className="draft-label">Suggested · not published</span>}
          <select aria-label={`Menu for ${date}`} value={selectedMenu} disabled={Boolean(v.closed)} onChange={(e) => { const nextValue = e.target.value; updateDraft(date, { menu: nextValue === customValue ? (isStandard ? '' : v.menu || '') : nextValue }); }}>
            {menuItems.map((item) => <option key={item} value={item}>{item.replace('\n', ' — ')}</option>)}<option value={customValue}>Custom menu…</option>
          </select>
          {!isStandard && <textarea aria-label={`Custom menu for ${date}`} value={v.menu || ''} placeholder="Enter a custom menu" disabled={Boolean(v.closed)} onChange={(e) => updateDraft(date, { menu: e.target.value })} />}
          <input className="day-note" aria-label={`Note for ${date}`} value={v.note || ''} placeholder="Optional note" onChange={(e) => updateDraft(date, { note: e.target.value })} />
          <label className="compact-check"><input type="checkbox" checked={Boolean(v.closed)} onChange={(e) => updateDraft(date, { closed: e.target.checked, published: e.target.checked ? true : Boolean(v.published) })} /> Day off</label>
          <div className="day-controls"><label className="compact-check"><input type="checkbox" checked={Boolean(v.published)} disabled={!saved && month === futureMonth} onChange={(e) => updateDraft(date, { published: e.target.checked })} /> Public</label></div><button className="save-day" onClick={() => saveDay(date)}>{saved ? 'Save day' : 'Save draft'}</button></div>; })}
      </div><p className="muted small">Public menu: <code>{schoolMenuUrl(location.public_slug)}</code></p>
    </div>}
    </fieldset>
  </section>;
}

function MenuItemsPage({ items, onRefresh, error }: { items: MenuItem[]; onRefresh: () => Promise<void>; error: (s: string) => void }) {
  const [name, setName] = useState('');
  async function save(id: string, values: Partial<MenuItem>) {
    try { await pb.collection('menu_items').update(id, values); await onRefresh(); } catch (e) { error(message(e)); }
  }
  return <section className="menu-items-page"><PageTitle title="Menu Items" subtitle="Shared choices for all schools. Changing an item leaves already saved menus unchanged." />
    <form className="panel inline-form menu-item-add" onSubmit={async (e) => { e.preventDefault(); try { await pb.collection('menu_items').create({ name: name.trim(), active: true }); setName(''); await onRefresh(); } catch (err) { error(message(err)); } }}>
      <label>New menu item<textarea value={name} onChange={(e) => setName(e.target.value)} required maxLength={500} placeholder="Main dish and sides" /></label><button className="primary" disabled={!name.trim()}>Add item</button>
    </form>
    <div className="panel">{items.map((item) => <div className="list-row menu-item-row" key={`${item.id}:${item.name}`}><textarea aria-label="Menu item name" defaultValue={item.name} maxLength={500} onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== item.name) void save(item.id, { name: e.target.value.trim() }); }} /><button className="outline" onClick={() => void save(item.id, { active: !item.active })}>{item.active ? 'Archive' : 'Restore'}</button><button className="quiet danger-text" onClick={async () => { if (!window.confirm('Delete this menu item? Saved daily menus keep their existing text.')) return; try { await pb.collection('menu_items').delete(item.id); await onRefresh(); } catch (err) { error(message(err)); } }}>Delete</button></div>)}</div>
  </section>;
}

function SchoolAdminsPage({ daycares, error }: { daycares: Daycare[]; error: (s: string) => void }) {
  const [accounts, setAccounts] = useState<User[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [schoolId, setSchoolId] = useState(daycares[0]?.id || ''); const [password, setPassword] = useState('');
  const [active, setActive] = useState(true); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState('');
  async function refresh() {
    try { setAccounts(await pb.collection('users').getFullList<User>({ filter: 'role = "daycare_admin"', sort: 'display_name', requestKey: null })); } catch (e) { error(message(e)); }
  }
  useEffect(() => { void refresh(); }, []);
  const school = daycares.find((d) => d.id === schoolId);
  function reset() { setEditing(null); setName(''); setEmail(''); setPassword(''); setActive(true); }
  function edit(account: User) { setEditing(account); setName(account.display_name || ''); setEmail(account.email); setSchoolId(account.daycare); setActive(Boolean(account.active)); setPassword(''); setNotice(''); }
  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setNotice('');
    try {
      if (editing) {
        const data: Row = { display_name: name.trim(), email: email.trim(), daycare: schoolId, active: active, role: 'daycare_admin' };
        if (password) { data.password = password; data.passwordConfirm = password; }
        await pb.collection('users').update(editing.id, data);
      } else {
        await pb.send('/api/daycare-admins', { method: 'POST', body: { display_name: name.trim(), email: email.trim(), password, daycare: schoolId } });
      }
      reset(); await refresh(); setNotice(editing ? 'School admin updated.' : 'School admin created.');
    } catch (err) { error(message(err)); } finally { setSaving(false); }
  }
  return <section><PageTitle title="School Admins" subtitle="Create school staff accounts, assign their school, update their details, and manage access." />
    {notice && <div className="notice">{notice}</div>}
    <form className="panel staff-admin-form" onSubmit={save}><h2>{editing ? 'Edit school admin' : 'Create school admin'}</h2><div className="staff-admin-fields">
      <label>Name<input required value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>School<select value={schoolId} required onChange={(e) => setSchoolId(e.target.value)}><option value="">Choose school</option>{daycares.map((d) => <option key={d.id} value={d.id}>{d.name}{!d.operations_enabled ? ' (operations off)' : ''}</option>)}</select></label>
      <label>{editing ? 'New password (optional)' : 'Temporary password'}<input type="password" autoComplete="new-password" required={!editing} minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    </div>{editing && <label className="checkline"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Account active</label>}
    {!school?.operations_enabled && <p className="muted small">Roster tools are off. Staff can still view the school menu.</p>}
    <div className="form-actions"><button className="primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save account' : 'Create account'}</button>{editing && <button type="button" className="outline" onClick={reset}>Cancel</button>}</div></form>
    <div className="panel table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>School</th><th>Access</th><th>Actions</th></tr></thead><tbody>{accounts.map((account) => {
      const location = daycares.find((d) => d.id === account.daycare);
      return <tr key={account.id}><td>{account.display_name}</td><td>{account.email}</td><td>{location?.name || 'Unassigned'}</td><td>{account.active ? 'Active' : 'Disabled'}</td><td><div className="row-actions"><button className="outline" onClick={() => edit(account)}>Edit</button><button className="quiet" onClick={async () => { try { await pb.collection('users').update(account.id, { active: !account.active }); await refresh(); } catch (e) { error(message(e)); } }}>{account.active ? 'Deactivate' : 'Activate'}</button><button className="quiet danger-text" onClick={async () => { if (!window.confirm(`Delete school admin ${account.display_name || account.email}?`)) return; try { await pb.collection('users').delete(account.id); if (editing?.id === account.id) reset(); await refresh(); } catch (e) { error(message(e)); } }}>Delete</button></div></td></tr>;
    })}{!accounts.length && <tr><td colSpan={5} className="empty-cell">No school admin accounts yet.</td></tr>}</tbody></table></div>
  </section>;
}

function LocationsPage({ daycares, onCreate, onAddAdmin, onSave, onRefresh }: { daycares: Daycare[]; onCreate: () => void; onAddAdmin: (d: Daycare) => void; onSave: (v: Partial<Daycare>) => Promise<void>; onRefresh: () => Promise<void> }) {
  const [selected, setSelected] = useState(daycares[0]?.id || ''); useEffect(() => { if (!daycares.some((d) => d.id === selected)) setSelected(daycares[0]?.id || ''); }, [daycares]);
  const daycare = daycares.find((d) => d.id === selected);
  return <section><PageTitle title="School Settings" subtitle="CLC-wide settings and account setup for each school." /><div className="toolbar"><select value={selected} onChange={(e) => setSelected(e.target.value)}>{daycares.map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select><button className="primary" onClick={onCreate}>Add school</button></div>
    {daycare && <div className="panel settings-panel"><div className="section-heading"><div><h2>{daycare.name}</h2><span className="muted">Public menu: {schoolSubdomainBySlug[daycare.public_slug] || daycare.public_slug}.cliffslunchclub.com</span></div><button className="outline" onClick={() => onAddAdmin(daycare)}>Create school admin</button></div>
      <label className="checkline"><input type="checkbox" checked={Boolean(daycare.operations_enabled)} onChange={(e) => void onSave({ id: daycare.id, operations_enabled: e.target.checked })} /> Allow school staff to use roster and weekly counts</label>
      <label className="checkline"><input type="checkbox" checked={daycare.allow_substitutions} onChange={(e) => void onSave({ id: daycare.id, allow_substitutions: e.target.checked })} /> Allow substitutions for this daycare</label>
      <label className="checkline"><input type="checkbox" checked={daycare.sizes_enabled} onChange={(e) => void onSave({ id: daycare.id, sizes_enabled: e.target.checked })} /> Track Small and Large meal counts</label>
      <h3>Substitution legend</h3><div className="legend-edit">{['a', 'b', 'c', 'v'].map((key) => <label key={key}>{key.toUpperCase()}<input defaultValue={daycare[`sub_${key}_label`] || ''} onBlur={(e) => { if (e.target.value !== daycare[`sub_${key}_label`]) void onSave({ id: daycare.id, [`sub_${key}_label`]: e.target.value } as Partial<Daycare>); }} /></label>)}</div>
      <button className="quiet" onClick={() => void onRefresh()}>Refresh location data</button>
    </div>}
  </section>;
}

function PublicMenu({ slug, embedded = false }: { slug: string; embedded?: boolean }) {
  const [rows, setRows] = useState<MenuDay[]>([]); const [title, setTitle] = useState(schoolNameBySlug[slug] || 'Cliffs Lunch Club'); const [error, setError] = useState('');
  const [requestedMonth, setRequestedMonth] = useState(''); const [now, setNow] = useState(new Date()); const [loading, setLoading] = useState(true);
  const months = publishedMenuMonths(rows, now);
  const month = months.includes(requestedMonth) ? requestedMonth : months[0] || localMonth();
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    let mounted = true; setLoading(true); setError('');
    void pb.collection('menu_days').getFullList<MenuDay>({ filter: pb.filter('public_slug = {:slug} && published = true', { slug }), sort: 'service_date', requestKey: null })
      .then((records) => { if (mounted) { setRows(records); setTitle(records.find((r) => r.public_slug === slug)?.daycare_name || schoolNameBySlug[slug] || 'Cliffs Lunch Club'); } })
      .catch((e) => { if (mounted) setError(message(e)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [slug]);
  const pdf = useMemo(() => menuPdf(title, month, (date) => rows.find((row) => dateOnly(row.service_date) === date) || { menu: 'Menu will be posted soon' }), [title, month, rows]);
  const [pdfUrl, setPdfUrl] = useState('');
  useEffect(() => { const url = URL.createObjectURL(pdf); setPdfUrl(url); return () => URL.revokeObjectURL(url); }, [pdf]);
  return <main className={embedded ? 'school-menu-page' : 'public-page'}>{!embedded && <a className="back-link" href="/">← Back to home</a>}<header className="public-header"><div><div className="eyebrow">CLIFFS LUNCH CLUB</div><h1>{title}</h1><p>{monthLabel(month)} lunch menu</p></div></header><div className="public-toolbar"><label>Month<select value={months.length ? month : ''} disabled={loading || !months.length} onChange={(event) => setRequestedMonth(event.target.value)}>{!months.length && <option value="">No published months</option>}{months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}</select></label><button className="outline" disabled={loading || !months.length} onClick={() => download(pdf, `${title}-${month}-menu.pdf`)}>Download PDF</button><button className="outline" disabled={loading || !months.length} onClick={() => printMenuHtml(publicMenuHtml(title, month, rows))}>Print / Save PDF</button><button className="primary" disabled={loading || !months.length} onClick={() => exportPublicWord(title, month, rows)}>Download Word</button></div>{error ? <div className="notice error">Menu not available.</div> : loading ? <p className="muted">Loading menu…</p> : !months.length ? <div className="panel empty-state"><p>The menu will appear once the full month is published.</p></div> : pdfUrl && <div className="menu-pdf-frame"><object className="menu-pdf" data={pdfUrl} type="application/pdf" aria-label={`${monthLabel(month)} lunch menu PDF`}><p>Your browser can’t display this PDF. <a href={pdfUrl} download={`${title}-${month}-menu.pdf`}>Download the menu PDF</a></p></object></div>}</main>;
}

function publicMenuHtml(title: string, month: string, rows: MenuDay[]) {
  return menuExportHtml(title, month, (date) => rows.find((row) => dateOnly(row.service_date) === date) || { menu: 'Menu will be posted soon' });
}
function exportPublicWord(title: string, month: string, rows: MenuDay[]) {
  download(menuExportDocx(title, month, (date) => rows.find((row) => dateOnly(row.service_date) === date) || { menu: 'Menu will be posted soon' }), menuFilename(title, month));
}

function shortDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function monthLabel(value: string) { const [y, m] = value.split('-').map(Number); return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)); }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function message(e: unknown) { return e instanceof Error ? e.message : 'Something went wrong. Please try again.'; }
function download(blob: Blob, filename: string) { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }
function Empty({ title, text }: { title: string; text: string }) { return <div className="panel empty-state"><h2>{title}</h2><p>{text}</p></div>; }

export default App;
